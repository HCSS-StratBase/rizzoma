/**
 * Native fractal-render — Awareness wrapper.
 *
 * Phase 3 (#54) deliverable: presence + cursor color per-blip.
 *
 * Wraps y-protocols/awareness with a small ergonomic API tailored to our
 * TopicDoc. Each connected client publishes:
 *   - user: { id, name, color, avatar? }
 *   - cursor: { blipId, anchor, head } | null  (which blip + position)
 *
 * Other clients subscribe to changes and render presence indicators
 * (collaborative cursors per-blip + a participant strip on the topic).
 *
 * The CollaborativeProvider already integrates Awareness with WebSocket
 * relay — this file is the in-memory model. The provider plumbs updates
 * to/from the wire.
 */

import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import type { TopicDoc } from './yjs-binding';

export interface UserPresence {
  id: string;
  name: string;
  color: string; // CSS color (used for cursor + avatar ring)
  avatar?: string;
}

export interface CursorState {
  blipId: string;
  /** ProseMirror selection anchor — the editor renders a caret here. */
  anchor: number;
  /** Selection head (anchor === head means a collapsed cursor). */
  head: number;
}

export interface ParticipantState {
  user: UserPresence;
  cursor?: CursorState | null;
}

export type AwarenessListener = (states: ReadonlyMap<number, ParticipantState>) => void;

const F_USER = 'user';
const F_CURSOR = 'cursor';

/**
 * Color palette for participants — deterministic from user id so the
 * same person always gets the same color across sessions.
 */
const COLORS = [
  '#4caf50', '#2196f3', '#ff9800', '#9c27b0', '#f44336',
  '#00bcd4', '#ffeb3b', '#795548', '#607d8b', '#e91e63',
];
export const colorForUserId = (id: string): string => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
};

/**
 * Wraps a Y.js Awareness instance for one TopicDoc + provides a
 * subscription API in our domain types.
 */
export class TopicAwareness {
  readonly awareness: Awareness;
  private listeners: Set<AwarenessListener> = new Set();
  private destroyed = false;
  private readonly handleUpdate = () => this.broadcast();

  constructor(doc: Y.Doc | TopicDoc) {
    const ydoc = (doc as any).doc instanceof Y.Doc ? (doc as TopicDoc).doc : (doc as Y.Doc);
    this.awareness = new Awareness(ydoc);
    this.awareness.on('change', this.handleUpdate);
  }

  /** Set this client's user identity (call once on connect). */
  setUser(user: UserPresence): void {
    if (this.destroyed) return;
    this.awareness.setLocalStateField(F_USER, user);
  }

  /** Update this client's cursor position. Pass null to clear. */
  setCursor(cursor: CursorState | null): void {
    if (this.destroyed) return;
    this.awareness.setLocalStateField(F_CURSOR, cursor);
  }

  /** Snapshot of all currently-known participants (including local). */
  getParticipants(): Map<number, ParticipantState> {
    const out = new Map<number, ParticipantState>();
    this.awareness.getStates().forEach((state, clientId) => {
      const user = state[F_USER] as UserPresence | undefined;
      if (!user) return;
      out.set(clientId, {
        user,
        cursor: (state[F_CURSOR] as CursorState | null | undefined) ?? null,
      });
    });
    return out;
  }

  /**
   * Snapshot of participants whose cursor is in a given blip — used by a
   * BlipView to render only the cursors that belong to its editor.
   */
  getParticipantsInBlip(blipId: string): ParticipantState[] {
    const out: ParticipantState[] = [];
    this.getParticipants().forEach((p) => {
      if (p.cursor && p.cursor.blipId === blipId) out.push(p);
    });
    return out;
  }

  /** Subscribe to all participant-state changes. */
  on(listener: AwarenessListener): () => void {
    this.listeners.add(listener);
    // Fire once immediately with the current state.
    listener(this.getParticipants());
    return () => this.listeners.delete(listener);
  }

  /** Local clientId — useful for filtering self out of remote-cursor renders. */
  get clientId(): number {
    return this.awareness.clientID;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.awareness.off('change', this.handleUpdate);
    this.awareness.destroy();
    this.listeners.clear();
  }

  private broadcast(): void {
    if (this.destroyed) return;
    const snapshot = this.getParticipants();
    for (const fn of this.listeners) {
      try { fn(snapshot); } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[TopicAwareness] listener threw:', err);
      }
    }
  }
}
