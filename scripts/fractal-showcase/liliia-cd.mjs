// Liliia (c) and (d), her own cases (liliia-3.png, liliia-4.png): a SUB-BLIP with three bullets "blip 1/2/3".
//  SC=ins-view-btn   view mode, click mid "blip 1", right-panel insert-reply button (no Edit first)
//  SC=ins-view-key   view mode, click mid "blip 1", Ctrl+Enter
//  SC=ins-edit-key   edit mode (Edit pressed), caret mid "blip 1", Ctrl+Enter
//  SC=paste-edit     edit mode, caret at the end of "blip 1", Ctrl+V of a real clipboard image
//  SC=paste-view     view mode, click "blip 1", Ctrl+V
// env: LIVE=1 -> Fractal Tester 2 on the live host (FS_STATE_IN, FS_REUSE_STATE_2, FS_EMAIL_2), else local (FS_BASE).
// The actor builds its own scratch topic and deletes it at the end. Prints where the new blip / the picture is stored.
import fs from 'node:fs';
import { launch, newClient, signInUi, seedUser, sleep, shot } from './lib.mjs';
const SC = process.env.SC || 'ins-view-btn'; const LIVE = process.env.LIVE === '1';
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const b = await launch(); let c; let base;
if (LIVE) {
  const { signInLive } = await import('./liveauth.mjs');
  const st = JSON.parse(fs.readFileSync(process.env.FS_STATE_IN, 'utf8')); base = st.base; process.env.FS_BASE = base;
  const s2 = await signInLive(b, base, 2, `/home/stephan/rizzoma-fractal-scratch/run/cd-${SC}.json`);
  c = await newClient(b, s2.email, { storageState: `/home/stephan/rizzoma-fractal-scratch/run/cd-${SC}.json` });
  await c.page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base }).catch(() => {});
} else {
  base = process.env.FS_BASE; const A = `cd-${Date.now().toString(36)}@example.com`; await seedUser(A);
  c = await newClient(b, A); await signInUi(c);
}
const p = c.page; const tag = `cd-${LIVE ? 'live' : 'local'}-${SC}`;
const done = async () => { for (let i = 0; i < 5; i += 1) { const d = p.locator('[data-testid="blip-menu-done"]').filter({ visible: true }).last(); if (await d.isVisible().catch(() => false)) { await d.click(); await sleep(1200); } } };
const stored = (id) => p.evaluate(async (wid) => { const r = await fetch(`/api/blips?waveId=${wid}&limit=100`, { credentials: 'include' }); const j = await r.json(); return (j.blips || j).filter((x) => !x.deleted).map((x) => ({ id: String(x.id || x._id).slice(-5), parent: String(x.parentId || '').slice(-5), html: String(x.content).replace(/<span class="blip-thread-host"[\s\S]*?<\/span><\/span>/g, '[+]').replace(/<img[^>]*>/g, '[IMG]').replace(/<\/li>/g, ' | ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() })); }, id);
await p.goto(base, { waitUntil: 'domcontentloaded' }); await sleep(4000);
await p.locator('button[aria-label="New topic"], .new-topic-buttons button').first().click(); await sleep(600);
await p.locator('#topic-title').click(); await p.keyboard.type('ZZ SCRATCH liliia cd', { delay: 25 });
await p.locator('.btn-primary').click(); await sleep(5000);
const topicId = p.url().split('/topic/')[1];
await p.locator('.write-reply-input').first().click(); await p.keyboard.type('Test 2', { delay: 25 }); await p.keyboard.press('Enter'); await sleep(2500);
await p.locator('.blip-collapsed-row', { hasText: 'Test 2' }).first().click(); await sleep(1800);
await p.locator('.blip-container.nested-blip li', { hasText: /^Test 2/ }).first().click({ position: { x: 12, y: 8 } }); await sleep(1500);
await p.keyboard.press('Control+End'); await p.keyboard.press('Control+Enter'); await sleep(2500);
for (const [i, t] of ['blip 1', 'blip 2', 'blip 3'].entries()) { await p.keyboard.type(t, { delay: 25 }); if (i < 2) await p.keyboard.press('Enter'); await sleep(300); }
await sleep(1500); await done(); await sleep(1500);
log('built: ' + JSON.stringify(await stored(topicId)));
await shot(c, `steps/${tag}-0-built`);
// the sub-blip is the one whose text starts with "blip 1"; its "blip 1" line
const sub = p.locator('.rizzoma-blip').filter({ hasText: 'blip 1' }).last();
const line1 = sub.locator('li', { hasText: /^blip 1/ }).first(); const bx = await line1.boundingBox();
const isEditing = () => p.locator('[data-testid="blip-menu-done"]').filter({ visible: true }).count();
if (SC === 'ins-edit-key' || SC === 'paste-edit') { await sub.locator('[data-testid="blip-menu-edit"]').filter({ visible: true }).first().click().catch(() => {}); await sleep(1200); }
const bx2 = await line1.boundingBox();
if (SC.startsWith('paste') || process.env.END === '1') { await p.mouse.click(bx2.x + 30, bx2.y + 8); await p.keyboard.press('End'); } else { await p.mouse.click(bx2.x + 30, bx2.y + 8); }
await sleep(Number(process.env.WAIT || 1500)); log(`after the click: edit toolbars visible=${await isEditing()}`);
await shot(c, `steps/${tag}-1-after-click`);
if (SC === 'ins-view-btn') { await p.locator('.active-blip-control.insert-reply').first().click(); await sleep(2500); await p.keyboard.type('NEW', { delay: 30 }); }
else if (SC.startsWith('ins')) {
  const probe = () => p.evaluate(() => ({ active: Array.from(document.querySelectorAll('.rizzoma-blip.active')).map((e) => (e.textContent || '').trim().slice(0, 14)), editing: Array.from(document.querySelectorAll('.rizzoma-blip.edit-mode')).map((e) => (e.textContent || '').trim().slice(0, 14)), focus: (document.activeElement?.closest?.('.rizzoma-blip')?.textContent || '').trim().slice(0, 14) }));
  log('before Ctrl+Enter: ' + JSON.stringify(await probe()));
  await p.keyboard.press('Control+Enter');
  for (const t of [300, 900, 1800]) { await sleep(t === 300 ? 300 : t - (t === 900 ? 300 : 900)); log(`+${t}ms: ` + JSON.stringify(await probe())); if (t === 900) await shot(c, `steps/${tag}-1b-after-ctrl-enter`); }
  p.on('console', (m) => { if (/dbg|error|warn|fail|reload|reset|resync/i.test(m.text()) && !/Cannot update a component/.test(m.text())) log('  CONSOLE ' + m.text().slice(0, 160)); });
  await p.evaluate(() => { document.addEventListener('beforeinput', (e) => { const pm = e.target.closest?.('.ProseMirror'); const blip = e.target.closest?.('.rizzoma-blip'); console.log('[dbg] beforeinput data=' + e.data + ' target=' + e.target.tagName + ' blip=' + (blip?.getAttribute('data-blip-id') || '').slice(-6) + ' pmEditable=' + pm?.getAttribute('contenteditable') + ' blipText=' + (blip?.textContent || '').trim().slice(0, 12)); }, true); document.addEventListener('keydown', (e) => console.log('[dbg] keydown ' + e.key + ' ownerBlip=' + (document.activeElement?.closest?.('.rizzoma-blip')?.getAttribute('data-blip-id') || '').slice(-5) + ' ownerText=' + (document.activeElement?.closest?.('.rizzoma-blip')?.textContent || '').trim().slice(0, 14) + ' pmCount=' + document.querySelectorAll('.ProseMirror[contenteditable=true]').length + ' active=' + document.activeElement?.tagName + '.' + String(document.activeElement?.className).slice(0, 20) + ' defaultPrevented=' + e.defaultPrevented), true); });
  const pms = () => p.evaluate(() => Array.from(document.querySelectorAll('.ProseMirror')).map((e) => (e.closest('.rizzoma-blip')?.getAttribute('data-blip-id') || 'topic').slice(-5) + ':' + e.getAttribute('contenteditable') + ':' + (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 18)).join(' || '));
  log('PMs before N: ' + await pms());
  p.on('console', (m) => { if (/TextSelection/.test(m.text())) log('  WARN-LOC ' + JSON.stringify(m.location()) + ' ' + JSON.stringify(m.args().length)); }); p.on('pageerror', (e) => log('  PAGEERROR ' + String(e).slice(0, 300))); p.on('requestfinished', (r) => { if (/\/api\//.test(r.url())) log('  REQ ' + r.method() + ' ' + r.url().replace(/^.*\/api/, '/api').slice(0, 90)); });
  for (const ch of ['N', 'E', 'W']) { await p.keyboard.press(ch); await sleep(60); log('PMs +60ms after ' + ch + ': ' + await pms()); await sleep(190); if (ch === 'N') await shot(c, `steps/${tag}-1c-after-N`); log(`typed ${ch}: ` + JSON.stringify(await probe()) + ' texts=' + JSON.stringify(await p.evaluate(() => Array.from(document.querySelectorAll('.rizzoma-blip .ProseMirror')).map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30))))); } }
else {
  if (SC === 'paste-edit') await p.keyboard.press('End');
  await p.evaluate(async () => { const cv = document.createElement('canvas'); cv.width = 240; cv.height = 120; const g = cv.getContext('2d'); g.fillStyle = '#2a7'; g.fillRect(0, 0, 240, 120); g.fillStyle = '#fff'; g.font = '30px sans-serif'; g.fillText('SHOT', 70, 70); const blob = await new Promise((r) => cv.toBlob(r, 'image/png')); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); });
  await p.keyboard.press('Control+v'); await sleep(6000);
}
await sleep(1500); await shot(c, `steps/${tag}-2-after-action`);
await done(); await sleep(1500);
const after = await stored(topicId); log('stored after: ' + JSON.stringify(after));
await shot(c, `steps/${tag}-3-after-done`);
const holder = after.filter((x) => /\[IMG\]/.test(x.html)); if (SC.startsWith('paste')) log('picture is in: ' + JSON.stringify(holder.map((x) => x.html)));
const sb = after.find((x) => /blip 1/.test(x.html)); if (SC.startsWith('ins') && sb) log('sub-blip html (the [+] must sit on the "blip 1" line): ' + sb.html);
const del = await p.evaluate(async (id) => { await fetch('/api/auth/csrf', { credentials: 'include' }); const raw = document.cookie.split('; ').find((e) => e.startsWith('XSRF-TOKEN=')); const csrf = raw ? decodeURIComponent(raw.split('=')[1]) : ''; const r = await fetch(`/api/topics/${id}`, { method: 'DELETE', headers: { 'x-csrf-token': csrf }, credentials: 'include' }); return r.status; }, topicId);
log('scratch topic delete status: ' + del);
await c.ctx.close(); await b.close();
