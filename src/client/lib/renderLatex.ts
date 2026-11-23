const SYMBOLS: Record<string, string> = {
  sum: '∑',
  prod: '∏',
  int: '∫',
  cdot: '·',
  times: '×',
  pm: '±',
  mp: '∓',
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  neq: '≠',
  ne: '≠',
  approx: '≈',
  infty: '∞',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  leftrightarrow: '↔',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  sigma: 'σ',
  phi: 'φ',
  omega: 'ω',
  Delta: 'Δ',
  Sigma: 'Σ',
  Omega: 'Ω',
  partial: '∂',
  nabla: '∇',
  forall: '∀',
  exists: '∃',
  in: '∈',
  notin: '∉',
  subset: '⊂',
  subseteq: '⊆',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Convert a LaTeX math expression (inside $$...$$) into safe, styled math HTML.
 */
export function formatLatexToHtml(rawExpr: string): string {
  let s = escapeHtml(rawExpr.trim());
  if (!s) return '';

  // Fractions: \frac{num}{den}
  s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '<span class="rizzoma-latex-frac"><span class="num">$1</span><span class="den">$2</span></span>');
  // Square roots: \sqrt{x}
  s = s.replace(/\\sqrt\{([^{}]+)\}/g, '√($1)');
  // Named symbols (\sum, \cdot, etc.)
  s = s.replace(/\\([A-Za-z]+)/g, (_m, name: string) => SYMBOLS[name] ?? name);
  // Braced subscripts and superscripts
  s = s.replace(/_\{([^{}]+)\}/g, '<sub>$1</sub>');
  s = s.replace(/\^\{([^{}]+)\}/g, '<sup>$1</sup>');
  // Single-character subscripts and superscripts
  s = s.replace(/_([A-Za-z0-9])/g, '<sub>$1</sub>');
  s = s.replace(/\^([A-Za-z0-9])/g, '<sup>$1</sup>');

  return s;
}

const BLACKBOARD: Record<string, string> = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ' };

/**
 * Convert a LaTeX expression into readable plain Unicode text (topic list preview, Mind Map). It is a reading aid, not a
 * typesetter: nested groups are resolved innermost first, wrappers such as \text{} and \mathbb{} are removed, matrices
 * become rows separated by ";", and a command it does not know keeps its name (sin, log, lim), so no backslash and no brace
 * of the source is left in the text. (Before, \frac{-b \pm \sqrt{b^2-4ac}}{2a} previewed as "frac{-b ± √(b^2-4ac)}{2a}".)
 */
export function formatLatexToPlain(rawExpr: string): string {
  let s = rawExpr.trim();
  if (!s) return '';
  for (let i = 0; i < 12; i += 1) {
    const before = s;
    s = s
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
      .replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, '$1√($2)')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
      .replace(/\\mathbb\s*\{([A-Z])\}/g, (_m, l: string) => BLACKBOARD[l] ?? l)
      .replace(/\\(?:text|textbf|textit|mathrm|mathbf|mathit|mathcal|mathsf|operatorname|boldsymbol|vec|hat|bar|overline|underline|tilde)\s*\{([^{}]*)\}/g, '$1');
    if (s === before) break;
  }
  s = s
    .replace(/\\(?:begin|end)\s*\{[A-Za-z*]+\}/g, '')
    .replace(/\\\\/g, '; ')
    .replace(/&/g, ' ')
    .replace(/\\(?:left|right|bigl|bigr|big|Big|bigg|Bigg)(?![A-Za-z])\s*/g, '')
    .replace(/\\[A-Za-z]+/g, (cmd) => SYMBOLS[cmd.slice(1)] ?? cmd.slice(1))
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/([_^])\{([^{}]*)\}/g, (_m, op: string, inner: string) => (inner.length > 1 ? `${op}(${inner})` : `${op}${inner}`))
    .replace(/[{}]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}
