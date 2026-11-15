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

/**
 * Convert a LaTeX expression into readable plain Unicode text (for MindMap / snippets).
 */
export function formatLatexToPlain(rawExpr: string): string {
  let s = rawExpr.trim();
  if (!s) return '';
  s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)');
  s = s.replace(/\\sqrt\{([^{}]+)\}/g, '√($1)');
  s = s.replace(/\\([A-Za-z]+)/g, (_m, name: string) => SYMBOLS[name] ?? name);
  s = s.replace(/[_^]\{([^{}]+)\}/g, '$1');
  return s.replace(/\s+/g, ' ').trim();
}
