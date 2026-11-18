// The content of the Fractal Showcase. Labels are atomic (2 to 5 words), globally unique by their first
// 18 characters (the driver locates a line by that prefix), and every blip body is a bulleted list.
// A line is { text | runs, hook?, anchors: [{ at, child }] }; see ops.mjs.
export const TITLE = 'Fractal Showcase: every function (built by hand, 18 Nov 2026)';

const L = (text, anchors = [], extra = {}) => ({ text, anchors, ...extra });
const B = (...lines) => ({ lines });

/** Depth chain: label of level n is `${prefix} level n`; used for the long spine. */
function chain(prefix, from, to, leaf) {
  if (from > to) return leaf;
  const label = `${prefix} level ${from} holds the next`;
  return B(L(label, [{ at: `level ${from}`, child: chain(prefix, from + 1, to, leaf) }]));
}

export function buildSpec(hooks = {}) {
  const h = (name) => hooks[name];
  return {
    lines: [
      // 1. the long spine: levels 1 to 9 below the root, with side branches at levels 3 and 6
      L('Spine branch goes deep here', [{ at: 'Spine branch', child: B(
        L('Spine level 1 holds the next', [{ at: 'level 1', child: B(
          L('Spine level 2 holds the next', [{ at: 'level 2', child: B(
            L('Spine level 3 holds the next', [{ at: 'level 3', child: B(
              L('Spine level 4 holds the next', [{ at: 'level 4', child: B(
                L('Spine level 5 holds the next', [{ at: 'level 5', child: B(
                  L('Spine level 6 holds the next', [{ at: 'level 6', child: B(
                    L('Spine level 7 holds the next', [{ at: 'level 7', child: B(
                      L('Spine level 8 holds the next', [{ at: 'level 8', child: B(
                        L('Spine level 9 is the leaf'),
                      ) }]),
                    ) }]),
                    L('Spine side branch six', [{ at: 'side branch', child: B(L('Side six child one'), L('Side six child two')) }]),
                  ) }]),
                ) }]),
              ) }]),
              L('Spine side branch three', [{ at: 'side branch', child: B(L('Side three child one')) }]),
            ) }]),
          ) }]),
        ) }]),
      ) }]),
      // 2. formatting
      L('Formatting branch shows marks', [{ at: 'Formatting branch', child: B(
        L('Bold text sample', [], { runs: [['Bold ', 'Control+b'], ['text sample']] }),
        L('Italic text sample', [], { runs: [['Italic ', 'Control+i'], ['text sample']] }),
        L('Underline text sample', [], { runs: [['Underline ', 'Control+u'], ['text sample']] }),
      ) }]),
    ],
  };
}
