import * as Y from 'yjs';
import { Socket } from 'socket.io-client';
import { Awareness } from 'y-protocols/awareness';

export class SocketIOProvider {
  doc: Y.Doc;
  socket: Socket;
  blipId: string;
  awareness: Awareness;
  
  constructor(doc: Y.Doc, socket: Socket, blipId: string) {
    this.doc = doc;
    this.socket = socket;
    this.blipId = blipId;
    this.awareness = new Awareness(doc);
    
    this.setupListeners();
    this.setupAwareness();
    this.joinRoom();
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
    
    this.socket.on(`blip:update:${this.blipId}`, (data: { update: number[] }) => {
      const update = new Uint8Array(data.update);
      Y.applyUpdate(this.doc, update, this);
    });
    
    this.socket.on(`blip:sync:${this.blipId}`, (data: { state: number[] }) => {
      const state = new Uint8Array(data.state);
      Y.applyUpdate(this.doc, state, this);
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
    
    // Send awareness updates
    this.awareness.on('update', ({ added, updated, removed }: any) => {
      const changedClients = added.concat(updated).concat(removed);
      const states = this.awareness.getStates();
      
      // Create a simple state object to send
      const stateUpdate: any = {};
      changedClients.forEach((clientId: number) => {
        if (states.has(clientId)) {
          stateUpdate[clientId] = states.get(clientId);
        }
      });
      
      this.socket.emit('awareness:update', {
        blipId: this.blipId,
        states: stateUpdate
      });
    });
    
    // Receive awareness updates
    this.socket.on(`awareness:update:${this.blipId}`, (data: { states: any }) => {
      // Apply awareness updates from other clients
      Object.entries(data.states).forEach(([clientIdStr, state]) => {
        const clientId = parseInt(clientIdStr);
        if (clientId !== this.doc.clientID) {
          const currentStates = this.awareness.getStates();
          if (!currentStates.has(clientId)) {
            currentStates.set(clientId, state as any);
          } else {
            // Merge state
            const existingState = currentStates.get(clientId) || {};
            currentStates.set(clientId, { ...existingState, ...(state as any) });
          }
        }
      });
      
      // Trigger update event
      this.awareness.emit('change', [{ added: [], updated: Object.keys(data.states).map(Number), removed: [] }]);
    });
  }
  
  private joinRoom() {
    this.socket.emit('blip:join', {
      blipId: this.blipId
    });
  }
  
  destroy() {
    this.socket.emit('blip:leave', {
      blipId: this.blipId
    });
    this.socket.off(`blip:update:${this.blipId}`);
    this.socket.off(`blip:sync:${this.blipId}`);
    this.socket.off(`awareness:update:${this.blipId}`);
    this.awareness.destroy();
  }
}