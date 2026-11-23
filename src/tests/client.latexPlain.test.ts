import { describe, it, expect } from 'vitest';
import { formatLatexToPlain } from '../client/lib/renderLatex';

// The topic list preview and the Mind Map show formulas as plain text. Hryhorii (23 Nov 2026) saw formulas as source;
// after KaTeX fixed the blip body, the preview still said "frac{-b ± √(b^2-4ac)}{2a}".
describe('formatLatexToPlain', () => {
  const cases: Array<[string, string]> = [
    ['x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', 'x = (-b ± √(b^2-4ac))/(2a)'],
    ['\\mathbb{R}^n \\ni v', 'ℝ^n ni v'],
    ['\\text{if } x > 0', 'if x > 0'],
    ['\\left( \\frac{a}{b} \\right)', '( (a)/(b) )'],
    ['\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}', '∫_0^∞ e^(-x^2) dx = (√(π))/(2)'],
    ['\\sum_{i=1}^{n} x^2 \\leq \\alpha', '∑_(i=1)^n x^2 ≤ α'],
    ['\\frac{1}{1+\\frac{1}{x}}', '(1)/(1+(1)/(x))'],
    ['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', 'a b ; c d'],
    ['\\sqrt[3]{x}', '3√(x)'],
  ];
  for (const [src, want] of cases) {
    it(`previews ${src}`, () => {
      expect(formatLatexToPlain(src)).toBe(want);
    });
  }

  it('leaves no backslash and no brace of the source in any preview', () => {
    for (const [src] of cases) {
      const out = formatLatexToPlain(src);
      expect(out, src).not.toMatch(/[\\{}]/);
    }
  });

  it('survives an unfinished formula', () => {
    expect(() => formatLatexToPlain('\\frac{a}{')).not.toThrow();
    expect(formatLatexToPlain('\\frac{a}{')).not.toMatch(/\\/);
    expect(formatLatexToPlain('   ')).toBe('');
  });
});
