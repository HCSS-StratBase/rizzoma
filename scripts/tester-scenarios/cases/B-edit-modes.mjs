// Family B: edit modes (view <-> edit, jump-in, Ctrl+Enter from view state, reply vs inline comment,
// clipboard actions). The tester: "to leave a comment or create a blip you must be in an editor mode".
import { newUser, shareWith, plain, sleep } from '../lib.mjs';
import { startL1, expectTree } from './_nest.mjs';

async function setup(ctx, title) {
  const a = await ctx.client(await newUser('a'));
  const topicId = await ctx.topic(a, title);
  await a.openTopic(topicId);
  return { a, topicId };
}
const find = (list, text) => list.find((b) => plain(b.content) === text);

export default [
  {
    id: 'B01', family: 'B', title: 'Edit button enters edit mode, text typed is kept, Done returns to view mode, content persists',
    rows: ['9.2', '14.8', '14.12', '3.12', '3.13', '14.26'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'edit done');
      await a.replyAtTopic('E1');
      await a.expandRow('E1');
      ctx.eq(await a.editorCount(), 0, 'view mode: no editor is open after expanding');
      await a.page.locator('.blip-container.nested-blip [data-testid="blip-menu-edit"]').first().click();
      await sleep(1200);
      ctx.ok((await a.editorCount()) >= 1, 'Edit opens a real editor');
      await a.page.keyboard.press('End');
      await a.page.keyboard.type(' edited', { delay: 25 });
      await a.page.locator('.blip-container.nested-blip [data-testid="blip-menu-done"]').first().click();
      await sleep(1800);
      ctx.eq(await a.editorCount(), 0, 'Done closes the editor (back to view mode)');
      await a.reload();
      ctx.ok(!!find(await a.blips(topicId), 'E1 edited'), 'the edited text persisted after reload');
    },
  },
  {
    id: 'B02', family: 'B', title: 'jump-in: clicking the text of an expanded blip enters edit mode at once (as in the original)',
    rows: ['9.2', '14.8'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'jump in');
      await a.replyAtTopic('J1');
      await a.expandRow('J1');
      await a.enterEditByClick('J1');
      ctx.ok((await a.editorCount()) >= 1, 'a click on the text opens the editor without pressing Edit');
      await a.page.keyboard.press('End');
      await a.page.keyboard.type('+j', { delay: 25 });
      await a.doneAll();
      await sleep(1200);
      ctx.ok(!!find(await a.blips(topicId), 'J1+j'), 'text typed after the jump-in persisted');
    },
  },
  {
    id: 'B03', family: 'B', title: 'Ctrl+Enter from the VIEW state creates a child of the active blip (not a root blip)',
    rows: ['14.11', '14.12'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'ctrl enter view');
      await a.replyAtTopic('V1');
      await a.expandRow('V1');
      ctx.eq(await a.editorCount(), 0, 'precondition: view mode');
      await a.page.keyboard.press('Control+Enter');
      await sleep(3200);
      await a.page.keyboard.type('Vchild', { delay: 30 });
      await sleep(1500);
      await a.doneAll();
      await sleep(1200);
      await expectTree(ctx, a, topicId, [{ text: 'V1' }, { text: 'Vchild', parent: 'V1' }], 'view-state Ctrl+Enter');
    },
  },
  {
    id: 'B04', family: 'B', title: 'Ctrl+Enter in the topic root does not break the topic (no crash, no orphan)',
    rows: ['14.11', '2.7'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'root ctrl enter');
      await a.page.locator('.topic-title, .topic-content-view, .topic-detail').first().click({ position: { x: 20, y: 10 } }).catch(() => undefined);
      await a.page.keyboard.press('Control+Enter');
      await sleep(2500);
      await a.page.keyboard.type('rootkid', { delay: 30 });
      await sleep(1500);
      await a.doneAll();
      await a.reload();
      const list = await a.blips(topicId);
      ctx.ok(list.every((b) => !b.parentId || list.some((p) => p.id === b.parentId)), 'no blip points at a missing parent');
      ctx.ok((await a.page.locator('body').innerText()).length > 20, 'the topic still renders after reload');
    },
  },
  {
    id: 'B05', family: 'B', title: 'cancel and re-enter: leaving edit mode without typing keeps the text; re-entering edits the same blip',
    rows: ['9.2', '14.8'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'cancel reenter');
      await a.replyAtTopic('C1');
      await a.expandRow('C1');
      await a.enterEditByClick('C1');
      await a.doneAll();
      await a.enterEditByClick('C1');
      await a.page.keyboard.press('End');
      await a.page.keyboard.type('2', { delay: 25 });
      await a.doneAll();
      await sleep(1200);
      const list = await a.blips(topicId);
      ctx.eq(list.filter((b) => plain(b.content).startsWith('C1')).map((b) => plain(b.content)), ['C12'], 'exactly one blip, with the re-entered edit applied');
    },
  },
  {
    id: 'B06', family: 'B', title: 'reply vs inline comment: reply row has no marker in the parent body, Ctrl+Enter child has one',
    rows: ['14.19', '9.1', '14.11'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'reply vs inline');
      await startL1(a, 'D1');
      await a.ctrlEnterChild('Dinline');
      await a.doneAll();
      await a.activate('D1');
      const replyBox = a.page.locator('.nested-blip', { hasText: 'D1' }).locator('.reply-placeholder-input').last();
      if (await replyBox.count()) {
        await replyBox.click(); await sleep(600);
        await a.page.locator('.reply-textarea').first().fill('Dreply');
        await a.page.locator('.btn-send-reply').first().click();
        await sleep(2500);
      }
      const list = await a.blips(topicId);
      const d1 = find(list, 'D1'); const inl = find(list, 'Dinline'); const rep = find(list, 'Dreply');
      ctx.ok(!!d1 && !!inl && inl.parentId === d1.id && String(d1.content).includes(inl.id), 'inline comment has a marker in the parent body');
      ctx.ok(!!rep && rep.parentId === d1?.id && !String(d1?.content).includes(rep?.id || '@@'), 'reply is a child with NO marker in the parent body', rep ? '' : 'reply box not found or reply not stored');
    },
  },
  {
    id: 'B07', family: 'B', title: 'Copy comment then "Paste as reply" on another blip creates a copy of the text under it',
    rows: ['9.8', '9.9', '9.5'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'copy paste reply');
      await a.replyAtTopic('Copyme text');
      await a.replyAtTopic('Target');
      await a.ensureExpanded('Copyme text'); await a.activate('Copyme text');
      await a.gearItem(/Copy comment/);
      await a.ensureExpanded('Target'); await a.activate('Target');
      await a.gearItem(/Paste as reply/);
      ctx.ok(/Copyme text/.test(await a.page.locator('.reply-textarea').first().inputValue().catch(() => '')), 'Paste as reply fills the reply form with the copied text');
      await a.page.locator('.btn-send-reply').first().click();
      await sleep(2500);
      const list = await a.blips(topicId);
      const tgt = find(list, 'Target');
      const copies = list.filter((x) => plain(x.content) === 'Copyme text');
      ctx.ok(copies.length === 2, 'the original and a pasted copy both exist', list.map((x) => plain(x.content)).join(','));
      ctx.ok(copies.some((x) => x.parentId === tgt?.id), 'the copy sits under the paste target');
    },
  },
  {
    id: 'B08', family: 'B', title: 'Copy link puts a working topic/blip URL on the clipboard',
    rows: ['9.6', '9.8'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'copy link');
      await a.replyAtTopic('Linkme');
      await a.expandRow('Linkme');
      await a.gearItem(/Copy link/);
      const clip = await a.page.evaluate(() => navigator.clipboard.readText()).catch((e) => `ERR ${e}`);
      ctx.ok(clip.includes(topicId), 'clipboard holds a URL naming this topic', clip.slice(0, 160));
      if (clip.includes(topicId)) {
        const b = await ctx.client(a.user);
        await b.page.goto(clip.startsWith('http') ? clip : `http://127.0.0.1${clip}`, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
        await sleep(5000);
        ctx.ok((await b.page.locator('body').innerText()).includes('Linkme') || (await b.page.locator('.blip-collapsed-row').count()) > 0, 'opening the copied link shows the topic');
      }
    },
  },
  {
    id: 'B09', family: 'B', title: 'Duplicate blip creates a second stored copy',
    rows: ['9.4'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'cut paste');
      await a.replyAtTopic('X1');
      await a.replyAtTopic('X2');
      await a.expandRow('X1');
      await a.gearItem(/Duplicate blip/);
      await sleep(1500);
      const list = await a.blips(topicId);
      ctx.ok(list.filter((b) => plain(b.content).startsWith('X1')).length >= 2, 'Duplicate blip created a second copy', list.map((b) => plain(b.content)).join(','));
    },
  },
];
