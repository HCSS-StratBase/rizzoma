import { useEffect, useState } from 'react';
import { onKatexReady, renderLatex } from '../../lib/katexRender';

/** A `$$ formula $$` in the read view: typeset by KaTeX, drawn by the simple converter until KaTeX has loaded. */
export function LatexSpan({ expr }: { expr: string }) {
  const [, setReady] = useState(0);
  useEffect(() => onKatexReady(() => setReady((n) => n + 1)), []);
  const { html, typeset } = renderLatex(expr);
  return (
    <span
      className={typeset ? 'rizzoma-latex rizzoma-latex-katex' : 'rizzoma-latex'}
      data-latex-source={expr.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
