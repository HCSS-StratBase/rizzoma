// Liliia (c) insert a blip mid-blip, (d) screenshot paste into a sub-blip + delete the picture, as the NON-OWNER B.
// Uses the topic built by liliia-repro.mjs (liliia-topic.json). Real mouse and keys; the clipboard is PREPARED with an
// image (what a person does with a screenshot tool) and pasted with a real Ctrl+V. Server read for the verdicts.
import fs from 'node:fs';
import { launch, newClient, signInUi, sleep, shot, OUT } from './lib.mjs';
const st = JSON.parse(fs.readFileSync('/home/stephan/rizzoma-fractal-scratch/run/liliia-topic.json', 'utf8'));
const tag = process.env.FS_TAG || 'repro2'; const BASE = st.base; process.env.FS_BASE = BASE;
const SECTIONS = (process.env.FS_SECTIONS || 'c,d').split(',');
const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const b = await launch();
const c = await newClient(b, st.b); await signInUi(c); const p = c.page;
const stored = () => p.evaluate(async (id) => { const r = await fetch(`/api/blips?waveId=${id}&limit=100`, { credentials: 'include' }); const j = await r.json(); return (j.blips || j).filter((x) => !x.deleted).map((x) => ({ id: String(x.id || x._id).slice(-6), parent: String(x.parentId || '').slice(-6), html: String(x.content).replace(/<span class="blip-thread-host"[\s\S]*?<\/span><\/span>/g, '[+]').replace(/<img[^>]*>/g, '[IMG]').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() })); }, st.topicId);
const done = async () => { for (let i = 0; i < 4; i += 1) { const d = p.locator('[data-testid="blip-menu-done"]').filter({ visible: true }).last(); if (await d.isVisible().catch(() => false)) { await d.click(); await sleep(1200); } } };
await p.goto(`${BASE}/?layout=rizzoma#/topic/${st.topicId}`, { waitUntil: 'domcontentloaded' }); await sleep(8000);
if (SECTIONS.includes('c')) {
  // (c1) click into the MIDDLE of a blip (view state) and press Ctrl+Enter
  await p.locator('.blip-collapsed-row', { hasText: 'Second blip' }).first().click(); await sleep(1500);
  const li = p.locator('.blip-container.nested-blip li', { hasText: /^Second blip/ }).first(); const bx = await li.boundingBox();
  await p.mouse.click(bx.x + 40, bx.y + 8); await sleep(1500);
  await p.keyboard.press('Control+Enter'); await sleep(2500); await p.keyboard.type('Mid child', { delay: 30 }); await sleep(1500);
  await shot(c, `steps/${tag}-c1`);
  await done(); await sleep(1500);
  log('(c1) stored after Ctrl+Enter mid-blip: ' + JSON.stringify((await stored()).filter((x) => /Second|Mid/.test(x.html))));
  // (c2) with the blip ACTIVE but NOT in edit mode: the right-panel "insert reply" button
  await p.locator('.blip-collapsed-row', { hasText: 'Third blip' }).first().click().catch(() => {}); await sleep(1500);
  log('(c2) blips marked active before the button: ' + await p.evaluate(() => Array.from(document.querySelectorAll('.rizzoma-blip.active')).map((e) => (e.className.includes('topic-root') ? 'TOPIC-ROOT' : (e.textContent || '').trim().slice(0, 20))).join(' | ')));
  await p.locator('.active-blip-control.insert-reply').first().click().catch((e) => log('(c2) button: ' + String(e.message).split('\n')[0].slice(0, 60))); await sleep(2500);
  await p.keyboard.type('Panel child', { delay: 30 }); await sleep(1500);
  await shot(c, `steps/${tag}-c2`);
  await done(); await sleep(1500);
  log('(c2) stored after the right-panel reply button (Third blip active, not editing): ' + JSON.stringify((await stored()).filter((x) => /Third|Panel/.test(x.html))));
}
if (SECTIONS.includes('d')) {
  await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(8000);
  // open the nested child (inside First blip) and put the caret in it
  await p.locator('.blip-collapsed-row', { hasText: 'First blip' }).first().click().catch(() => {}); await sleep(1500);
  await p.locator('.blip-thread-marker').filter({ visible: true }).first().click().catch(() => {}); await sleep(1800);
  const child = p.locator('.rizzoma-blip').filter({ hasText: 'Nested child' }).last(); const cb = await child.locator('li').first().boundingBox();
  await p.mouse.click(cb.x + 60, cb.y + 8); await sleep(1500); await p.keyboard.press('Control+End'); await sleep(400);
  // prepare the clipboard with a small PNG (as a screenshot tool does), then paste with the real keys
  await p.evaluate(async () => { const cv = document.createElement('canvas'); cv.width = 120; cv.height = 60; const g = cv.getContext('2d'); g.fillStyle = '#2a7'; g.fillRect(0, 0, 120, 60); g.fillStyle = '#fff'; g.font = '20px sans-serif'; g.fillText('SHOT', 30, 38); const blob = await new Promise((r) => cv.toBlob(r, 'image/png')); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); });
  await p.keyboard.press('Control+v'); await sleep(5000);
  const where = (await stored()).filter((x) => /IMG/.test(x.html)).map((x) => `${x.id}: "${x.html.slice(0, 40)}"`);
  log('(d1) after pasting the screenshot into the NESTED child, blips that now hold a picture: ' + JSON.stringify(where));
  await shot(c, `steps/${tag}-d1`);
  // (d2) delete the picture only: click it, press Backspace
  const img = p.locator('.rizzoma-blip img[src*="upload"], .rizzoma-blip .ProseMirror img').filter({ visible: true }).first();
  const n0 = await img.count();
  if (n0) { await img.click().catch(() => {}); await sleep(500); await p.keyboard.press('Backspace'); await sleep(2500); }
  const after = await stored();
  log(`(d2) deleting the picture (image elements found=${n0}): blips still stored=${after.length}; blips with picture=${after.filter((x) => /IMG/.test(x.html)).length}; nested child still there=${after.some((x) => /Nested child/.test(x.html))}`);
  await shot(c, `steps/${tag}-d2`);
}
log('problems: ' + c.problems.length + ' ' + c.problems.slice(0, 2).join(' | ').slice(0, 200));
await c.ctx.close(); await b.close();
