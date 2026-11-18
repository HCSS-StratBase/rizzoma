// READ-ONLY access probe as Fractal Tester 2 (no sharing with anyone): what can a brand-new user list and read?
// Prints counts and status codes only (no titles, no names, no content). No screenshots of other people's topics.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { launch, newClient, sleep } from './lib.mjs';
import { signInLive } from './liveauth.mjs';

const BASE = (process.env.FS_BASE || 'https://138-201-62-161.nip.io').replace(/\/$/, '');
process.env.FS_BASE = BASE;
const RUN = Date.now().toString(36);
const STATE = `/home/stephan/rizzoma-fractal-scratch/run/live-t2-${RUN}.json`;
const sdsId = `user:email:${crypto.createHash('sha256').update('sdspieg@gmail.com', 'utf8').digest('hex')}`;
const b = await launch();
const { email } = await signInLive(b, BASE, 2, STATE);
const c = await newClient(b, email, { storageState: STATE });
const p = c.page;
await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await sleep(3000);
const get = (u) => p.evaluate(async (x) => { const r = await fetch(x, { credentials: 'include' }); let j = null; try { j = await r.json(); } catch {} return { s: r.status, j }; }, u);

// 1. every topic the listing returns (no my=1)
const all = []; let off = 0;
for (;;) {
  const r = await get(`/api/topics?limit=100&offset=${off}`);
  if (r.s !== 200) { console.log('list status', r.s); break; }
  const t = r.j?.topics || []; all.push(...t); if (!r.j?.hasMore || t.length === 0) break; off += 100;
  if (off > 5000) break;
}
console.log('LISTING (no my=1): topics returned =', all.length);
const mine = (await get('/api/topics?my=1&limit=100')).j?.topics || [];
console.log('LISTING (my=1): topics returned =', mine.length);
const byAuthor = new Map();
for (const t of all) byAuthor.set(t.authorId || 'none', (byAuthor.get(t.authorId || 'none') || 0) + 1);
console.log('distinct authors in listing =', byAuthor.size, '; authored by SDS account =', byAuthor.get(sdsId) || 0);

// 2. read status and sharing for every listed topic
const stat = { topic200: 0, topicOther: {}, blips200: 0, blipsOther: {}, level: {}, role: {}, sdsLevel: {}, sdsRole: {}, canEdit: 0 };
const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
for (const t of all) {
  const r = await get(`/api/topics/${t.id}`);
  if (r.s === 200) {
    stat.topic200 += 1;
    const lvl = r.j?.sharing?.shareLevel ?? 'NO-sharing-field'; const role = r.j?.permissions?.role ?? '?';
    bump(stat.level, lvl); bump(stat.role, role); if (r.j?.permissions?.canEdit) stat.canEdit += 1;
    if (t.authorId === sdsId) { bump(stat.sdsLevel, lvl); bump(stat.sdsRole, role); }
  } else bump(stat.topicOther, r.s);
  const rb = await get(`/api/blips?waveId=${t.id}&limit=5`);
  if (rb.s === 200) stat.blips200 += 1; else bump(stat.blipsOther, rb.s);
}
console.log('READ of every listed topic: GET /api/topics/:id 200 =', stat.topic200, 'other =', JSON.stringify(stat.topicOther));
console.log('READ of blips: GET /api/blips 200 =', stat.blips200, 'other =', JSON.stringify(stat.blipsOther));
console.log('sharing.shareLevel of listed topics =', JSON.stringify(stat.level), '; role =', JSON.stringify(stat.role), '; canEdit count =', stat.canEdit);
console.log('topics authored by SDS visible to tester 2: levels =', JSON.stringify(stat.sdsLevel), 'roles =', JSON.stringify(stat.sdsRole));

// 3. control: a PRIVATE topic of Tester 1 (never shared) must be refused
const madeFiles = fs.readdirSync('/home/stephan/rizzoma-fractal-scratch/run').filter((f) => f.startsWith('live-made-')).sort();
if (madeFiles.length) {
  const made = JSON.parse(fs.readFileSync(`/home/stephan/rizzoma-fractal-scratch/run/${madeFiles.at(-1)}`, 'utf8'));
  const ids = made.slice(0, 3).map((m) => m.id);
  for (const id of ids) {
    const r = await get(`/api/topics/${id}`); const rb = await get(`/api/blips?waveId=${id}&limit=5`);
    console.log(`control: tester 1 private topic ${id.slice(-6)}: GET topic ${r.s}, GET blips ${rb.s}`);
  }
}

// 4. real attempt in the browser: open one listed legacy topic by URL, read only
const probe = all.find((t) => t.authorId !== sdsId) || all[0];
if (probe) {
  await p.goto(`${BASE}/?layout=rizzoma#/topic/${probe.id}`, { waitUntil: 'domcontentloaded' }); await sleep(7000);
  const ui = await p.evaluate(() => ({ blipContainers: document.querySelectorAll('.blip-container').length, textLen: (document.querySelector('.wave-panel')?.innerText || '').length, editBtn: !!document.querySelector('[data-testid="blip-menu-edit"]'), replyBox: !!document.querySelector('.write-reply-input') }));
  console.log('UI open (non-SDS author) topic: blip containers =', ui.blipContainers, ', topic text length =', ui.textLen, ', Edit button present =', ui.editBtn, ', reply box present =', ui.replyBox);
}
const sdsOne = all.find((t) => t.authorId === sdsId);
if (sdsOne) {
  await p.goto(`${BASE}/?layout=rizzoma#/topic/${sdsOne.id}`, { waitUntil: 'domcontentloaded' }); await sleep(7000);
  const ui = await p.evaluate(() => ({ blipContainers: document.querySelectorAll('.blip-container').length, textLen: (document.querySelector('.wave-panel')?.innerText || '').length, editBtn: !!document.querySelector('[data-testid="blip-menu-edit"]') }));
  console.log('UI open (SDS-authored) topic: blip containers =', ui.blipContainers, ', topic text length =', ui.textLen, ', Edit button present =', ui.editBtn);
}
await c.ctx.close(); await b.close();
