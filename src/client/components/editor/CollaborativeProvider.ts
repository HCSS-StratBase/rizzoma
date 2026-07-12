import * as Y from 'yjs';
import { Socket } from 'socket.io-client';
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import {
  anonymousCollaborationUser,
  type CollaborationUser,
  isCollaborationUser,
} from './collaborationIdentity';
import {
  acknowledgeCollaborationSnapshot,
  acknowledgeCollaborationUpdate,
  markCollaborationUpdatePending,
} from '../../lib/collaborationPending';

type UpdateAcknowledgement = { ok?: boolean; error?: string } | undefined;

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
  /** Server-authorized room membership. */
  private joined = false;
  /** True only after the authorized server snapshot has been applied. */
  private roomReady = false;
  private canEdit = false;
  private destroyed = false;
  private joinAttempt = 0;
  private readonly ownerId: string | null;
  private syncCallbacks: Array<() => void> = [];
  private reconnectHandler: (() => void) | null = null;
  private disconnectHandler: (() => void) | null = null;
  private docUpdateHandler: ((update: Uint8Array, origin: unknown) => void) | null = null;
  private remoteUpdateHandler: ((data: { update: number[] }) => void) | null = null;
  private syncHandler: ((data: {
    state: number[];
    shouldSeed?: boolean;
    user?: { id?: string } | null;
    canEdit?: boolean;
  }) => void) | null = null;
  private localAwarenessHandler: ((change: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => void) | null = null;
  private remoteAwarenessHandler: ((data: { update?: number[]; states?: Record<string, unknown> }) => void) | null = null;

  constructor(
    doc: Y.Doc,
    socket: Socket,
    blipId: string,
    user: CollaborationUser | null = null,
  ) {
    this.doc = doc;
    this.socket = socket;
    this.blipId = blipId;
    this.awareness = new Awareness(doc);
    this.ownerId = user?.id?.trim() || null;

    this.setupListeners();
    this.setupAwareness(user);
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
        if (this.roomReady && this.canEdit) this.emitDocumentUpdate(update, false);
        else markCollaborationUpdatePending(this.ownerId, this.blipId);
      }
    };
    this.doc.on('update', this.docUpdateHandler);

    const eventName = `blip:update:${this.blipId}`;
    this.remoteUpdateHandler = (data: { update: number[] }) => {
      const update = new Uint8Array(data.update);
      Y.applyUpdate(this.doc, update, this);
    };
    this.socket.on(eventName, this.remoteUpdateHandler);

    this.syncHandler = (data: {
      state: number[];
      shouldSeed?: boolean;
      user?: { id?: string } | null;
      canEdit?: boolean;
    }) => {
      if (!this.joined) return;
      // The server session is authoritative on every join. A cookie can switch
      // accounts in another tab while this tab still renders the old user; in
      // that case never release the old owner's Y.Doc into the new session.
      if (this.ownerId && data.user?.id !== this.ownerId) {
        this.joined = false;
        this.canEdit = false;
        this.roomReady = false;
        this.synced = false;
        this.shouldSeed = false;
        this.socket.emit('blip:leave', { blipId: this.blipId });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('rizzoma:auth-session-mismatch', {
            detail: { expectedUserId: this.ownerId, actualUserId: data.user?.id ?? null },
          }));
        }
        return;
      }
      const completesJoin = !this.roomReady;
      const serverDoc = new Y.Doc();
      if (data.state.length > 0) {
        const state = new Uint8Array(data.state);
        Y.applyUpdate(serverDoc, state);
        Y.applyUpdate(this.doc, state, this);
      }
      const serverStateVector = Y.encodeStateVector(serverDoc);
      serverDoc.destroy();
      this.shouldSeed = Boolean(data.shouldSeed);
      if (typeof data.canEdit === 'boolean') this.canEdit = data.canEdit;
      this.roomReady = true;
      this.synced = true;

      if (completesJoin) {
        // Local edits made while offline or while authorization was pending
        // were intentionally not emitted. Send only what the just-synced
        // server state is missing, then announce the authenticated identity.
        const localDiff = Y.encodeStateAsUpdate(this.doc, serverStateVector);
        if (localDiff.length > 2 && this.canEdit) {
          this.emitDocumentUpdate(localDiff, true);
        } else if (localDiff.length > 2) {
          this.reportAuthorizationFailure('forbidden');
        } else {
          // The authorized server state already contains everything local.
          acknowledgeCollaborationSnapshot(this.ownerId, this.blipId);
        }
        this.reannounceLocalAwarenessState();
      }
      this.syncCallbacks.forEach(cb => cb());
      this.syncCallbacks = [];
    };
    this.socket.on(`blip:sync:${this.blipId}`, this.syncHandler);
  }

  private emitDocumentUpdate(update: Uint8Array, coversCompleteDocument: boolean) {
    // A reconnect diff may already represent pending individual updates, so it
    // must not increment their count again. Ordinary live edits do increment.
    if (!coversCompleteDocument) markCollaborationUpdatePending(this.ownerId, this.blipId);
    this.socket.emit('blip:update', {
      blipId: this.blipId,
      update: Array.from(update),
    }, (ack: UpdateAcknowledgement) => {
      if (!ack?.ok) {
        if (ack?.error === 'forbidden' || ack?.error === 'unauthenticated') {
          this.joined = false;
          this.roomReady = false;
          this.canEdit = false;
          this.reportAuthorizationFailure(ack.error);
        }
        return;
      }
      if (coversCompleteDocument) acknowledgeCollaborationSnapshot(this.ownerId, this.blipId);
      else acknowledgeCollaborationUpdate(this.ownerId, this.blipId);
    });
  }

  private setupAwareness(initialUser: CollaborationUser | null) {
    // Use the y-protocols wire format, including its per-client clocks. The
    // previous implementation mutated awareness.getStates() directly and
    // manually emitted `change`; yCursorPlugin reacted by publishing another
    // local cursor update, producing a cross-client awareness ping-pong that
    // delayed document relays by 13-14 seconds in CI.
    this.localAwarenessHandler = ({ added, updated, removed }, origin) => {
      // applyAwarenessUpdate marks remote changes with this provider as their
      // origin. Never send those changes back to the server.
      if (origin === this) return;
      if (!this.roomReady) return;
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
    this.awareness.setLocalStateField(
      'user',
      initialUser ?? anonymousCollaborationUser(this.doc.clientID),
    );

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
      this.roomReady = false;
      this.canEdit = false;
      this.synced = false;
      this.shouldSeed = false;
      this.joinAttempt += 1;
    };
    this.socket.on('disconnect', this.disconnectHandler);
  }

  private joinRoom() {
    const attempt = ++this.joinAttempt;
    this.joined = false;
    this.roomReady = false;
    this.canEdit = false;
    this.synced = false;
    this.shouldSeed = false;
    this.socket.emit('blip:join', {
      blipId: this.blipId
    }, (result: { ok?: boolean; error?: string; canEdit?: boolean; user?: { id: string; name: string; color: string } }) => {
      if (this.destroyed || attempt !== this.joinAttempt) return;
      if (!result?.ok) {
        this.reportAuthorizationFailure(result?.error || 'forbidden');
        return;
      }
      if (this.ownerId && result.user?.id !== this.ownerId) {
        this.socket.emit('blip:leave', { blipId: this.blipId });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('rizzoma:auth-session-mismatch', {
            detail: { expectedUserId: this.ownerId, actualUserId: result.user?.id ?? null },
          }));
        }
        return;
      }
      this.joined = true;
      this.canEdit = Boolean(result.canEdit);

      // Set the authoritative identity while the roomReady gate is still
      // closed. The first awareness packet is released only after sync.
      if (result.user) {
        this.setUser(result.user);
      }

      const sv = Y.encodeStateVector(this.doc);
      this.socket.emit('blip:sync:request', {
        blipId: this.blipId,
        stateVector: Array.from(sv)
      });
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

  getUser(): CollaborationUser {
    const current = this.awareness.getLocalState()?.['user'];
    return isCollaborationUser(current)
      ? current
      : anonymousCollaborationUser(this.doc.clientID);
  }

  setUser(user: CollaborationUser) {
    const current = this.awareness.getLocalState()?.['user'];
    if (
      isCollaborationUser(current)
      && current.id === user.id
      && current.name === user.name
      && current.color === user.color
    ) {
      return;
    }
    this.awareness.setLocalStateField('user', user);
  }

  private reannounceLocalAwarenessState() {
    const state = this.awareness.getLocalState();
    if (!state) return;
    // setLocalState advances the awareness clock before the normal local
    // update handler serializes the state. Re-sending an old clock directly
    // would be ignored by a peer that already timed this client out.
    this.awareness.setLocalState(state);
  }

  destroy() {
    this.destroyed = true;
    this.joinAttempt += 1;
    // Tell peers immediately that this cursor left instead of waiting for the
    // awareness protocol's 30-second stale-client timeout.
    removeAwarenessStates(this.awareness, [this.awareness.clientID], 'local-destroy');
    // Never buffer the previous owner's leave packet across an auth reset. The
    // server already removes all rooms when the old transport disconnects.
    if (this.socket.connected) {
      this.socket.emit('blip:leave', {
        blipId: this.blipId
      });
    }
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
    this.joined = false;
    this.roomReady = false;
    this.canEdit = false;
    this.awareness.destroy();
  }
}
