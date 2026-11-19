// Owner: make Fractal Tester 2 an Editor through the real Invite dialog (select the member's checkbox, "Select role", Editor).
import fs from 'node:fs';
import { launch, newClient, sleep, shot } from './lib.mjs';
import { signInLive } from './liveauth.mjs';
const st = JSON.parse(fs.readFileSync(process.env.FS_STATE_IN, 'utf8')); process.env.FS_BASE = st.base;
const b = await launch();
const s1 = await signInLive(b, st.base, 1, '/home/stephan/rizzoma-fractal-scratch/run/pr-t1.json');
const c = await newClient(b, s1.email, { storageState: '/home/stephan/rizzoma-fractal-scratch/run/pr-t1.json' }); const p = c.page;
await p.goto(`${st.base}/?layout=rizzoma#/topic/${st.topicId}`, { waitUntil: 'domcontentloaded' }); await sleep(8000);
await p.locator('button[title="Invite participants"]').first().click({ timeout: 8000 }); await sleep(1500);
const rows = p.locator('.invite-member-row');
const n = await rows.count();
console.log('rows:', await rows.evaluateAll((els) => els.map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim().replace(/@[^ ]*/g, '@…').slice(0, 60))));
let idx = -1; for (let i = 0; i < n; i += 1) { if (/fractal2|Fractal Tester 2|sdspieg\+fractal2/i.test((await rows.nth(i).textContent()) || '')) idx = i; }
console.log('row index for tester 2:', idx);
if (idx >= 0) {
  await rows.nth(idx).locator('input[type="checkbox"]').check({ timeout: 5000 }); await sleep(500);
  await p.locator('[data-testid="invite-select-role"]').click({ timeout: 5000 }); await sleep(600);
  await p.locator('[data-testid="invite-role-menu"] [data-role="editor"]').first().click({ timeout: 5000 }); await sleep(3000);
}
const parts = await p.evaluate(async (id) => { const r = await fetch(`/api/waves/${id}/participants`, { credentials: 'include' }); const j = await r.json(); return (j.participants || []).map((x) => `${x.role}:${x.status}`).join(','); }, st.topicId);
console.log('participants now:', parts);
await c.ctx.close(); await b.close();
