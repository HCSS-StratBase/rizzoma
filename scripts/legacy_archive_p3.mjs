#!/usr/bin/env node
// LEGACY ARCHIVE PHASE 3 — clip-based crop retakes + settings/help/deep-topic states.
// Read-only discipline; resume-capable. Auth: scripts/rizzoma-session-state.json
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const OUT = '/mnt/c/Rizzoma/screenshots/260714-legacy-reference-archive';
const SANDBOX_TOPIC = 'https://rizzoma.com/topic/8738c4e1a37aa1118ff3f6318b086734/';
const log = m => console.log(`[p3] ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let captured = 0, skipped = 0, failed = 0;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: 'scripts/rizzoma-session-state.json', viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();
page.on('dialog', d => d.dismiss().catch(() => {}));

async function note(file, section, name, detail, ok) {
  await fs.writeFile(path.join(OUT, file.replace(/\.png$/, '.md')),
    `# ${name}\n\n- Section: ${section}\n- File: ${file}\n- Captured: 2026-07-14 from live rizzoma.com (legacy)\n- Status: ${ok ? 'captured' : 'CAPTURE FAILED'}\n\n${detail}\n`);
}
const dclick = sel => page.evaluate(s => {
  const el = Array.from(document.querySelectorAll(s)).find(x => x.offsetParent !== null) || document.querySelector(s);
  if (!el) return false;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return true;
}, sel);

async function clipShot(spec) {
  const file = `${spec.id}-${spec.slug}.png`;
  if (fsSync.existsSync(path.join(OUT, file))) { skipped++; return; }
  try {
    if (spec.run) await spec.run(page);
    await sleep(spec.settle ?? 1000);
    let clip;
    if (spec.sel) {
      clip = await page.evaluate(s => {
        const el = Array.from(document.querySelectorAll(s)).find(x => {
          const r = x.getBoundingClientRect();
          return r.width > 4 && r.height > 4;
        });
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const pad = 12;
        return { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: Math.min(1440, r.width + pad * 2), height: Math.min(940, r.height + pad * 2) };
      }, spec.sel);
    }
    await page.screenshot({ path: path.join(OUT, file), clip: clip || undefined, fullPage: false });
    await note(file, spec.section, spec.name, spec.detail, true);
    captured++; log(`✓ ${file}`);
  } catch (e) { failed++; log(`✗ ${file}: ${String(e).split('\n')[0].slice(0, 110)}`); }
}

