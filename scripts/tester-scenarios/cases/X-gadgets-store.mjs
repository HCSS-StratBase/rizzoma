// Family X: gadgets, store, teams, publics. Every sandbox app must render AND respond.
import { newUser, shareWith, plain, sleep, BASE } from '../lib.mjs';

const APPS = [
  { label: 'Kanban', appId: 'kanban-board', title: 'Kanban Board' },
  { label: 'Planner', appId: 'calendar-planner', title: 'Calendar Planner' },
  { label: 'Focus', appId: 'focus-timer', title: 'Focus Timer' },
  { label: 'Notes', appId: 'notes-scratchpad', title: 'Notes Scratchpad' },
];

async function insertApp(ctx, a, app) {
  const id = await ctx.topic(a, `gadget ${app.appId}`);
  await a.openTopic(id);
  await a.page.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click({ timeout: 10000 });
  await sleep(1500);
  await a.page.locator('.topic-content-edit .ProseMirror').first().click();
  await a.page.keyboard.press('End');
  await a.page.locator('[data-testid="right-tools-insert-gadget"]').first().click();
  await sleep(500);
  await a.page.locator('.gadget-tile', { hasText: app.label }).first().click({ timeout: 5000 });
  await a.page.locator(`iframe[src="/gadgets/apps/${app.appId}/index.html"]`).waitFor({ timeout: 20000 }).catch(() => undefined);
  await sleep(2500);
  return id;
}

