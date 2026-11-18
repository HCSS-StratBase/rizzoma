// Delete the scratch topics of a live run through the UI (gear menu, Delete, confirm), then prove with a
// read-only listing (my=1) that none with the scratch title prefix remain. env: FS_MADE (ids file), FS_PREFIX
import fs from 'node:fs';
import { launch, newClient, sleep } from './lib.mjs';
import { signInLive } from './liveauth.mjs';

const BASE = (process.env.FS_BASE || 'https://138-201-62-161.nip.io').replace(/\/$/, '');
process.env.FS_BASE = BASE;
const made = JSON.parse(fs.readFileSync(process.env.FS_MADE, 'utf8'));
const PREFIX = process.env.FS_PREFIX || 'ZZ SCRATCH fractal live';
const STATE = `/home/stephan/rizzoma-fractal-scratch/run/live-t1-clean-${Date.now().toString(36)}.json`;
const b = await launch();
const { email } = await signInLive(b, BASE, 1, STATE);
const c = await newClient(b, email, { storageState: STATE });
const p = c.page;
const list = () => p.evaluate(async (pre) => {
  const out = []; let off = 0;
  for (;;) { const r = await fetch(`/api/topics?my=1&limit=100&offset=${off}`, { credentials: 'include' }); const j = await r.json(); out.push(...(j.topics || [])); if (!j.hasMore) break; off += 100; }
  return { total: out.length, scratch: out.filter((t) => String(t.title).startsWith(pre)).length };
}, PREFIX);
await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await sleep(3000);
console.log('before cleanup (my=1):', JSON.stringify(await list()));
// The product has NO topic-delete control in the UI (only blips can be deleted there), so scratch topics are
// removed with the documented DELETE /api/topics/:id as the owner. This is cleanup, not content creation.
let deleted = 0;
for (const m of made) {
  const st = await p.evaluate(async (id) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const r = await fetch(`/api/topics/${id}`, { method: 'DELETE', credentials: 'include', headers: { 'x-csrf-token': csrf } });
    return r.status;
  }, m.id);
  if (st < 300) deleted += 1; else console.log('delete status', st, m.id.slice(-6));
}
await sleep(2000);
console.log('API deletes ok:', deleted, 'of', made.length);
console.log('after cleanup (my=1):', JSON.stringify(await list()));
await c.ctx.close(); await b.close();
