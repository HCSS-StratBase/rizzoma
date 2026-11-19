// Phase 2 on the built topic (live): topic-level functions as Fractal Tester 1, sharing through the REAL
// Invite dialog (SDS as Editor, Fractal Tester 2 as Commenter then Editor via the Select role menu), then
// Fractal Tester 2 opens the topic in a second browser context. Results go to a json report.
import fs from 'node:fs';
import { launch, newClient, sleep, shot, apiGet, OUT, TYPE_DELAY } from './lib.mjs';
import { signInLive, loadFractalCreds } from './liveauth.mjs';

const state = JSON.parse(fs.readFileSync(process.env.FS_STATE_IN, 'utf8'));
const BASE = state.base; process.env.FS_BASE = BASE;
const URL_ = `${BASE}/?layout=rizzoma#/topic/${state.topicId}`;
const rep = []; const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const note = (fn, how, result) => { rep.push({ fn, how, result }); log(`${fn}: ${result}`); };
const b = await launch();
const s1 = await signInLive(b, BASE, 1, '/home/stephan/rizzoma-fractal-scratch/run/live-t1-p2.json');
const c1 = await newClient(b, s1.email, { storageState: '/home/stephan/rizzoma-fractal-scratch/run/live-t1-p2.json' });
const p = c1.page;
await p.goto(URL_, { waitUntil: 'domcontentloaded' }); await sleep(7000);

// ---- Invite dialog
const invite = async (email, role) => {
  await p.locator('button[title="Invite participants"]').first().click({ timeout: 8000 }); await sleep(900);
  await p.locator('#invite-emails').click(); await p.keyboard.type(email, { delay: TYPE_DELAY });
  await p.locator('select[aria-label="Access role for new invitations"]').selectOption({ label: role }); await sleep(300);
  await shot(c1, 'steps/p2-invite-filled').catch(() => {});
  await p.locator('.invite-btn-primary').click({ timeout: 6000 }).catch(async (e) => { await shot(c1, 'steps/p2-invite-stuck').catch(() => {}); throw e; }); await sleep(3500);
};
if (!process.env.SKIP_SDS) try { await invite('sdspieg@gmail.com', 'Editor'); note('Invite dialog: invite SDS as Editor', 'clicked Invite, typed the address, chose Editor, clicked Invite', 'done'); } catch (e) { note('Invite dialog: invite SDS as Editor', 'Invite dialog', `FAILED ${String(e.message).split('\n')[0].slice(0, 80)}`); }
try { await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(6000); await invite(process.env.FS_EMAIL_2 || loadFractalCreds(2).user, 'Commenter'); note('Invite dialog: invite Fractal Tester 2 as Commenter', 'same dialog, role Commenter', 'done'); } catch (e) { note('Invite dialog: invite Fractal Tester 2 as Commenter', 'Invite dialog', `FAILED ${String(e.message).split('\n')[0].slice(0, 80)}`); }
await shot(c1, 'steps/p2-after-invites').catch(() => {});
const parts = (await apiGet(c1, `/api/waves/${state.topicId}/participants`)).json;
const plist = (parts?.participants || parts || []);
log(`participants persisted: ${plist.length} ${JSON.stringify(plist.map((x) => ({ role: x.role, status: x.status })))}`);
fs.writeFileSync('/home/stephan/rizzoma-fractal-scratch/run/p2-report.json', JSON.stringify({ rep, participants: plist.map((x) => ({ role: x.role, status: x.status })) }, null, 1));
await c1.ctx.close(); await b.close();
