#!/usr/bin/env node
/**
 * Regression gate: a NEWLY CREATED child blip must keep its editor, focus, caret and typed text
 * across the topic reload that the tab's own create/save socket events trigger.
 *
 * Real keyboard only (Playwright keyboard, never the API, for creating content). For every run:
 * log in, create an empty topic, open the root editor, type a root label, press Ctrl+Enter and
 * TYPE AT ONCE (as in the original Rizzoma), descend LEVELS deep (level 1 = root line, level 2 =
 * the root's child, ...), optionally press Ctrl+Enter twice on the same blip, press Done, reload,
 * and read the stored blips back through the API. A run passes only when
 *   (a) the cursor is in the new child immediately after the typing (the child editor survived),
 *   (b) every label is stored in its own blip with the right parent, and
 *   (c) no label is stored in the topic root or in a wrong blip.
 *
 * Environment:
 *   RIZZOMA_BASE_URL   default http://127.0.0.1:3000
 *   COUCHDB_URL / COUCHDB_DB   the database the server uses (to seed the account)
 *   RUNS               runs per scenario (default 20)
 *   LEVELS             depth of the chain (default 4)
 *   SCENARIOS          comma list of: chain, twice, stale (default chain,twice,stale).
 *                      stale = chain, but a topic reload is requested just before every Ctrl+Enter and its
 *                      answer is held for STALE ms (default 900), so it arrives after the child exists: the
 *                      deterministic form of "a socket event reloads the topic at the wrong moment"
 *   TYPING             fast (25 ms per key, typed at once) | slow (wait 1.2 s, 120 ms per key) | both (default both)
 *   LOAD               1 = a second client of the same account creates reply blips in the same topic every
 *                      600 ms during the whole run (socket events into the tab under test); 0 = idle (default 0)
 *   CPU / LAT          CPU throttling factor (1 = none) and network latency in ms for the tab under test,
 *                      to model a slow machine or link (default 1 / 0)
 *   TYPE_DELAY / SLOWMO  ms per typed key (default 25) / Playwright slowMo (default 0)
 *   VIDEO_DIR / STEPS_DIR  record a video per run / a screenshot per level
 *   HEADED             1 to watch (default headless)
 *
 *   node scripts/test-root-ctrl-enter-survives-reload.mjs
 */
import { chromium } from 'playwright';
import { seedVerifiedE2EAccount } from './lib/e2e-sharing-fixtures.mjs';

