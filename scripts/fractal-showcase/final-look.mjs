// How does a NORMAL EDITOR see the showcase gadgets? Fresh signed-in browser context as Fractal Tester 2 (not the owner,
// no persisted owner state): the owner promotes Tester 2 to Editor through the real Invite dialog, then Tester 2 opens
// the topic, expands the Gadgets branch row by row and we screenshot each leaf in the READ state, then LaTeX in the
// EDIT state (typeset while the caret is elsewhere, source when it touches the formula). env: FS_STATE_IN, FS_TAG
import fs from 'node:fs';
import { launch, newClient, sleep, OUT } from './lib.mjs';
import { signInLive } from './liveauth.mjs';
const st = JSON.parse(fs.readFileSync(process.env.FS_STATE_IN, 'utf8')); process.env.FS_BASE = st.base;
const TAG = process.env.FS_TAG || 'final';
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const b = await launch();
const URL_ = `${st.base}/?layout=rizzoma#/topic/${st.topicId}`;

// 1. (Tester 2 was made an Editor by promote-t2.mjs through the real Invite dialog)
// 2. Tester 2, brand-new context
const s2 = await signInLive(b, st.base, 2, '/home/stephan/rizzoma-fractal-scratch/run/fl-t2.json');
const c = await newClient(b, s2.email, { storageState: '/home/stephan/rizzoma-fractal-scratch/run/fl-t2.json' });
const p = c.page;
await p.goto(URL_, { waitUntil: 'domcontentloaded' }); await sleep(9000);
const expandRow = async (scope, text) => {
  const rx = new RegExp(text.replace(/^(\S+) /, '$1.{0,3} '));
  const mk = scope.locator('li').filter({ hasText: rx }).last().locator('.blip-thread-marker').first();
  await mk.scrollIntoViewIfNeeded().catch(() => {});
  if ((await mk.textContent()) !== '−') { await mk.click({ timeout: 6000 }); await sleep(1800); }
};
await expandRow(p.locator('.topic-content-view, .blip-text').first(), 'Gadgets branch');
const gadgets = p.locator('.rizzoma-blip').filter({ hasText: /Code.{0,3} block gadget/ }).filter({ hasText: /LaTeX.{0,3} gadget/ }).last();
const leafOf = (n) => p.locator('.rizzoma-blip').filter({ hasText: `${n} body` }).last();
const rows = ['Code block gadget', 'Poll gadget', 'LaTeX gadget', 'YouTube gadget', 'Iframe gadget', 'Spreadsheet gadget', 'Image gadget', 'Kanban app gadget', 'Planner app gadget', 'Focus timer gadget', 'Notes app gadget'];
for (const n of rows) {
  try {
    await expandRow(gadgets, n); await sleep(2500);
    const leaf = leafOf(n); await leaf.scrollIntoViewIfNeeded().catch(() => {});
    const facts = await leaf.evaluate((e) => { const r = (x) => { const bb = x.getBoundingClientRect(); return `${Math.round(bb.width)}x${Math.round(bb.height)}`; }; return { text: (e.textContent || '').replace(/\s+/g, ' ').slice(0, 70), parts: Array.from(e.querySelectorAll('.rizzoma-latex, pre, iframe, img, figure.gadget-poll')).slice(0, 4).map((x) => `${x.tagName.toLowerCase()}${x.getAttribute('src') ? '[' + x.getAttribute('src').slice(0, 38) + ']' : ''} ${r(x)} "${(x.textContent || '').trim().slice(0, 26)}"`) }; });
    await leaf.screenshot({ path: `${OUT}/steps/${TAG}-read-${n.split(' ')[0].toLowerCase()}.png` }).catch(() => {});
    log(`${n}: ${JSON.stringify(facts)}`);
  } catch (e) { log(`${n}: ERR ${String(e.message).split('\n')[0].slice(0, 80)}`); }
}
// EDIT state of the LaTeX leaf as an editor
const l = leafOf('LaTeX gadget'); await l.scrollIntoViewIfNeeded().catch(() => {});
const bx = await l.locator('li').first().boundingBox();
await p.mouse.click(bx.x + 40, bx.y + 8); await sleep(1800);
const editFacts = await l.evaluate((e) => ({ widget: e.querySelector('.latex-widget')?.textContent || '', rawVisible: /\$\$/.test(e.innerText), editable: !!e.querySelector('.ProseMirror[contenteditable="true"]') }));
log('LaTeX leaf in EDIT mode as editor (caret on the first line): ' + JSON.stringify(editFacts));
await l.screenshot({ path: `${OUT}/steps/${TAG}-edit-latex.png` }).catch(() => {});
await p.keyboard.press('Control+End'); await sleep(900);
const touching = await l.evaluate((e) => ({ widget: e.querySelector('.latex-widget')?.textContent || '', rawVisible: /\$\$/.test(e.innerText) }));
log('LaTeX leaf, caret at the end of the formula line (source shown for editing): ' + JSON.stringify(touching));
await l.screenshot({ path: `${OUT}/steps/${TAG}-edit-latex-caret-in.png` }).catch(() => {});
await c.ctx.close(); await b.close();
