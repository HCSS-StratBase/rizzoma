/** LaTeX command (without the backslash) to the Unicode text that stands for it. Styling and spacing words map to "" or " ". */
export const SYMBOLS: Record<string, string> = {
  // operators
  sum: '∑',
  prod: '∏',
  coprod: '∐',
  int: '∫',
  iint: '∬',
  iiint: '∭',
  oint: '∮',
  bigcup: '⋃',
  bigcap: '⋂',
  bigvee: '⋁',
  bigwedge: '⋀',
  bigoplus: '⨁',
  bigotimes: '⨂',
  bigsqcup: '⨆',
  cdot: '·',
  times: '×',
  div: '÷',
  pm: '±',
  mp: '∓',
  ast: '∗',
  star: '⋆',
  circ: '∘',
  bullet: '•',
  oplus: '⊕',
  ominus: '⊖',
  otimes: '⊗',
  oslash: '⊘',
  odot: '⊙',
  cup: '∪',
  cap: '∩',
  uplus: '⊎',
  sqcup: '⊔',
  sqcap: '⊓',
  setminus: '∖',
  smallsetminus: '∖',
  wedge: '∧',
  land: '∧',
  vee: '∨',
  lor: '∨',
  neg: '¬',
  lnot: '¬',
  dagger: '†',
  ddagger: '‡',
  wr: '≀',
  triangle: '△',
  bigtriangleup: '△',
  bigtriangledown: '▽',
  diamond: '⋄',
  amalg: '⨿',
  sqrt: '√',
  // relations
  leq: '≤',
  le: '≤',
  geq: '≥',
  ge: '≥',
  neq: '≠',
  ne: '≠',
  approx: '≈',
  approxeq: '≊',
  thickapprox: '≈',
  sim: '∼',
  simeq: '≃',
  cong: '≅',
  equiv: '≡',
  propto: '∝',
  ll: '≪',
  gg: '≫',
  lll: '⋘',
  ggg: '⋙',
  prec: '≺',
  succ: '≻',
  preceq: '⪯',
  succeq: '⪰',
  leqslant: '⩽',
  geqslant: '⩾',
  lesssim: '≲',
  gtrsim: '≳',
  doteq: '≐',
  asymp: '≍',
  bowtie: '⋈',
  models: '⊨',
  vdash: '⊢',
  dashv: '⊣',
  vDash: '⊨',
  perp: '⊥',
  bot: '⊥',
  top: '⊤',
  parallel: '∥',
  mid: '∣',
  nmid: '∤',
  nparallel: '∦',
  smile: '⌣',
  frown: '⌢',
  coloneqq: '≔',
  eqqcolon: '≕',
  triangleq: '≜',
  lt: '<',
  gt: '>',
  // sets and misc
  in: '∈',
  notin: '∉',
  ni: '∋',
  owns: '∋',
  subset: '⊂',
  supset: '⊃',
  subseteq: '⊆',
  supseteq: '⊇',
  subsetneq: '⊊',
  supsetneq: '⊋',
  nsubseteq: '⊈',
  nsupseteq: '⊉',
  sqsubset: '⊏',
  sqsupset: '⊐',
  sqsubseteq: '⊑',
  sqsupseteq: '⊒',
  emptyset: '∅',
  varnothing: '∅',
  forall: '∀',
  exists: '∃',
  nexists: '∄',
  complement: '∁',
  aleph: 'ℵ',
  beth: 'ℶ',
  Re: 'ℜ',
  Im: 'ℑ',
  wp: '℘',
  ell: 'ℓ',
  hbar: 'ℏ',
  hslash: 'ℏ',
  imath: 'ı',
  jmath: 'ȷ',
  mho: '℧',
  Box: '□',
  square: '□',
  blacksquare: '■',
  Diamond: '◇',
  lozenge: '◊',
  therefore: '∴',
  because: '∵',
  angle: '∠',
  measuredangle: '∡',
  sphericalangle: '∢',
  degree: '°',
  prime: '′',
  backprime: '‵',
  infty: '∞',
  partial: '∂',
  nabla: '∇',
  surd: '√',
  checkmark: '✓',
  flat: '♭',
  natural: '♮',
  sharp: '♯',
  clubsuit: '♣',
  diamondsuit: '♢',
  heartsuit: '♡',
  spadesuit: '♠',
  copyright: '©',
  S: '§',
  P: '¶',
  pounds: '£',
  euro: '€',
  yen: '¥',
  ss: 'ß',
  aa: 'å',
  AA: 'Å',
  o: 'ø',
  O: 'Ø',
  ae: 'æ',
  AE: 'Æ',
  oe: 'œ',
  OE: 'Œ',
  i: 'ı',
  j: 'ȷ',
  // arrows
  to: '→',
  rightarrow: '→',
  Rightarrow: '⇒',
  longrightarrow: '⟶',
  Longrightarrow: '⟹',
  leftarrow: '←',
  Leftarrow: '⇐',
  longleftarrow: '⟵',
  Longleftarrow: '⟸',
  leftrightarrow: '↔',
  Leftrightarrow: '⇔',
  longleftrightarrow: '⟷',
  Longleftrightarrow: '⟺',
  iff: '⟺',
  implies: '⟹',
  impliedby: '⟸',
  gets: '←',
  mapsto: '↦',
  longmapsto: '⟼',
  hookrightarrow: '↪',
  hookleftarrow: '↩',
  uparrow: '↑',
  Uparrow: '⇑',
  downarrow: '↓',
  Downarrow: '⇓',
  updownarrow: '↕',
  Updownarrow: '⇕',
  nearrow: '↗',
  searrow: '↘',
  swarrow: '↙',
  nwarrow: '↖',
  rightharpoonup: '⇀',
  rightharpoondown: '⇁',
  leftharpoonup: '↼',
  leftharpoondown: '↽',
  rightleftharpoons: '⇌',
  leadsto: '⇝',
  rightsquigarrow: '⇝',
  twoheadrightarrow: '↠',
  nrightarrow: '↛',
  nleftarrow: '↚',
  nleftrightarrow: '↮',
  nRightarrow: '⇏',
  nLeftarrow: '⇍',
  nLeftrightarrow: '⇎',
  curvearrowright: '↷',
  curvearrowleft: '↶',
  circlearrowright: '↻',
  circlearrowleft: '↺',
  rightrightarrows: '⇉',
  leftleftarrows: '⇇',
  rightleftarrows: '⇄',
  leftrightarrows: '⇆',
  // dots, brackets, spacing and style words
  ldots: '…',
  dots: '…',
  dotsc: '…',
  dotsb: '⋯',
  dotsm: '⋯',
  cdots: '⋯',
  vdots: '⋮',
  ddots: '⋱',
  textellipsis: '…',
  quad: ' ',
  qquad: ' ',
  enspace: ' ',
  thinspace: ' ',
  medspace: ' ',
  thickspace: ' ',
  negthinspace: '',
  hspace: '',
  displaystyle: '',
  textstyle: '',
  scriptstyle: '',
  scriptscriptstyle: '',
  limits: '',
  nolimits: '',
  nonumber: '',
  notag: '',
  middle: '',
  mathop: '',
  mathrel: '',
  mathbin: '',
  mathord: '',
  hline: '',
  cr: '',
  relax: '',
  allowbreak: '',
  nobreak: '',
  hfill: '',
  smash: '',
  strut: '',
  displaylines: '',
  langle: '⟨',
  rangle: '⟩',
  lceil: '⌈',
  rceil: '⌉',
  lfloor: '⌊',
  rfloor: '⌋',
  lbrace: '{',
  rbrace: '}',
  lbrack: '[',
  rbrack: ']',
  lvert: '|',
  rvert: '|',
  vert: '|',
  lVert: '‖',
  rVert: '‖',
  Vert: '‖',
  backslash: '\\',
  textbackslash: '\\',
  slash: '/',
  textbar: '|',
  textless: '<',
  textgreater: '>',
  textasciitilde: '~',
  textasciicircum: '^',
  textunderscore: '_',
  ulcorner: '⌜',
  urcorner: '⌝',
  llcorner: '⌞',
  lrcorner: '⌟',
  // greek
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  vartheta: 'ϑ',
  iota: 'ι',
  kappa: 'κ',
  varkappa: 'ϰ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  omicron: 'ο',
  pi: 'π',
  varpi: 'ϖ',
  rho: 'ρ',
  varrho: 'ϱ',
  sigma: 'σ',
  varsigma: 'ς',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  varphi: 'ϕ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  digamma: 'ϝ',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
  varGamma: 'Γ',
  varDelta: 'Δ',
  varTheta: 'Θ',
  varLambda: 'Λ',
  varXi: 'Ξ',
  varPi: 'Π',
  varSigma: 'Σ',
  varUpsilon: 'Υ',
  varPhi: 'Φ',
  varPsi: 'Ψ',
  varOmega: 'Ω',
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

const BLACKBOARD: Record<string, string> = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ', E: '𝔼', H: 'ℍ', K: '𝕂', F: '𝔽', S: '𝕊', T: '𝕋', '1': '𝟙' };

// Private-use stand-ins so an escaped brace or underscore survives the brace and sub/superscript passes.
const LBRACE = '\uE000';
const RBRACE = '\uE001';
const USCORE = '\uE002';
const CARET = '\uE003';
const BSLASH = '\uE004';
const AMP = '\uE005';

// Commands that wrap one braced argument and only style it: the preview keeps the argument.
const WRAPPERS =
  'text|textbf|textit|textrm|textsf|texttt|textnormal|mbox|hbox|mathrm|mathbf|mathit|mathcal|mathsf|mathtt|mathfrak|mathscr|mathbb|operatorname|boldsymbol|bm|pmb|vec|hat|widehat|bar|overline|underline|tilde|widetilde|dot|ddot|dddot|check|acute|grave|breve|overrightarrow|overleftarrow|overbrace|underbrace|boxed|cancel|bcancel|xcancel|substack|mathstrut|phantom|vphantom|hphantom|hspace|vspace|label|tag|ensuremath';

/**
 * Convert a LaTeX expression into readable plain Unicode text (topic list preview, Mind Map). It is a reading aid, not a
 * typesetter: nested groups are resolved innermost first, wrappers such as \text{} and \mathbb{} are removed, matrices
 * become rows separated by ";", and a command it does not know keeps its name (sin, log, lim), so no backslash and no brace
 * of the source is left in the text. (Before, \frac{-b \pm \sqrt{b^2-4ac}}{2a} previewed as "frac{-b ± √(b^2-4ac)}{2a}".)
 * Every symbol command of SYMBOLS (Greek, relations, arrows, sets, operators, spacing and style words) is replaced by its
 * Unicode character, so "\ni" reads "∋" and never "ni".
 */
export function formatLatexToPlain(rawExpr: string): string {
  let s = rawExpr.trim();
  if (!s) return '';
  // Escaped characters first: \{ \} \_ \^ \% \$ \# \& \| and the line break \\ .
  s = s.replace(/\\(\\|[{}_^%$#&|])/g, (_m, c: string) => {
    switch (c) {
      case '\\': return '; ';
      case '{': return LBRACE;
      case '}': return RBRACE;
      case '_': return USCORE;
      case '^': return CARET;
      case '|': return '‖';
      case '&': return AMP;
      default: return c;
    }
  });
  s = s.replace(/\\(?:left|right)\s*\./g, '');
  const wrapperRe = new RegExp(`\\\\(?:${WRAPPERS})\\s*\\{([^{}]*)\\}`, 'g');
  for (let i = 0; i < 12; i += 1) {
    const before = s;
    s = s
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
      .replace(/\\[dt]?binom\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1 choose $2)')
      .replace(/\\(?:overset|stackrel)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$2')
      .replace(/\\underset\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$2_($1)')
      .replace(/\\x(right|left)arrow\s*(?:\[([^\]]*)\])?\s*\{([^{}]*)\}/g, (_m, d: string, _lo: string, up: string) => `${d === 'right' ? '→' : '←'}(${up})`)
      .replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, '$1√($2)')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
      .replace(/\\mathbb\s*\{([A-Z1])\}/g, (_m, l: string) => BLACKBOARD[l] ?? l)
      .replace(/\\color\s*\{[^{}]*\}/g, '')
      .replace(wrapperRe, '$1');
    if (s === before) break;
  }
  s = s
    // Arguments without braces: \frac12, \sqrt2, \mathbb R.
    .replace(/\\[dt]?frac\s*([0-9A-Za-z])\s*([0-9A-Za-z])/g, '($1)/($2)')
    .replace(/\\sqrt\s*([0-9A-Za-z])/g, '√$1')
    .replace(/\\mathbb\s*([A-Z1])/g, (_m, l: string) => BLACKBOARD[l] ?? l)
    .replace(/\\(?:begin|end)\s*\{[A-Za-z*]+\}(?:\s*\{[^{}]*\})?/g, '')
    .replace(/&/g, ' ')
    .replace(/\\(?:left|right|bigl|bigr|big|Big|Bigl|Bigr|bigg|Bigg|biggl|biggr|Biggl|Biggr)(?![A-Za-z])\s*/g, '')
    .replace(/\\not\s*(\\[A-Za-z]+)/g, '$1̸')
    .replace(/\\[A-Za-z]+/g, (cmd) => {
      const sym = SYMBOLS[cmd.slice(1)];
      return sym === undefined ? cmd.slice(1) : sym.replace(/\{/g, LBRACE).replace(/\}/g, RBRACE).replace(/_/g, USCORE).replace(/\^/g, CARET).replace(/\\/g, BSLASH);
    })
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/([_^])\{([^{}]*)\}/g, (_m, op: string, inner: string) => (inner.length > 1 ? `${op}(${inner})` : `${op}${inner}`))
    .replace(/[{}]/g, '')
    .replace(/\\/g, '')
    .replace(new RegExp(LBRACE, 'g'), '{')
    .replace(new RegExp(RBRACE, 'g'), '}')
    .replace(new RegExp(USCORE, 'g'), '_')
    .replace(new RegExp(CARET, 'g'), '^')
    .replace(new RegExp(BSLASH, 'g'), '\\')
    .replace(new RegExp(AMP, 'g'), '&');
  return s.replace(/\s+/g, ' ').trim();
}