// ---- retakes via clip on topics page ----
await page.goto('https://rizzoma.com/topic/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(11000);
await clipShot({ id: '206', slug: 'crop-shortcut-legend', section: 'User Interface', name: 'Keyboard shortcut legend', detail: 'Ctrl+Enter (new blip) / Ctrl+Space (next unread) / @Mention / ~Task legend at rail bottom.', sel: '[class*="hotkeys"], [class*="first-steps"], [class*="shortcut"]' });
await clipShot({ id: '270', slug: 'crop-unread-badge', section: 'Unread', name: 'Unread badge close-up', detail: 'Green unread-count badge on a rail tab.', sel: '.js-unread-mentions-count, [class*="unread"][class*="count"], .js-mentions' });
await clipShot({ id: '271', slug: 'crop-follow-btn', section: 'Waves & Blips', name: 'Follow/Unfollow control', detail: 'Per-topic follow state control in the list.', sel: 'button:has-text("Unfollow"), [class*="follow"]' });

// ---- settings pages ----
for (const [id, slug, name, sel] of [
  ['272', 'settings-open-menu', 'Settings menu (header gear)', 'button.js-show-settings-button'],
  ['273', 'settings-first-page', 'Settings page', '[class*="settings-menu"] a, [class*="settings"] [class*="item"]'],
]) {
  await clipShot({ id, slug, section: 'User Interface', name, detail: `${name} — legacy account/topic settings surface.`, run: async p => { await dclick(sel); await sleep(2500); } });
}
await page.keyboard.press('Escape').catch(() => {});

// ---- sandbox BLB anatomy via clip ----
await page.goto(SANDBOX_TOPIC, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(9000);
await clipShot({ id: '220', slug: 'crop-blb-bullet-with-plus', section: 'BLB', name: 'BLB bullet with [+] marker', detail: 'A label LI with its folded inline [+] chip — the core fractal affordance (clip).', sel: 'li' });
await clipShot({ id: '221', slug: 'crop-fold-button', section: 'BLB', name: 'Fold control close-up', detail: 'The [+] fold control (clip).', sel: '.blip-thread .fold-button-container, .js-fold-button' });
await clipShot({ id: '224', slug: 'crop-blip-avatar-date', section: 'Waves & Blips', name: 'Blip avatar + date', detail: 'Author avatar/timestamp chip (clip).', sel: '.blip-container img, [class*="avatar"]' });
await page.evaluate(() => {
  const fb = Array.from(document.querySelectorAll('.blip-thread.folded .js-fold-button')).find(Boolean);
  fb?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await sleep(2500);
await clipShot({ id: '226', slug: 'crop-unfold-minus', section: 'BLB', name: 'Expanded thread [−] control', detail: 'Fold control in expanded state (clip).', sel: '.blip-thread:not(.folded) .js-fold-button, .blip-thread:not(.folded)' });

// ---- edit ribbon via clip (sandbox, zero keystrokes) ----
await page.locator('button.js-change-mode[title^="To edit"]').first().click({ timeout: 10000 }).catch(() => {});
await sleep(3000);
await clipShot({ id: '230', slug: 'crop-ribbon-full', section: 'Rich Text', name: 'Edit ribbon — full (clip)', detail: 'The complete legacy formatting ribbon.', sel: '[class*="edit-toolbar"], [class*="toolbar"]' });
await clipShot({ id: '274', slug: 'crop-ribbon-mention-task', section: 'Rich Text', name: 'Mention/task/tag buttons', detail: '@ ~ # insert buttons in the ribbon.', sel: 'button[title*="ention" i], button[title*="Insert" i]' });
await page.locator('button.js-change-mode[title^="Done"]').first().click({ timeout: 8000 }).catch(() => {});
await sleep(2500);

// ---- deep unfolds on real topics (read-only fold-dispatch, NO activation) ----
await page.goto('https://rizzoma.com/topic/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(9000);
const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.js-search-result, .search-result-item')).slice(0, 6).map((el, i) => ({ i, txt: (el.textContent || '').trim().slice(0, 30).replace(/\s+/g, ' ') })));
for (const row of rows.slice(0, 4)) {
  for (const lvl of [1, 2]) {
    await clipShot({
      id: `28${row.i}${lvl}`, slug: `topic-${row.i}-unfold-${lvl}`, section: 'BLB',
      name: `Real topic "${row.txt.slice(0, 20)}" — unfold ${lvl}`,
      detail: `Read-only deep state of a real topic: ${lvl} fold-dispatch unfold(s), no blip activation (greens preserved). Shows legacy nesting/indentation on real content.`,
      run: async p => {
        if (lvl === 1) {
          await p.goto('https://rizzoma.com/topic/', { waitUntil: 'domcontentloaded', timeout: 60000 });
          await sleep(8000);
          await p.evaluate(i => {
            const rs = Array.from(document.querySelectorAll('.js-search-result, .search-result-item'));
            rs[i]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          }, row.i);
          await sleep(9000);
        }
        await p.evaluate(() => {
          const fb = Array.from(document.querySelectorAll('.blip-thread.folded .js-fold-button')).find(Boolean);
          fb?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await sleep(2500);
      },
    });
  }
}

// ---- help ----
await clipShot({ id: '290', slug: 'help-overlay', section: 'User Interface', name: 'Help', detail: 'The Help entry (bottom-left ?) opened state.', run: async p => { await dclick('[class*="help"] button, button[title*="elp" i], .js-help'); await sleep(3000); } });

await browser.close();
log(`DONE: captured=${captured} skipped=${skipped} failed=${failed}`);
