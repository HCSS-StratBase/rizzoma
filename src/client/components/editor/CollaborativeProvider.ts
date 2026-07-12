import * as Y from 'yjs';
import { Socket } from 'socket.io-client';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';

export class SocketIOProvider {
  doc: Y.Doc;
  socket: Socket;
  blipId: string;
  awareness: Awareness;
  /** True once the initial blip:sync response has been received from the server. */
  synced = false;
  /** True when this client is the one responsible for seeding the Y.Doc
   *  from blip HTML on first join (only the first client to join a fresh
   *  blip gets this authority — see task #57 comment in src/server/lib/socket.ts). */
  shouldSeed = false;
  /** Server-authorized room membership. No local CRDT or awareness traffic is
   * published until the blip:join acknowledgement grants this membership. */
  private joined = false;
  private canEdit = false;
  private destroyed = false;
  private joinAttempt = 0;
  private pendingLocalUpdates: Uint8Array[] = [];
  private syncCallbacks: Array<() => void> = [];
  private reconnectHandler: (() => void) | null = null;
  private disconnectHandler: (() => void) | null = null;
  private docUpdateHandler: ((update: Uint8Array, origin: unknown) => void) | null = null;
  private remoteUpdateHandler: ((data: { update: number[] }) => void) | null = null;
  private syncHandler: ((data: { state: number[]; shouldSeed?: boolean }) => void) | null = null;
  private localAwarenessHandler: ((change: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => void) | null = null;
  private remoteAwarenessHandler: ((data: { update?: number[]; states?: Record<string, unknown> }) => void) | null = null;

  constructor(doc: Y.Doc, socket: Socket, blipId: string) {
    this.doc = doc;
    this.socket = socket;
    this.blipId = blipId;
    this.awareness = new Awareness(doc);

    this.setupListeners();
    this.setupAwareness();
    this.setupReconnect();
    // Only join immediately if socket is already connected;
    // setupReconnect() handles joining on (re)connect events.
    if (this.socket.connected) {
      this.joinRoom();
    }
  }

  /** Register a callback that fires once the initial server sync has been received. */
  onSynced(cb: () => void) {
    if (this.synced) { cb(); return; }
    this.syncCallbacks.push(cb);
  }

  private setupListeners() {
    this.docUpdateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin !== this) {
        if (!this.joined) {
          this.pendingLocalUpdates.push(update.slice());
          return;
        }
        if (this.canEdit) this.publishDocumentUpdate(update);
      }
    };
    this.doc.on('update', this.docUpdateHandler);

    const eventName = `blip:update:${this.blipId}`;
    this.remoteUpdateHandler = (data: { update: number[] }) => {
      const update = new Uint8Array(data.update);
      Y.applyUpdate(this.doc, update, this);
    };
    this.socket.on(eventName, this.remoteUpdateHandler);

