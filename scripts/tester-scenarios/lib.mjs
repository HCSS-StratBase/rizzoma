// Shared driver for the tester-scenarios suite. A "client" is one real browser context signed in as
// one real (fixture) user. Content is only ever entered with real key events; everything is judged
// from what the SERVER stored (GET /api/blips) and what a SECOND client sees, never from the DOM alone.
import fs from 'node:fs';
import path from 'node:path';
import { seedAcceptedParticipant, seedVerifiedE2EAccount } from '../lib/e2e-sharing-fixtures.mjs';

// LIVE mode (SUITE_LIVE=1): the same cases against the production host as the two real test accounts Fractal Tester 1 and 2 (their
// credentials are read here from $GDRIVE_ROOT/SYSTEM_CREDENTIALS.env, never printed); no database access, people are shared by the
// owner through the invitation API (the call the Invite dialog makes).
export const LIVE = process.env.SUITE_LIVE === '1';
const LIVE_ACCOUNTS = {};
if (LIVE) {
  if (!process.env.GDRIVE_ROOT) throw new Error('SUITE_LIVE needs GDRIVE_ROOT');
  const vars = {};
  for (const line of fs.readFileSync(path.join(process.env.GDRIVE_ROOT, 'SYSTEM_CREDENTIALS.env'), 'utf8').split('\n')) {
    const m = /^(RIZZOMA_MODERN_FRACTAL[12]_(?:USER|PASSWORD))=(.*)$/.exec(line.replace(/\r$/, ''));
    if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  LIVE_ACCOUNTS.t1 = { email: vars.RIZZOMA_MODERN_FRACTAL1_USER, password: vars.RIZZOMA_MODERN_FRACTAL1_PASSWORD };
  LIVE_ACCOUNTS.t2 = { email: vars.RIZZOMA_MODERN_FRACTAL2_USER, password: vars.RIZZOMA_MODERN_FRACTAL2_PASSWORD };
}
const T1_TAGS = new Set(['b', 'v', 'm', 'k', 'l', 'n', 'e', 'g']);
const TOPIC_OWNER = new Map();

export const BASE = (process.env.RIZZOMA_BASE_URL || (process.env.SUITE_LIVE === '1' ? 'https://138-201-62-161.nip.io' : 'http://127.0.0.1:3100')).replace(/\/$/, '');
export const PASS = 'TesterScenarios!1';
export const RUN_ID = process.env.SUITE_RUN_ID || `${Date.now().toString(36)}`;
export const SCRATCH = (what) => `ZZ SCRATCH suite ${RUN_ID} ${what}`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const OUT = process.env.SUITE_OUT || path.resolve('screenshots', `tester-scenarios-${RUN_ID}`);
export const SERVER_LOG = process.env.RIZZOMA_SERVER_LOG || '';
// Headed mode: a visible browser on the desktop, human pace, video and step screenshots as evidence.
export const HEADED = process.env.SUITE_HEADED === '1';
export const SLOWMO = Number(process.env.SUITE_SLOWMO || (HEADED ? 120 : 0));
export const TYPE_DELAY = Number(process.env.SUITE_TYPE_DELAY || (HEADED ? 90 : 0));
export const EVIDENCE = process.env.SUITE_EVIDENCE || '/mnt/c/Apps/rizzoma/session-2026-11-16/screenshots/tester-scenarios-suite';

export const plain = (html) => String(html || '')
  .replace(/<span class="blip-thread-host"[\s\S]*?<\/span><\/span>/g, '')
  .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
export const norm = (list) => (list || []).map((b) => ({ ...b, id: b.id || b._id }));

let userCounter = 0;
// The login route allows 30 attempts per 10 minutes per IP, so the suite re-uses a small pool of
// fixture users (one login each, session kept in memory) instead of creating a user per case.
const POOLED = new Set(['a', 'b', 'o', 'v', 'c', 'e', 'x', 'g', 't', 'n', 'p']);
const POOL = new Map();
export async function newUser(tag = 'u') {
  if (LIVE) {
    const key = T1_TAGS.has(tag) ? 't1' : 't2';
    if (!POOL.has(`live-${key}`)) POOL.set(`live-${key}`, { email: LIVE_ACCOUNTS[key].email, password: LIVE_ACCOUNTS[key].password, tag: key, live: true });
    return POOL.get(`live-${key}`);
  }
  if (POOLED.has(tag) && POOL.has(tag)) return POOL.get(tag);
  userCounter += 1;
  const email = `ts-${tag}${POOLED.has(tag) ? '' : userCounter}-${RUN_ID}@example.com`;
  await seedVerifiedE2EAccount(email, PASS);
  const user = { email, tag };
  if (POOLED.has(tag)) POOL.set(tag, user);
  return user;
}

/** Console/network noise that is normal for a signed-out visit and must not fail a case. */
const DEFAULT_ALLOW = [
  /Failed to load resource: the server responded with a status of \d+/i,
  // React DEV-build only (TipTap useEditor emits to our handlers while React renders); the production bundle strips it.
  ...(process.env.SUITE_ALLOW_REACT_DEV_WARNINGS === '0' ? [] : [/Cannot update a component .* while rendering a different component/]), // browser echo of an expected status; the network monitor judges the status itself
  // a navigation (goto / reload) aborts the page's in-flight fetches; the HTTP monitor judges real failures
  /TypeError: Failed to fetch/,
  // this machine's network interfaces flap (VPN, WSL); Chromium then aborts in-flight requests with ERR_NETWORK_CHANGED, which is not an app error
  /net::ERR_NETWORK_CHANGED|net::ERR_NAME_NOT_RESOLVED|net::ERR_INTERNET_DISCONNECTED/,
  /favicon/i,
  /\[vite\]/i,
  /Download the React DevTools/i,
];
const DEFAULT_ALLOW_STATUS = [
  { status: 401, url: /\/api\/auth\/me/ },
  { status: 401, url: /\/api\/(me|auth)\b/ },
  { status: 404, url: /favicon|\.map$|\/sw\.js|manifest/ },
  // the topic autosave retries a 409 (collaboration projection / revision race) by design; the cases assert the end state
  { status: 409, method: 'PATCH', url: /\/api\/topics\/[^/?]+$/ },
];

export class Client {
  constructor(browser, user, opts = {}) {
    this.browser = browser; this.user = user; this.opts = opts;
    this.problems = []; // unexpected console errors, page errors, bad responses
    this.allow = [...DEFAULT_ALLOW, ...(opts.allowConsole || [])];
    this.allowStatus = [...DEFAULT_ALLOW_STATUS, ...(opts.allow409Put ? [{ status: 409, method: 'PUT', url: /\/api\/blips\// }] : []), ...(opts.allowStatus || [])];
  }

  async open() {
    this.ctx = await this.browser.newContext({
      viewport: this.opts.viewport || { width: 1366, height: 900 },
      ...(this.user?.state ? { storageState: this.user.state } : {}),
      ...(this.opts.context || {}),
      ...(HEADED ? { recordVideo: { dir: path.join(EVIDENCE, 'videos', '_tmp'), size: this.opts.viewport || { width: 1366, height: 900 } } } : {}),
      permissions: ['clipboard-read', 'clipboard-write'],
      acceptDownloads: true,
    });
    this.page = await this.ctx.newPage();
    this.page.setDefaultTimeout(this.opts.timeout || (LIVE ? 45000 : HEADED ? 15000 : 9000));
    // SUITE_LATENCY_MS=N adds N ms of network latency to every request (Chromium DevTools network emulation), to reproduce on the local stack
    // what a person on a real network sees: the local API answers in 3 ms, production in about 90 ms, and races only show on the slower one.
    if (Number(process.env.SUITE_LATENCY_MS || 0) > 0) {
      const cdp = await this.ctx.newCDPSession(this.page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: Number(process.env.SUITE_LATENCY_MS), downloadThroughput: -1, uploadThroughput: -1 });
    }
    if (LIVE) {
      this.page.setDefaultNavigationTimeout(60000);
      // This machine's network interfaces flap now and then and Chromium then aborts the navigation with ERR_NETWORK_CHANGED; retry the
      // navigation itself (never an assertion) a few times.
      for (const fn of ['goto', 'reload']) {
        const orig = this.page[fn].bind(this.page);
        this.page[fn] = async (...args) => {
          let err;
          for (let i = 0; i < 5; i += 1) {
            try { return await orig(...args); } catch (e) { err = e; if (!/ERR_NETWORK_CHANGED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|Timeout/.test(String(e))) throw e; await new Promise((r) => setTimeout(r, 3000)); }
          }
          throw err;
        };
      }
    }
    if (HEADED && TYPE_DELAY && !this.opts.fast) {
      const kb = this.page.keyboard; const origType = kb.type.bind(kb);
      kb.type = (text, o = {}) => origType(text, { ...o, delay: Math.max(o.delay ?? 0, TYPE_DELAY) });
    }
    this.page.on('pageerror', (e) => this.problems.push(`pageerror: ${String(e).slice(0, 200)}`));
    this.page.on('console', async (m) => {
      if (m.type() !== 'error') return;
      let t = m.text();
      if (this.allow.some((re) => re.test(t))) return;
      if (/%s/.test(t)) { // React dev warnings: substitute the %s arguments so the component names are visible
        try { const vals = await Promise.all(m.args().slice(1).map((h) => h.jsonValue().catch(() => '?'))); let i = 0; t = t.replace(/%s/g, () => String(vals[i++] ?? '?')); } catch { /* keep raw text */ }
      }
      this.problems.push(`console.error: ${t.slice(0, 260)}`);
    });
    this.puts = [];
    this.page.on('response', async (r) => {
      const s = r.status();
      let why = '';
      // the server's own reason for a 409 (e.g. collaboration_projection_stale), so a failure names its cause
      if (s === 409) { try { why = ` ${String((await r.json())?.error || '').slice(0, 60)}`; } catch { /* no body */ } }
      if (r.request().method() === 'PUT' && /\/api\/blips\//.test(r.url())) this.puts.push({ status: s, url: r.url(), why: why.trim() });
      if (s < 400) return;
      const url = r.url();
      if (!url.startsWith(BASE)) return;
      if (this.allowStatus.some((a) => a.status === s && a.url.test(url) && (!a.method || a.method === r.request().method()))) return;
      // Production only: a save that overtakes the last collaboration updates answers 409 collaboration_projection_stale and the editor retries.
      // That is the designed retry path, so it is not an error by itself; what must hold is that every such save later succeeded (settleProblems).
      if (LIVE && s === 409 && r.request().method() === 'PUT' && /\/api\/blips\//.test(url) && /collaboration_projection_stale/.test(why)) { (this.stale409 ||= new Set()).add(url); return; }
      this.problems.push(`http ${s} ${r.request().method()} ${url.replace(BASE, '').slice(0, 120)}${why}`);
    });
    this.dialogMode = 'accept';
    this.page.on('dialog', (d) => { this.lastDialog = d.message(); (this.dialogMode === 'dismiss' ? d.dismiss() : d.accept(this.promptText)).catch(() => undefined); });
    if (this.user && !this.user.state) { await this.login(); if (POOLED.has(this.user.tag) || this.user.live) this.user.state = await this.ctx.storageState(); }
    if (this.user?.state) await this.page.goto(BASE, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    return this;
  }

  /** Sign in through the real sign-in form, typing the credentials (no fetch). */
  async login() {
    await this.page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
    await sleep(3000);
    const email = this.page.getByPlaceholder('Email address');
    await email.click(); await this.page.keyboard.press('Control+a'); await this.page.keyboard.type(this.user.email, { delay: 15 });
    const pw = this.page.getByPlaceholder('Password', { exact: true });
    await pw.click(); await this.page.keyboard.press('Control+a'); await this.page.keyboard.type(this.user.password || PASS, { delay: 15 });
    await this.page.locator('.submit-btn').click();
    try { await this.page.locator('.shell-auth-logout').waitFor({ timeout: 20000 }); } catch { await this.shot(`LOGIN-FAIL-${this.user.tag}`); throw new Error(`GUI sign-in failed for ${this.user.email}`); }
  }

  /** Signed-out client: load the app origin so fetch() has a base and a CSRF cookie. */
  async visit() { await this.page.goto(BASE, { waitUntil: 'domcontentloaded' }); await this.page.evaluate(() => fetch('/api/auth/csrf', { credentials: 'include' })); }

  async api(method, url, body) {
    return this.page.evaluate(async ({ method, url, body }) => {
      const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN='));
      const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
      const r = await fetch(url, { method, headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, credentials: 'include', body: body ? JSON.stringify(body) : undefined });
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch { /* not json */ }
      return { status: r.status, json: j, text: t.slice(0, 300) };
    }, { method, url, body });
  }

  topicUrl(id, render) {
    const r = render || this.opts.render;
    return `${BASE}/?layout=rizzoma${r === 'native' ? '&render=native' : ''}#/topic/${id}`;
  }

  async createTopic(title, bodyHtml) {
    const r = await this.api('POST', '/api/topics', { title, content: bodyHtml || `<h1>${title}</h1>` });
    if (r.status >= 300) throw new Error(`createTopic ${r.status} ${r.text}`);
    return r.json.id || r.json._id;
  }

  /** New topic through the wizard: "+ New", type the title, "Create Topic". Returns the topic id from the address bar. */
  async createTopicGui(title) {
    await this.page.goto(`${BASE}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
    await sleep(3500);
    const phone = (this.opts.viewport?.width || 1366) <= 768;
    // On a phone the "+ New" control is the "+" in the mobile header; on a desktop it is the navigation button.
    await this.hit(phone ? this.page.locator('[data-testid="mobile-new-topic"]').first() : this.page.locator('.create-wave').first());
    await sleep(900);
    const box = this.page.getByPlaceholder('What would you like to discuss?');
    await this.hit(box); await this.page.keyboard.type(title, { delay: 20 });
    await this.hit(this.page.getByRole('button', { name: 'Create Topic' }));
    await sleep(3500);
    let m = /#\/topic\/([^/?]+)/.exec(await this.page.evaluate(() => location.hash));
    if (!m) { const list = (await this.api('GET', '/api/topics')).json; const t = (list?.topics || []).find((x) => (x.title || '').includes(title)); if (t) m = [null, t.id]; }
    if (!m) throw new Error(`topic wizard did not produce a topic for "${title}"`);
    return m[1];
  }

  async openTopic(id, settle = 4500) {
    await this.page.goto(this.topicUrl(id), { waitUntil: 'domcontentloaded' });
    await sleep(settle);
  }

  async reload(settle = 5500) { await this.page.reload({ waitUntil: 'domcontentloaded' }); await sleep(settle); }

  async blips(topicId) {
    const r = await this.api('GET', `/api/blips?waveId=${topicId}&limit=1000`);
    return norm(r.json?.blips || r.json).filter((b) => !b.deleted);
  }
  async allBlips(topicId) {
    const r = await this.api('GET', `/api/blips?waveId=${topicId}&limit=1000&includeDeleted=1`);
    return norm(r.json?.blips || r.json);
  }

  // ---- real-UI gestures (all keyboard / mouse) ----
  /** Level-1 blip through the topic's reply box, exactly as a colleague would. */
  /** A tap on a touch device (real touch events), a click otherwise. */
  async hit(loc, o) { return this.opts.context?.hasTouch ? loc.tap(o) : loc.click(o); }
  async replyAtTopic(text) {
    const box = this.page.locator('.write-reply-input').first();
    await this.hit(box);
    await this.page.keyboard.type(text, { delay: 15 });
    await this.page.keyboard.press('Enter');
    await sleep(2200);
  }
  async expandRow(text) {
    await this.hit(this.page.locator('.blip-collapsed-row', { hasText: text }).first());
    await sleep(1300);
  }
  /** Real-input content helpers (typing only; no API writes). The topic must be open. */
  async uiRoots(texts) { for (const t of texts) await this.replyAtTopic(t); }
  async uiChild(parentText, text) {
    await this.ensureExpanded(parentText);
    await this.enterEditByClick(parentText);
    await this.ctrlEnterChild(text);
    await this.doneAll();
  }
  /** Make the blip with this text the ACTIVE blip (enter edit by click, then Done) so menu actions target it. */
  async activate(text) { await this.ensureExpanded(text); await this.enterEditByClick(text); await this.doneAll(); }
  /** Expand the collapsed row with this text unless it is already open. */
  async ensureExpanded(text) {
    const row = this.page.locator('.blip-collapsed-row', { hasText: text }).first();
    if (await row.count()) { await this.hit(row); await sleep(1300); }
  }
  async enterEditByClick(text) {
    await this.hit(this.page.locator('.blip-container.nested-blip li', { hasText: new RegExp(`^${text}`) }).first(), { position: { x: 12, y: 8 } });
    await sleep(1400);
  }
  /** Open the gear / overflow menu of the active blip and click an item by its visible text. */
  async gearItem(text) {
    const p = this.page;
    const sel = '[data-testid="blip-menu-gear-toggle"], [data-testid="blip-menu-overflow-toggle"]';
    const own = p.locator(`.rizzoma-blip.active:not(.topic-root) ${sel}`);
    const toggle = (await own.count()) ? own.last() : p.locator(sel).last();
    await toggle.click();
    await sleep(500);
    await p.getByRole('menuitem', { name: text }).last().click();
    await sleep(1200);
  }
  async editorCount() { return this.page.evaluate(() => document.querySelectorAll('.ProseMirror[contenteditable="true"]').length); }
  async ctrlEnterChild(text, delay = 25) {
    await this.page.keyboard.press('End');
    await this.page.keyboard.press('Control+Enter');
    await sleep(2300);
    await this.page.keyboard.type(text, { delay });
    await sleep(1100);
  }
  async done() {
    await this.page.locator('button:has-text("Done")').last().click().catch(() => undefined);
    await sleep(1500);
  }
  async doneAll(max = 8) {
    for (let i = 0; i < max; i += 1) {
      if (!(await this.page.locator('button:has-text("Done")').count())) break;
      await this.done();
    }
  }
  async shot(name) {
    fs.mkdirSync(OUT, { recursive: true });
    const f = path.join(OUT, `${name}.png`);
    await this.page.screenshot({ path: f }).catch(() => undefined);
    return f;
  }
  async close() {
    const vid = HEADED && this.page ? this.page.video() : null;
    await this.ctx?.close().catch(() => undefined);
    if (vid) {
      try {
        const p = await vid.path();
        const dir = path.join(EVIDENCE, 'videos'); fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(p, path.join(dir, `${this.opts.caseId || 'case'}-${this.user?.tag || 'anon'}.webm`));
        fs.unlinkSync(p);
      } catch { /* the video is evidence, not a gate */ }
    }
  }
  /** Parity evidence: the modernized screen for one legacy reference screenshot (key = its file name without .png). */
  async parity(key, target) {
    const dir = path.join(EVIDENCE, 'parity'); fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `${key}-ours.png`);
    const marker = path.join(dir, `${key}.missing`); try { fs.unlinkSync(marker); } catch { /* none */ }
    if (target && typeof target.screenshot === 'function') {
      const n = typeof target.count === 'function' ? await target.count().catch(() => 0) : 1;
      if (!n) { fs.writeFileSync(marker, 'the element of the original screen was not found in the modernized app; full page shown'); await this.page.screenshot({ path: f }).catch(() => undefined); }
      else await target.first().screenshot({ path: f }).catch(async () => { await this.page.screenshot({ path: f }).catch(() => undefined); });
    } else await this.page.screenshot({ path: f, ...(target || {}) }).catch(() => undefined);
    return f;
  }
  async stepShot(sub, name) {
    const dir = path.join(EVIDENCE, 'steps', sub); fs.mkdirSync(dir, { recursive: true });
    await this.page.screenshot({ path: path.join(dir, `${name}.png`) }).catch(() => undefined);
  }
}

export async function shareWith(topicId, user, role = 'editor') {
  if (!LIVE) { await seedAcceptedParticipant(topicId, user.email, role, 'e2e'); return; }
  // Production sends a REAL invitation mail to the invited address (the two test accounts are aliases of SDS's own mailbox: about 95
  // mails landed there on 21 Nov 2026). Never do that from a suite run unless it is explicitly allowed.
  if (process.env.SUITE_LIVE_ALLOW_MAIL !== '1') throw new Error('shareWith (live) would send a real invitation e-mail; refused (set SUITE_LIVE_ALLOW_MAIL=1 only for the invite-journey checks)');
  const owner = TOPIC_OWNER.get(topicId);
  if (!owner) throw new Error(`shareWith (live): no owner client known for topic ${topicId}`);
  if (owner.user.email === user.email) return; // the same real account plays both roles
  const r = await owner.api('POST', `/api/waves/${topicId}/participants`, { emails: [user.email], role });
  if (r.status >= 300) throw new Error(`shareWith (live) ${r.status} ${r.text}`);
}

/** Case context handed to every case: assertions + client factory + topic cleanup. */
export class Ctx {
  constructor(browser, spec, render) {
    this.browser = browser; this.spec = spec; this.render = render;
    this.checks = []; this.clients = []; this.topics = []; this.notes = []; this.pending = []; this.stepNo = 0;
  }
  ok(cond, label, detail = '') {
    this.checks.push({ ok: !!cond, label, detail: String(detail).slice(0, 400) });
    if (HEADED && this.clients[0] && this.stepNo < 14) {
      this.stepNo += 1;
      const n = String(this.stepNo).padStart(2, '0');
      this.pending.push(this.clients[0].stepShot(`${this.render}-${this.spec.id}`, `${n}-${cond ? 'ok' : 'FAIL'}-${label.replace(/[^a-z0-9]+/gi, '_').slice(0, 50)}`));
    }
    return !!cond;
  }
  eq(a, b, label) { return this.ok(JSON.stringify(a) === JSON.stringify(b), label, `got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); }
  async client(user, opts = {}) {
    const c = await new Client(this.browser, user, { render: this.render, caseId: `${this.render}-${this.spec.id}`, fast: !!this.spec.fast, ...(this.spec.client || {}), ...opts }).open();
    this.clients.push(c); return c;
  }
  async anon(opts = {}) { return this.client(null, opts); }
  /** GUI topic creation (wizard) for the GUI families; the API families (S, R) and cases needing a custom body use the API. */
  async topic(owner, title, html) {
    const gui = !html && !['S', 'R'].includes(this.spec.family);
    const id = gui ? await owner.createTopicGui(SCRATCH(title)) : await owner.createTopic(SCRATCH(title), html);
    this.topics.push({ owner, id }); TOPIC_OWNER.set(id, owner); return id;
  }
  /** Fail the case on unexpected console errors, page errors and 4xx/5xx collected on every client. */
  settleProblems() {
    for (const c of this.clients) {
      for (const url of c.stale409 || []) {
        if (!c.puts.some((p) => p.url === url && p.status === 200)) c.problems.push(`http 409 PUT ${url.replace(BASE, '').slice(0, 100)} collaboration_projection_stale never recovered`);
      }
      const probs = c.problems.filter((p) => !(this.spec.expect || []).some((re) => re.test(p)));
      this.ok(probs.length === 0, `no console/page/network errors (${c.user?.tag || 'anon'})`, probs.slice(0, 4).join(' || '));
    }
  }
  async cleanup() {
    await Promise.all(this.pending);
    for (const t of this.topics) await t.owner.api('DELETE', `/api/topics/${t.id}`).catch(() => undefined);
    for (const c of this.clients) await c.close();
  }
}

export function serverLogMark() { try { return SERVER_LOG ? fs.statSync(SERVER_LOG).size : 0; } catch { return 0; } }
export function serverLogErrors(from) {
  if (!SERVER_LOG) return null;
  try {
    const buf = fs.readFileSync(SERVER_LOG).subarray(from).toString('utf8');
    return buf.split('\n').filter((l) => !/^\d{4}-\d\d-\d\dT[\d:.]+Z (info|debug):/.test(l)
      && /(\berror:|\bError\b|Unhandled|unhandled|TypeError|RangeError|ECONNREFUSED|\[error\])/.test(l)
      && !/health check|couch\] indexes/i.test(l)).slice(0, 5);
  } catch { return null; }
}
