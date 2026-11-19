// As Fractal Tester 1 (owner): open the topic, click Share, choose "Anyone with the link" + allow editing, save.
// Real clicks only. env: FS_STATE_IN (json with topicId, base)
import fs from 'node:fs';
import { launch, newClient, sleep, shot, apiGet } from './lib.mjs';
import { signInLive } from './liveauth.mjs';
const st = JSON.parse(fs.readFileSync(process.env.FS_STATE_IN, 'utf8'));
process.env.FS_BASE = st.base;
const b = await launch();
const s = await signInLive(b, st.base, 1, '/home/stephan/rizzoma-fractal-scratch/run/live-t1-share.json');
const c = await newClient(b, s.email, { storageState: '/home/stephan/rizzoma-fractal-scratch/run/live-t1-share.json' });
const p = c.page;
await p.goto(`${st.base}/?layout=rizzoma#/topic/${st.topicId}`, { waitUntil: 'domcontentloaded' }); await sleep(7000);
await p.getByRole('button', { name: /Share/ }).first().click(); await sleep(1200);
await p.locator('input[name="shareLevel"][value="link"]').check(); await sleep(400);
await p.getByLabel('Allow editing').check(); await sleep(400);
await shot(c, 'steps/share-dialog');
await p.getByRole('button', { name: /Save|Done|Apply|OK/ }).first().click(); await sleep(3000);
const t = (await apiGet(c, `/api/topics/${st.topicId}`)).json;
console.log('sharing now:', JSON.stringify(t?.sharing));
await c.ctx.close(); await b.close();
