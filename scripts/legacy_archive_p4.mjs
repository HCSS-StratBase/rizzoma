#!/usr/bin/env node
// LEGACY ARCHIVE PHASE 4 — mobile nav states, extra widths, public-topic depth.
// Read-only; resume-capable. Auth: scripts/rizzoma-session-state.json
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
const OUT = '/mnt/c/Rizzoma/screenshots/260714-legacy-reference-archive';
const SANDBOX_TOPIC = 'https://rizzoma.com/topic/8738c4e1a37aa1118ff3f6318b086734/';
const log = m => console.log(`[p4] ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let captured = 0, skipped = 0, failed = 0;
const browser = await chromium.launch({ headless: true });

async function runSet(vp, specs, extra = {}) {
  const ctx = await browser.newContext({ storageState: 'scripts/rizzoma-session-state.json', viewport: vp, ...extra });
  const page = await ctx.newPage();
  page.on('dialog', d => d.dismiss().catch(() => {}));
  const dclick = sel => page.evaluate(s => {
    const el = Array.from(document.querySelectorAll(s)).find(x => x.offsetParent !== null) || document.querySelector(s);
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  }, sel);
  for (const spec of specs) {
    const file = `${spec.id}-${spec.slug}.png`;
    if (fsSync.existsSync(path.join(OUT, file))) { skipped++; continue; }
    try {
      if (spec.run) await spec.run(page, dclick);
      await sleep(spec.settle ?? 1200);
      await page.screenshot({ path: path.join(OUT, file), fullPage: false });
      await fs.writeFile(path.join(OUT, file.replace(/\.png$/, '.md')),
        `# ${spec.name}\n\n- Section: ${spec.section}\n- File: ${file}\n- Captured: 2026-07-14 from live rizzoma.com (legacy)\n- Status: captured\n\n${spec.detail}\n`);
      captured++; log(`✓ ${file}`);
    } catch (e) { failed++; log(`✗ ${file}: ${String(e).split('\n')[0].slice(0, 110)}`); }
  }
  await ctx.close();
}

const MOBILE = { width: 390, height: 844 };
await runSet(MOBILE, [
  { id: '300', slug: 'mobile-nav-mentions', section: 'Mobile', name: 'Mobile — mentions tab', detail: 'Mentions inbox at phone width.', run: async (p, d) => { await p.goto('https://rizzoma.com/topic/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(10000); await d('.js-mentions'); await sleep(4000); } },
  { id: '301', slug: 'mobile-nav-tasks', section: 'Mobile', name: 'Mobile — tasks tab', detail: 'Tasks inbox at phone width.', run: async (p, d) => { await d('.js-tasks'); await sleep(4000); } },
  { id: '302', slug: 'mobile-nav-publics', section: 'Mobile', name: 'Mobile — publics', detail: 'Publics directory at phone width.', run: async (p, d) => { await d('.js-publics'); await sleep(4000); } },
  { id: '303', slug: 'mobile-search', section: 'Mobile', name: 'Mobile — search results', detail: 'Topic search at phone width.', run: async (p, d) => { await p.goto('https://rizzoma.com/topic/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(9000); await p.fill('#js-search-query', 'try').catch(() => {}); await d('#js-run-search'); await sleep(4000); } },
  { id: '304', slug: 'mobile-mindmap', section: 'Mobile', name: 'Mobile — mindmap view', detail: 'Mindmap at phone width (sandbox).', run: async (p, d) => { await p.goto(SANDBOX_TOPIC, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(9000); await d('button.js-mindmap-view'); await sleep(4500); } },
  { id: '305', slug: 'mobile-share-modal', section: 'Mobile', name: 'Mobile — share modal', detail: 'Share dialog at phone width.', run: async (p, d) => { await d('button.js-text-view'); await sleep(2000); await d('button.js-show-share-button'); await sleep(2500); } },
], { isMobile: true, hasTouch: true });

await runSet({ width: 1280, height: 900 }, [
  { id: '310', slug: 'w1280-mindmap', section: 'User Interface', name: '1280px — mindmap', detail: 'Mindmap at 1280 width.', run: async (p, d) => { await p.goto(SANDBOX_TOPIC, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(9000); await d('button.js-mindmap-view'); await sleep(4500); } },
  { id: '311', slug: 'w1280-fractal-open', section: 'BLB', name: '1280px — fractal expanded', detail: 'Two unfolds at 1280 width.', run: async (p, d) => { await d('button.js-text-view'); await sleep(2500); for (let i = 0; i < 2; i++) { await p.evaluate(() => { const fb = Array.from(document.querySelectorAll('.blip-thread.folded .js-fold-button')).find(Boolean); fb?.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await sleep(2200); } } },
  { id: '312', slug: 'w1280-mentions', section: 'User Interface', name: '1280px — mentions', detail: 'Mentions inbox at 1280.', run: async (p, d) => { await p.goto('https://rizzoma.com/topic/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(9000); await d('.js-mentions'); await sleep(4000); } },
], {});

await runSet({ width: 1440, height: 950 }, [
  { id: '320', slug: 'public-topic-2', section: 'Waves & Blips', name: 'Public topic #2 (read-only)', detail: 'Second public topic content state, no activation.', run: async (p, d) => { await p.goto('https://rizzoma.com/topic/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(9000); await d('.js-publics'); await sleep(4500); await p.evaluate(() => { const rs = Array.from(document.querySelectorAll('.js-search-result, .search-result-item')); rs[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await sleep(9000); } },
  { id: '321', slug: 'public-topic-3', section: 'Waves & Blips', name: 'Public topic #3 (read-only)', detail: 'Third public topic content state.', run: async (p, d) => { await p.goto('https://rizzoma.com/topic/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(8000); await d('.js-publics'); await sleep(4500); await p.evaluate(() => { const rs = Array.from(document.querySelectorAll('.js-search-result, .search-result-item')); rs[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await sleep(9000); } },
  { id: '322', slug: 'sandbox-unfold-9', section: 'BLB', name: 'Sandbox unfold — further level', detail: 'Additional fold-dispatch unfold beyond level 8 (if threads remain).', run: async (p, d) => { await p.goto(SANDBOX_TOPIC, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(9000); for (let i = 0; i < 9; i++) { await p.evaluate(() => { const fb = Array.from(document.querySelectorAll('.blip-thread.folded .js-fold-button')).find(Boolean); fb?.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await sleep(1600); } } },
  { id: '323', slug: 'topics-list-scrolled', section: 'User Interface', name: 'Topics list — scrolled', detail: 'Lower half of the topics list (older topics, follow states).', run: async (p, d) => { await p.goto('https://rizzoma.com/topic/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(9000); await p.evaluate(() => { const rail = document.querySelector('[class*="search-results"], [class*="topics-list"]'); if (rail) rail.scrollTop = 600; }); await sleep(1500); } },
  { id: '324', slug: 'store-scrolled', section: 'Inline Widgets', name: 'Store — catalog scrolled', detail: 'More of the gadget catalog.', run: async (p, d) => { await d('.js-store'); await sleep(4500); await p.mouse.wheel(0, 500); await sleep(1500); } },
], {});

await browser.close();
log(`DONE: captured=${captured} skipped=${skipped} failed=${failed}`);
