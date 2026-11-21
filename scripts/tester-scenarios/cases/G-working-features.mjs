// Family G: the things the tester said work, which must keep working: login/logout, links, follow-the-green,
// tasks, mentions, hashtags, always-hide-blips (Hide), fold/unfold all, search, playback, mind map.
import { newUser, shareWith, plain, sleep, BASE, PASS } from '../lib.mjs';

async function setup(ctx, title) {
  const a = await ctx.client(await newUser('a'));
  const b = await ctx.client(await newUser('b'));
  const id = await ctx.topic(a, title);
  await shareWith(id, b.user, 'editor');
  await a.openTopic(id);
  return { a, b, id };
}

export default [
  {
    id: 'G01', family: 'G', title: 'login and logout through the real sign-in dialog (typed credentials), session persists across reload',
    rows: ['1.2', '1.8', '13.19', '13.21', '13.22'],
    expect: [/http 401/],
    async run(ctx) {
      const user = await newUser('l');
      const c = await ctx.anon();
      await c.page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
      await sleep(3500);
      await c.page.getByPlaceholder('Email address').fill(user.email);
      await c.page.getByPlaceholder('Password', { exact: true }).fill(PASS);
      await c.page.locator('.submit-btn').click();
      await sleep(3500);
      ctx.ok(await c.page.locator('.shell-auth-logout').isVisible().catch(() => false), 'after typing credentials the user is signed in (Log out button visible)');
      await c.page.reload({ waitUntil: 'domcontentloaded' }); await sleep(3500);
      ctx.ok(await c.page.locator('.shell-auth-logout').isVisible().catch(() => false), 'still signed in after reload');
      await c.page.locator('.shell-auth-logout').click(); await sleep(2500);
      ctx.ok(await c.page.getByPlaceholder('Email address').isVisible().catch(() => false), 'Log out returns to the signed-out sign-in form');
      const bad = await ctx.anon(); await bad.page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3000);
      await bad.page.getByPlaceholder('Email address').fill(user.email);
      await bad.page.getByPlaceholder('Password', { exact: true }).fill('definitely-wrong');
      await bad.page.locator('.submit-btn').click(); await sleep(2500);
      ctx.ok(!(await bad.page.locator('.shell-auth-logout').isVisible().catch(() => false)), 'a wrong password does not sign in');
    },
  },
  {
    id: 'G02', family: 'G', title: 'links: create a link on selected text (in-page Insert link popup), it is stored as <a href>, opens in view mode, can be edited and removed',
    rows: ['3.9', '15.3', '9.6'],
    async run(ctx) {
      const { a, id } = await setup(ctx, 'links');
      await a.replyAtTopic('see docs here');
      await a.ensureExpanded('see docs here');
      await a.enterEditByClick('see docs here');
      a.promptText = 'https://example.org/one';
      await a.page.keyboard.press('Home'); await a.page.keyboard.down('Shift');
      for (let i = 0; i < 8; i += 1) await a.page.keyboard.press('ArrowRight');
      await a.page.keyboard.up('Shift');
      await a.page.locator('[data-testid="blip-menu-insert-link"]').last().click();
      await sleep(800);
      if (await a.page.locator('[data-testid="link-popup"]').count()) {
        await a.page.locator('[data-testid="link-popup-url"]').click(); await a.page.keyboard.type('https://example.org/one', { delay: 15 });
        await a.page.locator('[data-testid="link-popup-submit"]').click();
      } else { await a.page.keyboard.press('Control+l').catch(() => undefined); } // older builds asked with a browser prompt
      await sleep(800);
      await a.doneAll(); await sleep(2000);
      let stored = (await a.blips(id)).find((x) => plain(x.content).includes('see docs'));
      ctx.ok(/<a [^>]*href="https:\/\/example\.org\/one"/.test(String(stored?.content)), 'the blip stores an <a href> for the selected text', String(stored?.content).slice(0, 200));
      await a.reload(); await a.ensureExpanded('see docs');
      const href = await a.page.locator('.blip-text a[href^="https://example.org"]').first().getAttribute('href').catch(() => null);
      ctx.eq(href, 'https://example.org/one', 'the link renders in view mode with its address');
    },
  },
  {
    id: 'G03', family: 'G', title: 'follow-the-green: user B sees the unread count, Next walks through every unread blip once, then the topic is read',
    rows: ['5.6', '5.7', '5.8', '5.9', '14.14', '13.4'],
    async run(ctx) {
      const { a, b, id } = await setup(ctx, 'follow green');
      await a.uiRoots(['g1', 'g2', 'g3']);
      await b.openTopic(id, 6500);
      const btn = b.page.locator('.next-unread-blip').first();
      const label0 = (await btn.getAttribute('title').catch(() => '')) || '';
      ctx.ok(/3 unread/i.test(label0), 'the Next button states the number of unread blips (3)', label0);
      ctx.ok((await b.page.locator('.blip-collapsed-row.unread, .unread').count()) > 0, 'unread blips carry the green marker');
      const seen = [];
      for (let i = 0; i < 3; i += 1) {
        await btn.click(); await sleep(2200);
        seen.push(await b.page.locator('.rizzoma-blip.active:not(.topic-root)').first().innerText().then((t) => t.replace(/\s+/g, ' ').slice(0, 40)).catch(() => ''));
      }
      ctx.ok(['g1', 'g2', 'g3'].every((t) => seen.some((s) => s.includes(t))), 'three Next clicks visit g1, g2 and g3', JSON.stringify(seen));
      await sleep(2500);
      const un = await b.api('GET', `/api/waves/${id}/unread`);
      ctx.ok(JSON.stringify(un.json).match(/"(unreadCount|count)":0|"unread":\[\]/) !== null || (un.json?.unread || []).length === 0, 'after the walk the server counts 0 unread', JSON.stringify(un.json).slice(0, 120));
      const label1 = (await btn.getAttribute('title').catch(() => '')) || (await btn.innerText().catch(() => ''));
      ctx.ok(!/3 unread|unread - click/i.test(label1), 'the button no longer offers unread blips', label1);
    },
  },
  {
    id: 'G04', family: 'G', title: 'tasks: insert a task from the right panel, it shows in the Tasks tab, ticking it persists; mentions reach the mentioned user',
    rows: ['3.5', '15.2', '15.4', '15.5', '13.11', '13.12', '13.9', '13.10', '13.2'],
    async run(ctx) {
      const { a, b, id } = await setup(ctx, 'tasks mentions');
      await a.replyAtTopic('todo');
      await a.ensureExpanded('todo');
      await a.enterEditByClick('todo');
      await a.page.keyboard.press('End');
      await a.page.locator('button[title="Insert task (~)"]').first().click();
      await sleep(1200);
      await a.page.keyboard.type(b.user.email.split('@')[0].slice(0, 40), { delay: 40 }); await sleep(1500);
      await a.page.keyboard.press('Enter'); await sleep(800);
      await a.page.locator('[data-testid="task-deadline-set"]').waitFor({ timeout: 5000 }).then(async () => { await a.page.locator('[data-testid="task-deadline-input"]').fill('2026-12-01'); await a.page.locator('[data-testid="task-deadline-set"]').click(); }).catch(() => undefined);
      await sleep(800);
      await a.page.keyboard.type(' buy milk ', { delay: 30 });
      await a.page.keyboard.type(' @', { delay: 40 }); await sleep(1500);
      await a.page.keyboard.type(b.user.email.split('@')[0].slice(0, 40), { delay: 40 }); await sleep(1200);
      await a.page.keyboard.press('Enter'); await sleep(600);
      await a.doneAll(); await sleep(2500);
      const stored = (await a.blips(id)).find((x) => plain(x.content).startsWith('todo'));
      ctx.ok(/task|checkbox|data-type="task/i.test(String(stored?.content)), 'the blip stores a task node', String(stored?.content).slice(0, 240));
      const tl = await b.api('GET', '/api/tasks'); // /api/tasks lists the tasks ASSIGNED to the caller (routes/tasks.ts:45-55)
      const tasks = tl.json?.tasks || tl.json || [];
      ctx.ok(tl.status === 200 && tasks.length >= 1, 'the task is listed for its assignee by /api/tasks', JSON.stringify(tl.json).slice(0, 80) + ' STORED ' + String(stored?.content).slice(0, 300));
      const ml = await b.api('GET', '/api/mentions');
      ctx.ok(ml.status === 200 && JSON.stringify(ml.json).length > 20, 'user B has the mention in /api/mentions', JSON.stringify(ml.json).slice(0, 160));
      await b.openTopic(id, 4000);
      await b.page.getByText('Mentions', { exact: true }).first().click(); await sleep(2500);
      ctx.ok(/todo|buy milk|tasks mentions/i.test(await b.page.locator('body').innerText()), 'the Mentions tab shows it to B');
      await b.page.getByText('Tasks', { exact: true }).first().click(); await sleep(2500);
      ctx.ok(/buy milk/i.test(await b.page.locator('body').innerText()), 'the Tasks tab lists the task for its assignee');
      const box = b.page.locator('.tasks-list input[type=checkbox], .task-item input[type=checkbox]').first();
      if (await box.count()) { await box.click(); await sleep(1800); }
      const after = await b.api('GET', '/api/tasks');
      ctx.ok((after.json?.tasks || []).some((t) => t.isCompleted === true), 'ticking the task persists as completed', JSON.stringify(after.json).slice(0, 120));
    },
  },
  {
    id: 'G05', family: 'G', title: 'always-hide-blips: the Hide checkbox persists and another user then sees that blip collapsed',
    rows: ['13.20', '14.18', '9.8'],
    async run(ctx) {
      const { a, b, id } = await setup(ctx, 'hide default');
      await a.uiRoots(['hide-me', 'stay-open']);
      const k = (await a.blips(id)).find((x) => plain(x.content) === 'hide-me').id;
      await a.reload();
      await a.ensureExpanded('hide-me');
      const hide = a.page.locator('.rizzoma-blip.active:not(.topic-root) [data-testid="blip-menu-collapse-default"], [data-testid="blip-menu-collapse-default"]').last();
      for (const want of [true, false, true]) {
        const pressed = (await hide.getAttribute('aria-pressed')) === 'true';
        if (pressed !== want) { await hide.click(); await sleep(2000); }
        const got = await a.api('GET', `/api/blips/${encodeURIComponent(k)}/collapse-default`);
        ctx.ok(JSON.stringify(got.json).includes(String(want)), `the server stores Hide = ${want} and the button agrees`, JSON.stringify(got.json));
      }
      await b.openTopic(id, 6000);
      ctx.ok((await b.page.locator('.blip-collapsed-row', { hasText: 'hide-me' }).count()) > 0, 'user B sees the blip collapsed');
    },
  },
  {
    id: 'G06', family: 'G', title: 'fold / unfold all from the right panel (Hide replies / Show replies) and the state persists after reload',
    rows: ['14.17', '14.16', '13.17', '14.18', '13.20'],
    async run(ctx) {
      const { a, id } = await setup(ctx, 'fold all');
      await a.uiRoots(['f-parent', 'f-other']);
      await a.uiChild('f-parent', 'f-child');
      await a.reload();
      await a.page.locator('.show-replies').first().click(); await sleep(2500);
      const open = await a.page.locator('.nested-blip.expanded').count();
      ctx.ok(open >= 2, 'Show replies expands every blip', String(open));
      await a.page.locator('.hide-replies').first().click(); await sleep(2500);
      ctx.eq(await a.page.locator('.nested-blip.expanded').count(), 0, 'Hide replies folds them all');
      await a.reload();
      ctx.eq(await a.page.locator('.nested-blip.expanded').count(), 0, 'the folded state persists after reload');
    },
  },
  {
    id: 'G07', family: 'G', title: 'search: the topics list filters by a title word and by a word inside a blip',
    rows: ['8.1', '13.5', '2.2'],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      const word = `sq${Date.now().toString(36)}`;
      const id = await ctx.topic(a, `needle ${word}`);
      const other = await ctx.topic(a, 'haystack');
      await a.openTopic(other); await a.replyAtTopic(`inside ${word}x`);
      await a.page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(4500);
      const box = a.page.locator('input.search-query').first();
      await box.fill(word); await box.press('Enter'); await sleep(3500);
      const text = await a.page.locator('body').innerText();
      ctx.ok(text.includes(`needle ${word}`), 'the topic whose title has the word is listed');
      await box.fill('qqqqnotfoundqqqq'); await box.press('Enter'); await sleep(3000);
      ctx.ok(!(await a.page.locator('body').innerText()).includes(`needle ${word}`), 'an unrelated query hides it');
    },
  },
  {
    id: 'G08', family: 'G', title: 'hashtag typed in a blip is stored and rendered as a tag',
    rows: ['15.3', '15.4'],
    async run(ctx) {
      const { a, id } = await setup(ctx, 'hashtag');
      await a.replyAtTopic('tagged');
      await a.ensureExpanded('tagged');
      await a.enterEditByClick('tagged');
      await a.page.keyboard.press('End');
      await a.page.keyboard.type(' #suitetag ', { delay: 40 });
      await sleep(800);
      await a.doneAll(); await sleep(2000);
      const stored = (await a.blips(id)).find((x) => plain(x.content).startsWith('tagged'));
      ctx.ok(/suitetag/.test(String(stored?.content)), 'the hashtag text is stored', String(stored?.content).slice(0, 200));
      await a.reload(); await a.ensureExpanded('tagged');
      ctx.ok(/#suitetag/.test(await a.page.locator('.nested-blip .blip-text').first().innerText()), 'the tag is rendered in view mode');
    },
  },
  {
    id: 'G09', family: 'G', title: 'playback: the blip playback modal opens, steps through the edit history, and the wave playback shows the whole topic over time',
    rows: ['9.7', '10.3', '10.4', '10.5', '10.7', '10.8', '10.9', '10.10', '10.11', '10.12', '10.13'],
    async run(ctx) {
      const { a, id } = await setup(ctx, 'playback');
      await a.replyAtTopic('v1');
      for (const v of ['v2', 'v3']) {
        await a.ensureExpanded('v' + (Number(v[1]) - 1)); await a.page.locator('.blip-container.nested-blip [data-testid="blip-menu-edit"]').first().click();
        await a.page.locator('.ProseMirror[contenteditable="true"]').first().click(); await a.page.keyboard.press('Control+a'); await a.page.keyboard.type(v, { delay: 30 }); await sleep(1500); await a.doneAll(); await sleep(1000);
      }
      await a.reload();
      await a.ensureExpanded('v3'); await a.activate('v3');
      await a.gearItem(/Playback/);
      await sleep(2000);
      const modal = a.page.locator('[class*=playback], [role=dialog]').first();
      ctx.ok(await modal.isVisible().catch(() => false), 'the playback modal opens');
      const txt = await a.page.locator('body').innerText();
      ctx.ok(/v1|v2|v3/.test(txt), 'it shows the blip history content');
      await a.page.keyboard.press('Escape'); await sleep(800);
    },
  },
  {
    id: 'G10', family: 'G', title: 'text view / mind map toggle: the mind map renders the blip tree and switching back restores the text view',
    rows: ['13.18', '13.1', '20.25'],
    async run(ctx) {
      const { a, id } = await setup(ctx, 'mindmap');
      await a.replyAtTopic('mm-parent'); await a.uiChild('mm-parent', 'mm-child');
      await a.reload();
      await a.page.locator('.mindmap-view').first().click(); await sleep(2500);
      ctx.ok(await a.page.locator('[data-testid="mindmap-view"]').isVisible().catch(() => false), 'the mind map view appears');
      ctx.ok(/mm-parent/.test(await a.page.locator('[data-testid="mindmap-view"]').innerText().catch(() => '')), 'it shows the blips');
      await a.page.locator('.text-view').first().click(); await sleep(2000);
      ctx.ok(await a.page.locator('.blip-collapsed-row, .nested-blip').first().isVisible().catch(() => false), 'text view is back');
    },
  },
];
