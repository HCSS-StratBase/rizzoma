// Load the topic link as a NON-OWNER account (Fractal Tester 2) in a headed run and report what a person sees.
// env: FS_STATE_IN (json with topicId, base), FS_WHO (1 or 2, default 2)
import fs from 'node:fs';
import { launch, newClient, sleep, shot, apiGet } from './lib.mjs';
import { signInLive } from './liveauth.mjs';
const st = JSON.parse(fs.readFileSync(process.env.FS_STATE_IN, 'utf8')); process.env.FS_BASE = st.base;
const who = Number(process.env.FS_WHO || 2);
const b = await launch();
const sp = `/home/stephan/rizzoma-fractal-scratch/run/live-t${who}-verify.json`;
const s = await signInLive(b, st.base, who, sp);
const c = await newClient(b, s.email, { storageState: sp });
const p = c.page;
await p.goto(`${st.base}/?layout=rizzoma#/topic/${st.topicId}`, { waitUntil: 'domcontentloaded' }); await sleep(8000);
const ui = await p.evaluate(() => ({ denied: /do not have access/i.test(document.body.innerText), title: (document.querySelector('.topic-content-view, .blip-text')?.textContent || '').slice(0, 60), editBtn: !!document.querySelector('[data-testid="blip-menu-edit"]'), markers: document.querySelectorAll('.blip-thread-marker').length }));
const t = await apiGet(c, `/api/topics/${st.topicId}`); const bl = await apiGet(c, `/api/blips?waveId=${st.topicId}&limit=1000`);
console.log(`non-owner tester ${who}: UI access-denied-text=${ui.denied} title="${ui.title}" editButton=${ui.editBtn} inlineMarkers=${ui.markers}`);
console.log(`API: GET topic ${t.status} role=${t.json?.permissions?.role} canEdit=${t.json?.permissions?.canEdit}; GET blips ${bl.status} count=${(bl.json?.blips || bl.json || []).length}`);
await shot(c, `steps/nonowner-tester${who}`);
await c.ctx.close(); await b.close();
