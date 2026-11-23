import { describe, it, expect } from 'vitest';
import { formatLatexToPlain, SYMBOLS } from '../client/lib/renderLatex';

// The topic list preview and the Mind Map show formulas as plain text. Hryhorii (23 Nov 2026) saw formulas as source;
// after KaTeX fixed the blip body, the preview still said "frac{-b ± √(b^2-4ac)}{2a}".
describe('formatLatexToPlain', () => {
  const cases: Array<[string, string]> = [
    ['x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', 'x = (-b ± √(b^2-4ac))/(2a)'],
    ['\\mathbb{R}^n \\ni v', 'ℝ^n ∋ v'],
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

  it('\\ni prints the symbol, not the letters ni (23 Nov: "A \\ni v" read "A ni v")', () => {
    expect(formatLatexToPlain('A \\ni v')).toBe('A ∋ v');
    expect(formatLatexToPlain('\\not\\ni')).toBe('∌');
  });

  // One case per command family the task named, plus the ones KaTeX supports that were missing.
  const symbolCases: Array<[string, string]> = [
    ['a \\in B', 'a ∈ B'], ['a \\notin B', 'a ∉ B'], ['A \\subset B', 'A ⊂ B'], ['A \\subseteq B', 'A ⊆ B'],
    ['A \\supset B', 'A ⊃ B'], ['A \\supseteq B', 'A ⊇ B'], ['A \\cup B', 'A ∪ B'], ['A \\cap B', 'A ∩ B'],
    ['A \\setminus B', 'A ∖ B'], ['\\emptyset', '∅'], ['\\varnothing', '∅'],
    ['\\forall x \\exists y', '∀ x ∃ y'], ['\\nexists', '∄'], ['\\infty', '∞'], ['\\partial f', '∂ f'], ['\\nabla f', '∇ f'],
    ['a \\to b', 'a → b'], ['a \\Rightarrow b', 'a ⇒ b'], ['a \\Leftarrow b', 'a ⇐ b'], ['a \\Leftrightarrow b', 'a ⇔ b'],
    ['a \\iff b', 'a ⟺ b'], ['a \\implies b', 'a ⟹ b'], ['x \\mapsto y', 'x ↦ y'], ['a \\longrightarrow b', 'a ⟶ b'],
    ['a \\leq b', 'a ≤ b'], ['a \\geq b', 'a ≥ b'], ['a \\neq b', 'a ≠ b'], ['a \\approx b', 'a ≈ b'],
    ['a \\sim b', 'a ∼ b'], ['a \\simeq b', 'a ≃ b'], ['a \\cong b', 'a ≅ b'], ['a \\equiv b', 'a ≡ b'],
    ['a \\propto b', 'a ∝ b'], ['a \\ll b', 'a ≪ b'], ['a \\gg b', 'a ≫ b'], ['a \\perp b', 'a ⊥ b'],
    ['a \\parallel b', 'a ∥ b'], ['a \\mid b', 'a ∣ b'], ['a \\times b', 'a × b'], ['a \\cdot b', 'a · b'],
    ['a \\div b', 'a ÷ b'], ['a \\circ b', 'a ∘ b'], ['a \\oplus b', 'a ⊕ b'], ['a \\otimes b', 'a ⊗ b'],
    ['a \\wedge b', 'a ∧ b'], ['a \\vee b', 'a ∨ b'], ['\\neg a', '¬ a'], ['a \\land b \\lor c', 'a ∧ b ∨ c'],
    ['\\sum \\prod \\int', '∑ ∏ ∫'], ['\\iint \\oint', '∬ ∮'], ['\\bigcup \\bigcap', '⋃ ⋂'],
    ['\\lim_{x \\to 0}', 'lim_(x → 0)'], ['\\sin x + \\log y', 'sin x + log y'],
    ['1, 2, \\ldots, n', '1, 2, …, n'], ['1 + \\cdots + n', '1 + ⋯ + n'], ['\\vdots \\ddots', '⋮ ⋱'],
    ['\\langle a, b \\rangle', '⟨ a, b ⟩'], ['\\lfloor x \\rfloor \\lceil y \\rceil', '⌊ x ⌋ ⌈ y ⌉'],
    ['\\hbar \\ell \\aleph \\Re \\Im', 'ℏ ℓ ℵ ℜ ℑ'], ['\\angle ABC', '∠ ABC'], ['90^\\circ', '90^∘'],
    ['f^\\prime', 'f^′'], ['\\therefore \\because', '∴ ∵'], ['a \\pm b \\mp c', 'a ± b ∓ c'],
    ['\\alpha \\beta \\gamma \\delta \\epsilon \\varepsilon \\zeta \\eta \\theta \\vartheta', 'α β γ δ ε ε ζ η θ ϑ'],
    ['\\iota \\kappa \\lambda \\mu \\nu \\xi \\pi \\varpi \\rho \\varrho', 'ι κ λ μ ν ξ π ϖ ρ ϱ'],
    ['\\sigma \\varsigma \\tau \\upsilon \\phi \\varphi \\chi \\psi \\omega', 'σ ς τ υ φ ϕ χ ψ ω'],
    ['\\Gamma \\Delta \\Theta \\Lambda \\Xi \\Pi \\Sigma \\Upsilon \\Phi \\Psi \\Omega', 'Γ Δ Θ Λ Ξ Π Σ Υ Φ Ψ Ω'],
    ['\\mathbb{R} \\mathbb{N} \\mathbb{Z} \\mathbb{Q} \\mathbb{C} \\mathbb{P} \\mathbb{E}', 'ℝ ℕ ℤ ℚ ℂ ℙ 𝔼'],
    ['\\mathbb R', 'ℝ'], ['\\text{for all } x', 'for all x'], ['\\textbf{b} \\mathrm{d}x \\mathcal{L}', 'b dx L'],
    ['\\operatorname{rank} A', 'rank A'], ['\\vec{v} \\hat{x} \\bar{y}', 'v x y'],
    ['\\sqrt{x} \\sqrt[n]{x} \\sqrt2', '√(x) n√(x) √2'], ['\\frac12', '(1)/(2)'], ['\\dfrac{a}{b} \\tfrac{c}{d}', '(a)/(b) (c)/(d)'],
    ['\\binom{n}{k}', '(n choose k)'], ['\\displaystyle \\sum_{i} x_i', '∑_i x_i'], ['a \\quad b \\qquad c', 'a b c'],
    ['\\boxed{x}', 'x'], ['\\color{red}{x}', 'x'], ['\\overset{def}{=}', '='], ['\\xrightarrow{f}', '→(f)'],
    ['\\{ x \\}', '{ x }'], ['\\lbrace x \\rbrace', '{ x }'], ['50\\% \\$5 \\# a\\_b \\&', '50% $5 # a_b &'], ['a \\| b', 'a ‖ b'],
    ['\\lVert x \\rVert \\vert y \\vert', '‖ x ‖ | y |'], ['a \\backslash b', 'a \\ b'], ['\\left. x \\right|', 'x |'],
    ['\\begin{cases} a & b \\\\ c & d \\end{cases}', 'a b ; c d'],
  ];
  for (const [src, want] of symbolCases) {
    it(`previews symbols in ${src}`, () => {
      const out = formatLatexToPlain(src);
      expect(out).toBe(want);
      // A command name must not leak: no backslash and no brace unless the source asked for one.
      if (!/\\\{|\\lbrace|\\backslash/.test(src)) expect(out).not.toMatch(/[\\{}]/);
    });
  }

  it('maps every command of the symbol table and leaks none of them as letters', () => {
    const letters = new Set(['sin', 'log']);
    for (const [name, sym] of Object.entries(SYMBOLS)) {
      expect(letters.has(name)).toBe(false);
      const out = formatLatexToPlain(`x \\${name} y`);
      if (!/backslash/i.test(name)) expect(out, name).not.toMatch(/[\\]/);
      if (sym.trim()) expect(out, name).toContain(sym.replace(/\\\\/g, '\\'));
      // the command's own name must not appear in the preview (symbols such as \ss or \o excepted when they equal the name)
      if (name.length > 2 && sym !== name) expect(out.replace(/[ ]/g, ''), name).not.toContain(name);
    }
  });

  it('keeps the names of functions that have no symbol (sin, cos, log, ln, exp, max, min, det, gcd)', () => {
    for (const f of ['sin', 'cos', 'tan', 'log', 'ln', 'exp', 'max', 'min', 'det', 'gcd', 'lim', 'sup', 'inf']) {
      expect(formatLatexToPlain(`\\${f} x`)).toBe(`${f} x`);
    }
  });

  it('survives an unfinished formula', () => {
    expect(() => formatLatexToPlain('\\frac{a}{')).not.toThrow();
    expect(formatLatexToPlain('\\frac{a}{')).not.toMatch(/\\/);
    expect(formatLatexToPlain('   ')).toBe('');
  });
});