    this.syncHandler = (data: { state: number[]; shouldSeed?: boolean }) => {
      if (!this.joined) return;
      if (data.state.length > 0) {
        const state = new Uint8Array(data.state);
        Y.applyUpdate(this.doc, state, this);
      }
      this.shouldSeed = Boolean(data.shouldSeed);
      this.synced = true;
      this.syncCallbacks.forEach(cb => cb());
      this.syncCallbacks = [];
    };
    this.socket.on(`blip:sync:${this.blipId}`, this.syncHandler);
  }

  private setupAwareness() {
    // Use the y-protocols wire format, including its per-client clocks. The
    // previous implementation mutated awareness.getStates() directly and
    // manually emitted `change`; yCursorPlugin reacted by publishing another
    // local cursor update, producing a cross-client awareness ping-pong that
    // delayed document relays by 13-14 seconds in CI.
    this.localAwarenessHandler = ({ added, updated, removed }, origin) => {
      // applyAwarenessUpdate marks remote changes with this provider as their
      // origin. Never send those changes back to the server.
      if (origin === this) return;
      const changedClients = added.concat(updated).concat(removed);
      if (changedClients.length === 0) return;
      if (!this.joined) return;
      const update = encodeAwarenessUpdate(this.awareness, changedClients);
      this.socket.emit('awareness:update', {
        blipId: this.blipId,
        update: Array.from(update),
      });
    };
    this.awareness.on('update', this.localAwarenessHandler);

    // Set initial user state after the listener is attached so peers receive
    // a valid clocked awareness update even before the editor gains focus.
    const userColors = ['#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#00bcd4'];
    const userId = this.doc.clientID.toString();

    this.awareness.setLocalStateField('user', {
      id: userId,
      name: `User ${userId.slice(-4)}`,
      color: userColors[parseInt(userId) % userColors.length]
    });

    // Receive awareness updates from remote clients
    this.remoteAwarenessHandler = (data) => {
      if (Array.isArray(data.update)) {
        applyAwarenessUpdate(this.awareness, new Uint8Array(data.update), this);
        return;
      }
      // Rolling-deploy compatibility for a stale client still sending the old
      // raw-state payload. New clients never emit this form.
      const states = data.states || {};
      const updated: number[] = [];
      Object.entries(states).forEach(([clientIdRaw, state]) => {
        const clientId = Number(clientIdRaw);
        if (!Number.isFinite(clientId) || clientId === this.doc.clientID) return;
        this.awareness.getStates().set(clientId, state as Record<string, unknown>);
        // Raw legacy payloads carry no awareness clock. Keep a minimal
        // non-negative clock so stale-client cleanup can encode a valid
        // removal update, while allowing a later clocked update (normally
        // clock >= 1) to supersede this rolling-deploy fallback.
        const currentMeta = this.awareness.meta.get(clientId);
        this.awareness.meta.set(clientId, {
          clock: currentMeta?.clock ?? 0,
          lastUpdated: Date.now(),
        });
        updated.push(clientId);
      });
      if (updated.length > 0) this.awareness.emit('change', [{ added: [], updated, removed: [] }, this]);
    };
    this.socket.on(`awareness:update:${this.blipId}`, this.remoteAwarenessHandler);
  }

  private setupReconnect() {
    this.reconnectHandler = () => {
      this.joinRoom();
    };
    this.socket.on('connect', this.reconnectHandler);
    this.disconnectHandler = () => {
      this.joined = false;
      this.canEdit = false;
      this.synced = false;
      this.joinAttempt += 1;
    };
    this.socket.on('disconnect', this.disconnectHandler);
  }

  private joinRoom() {
    const attempt = ++this.joinAttempt;
    this.joined = false;
    this.canEdit = false;
    this.synced = false;
    this.socket.emit('blip:join', {
      blipId: this.blipId
    }, (result: { ok?: boolean; error?: string; canEdit?: boolean; user?: { id: string; name: string; color: string } }) => {
      if (this.destroyed || attempt !== this.joinAttempt) return;
      if (!result?.ok) {
        this.reportAuthorizationFailure(result?.error || 'forbidden');
        return;
      }
      this.joined = true;
      this.canEdit = Boolean(result.canEdit);

      // The server returns the authenticated identity. Setting it now emits
      // the first awareness packet only after membership has been granted.
      if (result.user) {
        this.awareness.setLocalStateField('user', result.user);
      } else {
        this.publishCurrentAwareness();
      }

      // Reconnect diffs and any edits made during the short authorization
      // window are likewise released only after the acknowledgement.
      const sv = Y.encodeStateVector(this.doc);
      this.socket.emit('blip:sync:request', {
        blipId: this.blipId,
        stateVector: Array.from(sv)
      });
      if (this.canEdit) {
        const queued = this.pendingLocalUpdates.splice(0);
        queued.forEach((update) => this.publishDocumentUpdate(update));
      } else {
        this.pendingLocalUpdates = [];
      }
    });
  }

  private publishCurrentAwareness() {
    const state = this.awareness.getLocalState();
    if (!this.joined || !state) return;
    const update = encodeAwarenessUpdate(this.awareness, [this.awareness.clientID]);
    this.socket.emit('awareness:update', {
      blipId: this.blipId,
      update: Array.from(update),
    });
  }

  private publishDocumentUpdate(update: Uint8Array) {
    this.socket.emit('blip:update', {
      blipId: this.blipId,
      update: Array.from(update),
    }, (result: { ok?: boolean; error?: string }) => {
      if (result?.ok !== false) return;
      if (result.error === 'forbidden' || result.error === 'unauthenticated') {
        this.joined = false;
        this.canEdit = false;
        this.reportAuthorizationFailure(result.error);
      }
    });
  }

  private reportAuthorizationFailure(error: string) {
    if (typeof window === 'undefined') return;
    const sessionEnded = error === 'unauthenticated';
    window.dispatchEvent(new CustomEvent('toast', {
      detail: {
        type: 'error',
        message: sessionEnded
          ? 'Your collaboration session ended. Sign in again to continue editing.'
          : 'Your access to this blip changed. Local collaboration updates are paused.',
      },
    }));
    window.dispatchEvent(new CustomEvent('rizzoma:access-changed', {
      detail: { blipId: this.blipId, error },
    }));
  }

  setUser(user: { id: string; name: string; color: string }) {
    this.awareness.setLocalStateField('user', user);
  }

  destroy() {
    this.destroyed = true;
    this.joinAttempt += 1;
    // Tell peers immediately that this cursor left instead of waiting for the
    // awareness protocol's 30-second stale-client timeout.
    removeAwarenessStates(this.awareness, [this.awareness.clientID], 'local-destroy');
    this.socket.emit('blip:leave', {
      blipId: this.blipId
    });
    if (this.docUpdateHandler) {
      this.doc.off('update', this.docUpdateHandler);
      this.docUpdateHandler = null;
    }
    if (this.remoteUpdateHandler) {
      this.socket.off(`blip:update:${this.blipId}`, this.remoteUpdateHandler);
      this.remoteUpdateHandler = null;
    }
    if (this.syncHandler) {
      this.socket.off(`blip:sync:${this.blipId}`, this.syncHandler);
      this.syncHandler = null;
    }
    if (this.remoteAwarenessHandler) {
      this.socket.off(`awareness:update:${this.blipId}`, this.remoteAwarenessHandler);
      this.remoteAwarenessHandler = null;
    }
    if (this.localAwarenessHandler) {
      this.awareness.off('update', this.localAwarenessHandler);
      this.localAwarenessHandler = null;
    }
    if (this.reconnectHandler) {
      this.socket.off('connect', this.reconnectHandler);
      this.reconnectHandler = null;
    }
    if (this.disconnectHandler) {
      this.socket.off('disconnect', this.disconnectHandler);
      this.disconnectHandler = null;
    }
    this.pendingLocalUpdates = [];
    this.awareness.destroy();
  }
}
