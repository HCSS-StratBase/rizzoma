// LIVE verification of the pending-invitee fix and the avatar-overlay fix, headed, real clicks:
// (a) as owner (Fractal Tester 1): the Invite button must be the element under the pointer; invite Tester 2;
// (b) set the topic Private through the Share dialog; (c) as Tester 2 (a pending invitee, not the owner) open the
// topic link: it must open, and the entry must become accepted; (d) owner reload: header participants.
// env: FS_STATE_IN, FS_REUSE_STATE_1/2 (session states) or credentials, FS_EMAIL_2
import fs from 'node:fs';
import { launch, newClient, sleep, shot, apiGet, TYPE_DELAY } from './lib.mjs';
import { signInLive, loadFractalCreds } from './liveauth.mjs';
const st = JSON.parse(fs.readFileSync(process.env.FS_STATE_IN, 'utf8')); process.env.FS_BASE = st.base;
const URL_ = `${st.base}/?layout=rizzoma#/topic/${st.topicId}`;
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const b = await launch();
const s1 = await signInLive(b, st.base, 1, '/home/stephan/rizzoma-fractal-scratch/run/lv-t1.json');
const c1 = await newClient(b, s1.email, { storageState: '/home/stephan/rizzoma-fractal-scratch/run/lv-t1.json' });
const p = c1.page;
await p.goto(URL_, { waitUntil: 'domcontentloaded' }); await sleep(8000);
const under = await p.evaluate(() => { const bt = document.querySelector('button[title="Invite participants"]'); if (!bt) return 'no button'; const r = bt.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return top === bt ? 'the Invite button itself' : `${top?.tagName}.${String(top?.className).slice(0, 30)}`; });
log(`(a) element under the pointer at Invite: ${under}`);
const T2 = process.env.FS_EMAIL_2 || loadFractalCreds(2).user;
const parts0 = ((await apiGet(c1, `/api/waves/${st.topicId}/participants`)).json?.participants || []);
if (!parts0.some((x) => x.email === T2)) {
  await p.locator('button[title="Invite participants"]').first().click({ timeout: 8000 }); await sleep(900);
  await p.locator('#invite-emails').click(); await p.keyboard.type(T2, { delay: TYPE_DELAY });
  await p.locator('select[aria-label="Access role for new invitations"]').selectOption({ label: 'Commenter' });
  await p.locator('.invite-btn-primary').click({ timeout: 8000 }); await sleep(3500);
  await p.locator('.invite-btn-primary').click({ timeout: 4000 }).catch(() => {}); await sleep(1000);
  log('invited Tester 2 as Commenter through the dialog');
}
const parts1 = ((await apiGet(c1, `/api/waves/${st.topicId}/participants`)).json?.participants || []);
log(`participants before: ${JSON.stringify(parts1.map((x) => ({ role: x.role, status: x.status })))}`);
// (b) Private
await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(6000);
await p.getByRole('button', { name: /Share/ }).first().click(); await sleep(1200);
await p.locator('input[name="shareLevel"][value="private"]').check(); await sleep(400);
await p.locator('.share-btn-save').click(); await sleep(3000);
log(`(b) sharing level now: ${(await apiGet(c1, `/api/topics/${st.topicId}`)).json?.sharing?.shareLevel}`);
// (c) Tester 2 opens the link
const s2 = await signInLive(b, st.base, 2, '/home/stephan/rizzoma-fractal-scratch/run/lv-t2.json');
const c2 = await newClient(b, s2.email, { storageState: '/home/stephan/rizzoma-fractal-scratch/run/lv-t2.json' });
await c2.page.goto(URL_, { waitUntil: 'domcontentloaded' }); await sleep(8000);
const ui = await c2.page.evaluate(() => ({ denied: /do not have access/i.test(document.body.innerText), title: (document.querySelector('.topic-content-view, .blip-text')?.textContent || '').slice(0, 40), markers: document.querySelectorAll('.blip-thread-marker').length, avatars: document.querySelectorAll('.participant-avatar').length }));
const t2 = await apiGet(c2, `/api/topics/${st.topicId}`); const bl2 = await apiGet(c2, `/api/blips?waveId=${st.topicId}&limit=1000`);
log(`(c) Tester 2 on the PRIVATE topic: denied-text=${ui.denied} title="${ui.title}" markers=${ui.markers} headerAvatars=${ui.avatars}; GET topic ${t2.status} role=${t2.json?.permissions?.role}; GET blips ${bl2.status} count=${(bl2.json?.blips || bl2.json || []).length}`);
await shot(c2, 'steps/pending-invitee-tester2');
// (d) owner view
await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(7000);
const parts2 = ((await apiGet(c1, `/api/waves/${st.topicId}/participants`)).json?.participants || []);
const hdr = await p.evaluate(() => Array.from(document.querySelectorAll('.collab-participants [title]')).map((e) => e.getAttribute('title')).slice(0, 6));
log(`(d) participants after: ${JSON.stringify(parts2.map((x) => ({ role: x.role, status: x.status })))}; header avatars (titles): ${JSON.stringify(hdr.map((t) => t.replace(/@.*$/, '@…')))}`);
await shot(c1, 'steps/pending-invitee-owner-view');
await c1.ctx.close(); await c2.ctx.close(); await b.close();
