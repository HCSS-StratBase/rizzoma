import { formatLatexToHtml } from './renderLatex';

/**
 * Real LaTeX typesetting with KaTeX, loaded on demand.
 *
 * Why: the home-made converter in renderLatex.ts knows about 40 symbols, one level of \frac and nothing else, so an ordinary
 * formula came out as source text: the quadratic formula showed "frac{-b ± √(b2-4ac)}{2a}", \mathbb{R}, \text{}, \left( \right),
 * \vec, matrices and \int_0^\infty were all wrong (Hryhorii, 23 Nov 2026: "formulas ... render as plain text"). KaTeX was
 * already a dependency and was never used.
 *
 * KaTeX (about 270 KB) and its stylesheet load in their own chunk the first time a page holds a formula, so a topic without a
 * formula pays nothing. Until it has arrived, and for any expression KaTeX rejects (a formula still being typed), the old
 * converter draws the formula, so the page never shows raw dollar signs or an error box.
 */
type KatexModule = typeof import('katex').default;

let katex: KatexModule | null = null;
let loading: Promise<KatexModule | null> | null = null;
const listeners = new Set<() => void>();

export function loadKatex(): Promise<KatexModule | null> {
  if (katex) return Promise.resolve(katex);
  if (!loading) {
    loading = Promise.all([import('katex'), import('katex/dist/katex.min.css')])
      .then(([mod]) => {
        katex = mod.default;
        const waiting = [...listeners];
        listeners.clear();
        waiting.forEach((fn) => fn());
        return katex;
      })
      .catch(() => {
        loading = null; // offline or chunk missing: try again at the next formula
        return null;
      });
  }
  return loading;
}

export function katexLoaded(): boolean {
  return katex !== null;
}

/** Call back once KaTeX has loaded (immediately if it already has). Returns an unsubscribe function. */
export function onKatexReady(fn: () => void): () => void {
  if (katex) { fn(); return () => undefined; }
  listeners.add(fn);
  void loadKatex();
  return () => { listeners.delete(fn); };
}

/** KaTeX HTML for the expression, or null when KaTeX is not loaded yet or rejects the expression. */
export function renderKatexSync(expr: string): string | null {
  if (!katex) return null;
  const src = expr.trim();
  if (!src) return null;
  try {
    return katex.renderToString(src, {
      displayMode: false,
      throwOnError: true,
      output: 'htmlAndMathml',
      strict: 'ignore',
      trust: false,
      maxExpand: 1000,
      maxSize: 30,
    });
  } catch {
    return null;
  }
}

export type LatexHtml = { html: string; typeset: boolean };

/** What to draw for `$$ expr $$` right now: KaTeX when it can, the simple converter otherwise. */
export function renderLatex(expr: string): LatexHtml {
  const k = renderKatexSync(expr);
  if (k !== null) return { html: k, typeset: true };
  return { html: formatLatexToHtml(expr), typeset: false };
}