const BASE = process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3000';
const RUNS = Number(process.env.RUNS || 20);
const LEVELS = Number(process.env.LEVELS || 4);
const SCENARIOS = (process.env.SCENARIOS || 'chain,twice,stale').split(',').map((s) => s.trim()).filter(Boolean);
const TYPING = (process.env.TYPING || 'both');
const LOAD = process.env.LOAD === '1';
const TYPE_DELAY = Number(process.env.TYPE_DELAY || 25);
const LATE_MS = Number(process.env.LATE_MS || 2500);
const SLOWMO = Number(process.env.SLOWMO || 0);
const VIDEO_DIR = process.env.VIDEO_DIR || '';
const STEPS_DIR = process.env.STEPS_DIR || '';
const STALE = Number(process.env.STALE || 900);
const CPU = Number(process.env.CPU || 1);
const LAT = Number(process.env.LAT || 0);
const PASS = 'RootCtrlEnter!1';
const email = `rce-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plain = (h) => String(h || '')
  .replace(/<span class="blip-thread-host"[\s\S]*?<\/span><\/span>/g, '')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

let storageState = null;
async function login(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ e, p }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find((x) => x.startsWith('XSRF-TOKEN='));
    const csrf = decodeURIComponent(raw.split('=')[1]);
    await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ email: e, password: p }) });
  }, { e: email, p: PASS });
}
const csrfOf = (page) => page.evaluate(() => decodeURIComponent((document.cookie.split('; ').find((x) => x.startsWith('XSRF-TOKEN=')) || '=').split('=')[1] || ''));

async function createTopic(page) {
  return page.evaluate(async () => {
    const raw = document.cookie.split('; ').find((x) => x.startsWith('XSRF-TOKEN='));
    const csrf = decodeURIComponent(raw.split('=')[1]);
    const r = await fetch('/api/topics', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: JSON.stringify({ title: `RCE ${Date.now()}`, content: '<h1>RCE</h1>' }) });
    return (await r.json()).id;
  });
}

async function readStored(page, tid) {
  return page.evaluate(async (t) => {
    const b = await (await fetch(`/api/blips?waveId=${t}&limit=200`, { credentials: 'include', cache: 'no-store' })).json();
    const tp = await (await fetch(`/api/topics/${t}`, { credentials: 'include', cache: 'no-store' })).json();
    return { blips: (b.blips || []).filter((x) => !x.deleted).map((x) => ({ id: x._id || x.id, parentId: x.parentId || null, content: x.content || '' })), topicContent: tp.content || '' };
  }, tid);
}

// DOM probe: which blip container owns the label text, and is the caret inside it.
const probeLabel = (page, label) => page.evaluate((lab) => {
  let owner = null;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if ((n.nodeValue || '').includes(lab)) owner = n.parentElement?.closest('[data-blip-id]')?.getAttribute('data-blip-id') || (n.parentElement?.closest('.wave-panel') ? 'ROOT' : null);
  }
  const ae = document.activeElement;
  const focusId = ae?.closest?.('[data-blip-id]')?.getAttribute('data-blip-id') || (ae?.closest?.('.ProseMirror') ? 'ROOT' : null);
  return { owner, focusId, editors: document.querySelectorAll('.ProseMirror[contenteditable="true"]').length };
}, label);

async function ctrlEnterAndType(page, label, mode, scenario) {
  // A reload requested at this very moment: the same event the app handles for any socket message.
  if (scenario === 'stale') await page.evaluate(() => { window.dispatchEvent(new CustomEvent('rizzoma:refresh-topics')); });
  await page.keyboard.press('Control+Enter');
  if (mode === 'slow') { await sleep(1200); await page.keyboard.type(label, { delay: 120 }); } else { await page.keyboard.type(label, { delay: TYPE_DELAY }); }
}

async function clickDone(page) {
  for (let i = 0; i < 6; i += 1) {
    const done = page.locator('[data-testid="blip-menu-done"]:visible');
    const n = await done.count().catch(() => 0);
    if (!n) break;
    await done.first().click({ timeout: 3000 }).catch(() => undefined);
    await sleep(500);
  }
}

async function runOne(browser, scenario, mode, run) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, storageState, ...(VIDEO_DIR ? { recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 950 } } } : {}) });
  const page = await ctx.newPage();
  const problems = [];
  let noise = null;
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const tid = await createTopic(page);
    await page.goto(`${BASE}/?layout=rizzoma&render=react#/topic/${tid}`, { waitUntil: 'domcontentloaded' });
    await sleep(5000);
    if (LOAD) {
      const ctx2 = await browser.newContext({ viewport: { width: 1000, height: 700 }, storageState });
      const p2 = await ctx2.newPage();
      await p2.goto(`${BASE}/?layout=rizzoma&render=react#/topic/${tid}`, { waitUntil: 'domcontentloaded' });
      await sleep(2500);
      let stop = false; let k = 0;
      noise = { stop: () => { stop = true; }, ctx2 };
      (async () => {
        while (!stop) {
          k += 1;
          const csrf = await csrfOf(p2).catch(() => '');
          await p2.evaluate(async ({ t, c, i }) => {
            await fetch('/api/blips', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': c }, credentials: 'include', body: JSON.stringify({ waveId: t, parentId: null, content: `<ul><li><p>noise ${i}</p></li></ul>` }) });
          }, { t: tid, c: csrf, i: k }).catch(() => undefined);
          await sleep(600);
        }
      })();
    }
    const staleRoutes = [];
    if (scenario === 'stale') {
      // The server answers from its CURRENT state; the answer reaches the tab STALE ms later.
      const slow = async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        const answer = await route.fetch();
        await sleep(STALE);
        await route.fulfill({ response: answer }).catch(() => undefined);
      };
      const blipsRe = /\/api\/blips\?waveId=/;
      const topicRe = new RegExp(`/api/topics/${tid}$`);
      await page.route(blipsRe, slow); await page.route(topicRe, slow);
      staleRoutes.push([blipsRe, slow], [topicRe, slow]);
    }
    if (CPU > 1 || LAT > 0) {
      // A slow machine / slow link, as the colleague's (and any phone's) is. Applied to the tab under test only.
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: LAT, downloadThroughput: -1, uploadThroughput: -1 });
    }
    await page.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click({ timeout: 10000 });
    await sleep(1500);
    await page.locator('.ProseMirror[contenteditable="true"]').first().click().catch(() => undefined);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('L1 label', { delay: TYPE_DELAY });

    const labels = ['L1 label'];
    const depthLabels = (d) => `L${d} label`;
    for (let d = 2; d <= LEVELS; d += 1) {
      const lab = depthLabels(d);
      await ctrlEnterAndType(page, lab, mode, scenario);
      labels.push(lab);
      await sleep(1700); // past the ~400 ms reload and the late-arrival window
      if (STEPS_DIR) await page.screenshot({ path: `${STEPS_DIR}/${scenario}-${mode}-run${run}-L${d}.png` }).catch(() => undefined);
      // The label may legitimately arrive late on a very slow machine; allow up to LATE_MS more before failing.
      let pr = await probeLabel(page, lab);
      for (let w = 0; w < LATE_MS && (!pr.owner || pr.owner === 'ROOT' || pr.focusId !== pr.owner); w += 250) { await sleep(250); pr = await probeLabel(page, lab); }
      if (!pr.owner || pr.owner === 'ROOT' || (d > 2 && pr.owner === labels[d - 2])) problems.push(`L${d} label shown in ${pr.owner || 'no blip'} after 1.7 s`);
      if (!pr.focusId || pr.focusId !== pr.owner) problems.push(`L${d} caret not in the child (focus ${pr.focusId}, owner ${pr.owner}, editors ${pr.editors})`);
      if (!pr.owner || pr.owner === 'ROOT' || !pr.focusId || pr.focusId !== pr.owner) {
        const diag = await page.evaluate(() => ({
          trace: (window.__rizzomaHandoffTrace || {}).marks || null,
          conts: Array.from(document.querySelectorAll('[data-blip-id]')).map((c) => `${c.getAttribute('data-blip-id').slice(-5)}:${c.querySelector('.ProseMirror')?.getAttribute('contenteditable') || '-'}:${c.classList.contains('active') ? 'A' : ''}`),
          markers: document.querySelectorAll('[data-blip-thread]').length,
        })).catch(() => null);
        problems.push(`diag L${d} ${JSON.stringify(diag)}`);
        if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/fail-${scenario}-${mode}-run${run}-L${d}.png` }).catch(() => undefined);
      }
    }
    let twiceLabels = null;
    if (scenario === 'twice') {
      // Back to the level-2 blip and press Ctrl+Enter a second time on it.
      await page.getByText('L2 label', { exact: false }).first().click().catch(() => undefined);
      await sleep(800);
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('L2b label', { delay: TYPE_DELAY });
      await ctrlEnterAndType(page, 'L3b label', mode, scenario);
      twiceLabels = ['L2b label', 'L3b label'];
      await sleep(1700);
      const pr = await probeLabel(page, 'L3b label');
      if (!pr.owner || pr.focusId !== pr.owner) problems.push(`second Ctrl+Enter: L3b shown in ${pr.owner}, caret in ${pr.focusId}`);
    }
    await sleep(2500);
    await clickDone(page);
    await sleep(2500);
    if (noise) noise.stop();
    for (const [re, h] of staleRoutes) await page.unroute(re, h);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(4000);
    const { blips, topicContent } = await readStored(page, tid);
    const byText = (lab) => blips.filter((b) => plain(b.content).includes(lab));
    const first = {};
    for (const lab of [...labels.slice(1), ...(twiceLabels || [])]) {
      const hit = byText(lab);
      if (hit.length !== 1) { problems.push(`"${lab}" stored in ${hit.length} blips`); continue; }
      first[lab] = hit[0];
      if (plain(topicContent).includes(lab)) problems.push(`"${lab}" also in the topic root`);
    }
    if (!plain(topicContent).includes('L1 label')) problems.push('L1 label missing from the topic root');
    // parent chain: L2 -> parent null (child of the topic); Ld -> parent = L(d-1)
    for (let d = 2; d <= LEVELS; d += 1) {
      const me = first[labels[d - 1]]; if (!me) continue;
      if (d === 2) { if (me.parentId) problems.push(`L2 has parent ${me.parentId}, expected the topic root`); }
      else {
        const par = first[labels[d - 2]];
        if (par && me.parentId !== par.id) problems.push(`L${d} parent ${me.parentId} is not the L${d - 1} blip`);
      }
    }
    if (twiceLabels) {
      const l2 = first['L2 label'];
      if (l2 && !plain(l2.content).includes('L2b label')) problems.push('L2b label not in the L2 blip');
      const g1 = first['L3 label']; const g2 = first['L3b label'];
      if (l2 && g1 && g1.parentId !== l2.id) problems.push('L3 not under L2');
      if (l2 && g2 && g2.parentId !== l2.id) problems.push('L3b not under L2 (second Ctrl+Enter on the same blip)');
    }
  } catch (e) {
    problems.push(`exception: ${String(e.message || e).split('\n')[0]}`);
  } finally {
    if (noise) { noise.stop(); await noise.ctx2.close().catch(() => undefined); }
    await ctx.close().catch(() => undefined);
  }
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${scenario}/${mode}${LOAD ? '/load' : '/idle'} run ${run}${problems.length ? `  -- ${problems.join(' | ')}` : ''}`);
  return problems.length === 0;
}

await seedVerifiedE2EAccount(email, PASS);
const browser = await chromium.launch({ headless: process.env.HEADED !== '1', slowMo: SLOWMO, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
{
  // One login for the whole run (the login route is rate limited); every context reuses the session.
  const c0 = await browser.newContext();
  const p0 = await c0.newPage();
  await login(p0);
  storageState = await c0.storageState();
  await c0.close();
}
const modes = TYPING === 'both' ? ['fast', 'slow'] : [TYPING];
const summary = [];
let failedTotal = 0;
for (const scenario of SCENARIOS) {
  for (const mode of modes) {
    let ok = 0;
    for (let run = 1; run <= RUNS; run += 1) if (await runOne(browser, scenario, mode, run)) ok += 1;
    summary.push(`${scenario}/${mode}${LOAD ? '/load' : '/idle'}: ${ok} of ${RUNS} passed`);
    failedTotal += RUNS - ok;
  }
}
await browser.close();
console.log('SUMMARY\n' + summary.join('\n'));
process.exit(failedTotal === 0 ? 0 : 1);
