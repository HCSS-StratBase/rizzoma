// Family A: nesting and typing. Every text must land in ITS OWN blip, under the right parent,
// after reload and in a second client, with no console / page / network error at all.
import { newUser, shareWith, plain, sleep } from '../lib.mjs';
import { startL1, expectTree, expectSecondClient } from './_nest.mjs';

async function setup(ctx, title) {
  const a = await ctx.client(await newUser('a'));
  const b = await ctx.client(await newUser('b'));
  const topicId = await ctx.topic(a, title);
  await shareWith(topicId, b.user, 'editor');
  await a.openTopic(topicId);
  return { a, b, topicId };
}

export default [
  {
    id: 'A01', family: 'A', title: 'root plus five nested levels typed with Ctrl+Enter chain, persisted and visible to a second client',
    rows: ['2.7', '14.11', '14.12', '14.21', '9.1', '2.4'],
    async run(ctx) {
      const { a, b, topicId } = await setup(ctx, 'nest depth');
      await startL1(a, 'N1');
      for (const t of ['N2', 'N3', 'N4', 'N5']) await a.ctrlEnterChild(t);
      await a.doneAll();
      await sleep(2000);
      await a.reload();
      const exp = [{ text: 'N1' }, { text: 'N2', parent: 'N1' }, { text: 'N3', parent: 'N2' }, { text: 'N4', parent: 'N3' }, { text: 'N5', parent: 'N4' }];
      await expectTree(ctx, a, topicId, exp, 'after reload');
      await expectSecondClient(ctx, b, topicId, exp, 'user B');
    },
  },
  {
    id: 'A02', family: 'A', title: 'Ctrl+Enter twice on the same blip gives two children, both kept (the second-Ctrl+Enter crash)',
    rows: ['14.11', '14.20', '14.19'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'two ctrl enter');
      await startL1(a, 'T1');
      await a.ctrlEnterChild('T1first');
      await a.doneAll();
      await a.enterEditByClick('T1').catch(() => undefined);
      await a.ctrlEnterChild('T1second');
      await a.doneAll();
      await sleep(1500);
      await a.reload();
      await expectTree(ctx, a, topicId, [{ text: 'T1' }, { text: 'T1first', parent: 'T1' }, { text: 'T1second', parent: 'T1' }], 'two children');
    },
  },
  {
    id: 'A03', family: 'A', title: 'Ctrl+Enter five times on the same blip (five children, five markers)',
    rows: ['14.11', '14.20'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'five ctrl enter');
      await startL1(a, 'F1');
      const kids = ['F1a', 'F1b', 'F1c', 'F1d', 'F1e'];
      for (let i = 0; i < kids.length; i += 1) {
        if (i > 0) { await a.doneAll(); await a.enterEditByClick('F1').catch(() => undefined); }
        await a.ctrlEnterChild(kids[i]);
      }
      await a.doneAll();
      await sleep(1500);
      await a.reload();
      await expectTree(ctx, a, topicId, [{ text: 'F1' }, ...kids.map((t) => ({ text: t, parent: 'F1' }))], 'five children');
    },
  },
  {
    id: 'A04', family: 'A', title: 'children on different blips (sibling branches) stay under their own parents',
    rows: ['14.11', '14.21', '14.19'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'branches');
      await startL1(a, 'P1');
      await a.ctrlEnterChild('P1kid');
      await a.doneAll();
      await a.replyAtTopic('P2');
      await a.expandRow('P2');
      await a.enterEditByClick('P2');
      await a.ctrlEnterChild('P2kid');
      await a.doneAll();
      await sleep(1500);
      await a.reload();
      await expectTree(ctx, a, topicId, [{ text: 'P1' }, { text: 'P2' }, { text: 'P1kid', parent: 'P1' }, { text: 'P2kid', parent: 'P2' }], 'branches');
    },
  },
  {
    id: 'A05', family: 'A', title: 'mid-sentence anchor: Ctrl+Enter inside a sentence keeps the marker inside the sentence',
    rows: ['14.20', '14.11'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'mid sentence');
      await a.replyAtTopic('alpha beta gamma');
      await a.expandRow('alpha beta gamma');
      await a.enterEditByClick('alpha beta gamma');
      await a.page.keyboard.press('Home');
      for (let i = 0; i < 6; i += 1) await a.page.keyboard.press('ArrowRight'); // after "alpha "
      await a.page.keyboard.press('Control+Enter');
      await sleep(2300);
      await a.page.keyboard.type('MIDKID', { delay: 25 });
      await sleep(1500);
      await a.doneAll();
      await sleep(1500);
      const list = await a.blips(topicId);
      const root = list.find((b) => plain(b.content).startsWith('alpha'));
      const kid = list.find((b) => plain(b.content) === 'MIDKID');
      ctx.ok(!!root && !!kid && kid.parentId === root.id, 'mid-sentence child belongs to the sentence blip', list.map((x) => JSON.stringify(plain(x.content))).join(' '));
      const html = String(root?.content || '');
      const at = html.indexOf(kid?.id || '@@');
      ctx.ok(at > html.indexOf('alpha') && at < html.indexOf('gamma'), 'the inline marker sits inside the sentence, not at its end', `marker@${at} alpha@${html.indexOf('alpha')} gamma@${html.indexOf('gamma')}`);
      ctx.ok(plain(root?.content).replace(/\s+/g, ' ').includes('alpha beta gamma'), 'the sentence text is intact', plain(root?.content));
    },
  },
  {
    id: 'A06', family: 'A', title: 'Enter / Tab / Shift+Tab build real nested bullets that survive reload',
    rows: ['3.4', '14.1'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'bullets');
      await startL1(a, 'B1');
      const k = a.page.keyboard;
      await k.press('End'); await k.press('Enter'); await k.type('B2');
      await k.press('Enter'); await k.type('B3');
      await k.press('Tab'); await k.press('Enter'); await k.type('B4');
      await k.press('Enter'); await k.press('Shift+Tab'); await k.type('B5');
      await a.doneAll();
      await sleep(1500);
      await a.reload();
      const root = (await a.blips(topicId)).find((x) => plain(x.content).startsWith('B1'));
      const html = String(root?.content || '');
      ctx.ok(/B1[\s\S]*B2[\s\S]*<ul[^>]*>[\s\S]*B3[\s\S]*B4[\s\S]*<\/ul>[\s\S]*B5/.test(html) && html.indexOf('B2') < html.indexOf('<ul', html.indexOf('B2')), 'B3 and B4 are nested under B2 (Tab), B5 is back at the outer level (Shift+Tab)', html.slice(0, 400));
    },
  },
  {
    id: 'A07', family: 'A', title: 'typing fast (no delay, long text) loses no character in a child blip',
    rows: ['3.1', '14.12'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'fast typing');
      await startL1(a, 'S1');
      const long = 'the quick brown fox jumps over the lazy dog 0123456789 '.repeat(4).trim();
      await a.page.keyboard.press('End');
      await a.page.keyboard.press('Control+Enter');
      await sleep(2300);
      await a.page.keyboard.type(long, { delay: 0 });
      await sleep(1500);
      await a.doneAll();
      await sleep(1500);
      await a.reload();
      const kid = (await a.blips(topicId)).find((x) => plain(x.content).startsWith('the quick'));
      ctx.eq(plain(kid?.content), long, 'fast-typed text is stored exactly');
    },
  },
  {
    id: 'A08', family: 'A', title: 'typing after switching the active blip goes only into the blip that is active',
    rows: ['14.12', '9.2', '14.7', '14.8'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'switch active');
      await startL1(a, 'W1');
      await a.ctrlEnterChild('W2');
      await a.doneAll();
      await a.enterEditByClick('W1').catch(() => undefined);
      await a.page.keyboard.press('End');
      await a.page.keyboard.type(' plus1', { delay: 25 });
      await a.doneAll();
      await a.page.locator('.blip-collapsed-row', { hasText: 'W2' }).first().click().catch(() => undefined);
      await sleep(1200);
      await a.enterEditByClick('W2').catch(() => undefined);
      await a.page.keyboard.press('End');
      await a.page.keyboard.type(' plus2', { delay: 25 });
      await a.doneAll();
      await sleep(1500);
      await a.reload();
      const list = await a.blips(topicId);
      const texts = list.map((b) => plain(b.content));
      ctx.ok(texts.includes('W1 plus1'), 'W1 got exactly its own addition', texts.join(' | '));
      ctx.ok(texts.includes('W2 plus2'), 'W2 got exactly its own addition', texts.join(' | '));
    },
  },
  {
    id: 'A09', family: 'A', title: 'three level-1 blips from the reply box each keep their own text, in order',
    rows: ['2.4', '2.7', '9.1'],
    async run(ctx) {
      const { a, b, topicId } = await setup(ctx, 'three roots');
      for (const t of ['R-one', 'R-two', 'R-three']) await a.replyAtTopic(t);
      await a.reload();
      const list = await a.blips(topicId);
      const roots = list.filter((x) => ['R-one', 'R-two', 'R-three'].includes(plain(x.content)));
      ctx.eq(roots.length, 3, 'exactly three reply blips are stored');
      const exp = ['R-one', 'R-two', 'R-three'].map((text) => ({ text }));
      await expectSecondClient(ctx, b, topicId, exp, 'user B');
    },
  },
  {
    id: 'A10', family: 'A', title: 'pressing Done right after typing (no pause) in a fresh child blip loses no text',
    rows: ['9.2', '14.12'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'quick done');
      await startL1(a, 'Z1');
      await a.page.keyboard.press('End');
      await a.page.keyboard.press('Control+Enter');
      await sleep(2300);
      await a.page.keyboard.type('quickchild', { delay: 20 });
      await a.page.locator('button:has-text("Done")').last().click(); // no pause at all
      await sleep(300);
      await a.doneAll();
      await sleep(2500);
      await a.reload();
      const texts = (await a.blips(topicId)).map((x) => plain(x.content));
      ctx.ok(texts.includes('quickchild'), 'the text typed right before Done is stored in the child', texts.map((t) => JSON.stringify(t)).join(' '));
    },
  },
  {
    id: 'A11', family: 'A', title: 'topic-root Ctrl+Enter plus typing, 20 real-typing repetitions: the child blip survives a reload every time (failure rate must be 0 of 20)',
    rows: ['14.11', '2.7', '14.12'], timeoutMs: 1500000,
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      let failures = 0; const bad = [];
      for (let i = 1; i <= 20; i += 1) {
        const id = await ctx.topic(a, `root ctrl enter ${i}`);
        await a.openTopic(id, 4500);
        await a.page.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click({ timeout: 10000 });
        await sleep(1500);
        await a.page.locator('.topic-content-edit .ProseMirror').first().click();
        await a.page.keyboard.press('End');
        await a.page.keyboard.press('Control+Enter');
        await sleep(2300);
        await a.page.keyboard.type(`rootkid${i}`, { delay: 25 });
        await sleep(1100);
        await a.page.locator('.wave-panel [data-testid="blip-menu-done"]').first().click().catch(() => undefined);
        await a.doneAll();
        await sleep(3000);
        await a.reload(5000);
        const list = await a.blips(id);
        const kid = list.find((b) => plain(b.content) === `rootkid${i}`);
        if (!kid) { failures += 1; bad.push(i); }
      }
      ctx.eq(failures, 0, `failure rate of root Ctrl+Enter child over 20 repetitions (failed runs: ${bad.join(',') || 'none'})`);
    },
  },
  {
    id: 'A12', family: 'A', title: 'edit level 2 caret stays: click into level 2 text of a 3-level tree, type 20 characters at human pace; the caret and every typed character stay in the same blip (probed after each key), also after reload and after a level 3 child is added',
    rows: ['14.12', '14.21', '9.2'], timeoutMs: 900000,
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'caret stays');
      await startL1(a, 'level one text');
      await a.ctrlEnterChild('level two text');
      await a.ctrlEnterChild('level three text');
      await a.doneAll(); await sleep(2500);
      await a.reload();
      const probe = () => a.page.evaluate(() => {
        const ae = document.activeElement; const b = ae && ae.closest ? ae.closest('[data-blip-id]') : null; const sel = getSelection();
        return { blip: b ? b.getAttribute('data-blip-id') : null, off: (() => { try { const r = document.createRange(); r.setStart(ae.closest('.ProseMirror') || ae, 0); r.setEnd(sel.anchorNode, sel.anchorOffset); return r.toString().length; } catch { return null; } })(), tag: ae && ae.className ? String(ae.className).slice(0, 20) : '', text: ae ? (ae.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80) : '' };
      });
      const list0 = await a.blips(topicId);
      const l2 = list0.find((x) => plain(x.content) === 'level two text');
      ctx.ok(!!l2, 'level 2 exists after reload');
      await a.ensureExpanded('level one text');
      // open level 2 (its [+] marker in level 1) and click into its text
      await a.page.locator('.blip-thread-marker').first().click(); await sleep(1500);
      await a.page.locator('.blip-container.nested-blip li', { hasText: /^level two text/ }).first().click({ position: { x: 60, y: 8 } }); await sleep(1500);
      await a.page.keyboard.press('End');
      const before = await probe();
      ctx.ok(before.blip === l2?.id, 'after clicking into level 2 text the focused editor belongs to level 2', JSON.stringify(before));
      const typed = 'abcdefghijklmnopqrst';
      const violations = [];
      let lastOff = before.off;
      for (let i = 0; i < typed.length; i += 1) {
        await a.page.keyboard.type(typed[i], { delay: 90 });
        const p = await probe();
        if (p.blip !== l2?.id) violations.push(`key ${i + 1}: focus moved to blip ${String(p.blip).slice(-6)} text="${p.text}"`);
        else if (typeof p.off === 'number' && typeof lastOff === 'number' && p.off !== lastOff + 1) violations.push(`key ${i + 1}: caret ${lastOff} -> ${p.off}`);
        lastOff = p.off;
      }
      ctx.ok(violations.length === 0, 'the caret advances by one inside level 2 on each of the 20 keys and focus never leaves the blip', violations.slice(0, 4).join(' | '));
      await sleep(1500); await a.doneAll(); await sleep(2500);
      const list1 = await a.blips(topicId);
      const t = (id) => plain(list1.find((x) => x.id === id)?.content);
      ctx.eq(t(l2?.id), `level two text${typed}`, 'all 20 typed characters are in level 2');
      ctx.eq(plain(list1.find((x) => String(plain(x.content)).startsWith('level one'))?.content), 'level one text', 'level 1 is untouched');
      ctx.ok(list1.some((x) => plain(x.content) === 'level three text'), 'level 3 is untouched');
      await a.reload();
      ctx.eq(plain((await a.blips(topicId)).find((x) => x.id === l2?.id)?.content), `level two text${typed}`, 'level 2 text is the same after reload');
      // add a level 3 child to level 2, then type again in level 2
      await a.ensureExpanded('level one text');
      await a.page.locator('.blip-thread-marker').first().click(); await sleep(1500);
      await a.page.locator('.blip-container.nested-blip li', { hasText: /^level two text/ }).first().click({ position: { x: 60, y: 8 } }); await sleep(1500);
      await a.page.keyboard.press('End');
      await a.page.keyboard.press('Control+Enter'); await sleep(2500); await a.page.keyboard.type('L3b', { delay: 90 }); await sleep(1500);
      await a.doneAll(); await sleep(2000);
      await a.page.locator('.blip-container.nested-blip li', { hasText: /^level two text/ }).first().click({ position: { x: 60, y: 8 } }); await sleep(1500);
      await a.page.keyboard.press('End');
      const v2 = [];
      for (let i = 0; i < 5; i += 1) { await a.page.keyboard.type('XYZUV'[i], { delay: 90 }); const p = await probe(); if (p.blip !== l2?.id) v2.push(`key ${i + 1}: focus on ${String(p.blip).slice(-6)} "${p.text}"`); }
      ctx.ok(v2.length === 0, 'after a level 3 child was added, typing in level 2 stays in level 2', v2.join(' | '));
      await sleep(1500); await a.doneAll(); await sleep(2500);
      const fin = await a.blips(topicId);
      ctx.ok(plain(fin.find((x) => x.id === l2?.id)?.content).endsWith('XYZUV'), 'the five extra characters landed in level 2', plain(fin.find((x) => x.id === l2?.id)?.content));
      ctx.ok(fin.some((x) => plain(x.content) === 'L3b' && x.parentId === l2?.id), 'the new level 3 child is stored under level 2');
    },
  },
];
