import * as Y from 'yjs';
import { Socket } from 'socket.io-client';

export class SocketIOProvider {
  private doc: Y.Doc;
  private socket: Socket;
  private blipId: string;
  
  constructor(doc: Y.Doc, socket: Socket, blipId: string) {
    this.doc = doc;
    this.socket = socket;
    this.blipId = blipId;
    
    this.setupListeners();
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
  }
}