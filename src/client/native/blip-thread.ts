/**
 * Native fractal-render — BlipThread.
 *
 * Direct TS port of original Rizzoma's `blip/blip_thread.coffee`.
 *
 * A BlipThread is a `<span class="blip-thread">` wrapper that lives INSIDE
 * the parent's content `<p>`. It contains:
 *   - A fold-button (the [+]/[-] toggle)
 *   - A `<div class="js-blips-container">` that hosts one or more child blips
 *
 * Multiple BLIP elements with the same threadId batch into ONE BlipThread
 * (per renderer.coffee:106-107). Distinct threadIds → distinct BlipThreads.
 *
 * Fold/unfold is a CSS class toggle on the persistent span — never destroys
 * the subtree. Matches original (blip_thread.coffee:35-63).
 */

const ANIMATED_CLASS = 'animated';
const FOLDED_CLASS = 'folded';
const ANIMATION_DURATION_MS = 3000;

export type BlipThreadEvent = 'fold' | 'unfold';
export type BlipThreadListener = () => void;

const renderTemplate = (): string => `
<div class="fold-button-container" contenteditable="false">
  <span class="js-fold-button fold-button" role="button" tabindex="0">
    <div>
      <img src="/s/img/empty_pixel.png" height="20" width="18" alt="" />
      <div></div>
      <img class="plus-minus" src="/s/img/plus_minus.png" alt="" />
    </div>
  </span>
</div>
<div class="js-blips-container blips-container"></div>
`;

export class BlipThread {
  private readonly threadId: string;
  private readonly container: HTMLSpanElement;
  private readonly blipsContainer: HTMLDivElement;
  private readonly foldButton: HTMLElement;
  private blipNodes: HTMLElement[] = [];
  private folded = true;
  private animationTimer: number | null = null;
  private listeners: Map<BlipThreadEvent, Set<BlipThreadListener>> = new Map();

  constructor(threadId: string, firstBlipNode?: HTMLElement) {
    this.threadId = threadId;
    this.container = document.createElement('span');
    this.container.contentEditable = 'false';
    this.container.className = 'blip-thread';
    this.container.setAttribute('data-thread-id', threadId);
    this.container.innerHTML = renderTemplate();

    const blipsContainerEl = this.container.querySelector('.js-blips-container');
    if (!(blipsContainerEl instanceof HTMLDivElement)) {
      throw new Error('BlipThread template did not produce a js-blips-container');
    }
    this.blipsContainer = blipsContainerEl;

    const foldButtonEl = this.container.querySelector('.js-fold-button');
    if (!(foldButtonEl instanceof HTMLElement)) {
      throw new Error('BlipThread template did not produce a js-fold-button');
    }
    this.foldButton = foldButtonEl;

    this.foldButton.addEventListener('click', this.handleFoldClick);
    // Stop key/mouse propagation into parent contenteditable.
    this.foldButton.addEventListener('mousedown', (e) => e.stopPropagation());
    this.foldButton.addEventListener('keydown', (e) => e.stopPropagation());

    // Default to folded (per original initFold(true)).
    this.fold(false);

    if (firstBlipNode) {
      this.appendBlipElement(firstBlipNode);
    }

    // Tag container so other code can find the thread from any descendant.
    (this.container as unknown as { __rzBlipThread: BlipThread }).__rzBlipThread = this;
  }

  /** Static lookup: walk up from any DOM node to find its enclosing BlipThread. */
  static fromElement(element: Element | null): BlipThread | null {
    let cur: Element | null = element;
    while (cur) {
      const t = (cur as unknown as { __rzBlipThread?: BlipThread }).__rzBlipThread;
      if (t) return t;
      cur = cur.parentElement;
    }
    return null;
  }

  getId(): string {
    return this.threadId;
  }

  getContainer(): HTMLSpanElement {
    return this.container;
  }

  getBlipsContainer(): HTMLDivElement {
    return this.blipsContainer;
  }

  getBlipNodes(): readonly HTMLElement[] {
    return this.blipNodes;
  }

  isFolded(): boolean {
    return this.folded;
  }

  isFirstInThread(blipNode: HTMLElement): boolean {
    return this.blipNodes[0] === blipNode;
  }

  /** Append a child blip's DOM node into this thread. */
  appendBlipElement(blipNode: HTMLElement): void {
    this.blipNodes.push(blipNode);
    this.blipsContainer.appendChild(blipNode);
  }

  /** Insert AFTER another blip node already in this thread. */
  insertBlipNodeAfter(blipNode: HTMLElement, afterNode: HTMLElement): void {
    const idx = this.blipNodes.indexOf(afterNode);
    if (idx < 0) throw new Error('afterNode not in this thread');
    this.blipNodes.splice(idx + 1, 0, blipNode);
    afterNode.insertAdjacentElement('afterend', blipNode);
  }

  removeBlipNode(blipNode: HTMLElement): void {
    const idx = this.blipNodes.indexOf(blipNode);
    if (idx < 0) return;
    this.blipNodes.splice(idx, 1);
    if (blipNode.parentNode === this.blipsContainer) {
      this.blipsContainer.removeChild(blipNode);
    }
    if (this.blipNodes.length === 0) {
      this.destroy();
    }
  }

  fold(animated = true): void {
    if (this.folded) return;
    this.folded = true;
    this.container.classList.add(FOLDED_CLASS);
    this.emit('fold');
    if (animated) {
      this.setAnimated(true);
      this.animationTimer = window.setTimeout(() => {
        this.setAnimated(false);
        this.animationTimer = null;
      }, ANIMATION_DURATION_MS);
    }
  }

  unfold(): void {
    if (!this.folded) return;
    this.folded = false;
    this.container.classList.remove(FOLDED_CLASS);
    if (this.animationTimer !== null) {
      window.clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
    this.setAnimated(false);
    this.emit('unfold');
  }

  toggle(): void {
    if (this.folded) {
      this.unfold();
    } else {
      this.fold();
    }
  }

  on(event: BlipThreadEvent, listener: BlipThreadListener): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  }

  destroy(): void {
    this.foldButton.removeEventListener('click', this.handleFoldClick);
    if (this.animationTimer !== null) {
      window.clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
    delete (this.container as unknown as { __rzBlipThread?: BlipThread }).__rzBlipThread;
    this.blipNodes = [];
    this.listeners.clear();
    if (this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
  }

  private handleFoldClick = (e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    this.toggle();
  };

  private setAnimated(on: boolean): void {
    if (on) {
      this.container.classList.add(ANIMATED_CLASS);
    } else {
      this.container.classList.remove(ANIMATED_CLASS);
    }
  }

  private emit(event: BlipThreadEvent): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      try {
        fn();
      } catch (err) {
        // Don't let one listener break another.
        // eslint-disable-next-line no-console
        console.error(`[BlipThread] listener for "${event}" threw:`, err);
      }
    }
  }
}
