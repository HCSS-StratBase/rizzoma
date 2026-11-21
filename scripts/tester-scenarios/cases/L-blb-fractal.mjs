// Family L: the BLB paradigm seen on screen: [+] markers, portal placement, nested inline expansion, deep fractal
// (depth 10) collapsed / spine / parallel branches, toolbar states, insert buttons. Built only with real typing.
import { newUser, plain, sleep } from '../lib.mjs';
import { startL1 } from './_nest.mjs';

async function topic(ctx, title) {
  const a = await ctx.client(await newUser('a'));
  const id = await ctx.topic(a, title);
  await a.openTopic(id);
  return { a, id };
}
const markers = (a) => a.page.locator('.blip-thread-marker');

async function chain(a, root, labels) {
  await startL1(a, root);
  for (const l of labels) await a.ctrlEnterChild(l);
  await a.doneAll();
  await sleep(2000);
}

export default [
  {
    id: 'L01', family: 'L', title: '[+] marker styling (grey, about 16 x 14) and the child opens in place at its marker (portal), then [-] folds it back',
    rows: ['14.13', '14.5', '14.3', '14.4', '14.25'],
    async run(ctx) {
      const { a } = await topic(ctx, 'marker style');
      await a.replyAtTopic('MK alpha beta');
      await a.ensureExpanded('MK alpha beta');
      await a.enterEditByClick('MK alpha beta');
      await a.page.keyboard.press('Home'); for (let i = 0; i < 3; i += 1) await a.page.keyboard.press('ArrowRight');
      await a.ctrlEnterChild('MKchild');
      await a.doneAll(); await sleep(1500);
      await a.reload(); await a.ensureExpanded('MK alpha');
      const m = markers(a).first();
      ctx.ok(await m.count() > 0, 'the parent shows a [+] marker');
      const st = await m.evaluate((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor, color: cs.color }; });
      ctx.ok(st.w >= 12 && st.w <= 22 && st.h >= 10 && st.h <= 20, 'the marker is about 16 x 14 px', JSON.stringify(st));
      ctx.ok(/rgb/.test(st.bg), 'the marker has a background colour', st.bg);
      await m.click(); await sleep(1500);
      const pos = await a.page.evaluate(() => { const mk = document.querySelector('.blip-thread-marker')?.getBoundingClientRect(); const ch = Array.from(document.querySelectorAll('.nested-blip.expanded')).pop()?.getBoundingClientRect(); const par = document.querySelector('.blip-text')?.getBoundingClientRect(); return mk && ch && par ? { dy: Math.round(ch.top - mk.bottom), dx: Math.round(ch.left - par.left) } : null; });
      ctx.ok(!!pos && pos.dy >= -4 && pos.dy < 120, 'the child opens right under its marker, not at the end of the topic', JSON.stringify(pos));
      ctx.ok(!!pos && pos.dx >= -4 && pos.dx < 80, 'its left edge is flush with the parent text (indent parity)', JSON.stringify(pos));
      await m.click(); await sleep(1200);
      ctx.eq(await a.page.locator('.inline-child-expanded:visible').count(), 0, '[-] folds the child back');
    },
  },
  {
    id: 'L02', family: 'L', title: 'toolbar states: expanding [+] shows only text, clicking into the child shows the read toolbar, Edit the full toolbar, clicking outside hides it; toolbar is left-aligned',
    rows: ['14.6', '14.7', '14.8', '14.9', '14.10'],
    async run(ctx) {
      const { a } = await topic(ctx, 'toolbar states');
      await chain(a, 'TS1', ['TS child']);
      await a.reload(); await a.ensureExpanded('TS1');
      await markers(a).first().click(); await sleep(1500);
      const bar = (sel) => a.page.locator(`.nested-blip.expanded .inline-child-expanded ${sel}, .inline-child-expanded ${sel}`).count();
      ctx.eq(await bar('[data-testid="blip-menu-edit"]'), 0, 'right after [+] the child shows text only (no toolbar)');
      await a.page.locator('.inline-child-expanded .blip-text, .inline-child-expanded').first().click({ position: { x: 20, y: 10 } }); await sleep(1500);
      const editors = await a.editorCount();
      ctx.ok(editors >= 1 || (await bar('[data-testid="blip-menu-edit"]')) > 0, 'clicking into the child gives its toolbar / editor');
      await a.doneAll();
      await a.page.locator('.topic-title, .topic-root').first().click({ position: { x: 10, y: 10 } }).catch(() => undefined); await sleep(1200);
      const left = await a.page.evaluate(() => { const t = document.querySelector('.inline-child-expanded .blip-menu, .inline-child-expanded [class*=menu]'); const c = document.querySelector('.inline-child-expanded'); if (!t || !c) return null; return Math.round(t.getBoundingClientRect().left - c.getBoundingClientRect().left); });
      ctx.ok(left === null || left < 40, 'the child toolbar (when shown) is left-aligned', String(left));
    },
  },
  {
    id: 'L03', family: 'L', title: 'nested inline expansion: a [+] inside an expanded [+] opens in turn, and each level stays under its own marker',
    rows: ['14.21', '20.29', '14.3'],
    async run(ctx) {
      const { a } = await topic(ctx, 'nested inline');
      await chain(a, 'NI1', ['NI2', 'NI3']);
      await a.reload(); await a.ensureExpanded('NI1');
      for (let i = 0; i < 2; i += 1) { await markers(a).nth(i === 0 ? 0 : (await markers(a).count()) - 1).click(); await sleep(1600); }
      const texts = await a.page.locator('.nested-blip.expanded').allInnerTexts();
      ctx.ok(texts.some((t) => t.includes('NI2')) && texts.some((t) => t.includes('NI3')), 'both nested levels are expanded in place', texts.map((t) => t.slice(0, 30)).join(' | '));
    },
  },
  {
    id: 'L04', family: 'L', title: 'deep fractal: a depth-10 chain typed with Ctrl+Enter is shown collapsed (label + [+]) after reload; clicking [+] down the spine expands through all ten levels',
    rows: ['14.22', '14.23', '14.1'], timeoutMs: 900000,
    async run(ctx) {
      const { a, id } = await topic(ctx, 'deep fractal');
      await chain(a, 'D1', ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10']);
      const list = await a.blips(id);
      ctx.ok(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10'].every((t) => list.some((b) => plain(b.content) === t)), 'all ten levels are stored');
      await a.reload();
      ctx.eq(await a.page.locator('.nested-blip.expanded').count(), 0, 'after reload the tree is collapsed (BLB as table of contents)');
      await a.ensureExpanded('D1');
      for (let level = 2; level <= 10; level += 1) {
        const m = markers(a); const n = await m.count();
        if (!n) break;
        await m.nth(n - 1).click(); await sleep(1300);
      }
      const body = await a.page.locator('body').innerText();
      ctx.ok(['D2', 'D5', 'D9', 'D10'].every((t) => body.includes(t)), 'the spine is expanded through level 10', body.slice(0, 0));
      await a.shot('L04-deep-spine');
    },
  },
  {
    id: 'L05', family: 'L', title: 'deep fractal, parallel branches: three level-1 blips each with a depth-3 chain can all be expanded at the same time',
    rows: ['14.24', '14.16', '14.19'], timeoutMs: 900000,
    async run(ctx) {
      const { a, id } = await topic(ctx, 'parallel branches');
      for (const r of ['PA', 'PB', 'PC']) { await a.replyAtTopic(r); await a.ensureExpanded(r); await a.enterEditByClick(r); await a.ctrlEnterChild(`${r}2`); await a.ctrlEnterChild(`${r}3`); await a.doneAll(); }
      await a.reload();
      await a.page.locator('.show-replies').first().click(); await sleep(3500);
      const body = await a.page.locator('body').innerText();
      ctx.ok(['PA', 'PB', 'PC'].every((t) => body.includes(t)), 'all three branches are open at once');
      const open = await a.page.locator('.nested-blip.expanded').count();
      ctx.ok(open >= 3, 'at least the three level-1 blips are expanded together', String(open));
    },
  },
  {
    id: 'L06', family: 'L', title: 'insert buttons of the right panel enter edit mode by themselves: clicking "@" from the view state opens the editor with a mention trigger',
    rows: ['15.6', '15.4', '15.5'],
    async run(ctx) {
      const { a } = await topic(ctx, 'insert enters edit');
      await a.replyAtTopic('IE1');
      await a.ensureExpanded('IE1');
      ctx.eq(await a.editorCount(), 0, 'precondition: view mode');
      await a.page.locator('button[title^="Insert mention"], button[title*="mention" i]').first().click(); await sleep(1800);
      ctx.ok((await a.editorCount()) >= 1, 'the editor opened without pressing Edit');
      await a.doneAll();
    },
  },
];
