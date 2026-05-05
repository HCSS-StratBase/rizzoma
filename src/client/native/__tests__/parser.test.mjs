/**
 * Parser smoke test (runnable via Node + jsdom — no test framework needed).
 *
 *   node --import tsx scripts/run_native_parser_test.mjs
 *
 * Verifies the HTML → ContentArray parser produces the expected shape for
 * common blip HTML patterns. Not exhaustive — phase 1's spike test. Full
 * round-trip + dev-DB-coverage tests land in phase 2.
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
});
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Node = dom.window.Node;

const { parseHtmlToContentArray } = await import('../../../../src/client/native/parser.ts');
const { ModelType } = await import('../../../../src/client/native/types.ts');

const cases = [
  {
    name: 'plain paragraph',
    html: '<p>Hello world</p>',
    expect: arr => arr.length === 1 && arr[0].type === ModelType.TEXT && arr[0].text === 'Hello world',
  },
  {
    name: 'three-bullet list',
    html: '<ul><li>First</li><li>Second</li><li>Third</li></ul>',
    expect: arr => {
      const lines = arr.filter(e => e.type === ModelType.LINE);
      const texts = arr.filter(e => e.type === ModelType.TEXT);
      return lines.length === 3
        && lines.every(l => l.params.bulleted === 0)
        && texts.length === 3
        && texts.map(t => t.text).join('|') === 'First|Second|Third';
    },
  },
  {
    name: 'nested bullet list',
    html: '<ul><li>Outer<ul><li>Inner</li></ul></li></ul>',
    expect: arr => {
      const lines = arr.filter(e => e.type === ModelType.LINE);
      return lines.length === 2
        && lines[0].params.bulleted === 0
        && lines[1].params.bulleted === 1;
    },
  },
  {
    name: 'BLIP marker span produces BlipEl',
    html: '<p>Hi <span data-blip-thread="abc">+</span> world</p>',
    expect: arr => {
      const blips = arr.filter(e => e.type === ModelType.BLIP);
      return blips.length === 1 && blips[0].params.id === 'abc';
    },
  },
  {
    name: 'styled text',
    html: '<p>This is <b>bold</b> and <i>italic</i>.</p>',
    expect: arr => {
      const texts = arr.filter(e => e.type === ModelType.TEXT);
      return texts.some(t => t.params.bold === true)
        && texts.some(t => t.params.italic === true);
    },
  },
  {
    name: 'heading',
    html: '<h1>Title</h1><p>Body</p>',
    expect: arr => {
      const lines = arr.filter(e => e.type === ModelType.LINE);
      return lines[0]?.params.heading === 1;
    },
  },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const arr = parseHtmlToContentArray(c.html);
  const ok = c.expect(arr);
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${c.name}`);
  if (!ok) {
    console.log('  got:', JSON.stringify(arr, null, 2));
  }
  ok ? pass++ : fail++;
}
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail > 0 ? 1 : 0);