export default [
  ...APPS.map((app, i) => ({
    id: `X0${i + 1}`, family: 'X', title: `${app.label} sandbox app: inserted from the palette, renders its own UI, responds to a click, survives reload`,
    rows: ['3.14', '3.15', '15.8', '20.15'],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      const id = await insertApp(ctx, a, app);
      const sel = `iframe[src="/gadgets/apps/${app.appId}/index.html"]`;
      ctx.eq(await a.page.locator(sel).count(), 1, 'the iframe is inserted');
      const frame = a.page.frames().find((f) => f.url().includes(`/gadgets/apps/${app.appId}/`));
      const before = frame ? await frame.evaluate(() => document.body.innerText.length).catch(() => 0) : 0;
      ctx.ok(before > 40, 'the app renders text content', String(before));
      if (frame) {
        const btn = frame.locator('button').first();
        if (await btn.count()) {
          const htmlBefore = await frame.evaluate(() => document.body.innerHTML.length);
          await btn.click().catch(() => undefined); await sleep(800);
          const htmlAfter = await frame.evaluate(() => document.body.innerHTML.length);
          ctx.ok(htmlAfter !== htmlBefore || (await frame.locator('input,textarea').count()) > 0, 'the app responds to a click or offers inputs', `${htmlBefore} -> ${htmlAfter}`);
        }
      }
      await a.page.locator('.wave-panel [data-testid="blip-menu-done"]').first().click().catch(() => undefined);
      await sleep(2500);
      await a.reload(7000);
      ctx.eq(await a.page.locator(sel).count(), 1, 'the gadget is still there after reload');
    },
  })),
  {
    id: 'X05', family: 'X', title: 'gadget palette: all documented tiles are offered, the poll gadget (Yes/No/Maybe) renders',
    rows: ['3.15', '3.14', '15.8', '15.4'],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      const id = await ctx.topic(a, 'palette');
      await a.openTopic(id);
      await a.page.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click(); await sleep(1500);
      await a.page.locator('.topic-content-edit .ProseMirror').first().click(); await a.page.keyboard.press('End');
      await a.page.locator('[data-testid="right-tools-insert-gadget"]').first().click(); await sleep(700);
      const tiles = await a.page.locator('.gadget-tile').allInnerTexts();
      ctx.ok(tiles.length >= 11, 'the palette offers at least 11 tiles', `${tiles.length}: ${tiles.join(',').replace(/\n/g, ' ').slice(0, 160)}`);
      await a.page.locator('.gadget-tile', { hasText: /Poll|Yes/i }).first().click().catch(() => undefined); await sleep(2500);
      const poll = a.page.locator('.node-pollGadget').first();
      await poll.waitFor({ timeout: 20000 }).catch(() => undefined);
      ctx.ok(await poll.count() > 0, 'the poll gadget renders');
      const text = await poll.innerText();
      ctx.ok(['Yes', 'No', 'Maybe'].every((o) => text.includes(o)), 'it offers Yes, No and Maybe', text.replace(/\n/g, '/').slice(0, 80));
      await poll.getByText('Yes', { exact: true }).first().click(); await sleep(1200);
      ctx.ok(/1 total/.test(await poll.innerText()) || /100%/.test(await poll.innerText()), 'voting Yes updates the poll', (await poll.innerText()).replace(/\n/g, '/').slice(0, 80));
    },
  },
  {
    id: 'X06', family: 'X', title: 'Store tab: lists the gadgets, search filters them, a category can be chosen; Teams and Publics tabs render their panels',
    rows: ['13.2', '3.15', '20.15'],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      await a.page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(4000);
      await a.page.getByText('Store', { exact: true }).first().click(); await sleep(2000);
      const n0 = await a.page.locator('.gadget-card').count();
      ctx.ok(n0 >= 4, 'the store lists gadgets', String(n0));
      await a.page.locator('.store-search input').fill('kanban'); await sleep(1000);
      const n1 = await a.page.locator('.gadget-card').count();
      ctx.ok(n1 >= 1 && n1 < n0, 'searching narrows the list', `${n0} -> ${n1}`);
      for (const tab of ['Teams', 'Publics']) { await a.page.getByText(tab, { exact: true }).first().click(); await sleep(1800); ctx.ok((await a.page.locator('body').innerText()).length > 100, `${tab} panel renders`); }
    },
  },

  // ---- RENDERED-OUTPUT checks (added 17-19 Nov after SDS saw LaTeX, YouTube and Sheet not working live while X01-X05 passed).
  // X01-X05 only proved: iframe element present, text length > 40, a button changes innerHTML length, poll shows Yes/No/Maybe.
  // None of them touched LaTeX, YouTube, Sheet, iFrame, Image or Code. These cases assert what a person SEES.
  {
    id: 'X07', family: 'X', title: 'LaTeX gadget: insert from the palette, type a formula between the $$ marks, the READ view shows typeset math and no raw $$ source',
    rows: ['3.14', '3.15', '15.8'], timeoutMs: 300000,
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      const id = await ctx.topic(a, 'latex gadget');
      await a.openTopic(id);
      await a.page.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click({ timeout: 10000 }); await sleep(1500);
      await a.page.locator('.topic-content-edit .ProseMirror').first().click(); await a.page.keyboard.press('End');
      await a.page.locator('[data-testid="right-tools-insert-gadget"]').first().click(); await sleep(500);
      await a.page.locator('.gadget-tile', { hasText: 'LaTeX' }).first().click(); await sleep(1500);
      const edit = (await a.page.locator('.topic-content-edit .ProseMirror').first().innerText());
      ctx.ok(edit.includes('$$'), 'the palette inserts a $$ math starter into the editor', edit.slice(-60).replace(/\n/g, '/'));
      // a person types where the caret is, or moves it between the marks if the caret sits after them
      const around = () => a.page.evaluate(() => { const s = getSelection(); const t = s.anchorNode && s.anchorNode.textContent || ''; return { before: t.slice(0, s.anchorOffset), after: t.slice(s.anchorOffset) }; });
      for (let i = 0; i < 6; i += 1) { const c = await around(); if (/\$\$\s*$/.test(c.before) && /^\s*\$\$/.test(c.after)) break; await a.page.keyboard.press('ArrowLeft'); }
      ctx.ok(/\$\$\s*$/.test((await around()).before) && /^\s*\$\$/.test((await around()).after), 'the caret can be put between the two $$ marks', JSON.stringify(await around()));
      await a.page.keyboard.type('\\sum_{i=1}^{n} x^2 \\leq \\alpha', { delay: 70 }); await sleep(1500);
      await a.stepShot('X-gadgets', 'X07-latex-edit');
      await a.doneAll(); await sleep(3000);
      await a.reload(6000);
      await a.stepShot('X-gadgets', 'X07-latex-read');
      const root = a.page.locator('body');
      const body = (await a.page.locator('.topic-content-view, .wave-container, .rizzoma-topic-detail').first().innerText().catch(() => '')) || (await root.innerText());
      const typeset = await root.locator('.rizzoma-latex, .katex, math').count();
      ctx.ok(typeset > 0, 'a typeset math element (.rizzoma-latex, .katex or <math>) is on the page in read mode', `found ${typeset}`);
      const mathText = typeset > 0 ? (await root.locator('.rizzoma-latex, .katex, math').first().innerText()) : '';
      ctx.ok(/∑/.test(mathText) && /≤/.test(mathText) && /α/.test(mathText), 'the typeset formula shows the sum, less-or-equal and alpha symbols, not LaTeX commands', mathText.slice(0, 80));
      ctx.ok(!body.includes('$$') && !/\\sum|\\leq|\\alpha/.test(body), 'no raw $$ source or backslash commands are visible in the read view', body.replace(/\n/g, '/').slice(-120));
    },
  },
  {
    id: 'X08', family: 'X', title: 'YouTube gadget: URL from the palette becomes an embed player iframe that actually loads from youtube.com and is allowed to run (sandbox, CSP, size), and survives reload',
    rows: ['3.14', '3.15', '15.8'], timeoutMs: 300000, expect: [/youtube|googlevideo|ytimg|google|doubleclick|gstatic|Failed to load resource|net::ERR|ERR_BLOCKED/i],
    async run(ctx) { await embedCase(ctx, { label: 'YouTube', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', host: 'www.youtube.com', pathRe: /^\/embed\/jNQXAC9IVRw/, shot: 'X08-youtube', needSameOrigin: true }); },
  },
  {
    id: 'X09', family: 'X', title: 'Sheet gadget: a Google Sheets URL becomes a /preview iframe on docs.google.com, 720x420, loads and is allowed to run',
    rows: ['3.14', '3.15', '15.8'], timeoutMs: 300000, expect: [/DOCS_timing|google|gstatic|Failed to load resource|net::ERR|ERR_BLOCKED|401|403|404/i],
    async run(ctx) { await embedCase(ctx, { label: 'Sheet', url: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0', host: 'docs.google.com', pathRe: /^\/spreadsheets\/d\/[^/]+\/preview/, shot: 'X09-sheet', needSameOrigin: false }); },
  },
  {
    id: 'X10', family: 'X', title: 'iFrame gadget: a trusted https URL becomes a framed page that loads and is allowed to run',
    rows: ['3.14', '3.15', '15.8'], timeoutMs: 300000, expect: [/Failed to load resource|net::ERR|ERR_BLOCKED/i],
    async run(ctx) { await embedCase(ctx, { label: 'iFrame', url: 'https://example.com/', host: 'example.com', pathRe: /^\//, shot: 'X10-iframe', needSameOrigin: false }); },
  },
  {
    id: 'X11', family: 'X', title: 'Image and Code gadgets: the image URL shows a decoded picture (naturalWidth > 0), the Code tile makes a code block that keeps typed text',
    rows: ['3.14', '3.15', '15.8'], timeoutMs: 300000, expect: [/Failed to load resource|net::ERR|ERR_BLOCKED/i],
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      const id = await ctx.topic(a, 'image and code gadgets');
      await a.openTopic(id);
      await a.page.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click({ timeout: 10000 }); await sleep(1500);
      await a.page.locator('.topic-content-edit .ProseMirror').first().click(); await a.page.keyboard.press('End');
      await a.page.locator('[data-testid="right-tools-insert-gadget"]').first().click(); await sleep(500);
      await a.page.locator('.gadget-tile', { hasText: 'Image' }).first().click(); await sleep(500);
      await a.page.locator('.gadget-url-field').fill('https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png');
      await a.page.locator('.gadget-url-ok').click(); await sleep(3500);
      const img = a.page.locator('.topic-content-edit .ProseMirror img').first();
      ctx.ok(await img.count() === 1, 'an image is in the editor');
      const nat = await img.evaluate((el) => ({ w: el.naturalWidth, h: el.naturalHeight, complete: el.complete })).catch(() => ({ w: 0, h: 0, complete: false }));
      ctx.ok(nat.complete && nat.w > 10 && nat.h > 10, 'the image decoded to a real picture (naturalWidth and naturalHeight above 10)', JSON.stringify(nat));
      await a.page.locator('.topic-content-edit .ProseMirror').first().click(); await a.page.keyboard.press('Control+End'); await a.page.keyboard.press('Enter');
      await a.page.locator('[data-testid="right-tools-insert-gadget"]').first().click(); await sleep(500);
      await a.page.locator('.gadget-tile', { hasText: 'Code' }).first().click(); await sleep(1200);
      await a.page.keyboard.type('const answer = 42;', { delay: 70 }); await sleep(1200);
      const code = a.page.locator('.topic-content-edit .ProseMirror .code-block-wrapper pre').first();
      ctx.ok(await code.count() === 1 && /const answer = 42;/.test(await code.innerText()), 'the Code tile makes a code block that holds the typed text');
      await a.stepShot('X-gadgets', 'X11-image-code-edit');
      await a.doneAll(); await sleep(2500); await a.reload(6000);
      await a.stepShot('X-gadgets', 'X11-image-code-read');
      const rimg = a.page.locator('.topic-content-view img').first();
      const nat2 = await rimg.evaluate((el) => ({ w: el.naturalWidth, complete: el.complete })).catch(() => ({ w: 0, complete: false }));
      ctx.ok(nat2.complete && nat2.w > 10, 'the picture is still shown after reload', JSON.stringify(nat2));
      ctx.ok(/const answer = 42;/.test(await a.page.locator('.topic-content-view pre').first().innerText().catch(() => '')), 'the code block text is still there after reload');
    },
  },
  // ---- Hryhorii (23 Nov 2026): polls render nicely only while the blip is being edited.
  {
    id: 'X13', family: 'X', title: 'poll: the read view of a second person shows the same card as the editor (badge, total votes, question, options with share and bar)',
    rows: ['3.14', '3.15', '15.8'], timeoutMs: 300000,
    async run(ctx) {
      const a = await ctx.client(await newUser('a'));
      const b = await ctx.client(await newUser('b'));
      const opts = JSON.stringify([{ id: 'o1', label: 'Yes', votes: 2 }, { id: 'o2', label: 'No', votes: 1 }, { id: 'o3', label: 'Maybe', votes: 0 }]).replace(/"/g, '&quot;');
      const html = `<h1>poll</h1><ul><li><p>before</p><figure data-gadget-type="poll" data-poll-question="Lunch?" data-poll-options="${opts}" data-poll-allow-multiple="false" class="gadget-block gadget-poll"></figure></li></ul>`;
      const id = await ctx.topic(a, 'poll card', html);
      await shareWith(id, b, 'editor');
      await b.openTopic(id, 9000);
      await b.page.locator('.gadget-poll-read').first().waitFor({ timeout: 20000 }).catch(() => undefined);
      await b.stepShot('X-gadgets', 'X13-poll-read-second-person');
      const read = await b.page.locator('.gadget-poll-read').first().evaluate((el) => ({
        text: el.innerText.replace(/\s+/g, ' '),
        badge: !!el.querySelector('.gadget-chip'),
        widths: [...el.querySelectorAll('.gadget-poll-bar-fill')].map((f) => Math.round(f.getBoundingClientRect().width / (f.parentElement?.getBoundingClientRect().width || 1) * 100)),
        radius: getComputedStyle(el).borderTopLeftRadius,
      })).catch(() => ({ text: '', badge: false, widths: [], radius: '' }));
      ctx.ok(/POLL/i.test(read.text) && read.badge, 'the read poll has the Poll badge', read.text.slice(0, 60));
      ctx.ok(/3 total votes/.test(read.text), 'it shows the total number of votes', read.text.slice(0, 120));
      ctx.ok(/Lunch\?/.test(read.text) && /Yes/.test(read.text) && /No/.test(read.text) && /Maybe/.test(read.text), 'question and all options are shown');
      ctx.ok(/67%/.test(read.text) && /33%/.test(read.text) && /0%/.test(read.text), 'each option shows its share', read.text.slice(0, 160));
      ctx.ok(read.widths.length === 3 && read.widths[0] > read.widths[1] && read.widths[1] > read.widths[2], 'the bars are drawn in proportion', JSON.stringify(read.widths));
      ctx.ok(parseFloat(read.radius) >= 12, 'it is a rounded card like the editor poll, not a plain list', read.radius);
      await a.openTopic(id, 8000);
      await a.page.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click({ timeout: 10000 }); await sleep(2500);
      const edit = await a.page.locator('.node-pollGadget').first().innerText().catch(() => '');
      await a.stepShot('X-gadgets', 'X13-poll-edit-owner');
      ctx.ok(/3 total votes/.test(edit) && /67%/.test(edit), 'the editor shows the same numbers as the read view', edit.replace(/\n/g, '/').slice(0, 100));
      await a.doneAll();
      ctx.settleProblems();
    },
  },
];

async function embedCase(ctx, o) {
  const a = await ctx.client(await newUser('a'));
  const id = await ctx.topic(a, `${o.label} gadget`);
  const blocked = []; const frameResponses = [];
  a.page.on('console', (m) => { const t = m.text(); if (/Content Security Policy|Refused to (frame|display)|blocked by|X-Frame-Options/i.test(t)) {
    // A script that docs.google.com serves INSIDE its own frame can be blocked by Google's own policy (\"script-src 'unsafe-inline'\" is Google's, ours is script-src 'self');
    // it does not stop the viewer from loading. Reproduced neither with our sandbox nor with our page policy in isolation (21 Nov 2026), so it is third-party noise.
    if (/docs\.google\.com\/static\//.test(t)) return;
    blocked.push(t.slice(0, 200));
  } });
  a.page.on('response', (r) => { if (r.url().includes(o.host)) frameResponses.push({ s: r.status(), u: r.url().slice(0, 120), dest: r.request().resourceType() }); });
  await a.openTopic(id);
  await a.page.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click({ timeout: 10000 }); await sleep(1500);
  await a.page.locator('.topic-content-edit .ProseMirror').first().click(); await a.page.keyboard.press('End');
  await a.page.locator('[data-testid="right-tools-insert-gadget"]').first().click(); await sleep(500);
  await a.page.locator('.gadget-tile', { hasText: o.label }).first().click(); await sleep(500);
  await a.page.locator('.gadget-url-field').fill(o.url);
  await a.page.locator('.gadget-url-ok').click(); await sleep(6000);
  const check = async (where) => {
    const fr = a.page.locator('.gadget-embed-frame iframe').first();
    ctx.ok(await fr.count() === 1, `${where}: the embed iframe exists`);
    const src = (await fr.getAttribute('src').catch(() => '')) || '';
    let u; try { u = new URL(src); } catch { u = null; }
    ctx.ok(!!u && u.hostname === o.host && o.pathRe.test(u.pathname), `${where}: the iframe src is the embed form on ${o.host}`, src.slice(0, 100));
    const box = await fr.boundingBox().catch(() => null);
    ctx.ok(!!box && box.width >= 300 && box.height >= 150, `${where}: the frame has a real size`, box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'no box');
    const sb = (await fr.getAttribute('sandbox').catch(() => '')) || '';
    if (o.needSameOrigin) ctx.ok(/allow-same-origin/.test(sb), `${where}: the sandbox lets the provider's own page use its storage (allow-same-origin); without it ${o.host} players and viewers usually refuse to start`, `sandbox="${sb}"`);
    const f = a.page.frames().find((x) => { try { return new URL(x.url()).hostname === o.host; } catch { return false; } });
    ctx.ok(!!f, `${where}: the frame navigated to ${o.host} (a real child frame exists)`, a.page.frames().map((x) => x.url().slice(0, 50)).join(' | ').slice(0, 200));
    ctx.ok(frameResponses.some((r) => r.s >= 200 && r.s < 400 && r.dest === 'document'), `${where}: the provider answered the frame request with a 2xx/3xx document`, JSON.stringify(frameResponses.filter((r) => r.dest === 'document').slice(0, 3)));
    ctx.ok(blocked.length === 0, `${where}: no CSP / X-Frame-Options / blocked-frame message`, blocked.slice(0, 2).join(' | '));
  };
  await a.stepShot('X-gadgets', `${o.shot}-edit`);
  await check('edit view');
  await a.doneAll(); await sleep(3000); await a.reload(8000);
  await a.stepShot('X-gadgets', `${o.shot}-read`);
  await check('read view after reload');
}
