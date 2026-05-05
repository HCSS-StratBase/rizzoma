/**
 * Native fractal-render — WaveView.
 *
 * The topic-level container that owns all the BlipViews for one
 * conversation. Direct port of the structural pieces of original
 * Rizzoma's `wave/view.coffee`.
 *
 * Responsibilities (Phase 2 scope):
 *   - Per-topic BlipView registry, keyed by blipId
 *   - Root container management (the single DOM element the React wrapper
 *     mounts into the topic-detail page)
 *   - Lazy view instantiation via a content-lookup callback
 *   - Helpers: find BlipView for a DOM node, walk path from root to a
 *     blip, broadcast events, destroy
 *
 * Out of scope for Phase 2 (lands in Phase 3 Y.js work):
 *   - Cross-tab synchronization
 *   - Persistence calls back to the server
 *   - Awareness/cursors
 *
 * The earlier WaveView skeleton in blip-view.ts is moved here; that file
 * now exports BlipView only. Importers should switch to `from './wave-view'`.
 */

import { BlipView } from './blip-view';
import { ContentArray } from './types';

export type WaveViewEvent =
  | 'blip-added'
  | 'blip-removed'
  | 'root-set'
  | 'destroyed';

export type WaveViewListener = (payload?: unknown) => void;

export interface WaveViewOptions {
  /** Lookup callback the WaveView calls when it needs to materialize a BlipView. */
  contentByBlipId: (id: string) => ContentArray | null;
  /** Optional CSS class added to the root container (default: 'wave-view'). */
  rootClassName?: string;
}

export class WaveView {
  private readonly views = new Map<string, BlipView>();
  private readonly rootContainer: HTMLElement;
  private readonly contentLookup: (id: string) => ContentArray | null;
  private rootBlipId: string | null = null;
  private listeners = new Map<WaveViewEvent, Set<WaveViewListener>>();
  private destroyed = false;

  constructor(opts: WaveViewOptions) {
    this.contentLookup = opts.contentByBlipId;
    this.rootContainer = document.createElement('div');
    this.rootContainer.className = opts.rootClassName || 'wave-view';
  }

  // ─── Container ─────────────────────────────────────────────────────

  getRootContainer(): HTMLElement {
    return this.rootContainer;
  }

  getRootBlipId(): string | null {
    return this.rootBlipId;
  }

  // ─── BlipView registry ─────────────────────────────────────────────

  getView(blipId: string): BlipView | undefined {
    return this.views.get(blipId);
  }

  size(): number {
    return this.views.size;
  }

  /** Lazily materialize a BlipView for the given id, wiring its child resolver. */
  getOrCreateView(blipId: string): BlipView {
    if (this.destroyed) throw new Error('WaveView is destroyed');
    let view = this.views.get(blipId);
    if (view) return view;
    view = new BlipView(blipId);
    view.setChildResolver((childId) => this.resolveChild(childId));
    this.views.set(blipId, view);
    const content = this.contentLookup(blipId);
    if (content) view.setContent(content);
    this.emit('blip-added', view);
    return view;
  }

  /** Remove a BlipView from the registry and tear it down. */
  removeView(blipId: string): void {
    const view = this.views.get(blipId);
    if (!view) return;
    this.views.delete(blipId);
    view.destroy();
    this.emit('blip-removed', view);
  }

  // ─── Root assignment ───────────────────────────────────────────────

  setRoot(blipId: string): void {
    if (this.destroyed) throw new Error('WaveView is destroyed');
    this.rootBlipId = blipId;
    const view = this.getOrCreateView(blipId);
    while (this.rootContainer.firstChild) {
      this.rootContainer.removeChild(this.rootContainer.firstChild);
    }
    this.rootContainer.appendChild(view.getContainer());
    this.emit('root-set', view);
  }

  // ─── DOM helpers ───────────────────────────────────────────────────

  /** Walk up from a DOM node to find the enclosing BlipView (via data-blip-id). */
  findViewForElement(el: Element | null): BlipView | null {
    let cur: Element | null = el;
    while (cur) {
      const id = cur.getAttribute?.('data-blip-id');
      if (id) {
        const view = this.views.get(id);
        if (view) return view;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  // ─── Events ────────────────────────────────────────────────────────

  on(event: WaveViewEvent, listener: WaveViewListener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  // ─── Teardown ──────────────────────────────────────────────────────

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.rootBlipId = null;
    while (this.rootContainer.firstChild) {
      this.rootContainer.removeChild(this.rootContainer.firstChild);
    }
    this.emit('destroyed');
    this.listeners.clear();
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private resolveChild(childId: string): HTMLElement | null {
    if (this.destroyed) return null;
    const view = this.getOrCreateView(childId);
    return view.getContainer();
  }

  private emit(event: WaveViewEvent, payload?: unknown): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[WaveView] listener for "${event}" threw:`, err);
      }
    }
  }
}
