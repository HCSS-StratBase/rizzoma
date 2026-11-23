#!/usr/bin/env node
// Delete the suite's scratch topics ("ZZ SCRATCH suite ...") that the two live test accounts own on production, then prove with a
// read-only listing (my=1) that none remain. Cleanup only: DELETE /api/topics/:id as the owner (the product has no topic-delete control).
//   GDRIVE_ROOT=... SUITE_LIVE=1 xvfb-run -a env -u DISPLAY -u WAYLAND_DISPLAY node scripts/tester-scenarios/live-sweep.mjs
import { chromium } from 'playwright';
import { Client, newUser, sleep } from './lib.mjs';

const PREFIX = process.env.SWEEP_PREFIX || 'ZZ SCRATCH suite';
const browser = await chromium.launch({ headless: false, args: [] });
let allGone = true;
for (const tag of ['a', 'b', 'k']) {
  const user = await newUser(tag);
  const c = await new Client(browser, user, {}).open();
  await c.page.goto(`${process.env.RIZZOMA_BASE_URL || 'https://138-201-62-161.nip.io'}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' }); await sleep(3000);
  const list = async () => {
    const out = [];
    for (let off = 0; ; off += 100) {
      const r = await c.api('GET', `/api/topics?limit=100&offset=${off}`);
      const t = r.json?.topics || []; out.push(...t); if (t.length < 100) break;
    }
    return out;
  };
  const before = await list(); console.log(tag, 'sample', JSON.stringify(before.slice(0, 3).map((t) => [t.title, t.owner || t.ownerId || t.authorId, t.role])));  const mine = before.filter((t) => String(t.title || '').startsWith(PREFIX));
  let ok = 0; const bad = [];
  for (const t of mine) { const r = await c.api('DELETE', `/api/topics/${t.id}`); if (r.status < 300) ok += 1; else bad.push(`${t.id.slice(-6)}:${r.status}`); }
  await sleep(1500);
  const after = (await list()).filter((t) => String(t.title || '').startsWith(PREFIX));
  console.log(`${user.tag}: topics ${before.length}, scratch ${mine.length}, deleted ${ok}, failed [${bad.join(' ')}], scratch remaining ${after.length}`);
  if (after.length) allGone = false;
  await c.close();
}
await browser.close();
console.log(allGone ? 'PROOF: zero scratch topics remain on both live accounts' : 'SCRATCH TOPICS REMAIN');
process.exit(allGone ? 0 : 1);
