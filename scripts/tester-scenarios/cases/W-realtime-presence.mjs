// Family W: real-time collaboration seen from the other user's screen (presence, cursors, typing, live updates).
import { newUser, shareWith, plain, sleep } from '../lib.mjs';

async function two(ctx, title) {
  const a = await ctx.client(await newUser('a'));
  const b = await ctx.client(await newUser('b'));
  const id = await ctx.topic(a, title);
  await shareWith(id, b.user, 'editor');
  return { a, b, id };
}

export default [
  {
    id: 'W01', family: 'W', title: 'live update: a blip user A creates appears on user B\'s open screen without reload',
    rows: ['4.1', '4.6', '2.4'],
    async run(ctx) {
      const { a, b, id } = await two(ctx, 'live update');
      await b.openTopic(id, 5500); await a.openTopic(id, 4000);
      await a.replyAtTopic('live-one');
      await sleep(6000);
      ctx.ok((await b.page.locator('.blip-collapsed-row', { hasText: 'live-one' }).count()) > 0 || (await b.page.locator('body').innerText()).includes('live-one'), 'B sees "live-one" without reloading');
      await a.activate('live-one');
      await a.gearItem(/Delete blip/);
      await sleep(6000);
      ctx.eq(await b.page.locator('.blip-collapsed-row', { hasText: 'live-one' }).count(), 0, 'and B sees it vanish when A deletes it');
    },
  },
  {
    id: 'W02', family: 'W', client: { allow409Put: true }, title: 'two users in the same blip editor: text typed by A reaches B live (CRDT), both edits merge, cursor label of the other user is shown',
    rows: ['4.2', '4.3', '4.4', '4.5', '14.12'],
    async run(ctx) {
      const { a, b, id } = await two(ctx, 'crdt');
      await a.openTopic(id, 4500);
      await a.replyAtTopic('shared');
      await b.openTopic(id, 6000);
      for (const c of [a, b]) { await c.ensureExpanded('shared'); }
      await a.enterEditByClick('shared'); await b.enterEditByClick('shared'); await sleep(Number(process.env.W02_SETTLE || 0));
      await a.page.keyboard.press('End'); await a.page.keyboard.type(' A1', { delay: 60 });
      await sleep(2500);
      ctx.notes.push(`A after typing: ${JSON.stringify(await a.page.locator('.ProseMirror[contenteditable="true"]').first().innerText())}`);
      const bText = await b.page.locator('.ProseMirror[contenteditable="true"]').first().innerText();
      ctx.ok(/A1/.test(bText), 'B sees A\'s typing live inside the open editor', `${bText} || ${ctx.notes.join(' ; ')}`);
      await b.page.keyboard.press('End'); await b.page.keyboard.type(' B1', { delay: 60 });
      await sleep(2500);
      const aText = await a.page.locator('.ProseMirror[contenteditable="true"]').first().innerText();
      ctx.ok(/A1/.test(aText) && /B1/.test(aText), 'both edits are merged on A\'s screen', aText);
      ctx.ok((await b.page.locator('.collaboration-cursor__label, .collaboration-cursor__caret, [class*=collaboration-cursor]').count()) > 0, 'B sees the other user\'s cursor / label');
      ctx.ok((await a.page.locator('.collab-participants > *').count()) >= 2, 'the participants bar shows both collaborators (avatars)');
      await a.doneAll(); await b.doneAll(); await sleep(2500);
      const t = plain((await a.blips(id)).find((x) => plain(x.content).startsWith('shared'))?.content);
      ctx.ok(/A1/.test(t) && /B1/.test(t), 'the stored blip holds both edits', `${t} | all stored: ${JSON.stringify((await a.blips(id)).map((x) => plain(x.content)))}`);
      // A 409 on a save is the editor's retry path (RizzomaBlip.tsx autoSaveBlip/persistLatestProjection): after every blip that saw
      // one, its LAST save must have succeeded, otherwise an edit would have been lost.
      for (const c of [a, b]) {
        const byUrl = new Map(); c.puts.forEach((p) => byUrl.set(p.url, [...(byUrl.get(p.url) || []), p.status]));
        const conflicted = [...byUrl.values()].filter((st) => st.includes(409));
        ctx.ok(conflicted.every((st) => st[st.length - 1] < 300), `every save that hit a 409 was retried to success (${c.user.tag}: ${conflicted.length} conflicted blips)`, JSON.stringify([...byUrl.values()]).slice(0, 160));
      }
    },
  },
];
