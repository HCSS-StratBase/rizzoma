// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { loadKatex, renderLatex, renderKatexSync, katexLoaded } from '../client/lib/katexRender';
import { LatexSpan } from '../client/components/blip/LatexSpan';
import { snippetWithFormulas } from '../client/components/RizzomaTopicsList';
import { latexWidgetHtml } from '../client/components/editor/extensions/LatexPreview';

// Hryhorii, 23 Nov 2026: "some elements aren't rendering correctly: formulas". The home-made converter printed the
// quadratic formula as "frac{-b ± √(b2-4ac)}{2a}". These are formulas people actually write.
const QUADRATIC = 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}';
const HARD = [
  QUADRATIC,
  '\\mathbb{R}^n',
  '\\text{if } x > 0',
  '\\left( \\frac{a}{b} \\right)',
  '\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}',
  '\\vec{v} \\cdot \\hat{x}',
  '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
  '\\frac{1}{1+\\frac{1}{x}}',
  '\\sqrt[3]{x}',
];

describe('formulas are typeset with KaTeX', () => {
  it('before KaTeX has loaded the simple converter draws something readable, never raw source', () => {
    if (katexLoaded()) return; // another test in this file may have loaded it
    const r = renderLatex('E = mc^2');
    expect(r.typeset).toBe(false);
    expect(r.html).toContain('<sup>2</sup>');
  });

  it('typesets every hard formula: a .katex tree, and none of the source commands left as text', async () => {
    await loadKatex();
    expect(katexLoaded()).toBe(true);
    for (const f of HARD) {
      const k = renderKatexSync(f);
      expect(k, f).not.toBeNull();
      const host = document.createElement('div');
      host.innerHTML = k as string;
      expect(host.querySelector('.katex'), f).not.toBeNull();
      const visible = host.querySelector('.katex-html')?.textContent || '';
      expect(visible, f).not.toMatch(/\\|frac\{|mathbb\{|text\{|begin\{|left\(|vec\{|hat\{/);
    }
  });

  it('the quadratic formula keeps its fraction: numerator holds the root, denominator is 2a', async () => {
    await loadKatex();
    const host = document.createElement('div');
    host.innerHTML = renderLatex(QUADRATIC).html;
    expect(host.querySelector('.mfrac')).not.toBeNull();
    expect(host.querySelector('.sqrt')).not.toBeNull();
    // MathML copy for screen readers carries the real structure
    expect(host.querySelector('annotation[encoding="application/x-tex"]')?.textContent).toBe(QUADRATIC);
  });

  it('an unfinished formula (what a person types on the way) falls back instead of showing an error', async () => {
    await loadKatex();
    for (const partial of ['\\frac{a}{', '\\sqrt{', 'x^{', '\\begin{matrix} a']) {
      const r = renderLatex(partial);
      expect(r.typeset, partial).toBe(false);
      expect(r.html, partial).not.toContain('katex-error');
    }
  });

  it('never lets a formula run script, open a link or load a picture (trust off)', async () => {
    await loadKatex();
    for (const evil of ['\\href{javascript:alert(1)}{x}', '\\url{http://example.com}', '\\includegraphics{http://x/y.png}', '\\htmlClass{a}{x}', '\\htmlStyle{color:red}{x}']) {
      const host = document.createElement('div');
      host.innerHTML = renderLatex(evil).html;
      expect(host.querySelector('a, img, script, iframe, [href], [onclick]'), evil).toBeNull();
      // the source text may still be echoed (inert text in the TeX annotation); what must not exist is an element or attribute that acts on it
      expect(host.querySelector('[style*="javascript"], [src]'), evil).toBeNull()
    }
  });

  it('LatexSpan in the read view ends up typeset', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<LatexSpan expr={QUADRATIC} />); });
    await act(async () => { await loadKatex(); });
    const span = container.querySelector('.rizzoma-latex');
    expect(span?.classList.contains('rizzoma-latex-katex')).toBe(true);
    expect(span?.querySelector('.katex')).not.toBeNull();
    await act(async () => { root.unmount(); });
  });

  it('the editor preview widget uses the same typesetting', async () => {
    await loadKatex();
    const w = latexWidgetHtml(QUADRATIC);
    expect(w.empty).toBe(false);
    expect(w.html).toContain('katex');
    expect(latexWidgetHtml('   ').empty).toBe(true);
  });
});

describe('topic list snippet', () => {
  it('shows readable symbols instead of $$ and backslashes', () => {
    const s = snippetWithFormulas('typed formula $$\\sum_{i=1}^{n} x^2 \\leq \\alpha$$ end');
    expect(s).not.toContain('$$');
    expect(s).not.toContain('\\');
    expect(s).toContain('∑');
    expect(s).toContain('≤');
    expect(s).toContain('α');
  });
  it('leaves text without formulas alone', () => {
    expect(snippetWithFormulas('plain text, 5$ and 6$')).toBe('plain text, 5$ and 6$');
  });
});
