// Build the Fractal Showcase topic BY HAND (real keyboard / mouse) and verify it from persisted state.
// env: FS_BASE (local stack or live host), FS_LIVE=1 (sign in as Fractal Tester 1 from the credential file),
//      FS_STATE_OUT (json with the topic id), FS_RESUME_TOPIC (continue an existing topic: not supported yet)
import fs from 'node:fs';
import { launch, newClient, signInUi, seedUser, sleep, shot, apiGet, TYPE_DELAY, OUT } from './lib.mjs';
import { signInLive } from './liveauth.mjs';
import { buildBlip, EDITOR, blipIds } from './ops.mjs';
import { buildSpec, TITLE } from './spec.mjs';

const BASE = (process.env.FS_BASE || 'http://127.0.0.1:3107').replace(/\/$/, '');
process.env.FS_BASE = BASE;
const LIVE = process.env.FS_LIVE === '1';
const STATE_OUT = process.env.FS_STATE_OUT || '/home/stephan/rizzoma-fractal-scratch/run/showcase-state.json';
const TOPIC_TITLE = process.env.FS_TITLE || TITLE;
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
fs.mkdirSync(`${OUT}/steps`, { recursive: true });

const b = await launch();
let c;
if (LIVE) {
  const st = '/home/stephan/rizzoma-fractal-scratch/run/live-t1-build.json';
  const { email } = await signInLive(b, BASE, 1, st);
  c = await newClient(b, email, { storageState: st });
} else {
  await seedUser('fs-alice@example.com');
  c = await newClient(b, 'fs-alice@example.com');
  await signInUi(c);
}
const p = c.page;
globalThis.__fsShotOnFail = () => shot(c, 'steps/build-fail').catch(() => {});

// 1. create the topic through the New dialog
await p.goto(BASE, { waitUntil: 'domcontentloaded' }); await sleep(3500);
await p.locator('button[aria-label="New topic"], .new-topic-buttons button').first().click(); await sleep(600);
await p.locator('#topic-title').click(); await p.keyboard.type(TOPIC_TITLE, { delay: TYPE_DELAY });
await shot(c, 'steps/01-new-topic-dialog');
await p.locator('.btn-primary').click(); await sleep(4500);
const topicId = p.url().split('/topic/')[1];
log(`topic ${topicId}`);
fs.writeFileSync(STATE_OUT, JSON.stringify({ topicId, base: BASE, title: TOPIC_TITLE }));

// 2. root editor, first bullet
await p.locator('.wave-panel [data-testid="blip-menu-edit"]').first().click(); await sleep(1800);
await p.locator(EDITOR).first().click(); await p.keyboard.press('Control+End'); await p.keyboard.press('Enter');
await shot(c, 'steps/02-root-editor');

// 3. build the tree
globalThis.__fsTraceFocus = log;
const t0 = Date.now();
const n = await buildBlip(p, buildSpec(), log);
log(`built ${n} blips in ${Math.round((Date.now() - t0) / 1000)} s; Ctrl+Enter presses=${JSON.stringify(globalThis.__fsCE)}; root-editor torn down and recovered ${globalThis.__fsRootDestroyed || 0} time(s)`);
await sleep(3000);
await shot(c, 'steps/03-tree-built');

// 4. reload and verify the persisted tree (read-only API)
await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(6000);
const r = await apiGet(c, `/api/blips?waveId=${topicId}&limit=1000`);
const blips = (r.json?.blips || r.json || []).filter((x) => !x.deleted).map((x) => ({ id: x.id || x._id, parent: x.parentId || x.parentBlipId || null, text: String(x.content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }));
const byId = new Map(blips.map((x) => [x.id, x]));
const depthOf = (x) => { let d = 1; let q = x; while (q.parent && byId.has(q.parent)) { d += 1; q = byId.get(q.parent); } return d; };
const maxDepth = Math.max(0, ...blips.map(depthOf));
log(`PERSISTED: blips=${blips.length} (excluding the topic root), deepest level=${maxDepth}`);
await shot(c, 'steps/04-after-reload');
fs.writeFileSync(STATE_OUT, JSON.stringify({ topicId, base: BASE, title: TOPIC_TITLE, blips: blips.length, maxDepth, ce: globalThis.__fsCE, rootDestroyed: globalThis.__fsRootDestroyed || 0 }));
console.log('problems:', c.problems.length, c.problems.slice(0, 3).join(' | ').slice(0, 300));
await c.ctx.close(); await b.close();
