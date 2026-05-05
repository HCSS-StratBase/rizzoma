/**
 * Native fractal-render — BlipView (Phase 2 skeleton).
 *
 * Per-blip view object. Owns the DOM container for one blip (`<div
 * class="blip-container">` with an inner `<div class="blip-text">`),
 * renders its content via the renderer, and exposes lifecycle hooks
 * for the wave-view to wire up edit/fold/etc.
 *
 * Direct skeleton port of the structural pieces of original Rizzoma's
 * `blip/view.coffee` (the 1000-line file). Phase 2 only needs the read-
 * mode rendering surface; TipTap edit-mode mounting lands in
 * blip-editor-host.ts next.
 *
 * Key invariant matching the original:
 *   - The `<div class="blip-container">` is OWNED by this BlipView and
 *     persists across re-renders (re-renders only swap the inner
 *     `.blip-text` content). This is what lets BlipThread fold/unfold
 *     by CSS-class without ever destroying the subtree.
 */

import { renderContent, RenderOptions } from './renderer';
import { ContentArray } from './types';

export interface BlipViewListener {
  (): void;
}

export type BlipViewEvent = 'rendered' | 'destroyed';

export class BlipView {
  private readonly blipId: string;
  private readonly container: HTMLElement;
  private readonly inner: HTMLElement;
  private content: ContentArray = [];
  private destroyed = false;
  private resolver: ((id: string) => HTMLElement | null) | null = null;
  private listeners: Map<BlipViewEvent, Set<BlipViewListener>> = new Map();

  constructor(blipId: string) {
    this.blipId = blipId;
    this.container = document.createElement('div');
    this.container.className = 'blip-container';
    this.container.setAttribute('data-blip-id', blipId);

    this.inner = document.createElement('div');
    this.inner.className = 'blip-text';
    this.container.appendChild(this.inner);
  }

  getId(): string {
    return this.blipId;
  }

  getContainer(): HTMLElement {
    return this.container;
  }

  /** The inner element that holds rendered content. Exposed for callers
   * (e.g. blip-editor-host.ts) that need to mount TipTap into this slot. */
  getInner(): HTMLElement {
    return this.inner;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  /** Set the resolver used by the renderer to look up child BlipView
   * containers when it encounters a BLIP element. */
  setChildResolver(resolver: (id: string) => HTMLElement | null): void {
    this.resolver = resolver;
  }

  setContent(content: ContentArray): void {
    if (this.destroyed) return;
    this.content = content;
    this.render();
  }

  getContent(): ContentArray {
    return this.content;
  }

  render(): void {
    if (this.destroyed) return;
    const opts: RenderOptions = {
      resolveChildBlip: (id) => (this.resolver ? this.resolver(id) : null),
    };
    renderContent(this.inner, this.content, opts);
    this.emit('rendered');
  }

  on(event: BlipViewEvent, listener: BlipViewListener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit('destroyed');
    this.listeners.clear();
    while (this.inner.firstChild) this.inner.removeChild(this.inner.firstChild);
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  private emit(event: BlipViewEvent): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try {
        fn();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[BlipView] listener for "${event}" threw:`, err);
      }
    }
  }
}

/**
 * Wave-level registry: holds all BlipViews for one topic, manages
 * lookups, and provides the root container.
 *
 * Skeleton port of the structural pieces of original Rizzoma's
 * `wave/view.coffee`. Like BlipView, this is the read-mode/foundation
 * layer; TipTap mounting + Ctrl+Enter routing comes in subsequent files.
 */
export class WaveView {
  private readonly views = new Map<string, BlipView>();
  private readonly rootContainer: HTMLElement;
  private readonly contentByBlipId: (id: string) => ContentArray | null;
  private rootBlipId: string | null = null;

  constructor(contentLookup: (id: string) => ContentArray | null) {
    this.contentByBlipId = contentLookup;
    this.rootContainer = document.createElement('div');
    this.rootContainer.className = 'wave-view';
  }

  getRootContainer(): HTMLElement {
    return this.rootContainer;
  }

  setRoot(blipId: string): void {
    this.rootBlipId = blipId;
    const view = this.getOrCreateView(blipId);
    while (this.rootContainer.firstChild) this.rootContainer.removeChild(this.rootContainer.firstChild);
    this.rootContainer.appendChild(view.getContainer());
  }

  getRootBlipId(): string | null {
    return this.rootBlipId;
  }

  getView(blipId: string): BlipView | undefined {
    return this.views.get(blipId);
  }

  getOrCreateView(blipId: string): BlipView {
    let view = this.views.get(blipId);
    if (view) return view;
    view = new BlipView(blipId);
    view.setChildResolver((childId) => this.resolveChild(childId));
    this.views.set(blipId, view);
    const content = this.contentByBlipId(blipId);
    if (content) view.setContent(content);
    return view;
  }

  /** Total number of BlipViews currently held. */
  size(): number {
    return this.views.size;
  }

  destroy(): void {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.rootBlipId = null;
    while (this.rootContainer.firstChild) this.rootContainer.removeChild(this.rootContainer.firstChild);
  }

  private resolveChild(childId: string): HTMLElement | null {
    const view = this.getOrCreateView(childId);
    return view.getContainer();
  }
}
