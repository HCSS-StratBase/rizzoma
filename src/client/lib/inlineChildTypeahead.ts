/**
 * Ctrl+Enter type-ahead: keystrokes typed between Ctrl+Enter and the moment
 * the new inline child's editor is ready go INTO that child, never into the
 * parent.
 *
 * Inspiration: original Rizzoma (original-rizzoma-src/src/client/blip/
 * view.coffee:511-539, initInsertInlineBlip) created the child locally and
 * focused it synchronously, so the very next keystroke landed in the child.
 * Here the child needs a server id and a collaboration room before its
 * editor is editable (tens of ms locally, more on a slow link, longer after a
 * remount). Instead of making the user wait or losing what they type, we hold
 * the keys and replay them into the child the instant it is editable. If the
 * child never becomes ready, the held text goes back to where it was typed,
 * so nothing is lost.
 *
 * Measured motivation (2026-11-10, depth-10 behaviour gate): after Ctrl+Enter
 * in the topic root the cursor stayed in the root line for about a second,
 * so "L2 la" landed beside the parent's label and the rest was lost.
 */

export type TypeaheadToken = { text: string } | { key: 'Enter' | 'Backspace' };

type Inserter = (target: HTMLElement, tokens: TypeaheadToken[]) => void;

interface ActiveTypeahead {
  tokens: TypeaheadToken[];
  origin: HTMLElement | null;
  timer: ReturnType<typeof setTimeout>;
  onKeyDown: (event: KeyboardEvent) => void;
  onPointerDown: () => void;
}

let active: ActiveTypeahead | null = null;

const pushText = (tokens: TypeaheadToken[], text: string) => {
  const last = tokens[tokens.length - 1];
  if (last && 'text' in last) last.text += text;
  else tokens.push({ text });
};

const popChar = (tokens: TypeaheadToken[]): boolean => {
  const last = tokens[tokens.length - 1];
  if (!last || !('text' in last)) return false;
  last.text = last.text.slice(0, -1);
  if (!last.text) tokens.pop();
  return true;
};

/** Default replay: the browser's own editing commands, which ProseMirror
 *  receives as real input (the codebase already inserts text this way). */
export const replayIntoEditable: Inserter = (target, tokens) => {
  for (const token of tokens) {
    if ('text' in token) {
      document.execCommand('insertText', false, token.text);
    } else if (token.key === 'Backspace') {
      document.execCommand('delete', false);
    } else {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    }
  }
};

const stop = (): ActiveTypeahead | null => {
  const current = active;
  if (!current) return null;
  active = null;
  clearTimeout(current.timer);
  window.removeEventListener('keydown', current.onKeyDown, true);
  window.removeEventListener('pointerdown', current.onPointerDown, true);
  return current;
};

const deliver = (target: HTMLElement | null, tokens: TypeaheadToken[], insert: Inserter) => {
  if (!target || tokens.length === 0) return;
  if (document.activeElement !== target) target.focus();
  insert(target, tokens);
};

/**
 * Start holding keystrokes. Call synchronously from the Ctrl+Enter handler,
 * before any await. Safe to call when already active (no-op).
 */
export function beginChildTypeahead(options: { timeoutMs?: number; insert?: Inserter } = {}): void {
  if (active || typeof window === 'undefined') return;
  const tokens: TypeaheadToken[] = [];
  const origin = (document.activeElement as HTMLElement | null) ?? null;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.isComposing) return;
    const mod = event.ctrlKey || event.metaKey || event.altKey;
    if (event.key === 'Escape') {
      // The user gave up on the child: hand everything back to the parent.
      cancelChildTypeahead(options.insert);
      return;
    }
    if (mod) {
      // Swallow a second Ctrl+Enter (it would create a sibling child of the
      // PARENT); let other shortcuts (copy, reload...) through untouched.
      if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); }
      return;
    }
    if (event.key.length === 1) {
      pushText(tokens, event.key);
    } else if (event.key === 'Backspace') {
      if (!popChar(tokens)) tokens.push({ key: 'Backspace' });
    } else if (event.key === 'Enter') {
      tokens.push({ key: 'Enter' });
    } else if (event.key === 'Shift' || event.key === 'CapsLock') {
      return;
    }
    // Everything else (arrows, Tab...) is held back too: it must not move the
    // parent's cursor while the child is being opened.
    event.preventDefault();
    event.stopPropagation();
  };
  // A click elsewhere means the user moved on: return the held text to the
  // place it was typed rather than dropping it.
  const onPointerDown = () => cancelChildTypeahead(options.insert);

  const timer = setTimeout(() => cancelChildTypeahead(options.insert), options.timeoutMs ?? 10000);
  active = { tokens, origin, timer, onKeyDown, onPointerDown };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('pointerdown', onPointerDown, true);
}

/** The child's editor is editable: focus it and replay the held keys there. */
export function flushChildTypeahead(target: HTMLElement, insert: Inserter = replayIntoEditable): void {
  const current = stop();
  if (!current) {
    if (document.activeElement !== target) target.focus();
    return;
  }
  if (document.activeElement !== target) target.focus();
  deliver(target, current.tokens, insert);
}

/** The child could not be opened: replay the held keys where they were typed. */
export function cancelChildTypeahead(insert: Inserter = replayIntoEditable): void {
  const current = stop();
  if (!current) return;
  deliver(current.origin, current.tokens, insert);
}

export function isChildTypeaheadActive(): boolean {
  return active !== null;
}

/** Test hook: what is currently held. */
export function peekChildTypeahead(): TypeaheadToken[] {
  return active ? active.tokens.map((t) => ({ ...t })) : [];
}
