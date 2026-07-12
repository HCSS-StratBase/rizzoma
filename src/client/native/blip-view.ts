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

/** Optional callback for opening the per-blip history modal. */
export type HistoryOpenHandler = (blipId: string) => void;

export class BlipView {
  private readonly blipId: string;
  private readonly container: HTMLElement;
  private readonly inner: HTMLElement;
  private content: ContentArray = [];
  private destroyed = false;
  private resolver: ((id: string) => HTMLElement | null) | null = null;
  private listeners: Map<BlipViewEvent, Set<BlipViewListener>> = new Map();
  private gearButton: HTMLButtonElement | null = null;
  private onOpenHistory: HistoryOpenHandler | null = null;

  constructor(blipId: string) {
    this.blipId = blipId;
    this.container = document.createElement('div');
    this.container.className = 'blip-container';
    this.container.setAttribute('data-blip-id', blipId);

    this.inner = document.createElement('div');
    this.inner.className = 'blip-text';
    this.container.appendChild(this.inner);

    // Gear menu (history button + room for share/permissions later).
    // Kept hidden by default via CSS; revealed on container hover or when
    // BlipView is "active". The native render owns this DOM directly —
    // no React, no portal — so it survives fold/unfold without remount.
    const gear = document.createElement('div');
    gear.className = 'blip-gear-menu';
    gear.contentEditable = 'false';
    const historyBtn = document.createElement('button');
    historyBtn.type = 'button';
    historyBtn.className = 'blip-gear-history';
    historyBtn.title = 'View blip history';
    historyBtn.textContent = '⏱';
    historyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.onOpenHistory) this.onOpenHistory(this.blipId);
    });
    gear.appendChild(historyBtn);
    this.container.appendChild(gear);
    this.gearButton = historyBtn;
  }

  /** Wire the history modal opener. */
  setHistoryHandler(handler: HistoryOpenHandler | null): void {
    this.onOpenHistory = handler;
  }

  /** Expose the gear button for tests / event wiring. */
  getGearButton(): HTMLButtonElement | null {
    return this.gearButton;
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

// WaveView lives in ./wave-view.ts — split out for clarity. Re-export for
// callers that still import from this module.
export { WaveView } from './wave-view';
