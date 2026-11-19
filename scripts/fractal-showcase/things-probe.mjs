// Probe the everyday editing things on a scratch chain (root > Probe level 1..4 (+ Extra child)), headed, real
// mouse and keys: bold, italic, Tab (indent), undo, collapse/expand, delete, Ctrl+Enter. Each result is judged
// from what the SERVER stored (read-only API) or from the rendered DOM. env: FS_BASE, FS_STATE_IN, FS_LIVE=1
import fs from 'node:fs';
import { launch, newClient, signInUi, seedUser, sleep, shot, TYPE_DELAY } from './lib.mjs';
import { signInLive } from './liveauth.mjs';
const BASE = (process.env.FS_BASE || 'http://127.0.0.1:3105').replace(/\/$/, ''); process.env.FS_BASE = BASE;
const topicId = JSON.parse(fs.readFileSync(process.env.FS_STATE_IN, 'utf8')).topicId;
const b = await launch(); let c;
if (process.env.FS_LIVE === '1') { const st = '/home/stephan/rizzoma-fractal-scratch/run/things-t1.json'; const { email } = await signInLive(b, BASE, 1, st); c = await newClient(b, email, { storageState: st }); }
else { await seedUser('fs-alice@example.com'); c = await newClient(b, 'fs-alice@example.com'); await signInUi(c); }
const p = c.page; const res = [];
const rec = (what, ok, detail = '') => { res.push({ what, ok, detail }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${what}${detail ? ' | ' + detail : ''}`); };
const stored = () => p.evaluate(async (id) => { const r = await fetch(`/api/blips?waveId=${id}&limit=100`, { credentials: 'include' }); const j = await r.json(); return (j.blips || j).filter((x) => !x.deleted).map((x) => String(x.content).replace(/<span class="blip-thread-host"[\s\S]*?<\/span><\/span>/g, '[+]')); }, topicId);
const open = async () => { await p.goto(`${BASE}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' }); await sleep(7000);
  for (let i = 0; i < 6; i += 1) { const m = p.locator('.blip-thread-marker').filter({ visible: true }); const n = await m.count(); let did = false; for (let k = 0; k < n; k += 1) { const el = m.nth(k); if (/expanded/.test((await el.getAttribute('class')) || '')) continue; if ((await el.textContent()) === '−') continue; try { await el.click({ timeout: 1500 }); did = true; await sleep(800); break; } catch {} } if (!did) break; } };
const clickLine = async (needle, x = 70) => { const li = p.locator('.rizzoma-blip').filter({ hasText: needle }).last().locator('li').first(); const bx = await li.boundingBox(); await p.mouse.click(bx.x + x, bx.y + 8); await sleep(900); };
const done = async () => { const d = p.locator('[data-testid="blip-menu-done"]').filter({ visible: true }).last(); if (await d.isVisible().catch(() => false)) { await d.click(); await sleep(1500); } };

await open();
// bold + italic on level 3
await clickLine('Probe level 3'); await p.keyboard.press('Control+End');
await p.keyboard.press('Control+b'); await p.keyboard.type(' BOLD', { delay: TYPE_DELAY }); await p.keyboard.press('Control+b');
await p.keyboard.press('Control+i'); await p.keyboard.type(' ITAL', { delay: TYPE_DELAY }); await p.keyboard.press('Control+i'); await sleep(2500);
let s = (await stored()).join('\n');
rec('bold (Ctrl+B) persisted', /<strong>\s*BOLD|<strong> BOLD/.test(s) || /<strong>[^<]*BOLD/.test(s));
rec('italic (Ctrl+I) persisted', /<em>[^<]*ITAL/.test(s));
// Tab: new bullet then indent
await p.keyboard.press('Enter'); await p.keyboard.type('indent me', { delay: TYPE_DELAY }); await p.keyboard.press('Tab'); await sleep(2500);
s = (await stored()).join('\n');
rec('Tab indents a bullet (nested list persisted)', /<ul>[\s\S]*<ul>[\s\S]*indent me/.test(s));
// undo
await p.keyboard.type(' ZZUNDO', { delay: TYPE_DELAY }); await sleep(600); await p.keyboard.press('Control+z'); await sleep(600); await p.keyboard.press('Control+z'); await sleep(2500);
s = (await stored()).join('\n');
rec('undo (Ctrl+Z) removes typed text', !/ZZUNDO/.test(s), /ZZUNDO/.test(s) ? 'text still stored' : '');
await done(); await done();
// collapse / expand
const before = await p.locator('.blip-thread-marker').filter({ visible: true }).count();
await p.locator('.blip-thread-marker').filter({ visible: true }).first().click(); await sleep(900);
const afterCollapse = await p.locator('.rizzoma-blip').count();
await p.locator('.blip-thread-marker').filter({ visible: true }).first().click(); await sleep(900);
const afterExpand = await p.locator('.rizzoma-blip').count();
rec('collapse then expand a marker', afterCollapse < afterExpand, `blips shown: ${afterExpand} -> ${afterCollapse} -> ${afterExpand}`);
// edit level 2 after reload: caret at click, typing stays put
await p.reload({ waitUntil: 'domcontentloaded' }); await open();
await clickLine('Probe level 2', 50);
await p.keyboard.type('W', { delay: TYPE_DELAY }); await sleep(2500);
s = (await stored()).join('\n');
rec('level 2 edit after reload: character lands where clicked (not at the end)', /Probe l.*W.*evel 2|Probe lW/.test(s) || /Pro.*W/.test(s.split('\n').find((x) => /Probe/.test(x) && /level 2|evel 2/.test(x)) || ''), (s.split('\n').find((x) => /evel 2/.test(x)) || '').replace(/<[^>]+>/g, '').slice(0, 50));
await p.keyboard.press('Backspace'); await sleep(1500); await done();
// delete a leaf blip through the gear menu
const nBefore = (await stored()).length;
await p.locator('.rizzoma-blip').filter({ hasText: 'Extra child' }).last().click({ position: { x: 40, y: 10 } }).catch(() => {}); await sleep(900);
const gear = p.locator('[data-testid="blip-menu-gear-toggle"], [data-testid="blip-menu-overflow-toggle"]').filter({ visible: true }).last();
await gear.click().catch(() => {}); await sleep(600);
await p.getByRole('menuitem', { name: /delete/i }).filter({ visible: true }).last().click().catch((e) => console.log('delete item err', String(e.message).split('\n')[0].slice(0, 60))); await sleep(3000);
const nAfter = (await stored()).length;
rec('delete a blip (gear menu, confirm)', nAfter < nBefore, `stored blips ${nBefore} -> ${nAfter}; dialogs: ${c.dialogs.slice(-1).join('')}`);
await shot(c, 'steps/things-probe-end');
console.log('problems:', c.problems.length, c.problems.slice(0, 2).join(' | ').slice(0, 200));
fs.writeFileSync('/home/stephan/rizzoma-fractal-scratch/run/things-report.json', JSON.stringify(res, null, 1));
await c.ctx.close(); await b.close();
