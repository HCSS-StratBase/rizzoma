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
    // Send awareness updates
    this.awareness.on('update', ({ added, updated, removed }: any) => {
      const changedClients = added.concat(updated).concat(removed);
      this.socket.emit('awareness:update', {
        blipId: this.blipId,
        awareness: Array.from(this.awareness.encodeUpdate(changedClients))
      });
    });
    
    // Receive awareness updates
    this.socket.on(`awareness:update:${this.blipId}`, (data: { awareness: number[] }) => {
      const update = new Uint8Array(data.awareness);
      this.awareness.applyUpdate(update, this);
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