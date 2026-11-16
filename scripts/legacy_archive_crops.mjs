#!/usr/bin/env node
/**
 * LEGACY ARCHIVE PHASE 2 — element-level CROPS keyed to feature-matrix rows,
 * per-topic content states, edit-ribbon dropdowns, and extra widths.
 * Same read-only discipline as legacy_reference_archive.mjs. Resume-capable.
 * Auth: scripts/rizzoma-session-state.json
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const OUT = '/mnt/c/Rizzoma/screenshots/260714-legacy-reference-archive';
const SANDBOX_TOPIC = 'https://rizzoma.com/topic/8738c4e1a37aa1118ff3f6318b086734/';
const log = m => console.log(`[crops] ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
await fs.mkdir(OUT, { recursive: true });
let captured = 0, skipped = 0, failed = 0;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: 'scripts/rizzoma-session-state.json', viewport: { width: 1440, height: 950 } });
const page = await ctx.newPage();
page.on('dialog', d => d.dismiss().catch(() => {}));

async function note(file, section, name, detail, ok) {
  const md = `# ${name}\n\n- Section: ${section}\n- File: ${file}\n- Captured: 2026-07-14 from live rizzoma.com (legacy)\n- Status: ${ok ? 'captured' : 'CAPTURE FAILED'}\n\n${detail}\n`;
  await fs.writeFile(path.join(OUT, file.replace(/\.png$/, '.md')), md);
}
async function crop(spec) {
  const file = `${spec.id}-${spec.slug}.png`;
  if (fsSync.existsSync(path.join(OUT, file))) { skipped++; return; }
  try {
    if (spec.run) await spec.run(page);
    await sleep(spec.settle ?? 900);
    if (spec.sel) {
      const el = page.locator(spec.sel).first();
      await el.screenshot({ path: path.join(OUT, file), timeout: 8000 });
    } else {
      await page.screenshot({ path: path.join(OUT, file), fullPage: false });
    }
    await note(file, spec.section, spec.name, spec.detail, true);
    captured++; log(`✓ ${file}`);
  } catch (e) {
    failed++; log(`✗ ${file}: ${String(e).split('\n')[0].slice(0, 120)}`);
  }
}
const dclick = sel => page.evaluate(s => {
  const el = Array.from(document.querySelectorAll(s)).find(x => x.offsetParent !== null) || document.querySelector(s);
  if (!el) return false;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return true;
}, sel);

// ---------- C1: left-rail + header element crops (topics page) ----------
await page.goto('https://rizzoma.com/topic/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(11000);
const C1 = [
  ['200', 'crop-left-rail-full', 'User Interface', 'Left navigation rail', 'New button + Topics/Mentions/Tasks/Publics/Store/Teams tabs with Pro and unread badges.', '.navigation-panel, [class*="navigation"]'],
  ['201', 'crop-new-topic-btn', 'Waves & Blips', 'New-topic button', 'The "New" button with beta-wand icon.', 'button:has-text("New"), .js-create-topic'],
  ['202', 'crop-mentions-tab-badge', 'Unread', 'Mentions tab with unread badge', 'Green unread-count badge on the @ Mentions tab.', '.js-mentions'],
  ['203', 'crop-tasks-tab-pro', 'User Interface', 'Tasks tab (Pro)', 'Tasks tab with the orange Pro ribbon.', '.js-tasks'],
  ['204', 'crop-search-box', 'Search', 'Topic search box', 'Search input + dropdown + magnifier (#js-search-query).', '#js-search-query'],
  ['205', 'crop-topic-row', 'Waves & Blips', 'Topic list row', 'One topic row: title, snippet preview, avatar, date.', '.js-search-result, .search-result-item'],
  ['206', 'crop-shortcut-legend', 'User Interface', 'Keyboard shortcut legend', 'Ctrl+Enter/Ctrl+Space/@Mention/~Task legend at rail bottom.', '[class*="shortcut"], [class*="first-steps"]'],
  ['207', 'crop-topic-header', 'User Interface', 'Topic header bar', 'Invite + participant avatars + Share + gear.', '[class*="wave-header"], [class*="topic-header"]'],
  ['208', 'crop-share-btn', 'User Interface', 'Share button (private state)', 'Lock icon + "Share" — title says "Topic is private, click to change".', 'button.js-show-share-button'],
  ['209', 'crop-blip-menu-bar', 'Blip Operations', 'Blip menu bar (view mode)', 'Edit chip + comment/link/gear icon buttons above the root blip.', '.js-blip-menu, [class*="blip-menu"], button.js-change-mode'],
  ['210', 'crop-next-topic-btn', 'Unread', 'Next (Follow-the-Green) button', 'The right-rail Next unread-navigation button.', '.js-global-next-unread, [class*="next"]'],
  ['211', 'crop-text-mindmap-toggle', 'User Interface', 'Text view / Mind map toggles', 'Right-rail view-mode switch buttons.', 'button.js-text-view'],
];
for (const [id, slug, section, name, detail, sel] of C1) await crop({ id, slug, section, name, detail, sel });

// ---------- C2: sandbox topic element crops + BLB anatomy ----------
await page.goto(SANDBOX_TOPIC, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(9000);
const C2 = [
  ['220', 'crop-blb-bullet-with-plus', 'BLB', 'BLB bullet with [+] marker', 'A label LI with its folded inline [+] chip — the core fractal affordance.', '.blip-thread.folded'],
  ['221', 'crop-fold-button', 'BLB', 'Fold button close-up', 'The [+]/[−] fold control anatomy.', '.js-fold-button'],
  ['222', 'crop-root-blip-body', 'Waves & Blips', 'Root blip body', 'The root blip: title, hashtag chips, bulleted body.', '.blip-container'],
  ['223', 'crop-reply-box', 'Waves & Blips', 'Reply affordance', 'The reply input at thread bottom.', '[class*="reply"]'],
  ['224', 'crop-blip-avatar-date', 'Waves & Blips', 'Blip contributor avatar + date', 'Author avatar and timestamp chip on a blip.', '.blip-container [class*="avatar"], .blip-container img'],
];
for (const [id, slug, section, name, detail, sel] of C2) await crop({ id, slug, section, name, detail, sel });

// unfold one level then crop expanded-thread anatomy
await page.evaluate(() => {
  const fb = Array.from(document.querySelectorAll('.blip-thread.folded .js-fold-button')).find(Boolean);
  fb?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await sleep(2500);
await crop({ id: '225', slug: 'crop-expanded-inline-thread', section: 'BLB', name: 'Expanded inline thread', detail: 'An unfolded [+] thread: boxed child blip inline under its anchor LI with indent + thread line.', sel: '.blip-thread:not(.folded)' });
await crop({ id: '226', slug: 'crop-unfold-minus', section: 'BLB', name: '[−] collapse control on expanded thread', detail: 'The fold control in its expanded state.', sel: '.blip-thread:not(.folded) .js-fold-button' });

// ---------- C3: edit-mode ribbon crops + dropdowns (sandbox root; zero keystrokes) ----------
await page.locator('button.js-change-mode[title^="To edit"]').first().click({ timeout: 10000 }).catch(() => {});
await sleep(3000);
const C3 = [
  ['230', 'crop-ribbon-full', 'Rich Text', 'Edit ribbon — full', 'The complete legacy formatting ribbon in edit mode.', '[class*="toolbar"], [class*="ribbon"], [class*="editor-tools"]'],
  ['231', 'crop-ribbon-bold-group', 'Rich Text', 'Bold/Italic/Underline/Strike group', 'B I U S buttons.', 'button.js-make-bold'],
  ['232', 'crop-ribbon-lists', 'Rich Text', 'List toggles', 'Bulleted + numbered list buttons.', 'button[title="Bulleted list"]'],
  ['233', 'crop-ribbon-link-btn', 'Rich Text', 'Insert link button', 'The Ctrl+L link button.', 'button.js-manage-link'],
];
for (const [id, slug, section, name, detail, sel] of C3) await crop({ id, slug, section, name, detail, sel });

// dropdown states (open → full-page shot → Escape)
for (const [id, slug, name, sel] of [
  ['234', 'edit-size-dropdown', 'Font-size dropdown open', 'button[title*="size" i], [class*="font-size"]'],
  ['235', 'edit-format-dropdown', 'Format dropdown open', 'button[title*="format" i], [class*="format-button"]'],
  ['236', 'edit-bg-palette', 'Background-color palette open', 'button[title*="background" i], [class*="highlight"], button[title*="Bg" i]'],
  ['237', 'edit-color-palette', 'Text-color palette open', 'button[title*="color" i]'],
  ['238', 'edit-gadget-picker', 'Gadget picker open', 'button[title*="gadget" i], [class*="gadget"]'],
]) {
  await crop({ id, slug, section: 'Rich Text', name, detail: `${name} in the legacy edit ribbon (opened, screenshot, then dismissed with Escape — no content change).`, run: async p => { await dclick(sel); await sleep(1500); } });
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(700);
}
// exit edit mode WITHOUT typing
await page.locator('button.js-change-mode[title^="Done"]').first().click({ timeout: 8000 }).catch(() => {});
await sleep(2500);

// ---------- C4: per-topic content states (read-only; NO blip activation) ----------
await page.goto('https://rizzoma.com/topic/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(10000);
const topicRows = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.js-search-result, .search-result-item')).slice(0, 12).map((el, i) => ({
    i, txt: (el.textContent || '').trim().slice(0, 40).replace(/\s+/g, ' '),
  })));
log(`topic rows found: ${topicRows.length}`);
for (const row of topicRows) {
  await crop({
    id: String(240 + row.i), slug: `topic-content-${row.i}-${row.txt.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`,
    section: 'Waves & Blips', name: `Topic content: ${row.txt.slice(0, 30)}`,
    detail: `Read-only landing state of the topic "${row.txt}" — content rendering variety (hashtags, embeds, Cyrillic, BLB shapes). No blip activated (greens preserved).`,
    run: async p => {
      await p.goto('https://rizzoma.com/topic/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(8000);
      await p.evaluate(i => {
        const rows = Array.from(document.querySelectorAll('.js-search-result, .search-result-item'));
        rows[i]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }, row.i);
      await sleep(9000);
    },
    settle: 500,
  });
}

// ---------- C5: mindmap + text view on a REAL topic (read-only) ----------
await crop({ id: '260', slug: 'mindmap-real-topic', section: 'User Interface', name: 'Mind map of a real topic', detail: 'Mindmap view of a content-rich real topic (read-only).', run: async p => { await dclick('button.js-mindmap-view'); await sleep(5000); } });
await crop({ id: '261', slug: 'mindmap-real-topic-short', section: 'User Interface', name: 'Mind map — short labels (real topic)', detail: 'Short-label mode.', run: async p => { await dclick('button.js-mindmap-short-view'); await sleep(2500); } });
await crop({ id: '262', slug: 'text-view-real-topic', section: 'User Interface', name: 'Text view of a real topic', detail: 'Back to text view.', run: async p => { await dclick('button.js-text-view'); await sleep(3500); } });

await browser.close();
log(`DONE: captured=${captured} skipped=${skipped} failed=${failed}`);
