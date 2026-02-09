import * as Y from 'yjs';
import { Socket } from 'socket.io-client';
import { Awareness } from 'y-protocols/awareness';

export class SocketIOProvider {
  doc: Y.Doc;
  socket: Socket;
  blipId: string;
  awareness: Awareness;
  /** True once the initial blip:sync response has been received from the server. */
  synced = false;
  private syncCallbacks: Array<() => void> = [];
  private reconnectHandler: (() => void) | null = null;
  /** Guard to prevent awareness update loop (receive → emit change → send → relay → receive) */
  private applyingRemoteAwareness = false;

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
    this.doc.on('update', (update: Uint8Array, origin: any) => {
      if (origin !== this) {
        this.socket.emit('blip:update', {
          blipId: this.blipId,
          update: Array.from(update)
        });
      }
    });

    const eventName = `blip:update:${this.blipId}`;
    this.socket.on(eventName, (data: { update: number[] }) => {
      const update = new Uint8Array(data.update);
      Y.applyUpdate(this.doc, update, this);
    });

    this.socket.on(`blip:sync:${this.blipId}`, (data: { state: number[] }) => {
      if (data.state.length > 0) {
        const state = new Uint8Array(data.state);
        Y.applyUpdate(this.doc, state, this);
      }
      this.synced = true;
      this.syncCallbacks.forEach(cb => cb());
      this.syncCallbacks = [];
    });
  }

  private setupAwareness() {
    // Set initial user state
    const userColors = ['#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#00bcd4'];
    const userId = this.doc.clientID.toString();

    this.awareness.setLocalStateField('user', {
      id: userId,
      name: `User ${userId.slice(-4)}`,
      color: userColors[parseInt(userId) % userColors.length]
    });

    // Send LOCAL awareness updates (skip when applying remote to prevent loop)
    this.awareness.on('update', ({ added, updated, removed }: any) => {
      if (this.applyingRemoteAwareness) return;

      const changedClients = added.concat(updated).concat(removed);
      // Only send updates for our own client
      const localId = this.doc.clientID;
      if (!changedClients.includes(localId)) return;

      const localState = this.awareness.getLocalState();
      if (!localState) return;

      this.socket.emit('awareness:update', {
        blipId: this.blipId,
        states: { [localId]: localState }
      });
    });

    // Receive awareness updates from remote clients
    this.socket.on(`awareness:update:${this.blipId}`, (data: { states: any }) => {
      this.applyingRemoteAwareness = true;
      try {
        Object.entries(data.states).forEach(([clientIdStr, state]) => {
          const clientId = parseInt(clientIdStr);
          if (clientId !== this.doc.clientID) {
            const currentStates = this.awareness.getStates();
            if (!currentStates.has(clientId)) {
              currentStates.set(clientId, state as any);
            } else {
              const existingState = currentStates.get(clientId) || {};
              currentStates.set(clientId, { ...existingState, ...(state as any) });
            }
          }
        });
        this.awareness.emit('change', [{ added: [], updated: Object.keys(data.states).map(Number), removed: [] }]);
      } finally {
        this.applyingRemoteAwareness = false;
      }
    });
  }

  private setupReconnect() {
    this.reconnectHandler = () => {
      this.joinRoom();
      // Send state vector so server returns only missing updates
      const sv = Y.encodeStateVector(this.doc);
      this.socket.emit('blip:sync:request', {
        blipId: this.blipId,
        stateVector: Array.from(sv)
      });
    };
    this.socket.on('connect', this.reconnectHandler);
  }

  private joinRoom() {
    this.socket.emit('blip:join', {
      blipId: this.blipId
    });
  }

  setUser(user: { id: string; name: string; color: string }) {
    this.awareness.setLocalStateField('user', user);
  }

  destroy() {
    this.socket.emit('blip:leave', {
      blipId: this.blipId
    });
    this.socket.off(`blip:update:${this.blipId}`);
    this.socket.off(`blip:sync:${this.blipId}`);
    this.socket.off(`awareness:update:${this.blipId}`);
    if (this.reconnectHandler) {
      this.socket.off('connect', this.reconnectHandler);
      this.reconnectHandler = null;
    }
    this.awareness.destroy();
  }
}
