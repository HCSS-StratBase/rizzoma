// Family C: data safety ("my blips disappear"). Every created blip must still exist, with the right
// parent, after reload, from a second client, after cut/paste, delete-cancel and concurrent edits.
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
const find = (list, text) => list.find((x) => plain(x.content) === text);

export default [
  {
    id: 'C01', family: 'C', title: 'delete a blip with children: confirm names the number below; cancel keeps everything; accept removes the subtree only',
    rows: ['9.3', '2.6', '2.4'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'delete confirm');
      await startL1(a, 'K1');
      await a.ctrlEnterChild('K2');
      await a.ctrlEnterChild('K3');
      await a.doneAll();
      await a.replyAtTopic('Keep');
      await sleep(1500);
      await a.activate('K1');
      a.dialogMode = 'dismiss';
      await a.gearItem(/Delete blip/).catch(() => undefined);
      ctx.ok(/2 blips under it/.test(a.lastDialog || ''), 'the confirm dialog states the number of blips below (2)', a.lastDialog);
      let list = await a.blips(topicId);
      ctx.ok(['K1', 'K2', 'K3', 'Keep'].every((t) => !!find(list, t)), 'cancel keeps every blip');
      a.dialogMode = 'accept';
      await a.gearItem(/Delete blip/).catch(() => undefined);
      await sleep(2000);
      list = await a.blips(topicId);
      ctx.ok(!find(list, 'K1') && !find(list, 'K2') && !find(list, 'K3'), 'accept removes the blip and its two descendants');
      ctx.ok(!!find(list, 'Keep'), 'a sibling outside the subtree is untouched');
      await a.reload();
      ctx.ok(!!find(await a.blips(topicId), 'Keep') && !find(await a.blips(topicId), 'K2'), 'the result is the same after reload');
    },
  },
  {
    id: 'C02', family: 'C', title: 'cut a blip with children and paste it under another blip: nothing lost, subtree intact, re-parented',
    rows: ['9.5', '9.9', '2.4'],
    async run(ctx) {
      const { a, b, topicId } = await setup(ctx, 'cut paste');
      await startL1(a, 'M1');
      await a.ctrlEnterChild('M1kid');
      await a.doneAll();
      await a.replyAtTopic('M2');
      await sleep(1000);
      await a.activate('M1');
      await a.gearItem(/Cut blip/).catch(() => undefined);
      await a.activate('M2');
      await a.gearItem(/Paste as new blip/).catch(() => undefined);
      await sleep(2500);
      const list = await a.blips(topicId);
      const m1 = find(list, 'M1'); const m2 = find(list, 'M2'); const kid = find(list, 'M1kid');
      ctx.ok(!!m1 && !!m2 && !!kid, 'all three blips still exist after cut + paste', list.map((x) => plain(x.content)).join(','));
      ctx.ok(m1?.parentId === m2?.id, 'the cut blip is now a child of the paste target');
      ctx.ok(kid?.parentId === m1?.id, 'the cut blip keeps its own child (subtree intact)');
      await expectSecondClient(ctx, b, topicId, [{ text: 'M1' }, { text: 'M1kid' }, { text: 'M2' }], 'user B');
    },
  },
  {
    id: 'C03', family: 'C', title: 'a long session: 30 inline sub-blips created by Ctrl+Enter all survive reload (created 30, stored 30, 0 deleted)',
    rows: ['2.4', '14.20', '19.1'],
    client: { timeout: 12000 },
    timeoutMs: 900000,
    async run(ctx) {
      const { a, b, topicId } = await setup(ctx, 'thirty subblips');
      await startL1(a, 'Q0');
      const N = 30;
      for (let i = 1; i <= N; i += 1) {
        if (i > 1) { await a.doneAll(); await a.enterEditByClick('Q0').catch(() => undefined); }
        await a.ctrlEnterChild(`Q${i}`, 10);
      }
      await a.doneAll();
      await sleep(2500);
      await a.reload();
      const all = await a.allBlips(topicId);
      const live = all.filter((x) => !x.deleted);
      const kids = live.filter((x) => /^Q\d+$/.test(plain(x.content)) && plain(x.content) !== 'Q0');
      ctx.eq(kids.length, N, `${N} sub-blips created, ${N} stored`);
      ctx.eq(all.filter((x) => x.deleted).length, 0, 'no blip carries a deleted flag');
      const q0 = find(live, 'Q0');
      ctx.ok(kids.every((k) => k.parentId === q0?.id), 'every sub-blip is a child of Q0');
      ctx.ok(kids.every((k) => String(q0?.content).includes(k.id)), 'Q0 holds an inline marker for every one of them');
      const seen = await b.blips(topicId);
      ctx.eq(seen.filter((x) => /^Q\d+$/.test(plain(x.content))).length, N + 1, 'a second client sees all 31 blips');
    },
  },
  {
    id: 'C04', family: 'C', title: 'two users add blips to the same topic at the same time: neither loses any',
    rows: ['4.1', '4.2', '4.6', '2.4'],
    async run(ctx) {
      const { a, b, topicId } = await setup(ctx, 'concurrent');
      await b.openTopic(topicId);
      const addMany = async (c, prefix) => { for (let i = 1; i <= 4; i += 1) await c.replyAtTopic(`${prefix}${i}`); };
      await Promise.all([addMany(a, 'AA'), addMany(b, 'BB')]);
      await sleep(3000);
      await a.reload(); await b.reload();
      for (const c of [a, b]) {
        const texts = (await c.blips(topicId)).map((x) => plain(x.content));
        const want = ['AA1', 'AA2', 'AA3', 'AA4', 'BB1', 'BB2', 'BB3', 'BB4'];
        ctx.ok(want.every((t) => texts.includes(t)), `all 8 blips present for ${c.user.tag}`, texts.join(','));
      }
    },
  },
  {
    id: 'C05', family: 'C', title: 'a blip whose parent marker is missing is still reachable as a reply row after the grace period',
    rows: ['14.15', '2.7', '2.3'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'orphan');
      await a.replyAtTopic('Par');
      const par = find(await a.blips(topicId), 'Par');
      const r = await a.api('POST', '/api/blips', { waveId: topicId, parentId: par.id, content: '<ul><li><p>Orphan</p></li></ul>', anchorPosition: 3 });
      ctx.ok(r.status < 300, 'API created a child without any marker in the parent', String(r.status));
      await a.reload(7000);
      await a.ensureExpanded('Par');
      await sleep(35000);
      const visible = await a.page.locator('.blip-collapsed-row, .blip-text', { hasText: 'Orphan' }).count();
      ctx.ok(visible > 0, 'the marker-less child is shown (as a reply row) after the 30 s grace', `rows with text=${visible}`);
    },
  },
  {
    id: 'C06', family: 'C', title: 'undo in the editor restores typed text; the blip history/playback opens',
    rows: ['10.3', '10.2', '9.7'],
    async run(ctx) {
      const { a, topicId } = await setup(ctx, 'undo playback');
      await startL1(a, 'U1');
      await a.page.keyboard.press('End');
      await a.page.keyboard.type(' oops', { delay: 25 });
      await a.page.keyboard.press('Control+z');
      await sleep(600);
      const text = await a.page.locator('.ProseMirror[contenteditable="true"]').first().innerText();
      ctx.ok(!/oops/.test(text), 'Ctrl+Z removes the last typed word', text);
      await a.doneAll();
      await sleep(1500);
      const list = await a.blips(topicId);
      const u1 = find(list, 'U1');
      ctx.ok(!!u1, 'the blip text is U1 after undo');
      const h = await a.api('GET', `/api/blips/${encodeURIComponent(u1?.id || '')}/history`);
      ctx.ok(h.status === 200, 'GET /api/blips/:id/history answers 200', String(h.status));
    },
  },
];
