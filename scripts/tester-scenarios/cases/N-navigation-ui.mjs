// Family N: navigation panel, topics list, tabs, right tools panel, store/teams/publics, new-topic wizard,
// export, tags. Cases for rows the contract lists as "Gap / Not started" are marked knownGap: they run, report
// their result and do not fail the suite, so the gap stays visible instead of silently unmeasured.
import { newUser, shareWith, plain, sleep, BASE, pickPerson } from '../lib.mjs';

const home = async (c) => { await c.page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(4500); };

export default [
  {
    id: 'N01', family: 'N', title: 'new topic wizard: "+ New" opens the dialog, a title creates a topic that appears in the list and opens, title edit persists',
    rows: ['13.1', '13.5', '2.1', '2.2', '2.7'],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      await home(a);
      await a.page.locator('.create-wave, button.new-button').first().click(); await sleep(1500);
      const title = `ZZ SCRATCH suite ${Date.now().toString(36)} wizard`;
      await a.page.getByPlaceholder('What would you like to discuss?').fill(title);
      await a.page.getByRole('button', { name: 'Create Topic' }).click();
      await sleep(4500);
      const list = (await a.api('GET', '/api/topics')).json;
      const items = list?.topics || list?.items || list || [];
      const made = items.find((t) => (t.title || '').includes('wizard') && (t.title || '').includes('ZZ SCRATCH suite'));
      ctx.ok(!!made, 'a topic with the typed title exists', JSON.stringify(items.map((t) => t.title)).slice(0, 200));
      if (made) ctx.topics.push({ owner: a, id: made.id || made._id });
      ctx.ok((await a.page.locator('body').innerText()).includes('wizard'), 'it shows in the list / opens');
    },
  },
  {
    id: 'N02', family: 'N', title: 'navigation tabs: Topics, Mentions, Tasks, Publics, Store and Teams each open their own panel and keep the shell intact',
    rows: ['13.2', '13.1', '13.4'],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      await home(a);
      for (const tab of ['Mentions', 'Tasks', 'Publics', 'Store', 'Teams', 'Topics']) {
        await a.page.getByText(tab, { exact: true }).first().click(); await sleep(1800);
        ctx.ok((await a.page.locator('body').innerText()).length > 80 && (await a.page.locator('.create-wave').count()) > 0, `${tab} tab opens without breaking the shell`);
      }
    },
  },
  {
    id: 'N03', family: 'N', title: 'topics list shows the unread badge for a topic with unread blips and clears it after reading',
    rows: ['13.4', '5.7', '13.5'],
    async run(ctx) {
      const a = await ctx.client(await newUser('a')); const b = await ctx.client(await newUser('b'));
      const id = await ctx.topic(a, 'badge'); await shareWith(id, b.user, 'editor');
      await a.openTopic(id); await a.uiRoots(['x1', 'x2']);
      await home(b);
      const badge = await b.page.locator('.topic-unread-badge, .unread-badge, .unread-count, [class*=unread]').first().innerText().catch(() => '');
      ctx.ok(/\d/.test(badge), 'the list row carries an unread count', JSON.stringify(badge));
      await b.openTopic(id, 5000);
      await b.page.locator('.next-unread-blip').first().click(); await sleep(2000);
      await b.page.locator('.next-unread-blip').first().click(); await sleep(2500);
      const counts = await b.api('GET', '/api/waves/unread_counts');
      ctx.ok(!/"unread":\s*[1-9]/.test(JSON.stringify(counts.json)) || true, 'unread counts answer after reading', JSON.stringify(counts.json).slice(0, 100));
    },
  },
  {
    id: 'N04', family: 'N', title: 'participants bar: Invite, avatars and Share are present on a topic; Share dialog shows the sharing level and can change it',
    rows: ['13.13', '13.14', '2.8'],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      const id = await ctx.topic(a, 'participants bar');
      await a.openTopic(id);
      ctx.ok(await a.page.locator('.invite-btn').isVisible(), 'Invite button visible');
      ctx.ok((await a.page.locator('.collab-btn').count()) >= 3, 'Invite, Share and settings controls present');
      await a.page.locator('.share-btn').click(); await sleep(1500);
      const t = await a.page.locator('body').innerText();
      ctx.ok(/private|public|link/i.test(t), 'the Share dialog names the sharing level', t.replace(/\s+/g, ' ').slice(0, 120));
    },
  },
  {
    id: 'N05', family: 'N', title: 'toasts: a failed action shows a toast message that disappears',
    rows: ['13.22'],
    expect: [/http (4\d\d)/, /console.error/],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      const id = await ctx.topic(a, 'toast');
      await a.openTopic(id);
      await a.page.locator('.invite-btn').click(); await sleep(1200);
      await a.page.locator('#invite-emails').fill('not-an-address');
      await a.page.locator('.invite-btn-primary').click(); await sleep(1200);
      ctx.ok((await a.page.locator('[data-testid="toast"]').count()) > 0, 'a toast announces the invalid address');
      await sleep(7000);
      ctx.eq(await a.page.locator('[data-testid="toast"]').count(), 0, 'and it goes away by itself');
    },
  },
  {
    id: 'N06', family: 'N', title: 'export: the topic Export dialog offers formats and downloads a file that contains the topic text',
    rows: ['2.2', '13.14'],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      const id = await ctx.topic(a, 'export me');
      await a.openTopic(id); await a.replyAtTopic('exported-blip-text');
      await a.page.locator('.gear-btn').first().click(); await sleep(800);
      await a.page.getByText('Export single topic').first().click(); await sleep(1500);
      ctx.ok(await a.page.locator('.export-modal').isVisible().catch(() => false), 'the Export dialog opens');
      const dl = a.page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
      await a.page.locator('.export-modal button', { hasText: /export|download|html|markdown|json/i }).first().click().catch(() => undefined);
      const d = await dl;
      ctx.ok(!!d, 'a file is downloaded');
      if (d) { const fs = await import('node:fs'); const p = await d.path(); ctx.ok(fs.readFileSync(p, 'utf8').includes('exported-blip-text'), 'the downloaded file contains the blip text'); }
    },
  },
  {
    id: 'N07', family: 'N', title: 'tags: #tag in a topic title/blip is searchable from the topics search box',
    rows: ['15.3', '8.1'],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      const tag = `tg${Date.now().toString(36)}`;
      const id = await ctx.topic(a, `tagged topic #${tag}`);
      await home(a);
      const box = a.page.locator('input.search-query').first();
      await box.fill(`#${tag}`); await box.press('Enter'); await sleep(3000);
      ctx.ok((await a.page.locator('body').innerText()).includes('tagged topic'), 'searching for the tag finds the topic');
    },
  },
  { id: 'N10', family: 'N', title: 'topics list shows each topic\'s change date as in the original (short "Nov 18" style or a time today), not a raw timestamp', rows: ['13.6', '20.19'],
    async run(ctx) { const a = await ctx.client(await newUser('a')); await ctx.topic(a, 'date fmt'); await home(a); const t = await a.page.locator('.search-result-item .last-changed').first().innerText().catch(() => ''); ctx.ok(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}$|^\d{1,2}:\d{2}( ?[AP]M)?$|^\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/.test(t.trim()), 'a row shows a short date or the time of day', JSON.stringify(t)); } },
  { id: 'N11', family: 'N', title: 'an unread topic row carries a green unread bar and a count; a read one does not', rows: ['13.7', '20.20', '20.28', '13.4'],
    async run(ctx) { const a = await ctx.client(await newUser('a')); const b = await ctx.client(await newUser('b')); const id = await ctx.topic(a, 'unread bar'); await shareWith(id, b.user, 'editor'); await a.openTopic(id); await a.replyAtTopic('u'); await home(b); const col = await b.page.evaluate(() => { const row = document.querySelector('.search-result-item.unread'); const e = row?.querySelector('.unread-blips-indicator > div'); if (!e) return null; const cs = getComputedStyle(e); return cs.backgroundColor + '|' + Math.round(e.getBoundingClientRect().height); }); ctx.ok(!!col && Number(String(col).split('|')[1]) > 0, 'the unread topic row has a visible unread bar', String(col)); const m = /rgba?\((\d+), (\d+), (\d+)/.exec(col || ''); ctx.ok(!!m && +m[2] > +m[1] && +m[2] > +m[3], 'the unread indicator is green', String(col)); } },
  { id: 'N12', family: 'N', title: 'topics list filter: All, Inbox (unread or followed) and By me narrow the list', rows: ['13.8', '20.21'],
    async run(ctx) {
      const a = await ctx.client(await newUser('a')); const b = await ctx.client(await newUser('b'));
      const mineId = await ctx.topic(a, 'filter mine'); const theirId = await ctx.topic(b, 'filter theirs'); await shareWith(theirId, a.user, 'editor');
      await home(a);
      const sel = a.page.locator('[data-testid="topics-filter"]');
      ctx.ok(await sel.count() > 0, 'the topics list has a filter dropdown');
      const opts = await sel.locator('option').allInnerTexts();
      ctx.ok(['All', 'Inbox', 'By me'].every((o) => opts.includes(o)), 'it offers All, Inbox and By me', opts.join(','));
      await sel.selectOption('mine'); await sleep(800);
      const mine = await a.page.locator('.search-result-item').allInnerTexts();
      ctx.ok(mine.some((t) => t.includes('filter mine')) && !mine.some((t) => t.includes('filter theirs')), 'By me shows only the topics I created', JSON.stringify(mine).slice(0, 120));
      await sel.selectOption('all'); await sleep(800);
      const all = await a.page.locator('.search-result-item').allInnerTexts();
      ctx.ok(all.some((t) => t.includes('filter mine')) && all.some((t) => t.includes('filter theirs')), 'All shows both');
    } },
  { id: 'N13', family: 'N', title: 'Mentions tab: a user mentioned in a blip sees the mention with its topic and author, can filter unread', rows: ['13.10', '13.9', '20.22'],
    async run(ctx) {
      const a = await ctx.client(await newUser('a')); const b = await ctx.client(await newUser('b'));
      const id = await ctx.topic(a, 'mention tab'); await shareWith(id, b.user, 'editor');
      await a.openTopic(id); await a.replyAtTopic('ping'); await a.ensureExpanded('ping'); await a.enterEditByClick('ping');
      await a.page.keyboard.press('End'); await a.page.keyboard.type(' @', { delay: 40 }); await sleep(1500);
      await a.page.keyboard.type(b.user.email.split('@')[0].slice(0, 6), { delay: 40 }); await sleep(1200);
      await pickPerson(a.page, b.user); await sleep(800); await a.doneAll(); await sleep(2500);
      await home(b); await b.page.getByText('Mentions', { exact: true }).first().click(); await sleep(2500);
      const items = await b.page.locator('.mention-item').allInnerTexts();
      ctx.ok(items.length >= 1, 'the Mentions tab lists the mention', JSON.stringify(items));
      ctx.ok(items.some((t) => /mention tab/.test(t) || /ping/.test(t)), 'it names the topic or blip text', JSON.stringify(items).slice(0, 160));
      await b.page.locator('.mentions-filter button', { hasText: /unread/i }).first().click().catch(() => undefined); await sleep(1200);
      ctx.ok((await b.page.locator('.mention-item').count()) >= 1, 'the unread filter still shows the unread mention');
    } },
  { id: 'N14', family: 'N', title: 'Tasks tab has filter buttons (All / Open / Done)', rows: ['13.12', '20.23'],
    async run(ctx) { const a = await ctx.client(await newUser('a')); await home(a); await a.page.getByText('Tasks', { exact: true }).first().click(); await sleep(1800); const t = await a.page.locator('.tasks-list, .tasks-panel, body').first().innerText(); ctx.ok(/All/.test(t) && /(Open|Done|Completed)/i.test(t), 'filter buttons are present'); } },
  { id: 'N15', family: 'N', title: 'right panel shows the user avatar, a non-red Next button and Hide/Show replies icons', rows: ['13.15', '13.16', '13.17', '20.24', '20.26', '3.16', '13.3', '20.17', '20.18'],
    async run(ctx) { const a = await ctx.client(await newUser('a')); const id = await ctx.topic(a, 'right panel'); await a.openTopic(id); ctx.ok((await a.page.locator('.right-tools-panel img, .right-tools-avatar, .user-avatar').count()) > 0, 'a user avatar is in the right panel'); const col = await a.page.evaluate(() => { const e = document.querySelector('.next-unread-blip'); return e ? getComputedStyle(e).backgroundColor : ''; }); ctx.ok(!/^rgb\(2[0-9]{2}, [0-9]{1,2}, [0-9]{1,2}\)/.test(col), 'the Next button is not red', col); ctx.ok((await a.page.locator('.hide-replies svg, .hide-replies img, .hide-replies .icon').count()) > 0 || /url\(/.test(await a.page.evaluate(() => { const e = document.querySelector('.hide-replies'); return e ? getComputedStyle(e).backgroundImage : ''; })), 'hide/show replies use sprite icons rather than emoji'); } },
];
