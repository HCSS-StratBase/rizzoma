import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { formatLatexToHtml } from '../../../lib/renderLatex';

/**
 * LaTeX in the EDITOR: a `$$ formula $$` run shows TYPESET while the caret is elsewhere, and its source while the
 * caret is inside or touching it (click the formula to edit it). Before this the editor always showed the raw
 * `$$ ... $$` and only the read view typeset it, so a person typing a formula saw no result until they pressed
 * Done, and an empty gadget looked like an unexplained "$$ $$" (SDS, 18 Nov 2026).
 */
export const LATEX_RUN = /\$\$([^$]*)\$\$/g;

export function latexRuns(text: string): Array<{ from: number; to: number; formula: string }> {
  const out: Array<{ from: number; to: number; formula: string }> = [];
  LATEX_RUN.lastIndex = 0;
  for (let m = LATEX_RUN.exec(text); m; m = LATEX_RUN.exec(text)) out.push({ from: m.index, to: m.index + m[0].length, formula: m[1] || '' });
  return out;
}

export function latexWidgetHtml(formula: string): { html: string; empty: boolean } {
  const trimmed = formula.trim();
  if (!trimmed) return { html: '', empty: true };
  return { html: formatLatexToHtml(trimmed), empty: false };
}

const key = new PluginKey('latexPreview');

export const LatexPreview = Extension.create({
  name: 'latexPreview',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            const sel = state.selection;
            state.doc.descendants((node, pos) => {
              if (!node.isTextblock) return true;
              const text = node.textBetween(0, node.content.size, undefined, '￼');
              for (const run of latexRuns(text)) {
                // only plain text positions: the text has no atoms before the run when lengths agree
                const from = pos + 1 + run.from;
                const to = pos + 1 + run.to;
                if (sel.from <= to && sel.to >= from) continue; // caret inside or touching: show the source
                const { html, empty } = latexWidgetHtml(run.formula);
                decos.push(Decoration.inline(from, to, { class: 'latex-src-hidden' }));
                decos.push(Decoration.widget(from, () => {
                  const el = document.createElement('span');
                  el.className = empty ? 'rizzoma-latex rizzoma-latex-empty latex-widget' : 'rizzoma-latex latex-widget';
                  el.setAttribute('data-latex-from', String(from));
                  el.setAttribute('contenteditable', 'false');
                  if (empty) el.textContent = 'type a formula';
                  else el.innerHTML = html;
                  return el;
                }, { side: -1, key: `latex-${from}-${run.formula}` }));
              }
              return false;
            });
            return DecorationSet.create(state.doc, decos);
          },
          handleDOMEvents: {
            mousedown(view, event) {
              const el = (event.target as HTMLElement | null)?.closest?.('.latex-widget') as HTMLElement | null;
              if (!el) return false;
              const from = Number(el.getAttribute('data-latex-from'));
              if (!Number.isFinite(from)) return false;
              event.preventDefault();
              // put the caret inside the source (after the opening $$ and the space) so the formula is editable
              const pos = Math.min(view.state.doc.content.size, from + 3);
              view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
              view.focus();
              return true;
            },
          },
        },
      }),
    ];
  },
});
