// Family Y: behaviours of original client modules that no earlier case exercised (SDS/coordinator 21 Nov: "untested, not product decisions").
// Each case drives the real UI and keeps screenshots under <evidence>/yshots/.
import fs from 'node:fs';
import path from 'node:path';
import { newUser, sleep, BASE, EVIDENCE, PASS } from '../lib.mjs';

const shotDir = () => { const d = path.join(EVIDENCE, 'yshots'); fs.mkdirSync(d, { recursive: true }); return d; };
const DESK = { viewport: { width: 1440, height: 950 } };

export default [
  {
    id: 'Y01', family: 'Y', title: 'Play video in the tips box opens something a person can watch or read (original tips_video: "First Steps in Rizzoma")', client: DESK,
    rows: [], shotRows: [],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'), DESK);
      await a.page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(4500);
      const btn = a.page.getByRole('button', { name: 'Play video' }).first();
      ctx.ok(await btn.count() > 0, 'the tips box offers Play video');
      const before = await a.page.evaluate(() => document.querySelectorAll('[role=dialog], .modal, iframe, video').length);
      await btn.click(); await sleep(2500);
      const after = await a.page.evaluate(() => ({ n: document.querySelectorAll('[role=dialog], .modal, iframe, video').length, text: (document.querySelector('[role=dialog]')?.innerText || '').slice(0, 80) }));
      await a.page.screenshot({ path: path.join(shotDir(), 'Y01-after-play-video.png') });
      ctx.ok(after.n > before, 'clicking Play video opens a dialog, player or video', JSON.stringify(after));
    },
  },
  {
    id: 'Y02', family: 'Y', title: 'task deadline: a person sets a deadline on a task in an in-page dialog and it shows on the task (original utils/date_time_picker)', client: DESK,
    rows: [],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'), DESK); const id = await ctx.topic(a, 'task deadline');
      await a.openTopic(id, 4500); await a.replyAtTopic('call Remy'); await a.ensureExpanded('call Remy'); await a.enterEditByClick('call Remy');
      await a.page.keyboard.press('End'); await a.page.locator('button[title="Insert task (~)"]').first().click(); await sleep(1500);
      await a.page.keyboard.press('Enter'); await sleep(1000);
      const dlg = a.page.locator('[data-testid="task-deadline-dialog"]');
      await a.page.screenshot({ path: path.join(shotDir(), 'Y02-deadline-dialog.png') });
      ctx.ok(await dlg.isVisible().catch(() => false), 'choosing the assignee opens a Deadline dialog with a date field');
      await a.page.locator('[data-testid="task-deadline-input"]').fill('2026-12-01'); await a.page.locator('[data-testid="task-deadline-set"]').click(); await sleep(1200);
      await a.page.keyboard.type(' by phone', { delay: 30 });
      await a.doneAll(); await sleep(2500);
      await a.page.screenshot({ path: path.join(shotDir(), 'Y02-task-with-deadline.png') });
      const stored = (await a.blips(id)).map((b) => String(b.content)).join(' ');
      ctx.ok(/data-due-date="2026-12-01/.test(stored), 'the stored task carries the deadline', stored.slice(0, 200));
    },
  },
  {
    id: 'Y03', family: 'Y', title: 'session expiry: after the session cookie is gone the next action tells the person to sign in again (original session module)', client: DESK, expect: [/http 40[13]/, /console.error/],
    rows: [],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'), DESK); const id = await ctx.topic(a, 'session expiry');
      await a.openTopic(id, 4500);
      await a.ctx.clearCookies(); await sleep(500);
      await a.page.locator('.write-reply-input').first().click().catch(() => undefined);
      await a.page.keyboard.type('after expiry', { delay: 20 }); await a.page.keyboard.press('Enter'); await sleep(3500);
      await a.page.screenshot({ path: path.join(shotDir(), 'Y03-after-cookie-cleared.png') });
      const t = (await a.page.locator('body').innerText()).replace(/\s+/g, ' ');
      const told = (await a.page.locator('[data-testid="toast"]').allInnerTexts()).join(' ') + ' ' + ((await a.page.getByPlaceholder('Email address').count()) ? 'SIGNIN-FORM' : '');
      ctx.ok(/session has expired|SIGNIN-FORM/i.test(told), 'the person is told the session expired (toast) or shown the sign-in form', told.slice(0, 160));
    },
  },
  {
    id: 'Y04', family: 'Y', title: 'export: the downloaded topic file opens and shows the topic text (original export module)', client: DESK,
    rows: [],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'), DESK); const id = await ctx.topic(a, 'export open');
      await a.openTopic(id, 4500); await a.replyAtTopic('export-text-alpha');
      await a.page.locator('.gear-btn').first().click(); await sleep(800);
      await a.page.getByText('Export single topic').first().click(); await sleep(1500);
      const dl = a.page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
      await a.page.locator('.export-modal button', { hasText: /export|download|html|markdown|json/i }).first().click().catch(() => undefined);
      const d = await dl; ctx.ok(!!d, 'a file is downloaded');
      if (!d) return;
      const f = await d.path(); const name = d.suggestedFilename(); const text = fs.readFileSync(f, 'utf8');
      ctx.ok(text.includes('export-text-alpha'), `the file ${name} contains the blip text`, text.slice(0, 80));
      const p = await ctx.browser.newPage({ viewport: { width: 1000, height: 600 } });
      const html = /\.html?$/i.test(name) ? text : `<pre style="font:14px monospace;white-space:pre-wrap">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`;
      await p.setContent(html); await sleep(500); await p.screenshot({ path: path.join(shotDir(), 'Y04-downloaded-file-opened.png') }); await p.close();
    },
  },
  {
    id: 'Y05', family: 'Y', title: 'ribbon: the text colour/highlight button opens the original 7-colour palette, a colour is applied to the selection (archive 237, ribbon 063/230)', client: DESK,
    rows: [],
    shotRows: ['234-edit-size-dropdown', '235-edit-format-dropdown', '237-edit-color-palette'],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'), DESK); const id = await ctx.topic(a, 'ribbon palette');
      await a.openTopic(id, 4500); await a.replyAtTopic('colour me please'); await a.ensureExpanded('colour me'); await a.enterEditByClick('colour me');
      await a.page.keyboard.press('Home'); await a.page.keyboard.down('Shift'); for (let i = 0; i < 6; i += 1) await a.page.keyboard.press('ArrowRight'); await a.page.keyboard.up('Shift'); await sleep(300);
      await a.page.screenshot({ path: path.join(shotDir(), 'Y05-ribbon-buttons.png'), clip: { x: 400, y: 190, width: 700, height: 120 } });
      const names = await a.page.evaluate(() => [...document.querySelectorAll('.ProseMirror[contenteditable="true"]')].length && [...document.querySelectorAll('[data-testid^="blip-menu-"], .menu-btn')].filter((e) => e.offsetParent).map((e) => e.getAttribute('title') || e.getAttribute('data-testid')).join(' | '));
      await a.page.locator('[data-testid="blip-menu-highlight-toggle"]').first().click(); await sleep(700);
      await a.page.screenshot({ path: path.join(shotDir(), 'Y05-palette-open.png'), clip: { x: 400, y: 190, width: 700, height: 160 } });
      const n = await a.page.locator('.color-panel .color-choice').count();
      ctx.ok(n >= 7, 'the palette offers the original colours (white to clear, yellow, green, teal, blue, purple, pink)', `choices=${n}; buttons: ${String(names).slice(0, 300)}`);
      await a.page.locator('.color-panel .color-choice').nth(1).click(); await sleep(900);
      await a.doneAll(); await sleep(2500);
      await a.page.screenshot({ path: path.join(shotDir(), 'Y05-colour-applied.png') });
      const stored = (await a.blips(id)).map((b) => String(b.content)).join(' ');
      ctx.ok(/<mark[^>]*(background|data-color)|background-color/.test(stored), 'the selection is stored with a background colour', stored.slice(0, 260));
    },
  },
  {
    id: 'Y06', family: 'Y', title: 'Ctrl+Enter hand-off: the new child blip is ready for typing within 3 seconds (marks of the hand-off trace are recorded)', client: DESK,
    rows: [], expect: [/http 40[19]/],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'), DESK); const id = await ctx.topic(a, 'handoff timing');
      await a.openTopic(id, 4500);
      await a.page.locator('.write-reply-input').first().click(); await a.page.keyboard.type('H1', { delay: 30 }); await a.page.keyboard.press('Enter'); await sleep(2500);
      await a.ensureExpanded('H1'); await a.enterEditByClick('H1');
      await a.page.keyboard.press('End'); await a.page.keyboard.press('Control+Enter');
      const t0 = Date.now(); let trace = null;
      while (Date.now() - t0 < 20000) {
        trace = await a.page.evaluate(() => window.__rizzomaHandoffTrace ? { marks: window.__rizzomaHandoffTrace.marks } : null);
        if (trace && 'flushed' in trace.marks) break; await sleep(100);
      }
      await a.page.screenshot({ path: path.join(shotDir(), 'Y06-after-handoff.png') });
      const diag = await a.page.evaluate(() => ({ editors: [...document.querySelectorAll('.ProseMirror')].map((e) => e.getAttribute('contenteditable')), hasTrace: !!window.__rizzomaHandoffTrace, active: document.activeElement?.className?.toString().slice(0, 40), blips: document.querySelectorAll('.blip-container').length }));
      const ms = Date.now() - t0; const marks = JSON.stringify(trace?.marks || {}) + ' diag ' + JSON.stringify(diag);
      ctx.ok(!!trace && 'flushed' in trace.marks, 'the hand-off completes (child editor ready and focused)', `${ms} ms; marks ${marks}`);
      ctx.ok(ms <= 3000, 'and within 3 seconds', `${ms} ms; marks ${marks}`);
    },
  },
  {
    id: 'Y07', family: 'Y', title: 'invitation link (no mail): a dead invitation opens the sign-in form first, then says clearly that it no longer works', client: DESK, expect: [/http 40[0134]/],
    rows: [],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'), DESK);
      const topic = await ctx.topic(a, 'invite dead link'); const token = 'x'.repeat(64);
      await a.ctx.clearCookies(); await a.page.evaluate(() => { try { sessionStorage.clear(); } catch { /* ignore */ } });
      await a.page.goto('about:blank'); await a.page.goto(`${BASE}/?layout=rizzoma#/topic/${topic}?invite=${token}`, { waitUntil: 'domcontentloaded' }); await sleep(4500);
      await a.page.screenshot({ path: path.join(shotDir(), 'Y07-1-link-signed-out.png') });
      const first = (await a.page.locator('body').innerText()).replace(/\s+/g, ' ');
      ctx.ok(/Sign in to continue/i.test(first) && !/Create an account/i.test(first), 'the link opens the sign-in form first', first.slice(0, 60));
      ctx.ok(!/invite=/.test(a.page.url()), 'the token is not left in the address bar');
      await a.page.getByPlaceholder('Email address').click(); await a.page.keyboard.press('Control+a'); await a.page.keyboard.type(a.user.email, { delay: 15 });
      await a.page.getByPlaceholder('Password', { exact: true }).click(); await a.page.keyboard.press('Control+a'); await a.page.keyboard.type(a.user.password || PASS, { delay: 15 });
      await a.page.locator('.submit-btn').click(); await a.page.locator('.shell-auth-logout').waitFor({ timeout: 30000 }); await a.page.locator('[data-testid="toast"]').waitFor({ timeout: 8000 }).catch(() => undefined);
      await a.page.screenshot({ path: path.join(shotDir(), 'Y07-2-after-sign-in.png') });
      const txt = (await a.page.locator('body').innerText()).replace(/\s+/g, ' ');
      const toasts = (await a.page.locator('[data-testid="toast"]').allInnerTexts().catch(() => [])).join(' ');
      ctx.ok(/invalid|expired|no longer/i.test(toasts + ' ' + txt), 'after sign-in a clear message says the invitation is invalid or expired', (toasts || txt).slice(0, 100));
    },
  },
  {
    id: 'Y08', family: 'Y', title: 'provider sign-in landing (no mail): the callback lands on the list, a pending invitation takes the person to its topic', client: DESK, expect: [/http 40[0134]/],
    rows: [],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'), DESK);
      const topic = 'f'.repeat(32); const token = 'y'.repeat(64);
      await a.page.evaluate(({ topic, token }) => { sessionStorage.setItem('rizzoma:pendingInvite', JSON.stringify({ token, waveId: topic, createdAt: Date.now(), expiresAt: Date.now() + 3600000 })); }, { topic, token });
      await a.page.goto('about:blank'); await a.page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(8000);
      await a.page.screenshot({ path: path.join(shotDir(), 'Y08-after-callback-landing.png') });
      ctx.ok(a.page.url().includes(topic), 'a signed-in person with a pending invitation is taken to its topic', a.page.url().slice(-50));
    },
  },
  {
    id: 'Y09', family: 'Y', title: 'user card: a click on a person avatar opens a card with name and e-mail (original popup/user_popup)', client: DESK,
    rows: [],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'), DESK); const id = await ctx.topic(a, 'user card');
      await a.openTopic(id, 4500);
      await a.page.locator('[data-testid="user-avatar"]').first().click(); await sleep(700);
      await a.page.screenshot({ path: path.join(shotDir(), 'Y09-user-card.png') });
      const t = await a.page.locator('[data-testid="user-card"]').innerText().catch(() => '');
      ctx.ok(t.includes(a.user.email.split('@')[0]), 'the card shows the e-mail address of the person', t.replace(/\s+/g, ' ').slice(0, 80));
    },
  },
  {
    id: 'Y10', family: 'Y', title: 'export multiple topics: gear menu, tick one topic, Export selected topics downloads a ZIP with its text (original export popup)', client: DESK,
    rows: [], shotRows: ['020-settings-menu', '272-settings-open-menu'],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'), DESK); const id = await ctx.topic(a, 'export multi'); await a.openTopic(id, 4500); await a.replyAtTopic('multi-export-text');
      await a.page.locator('.gear-btn').first().click(); await sleep(700);
      await a.page.locator('[data-testid="gear-export-multiple"]').click(); await sleep(3000);
      await a.page.screenshot({ path: path.join(shotDir(), 'Y10-1-dialog.png') });
      const row = a.page.locator('[data-testid="export-multiple"] .ep-topic', { hasText: 'export multi' }).first();
      ctx.ok(await row.count() > 0, 'the dialog lists the topic');
      await row.locator('input[type=checkbox]').check();
      const dl = a.page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
      await a.page.locator('[data-testid="export-start"]').click(); const d = await dl;
      ctx.ok(!!d, 'a ZIP is downloaded');
      if (d) { const txt = fs.readFileSync(await d.path(), 'latin1'); ctx.ok(txt.startsWith('PK') && txt.includes('multi-export-text'), `the ${d.suggestedFilename()} holds the topic text`, `${txt.length} bytes`); }
      await sleep(800); await a.page.screenshot({ path: path.join(shotDir(), 'Y10-2-done.png') });
    },
  },
  {
    id: 'Y11', family: 'Y', title: 'introduction for new users: four tips, Prev / Next, Check it later closes it (original introduce)', client: DESK,
    rows: [],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'), DESK);
      await a.page.evaluate(() => sessionStorage.setItem('rizzoma:showIntro', '1')); await a.page.reload({ waitUntil: 'domcontentloaded' }); await sleep(5000);
      await a.page.screenshot({ path: path.join(shotDir(), 'Y11-1-tip1.png') });
      ctx.ok(await a.page.locator('[data-testid="intro-overlay"]').isVisible().catch(() => false), 'the introduction shows');
      await a.page.locator('[data-testid="intro-next"]').click(); await sleep(300);
      await a.page.screenshot({ path: path.join(shotDir(), 'Y11-2-tip2.png') });
      await a.page.locator('[data-testid="intro-close"]').click(); await sleep(500);
      ctx.ok(await a.page.locator('[data-testid="intro-overlay"]').count() === 0, 'Check it later closes it');
    },
  },
];
