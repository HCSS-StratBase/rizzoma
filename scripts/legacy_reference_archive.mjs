#!/usr/bin/env node
/**
 * LEGACY REFERENCE ARCHIVE — systematic captures of original rizzoma.com.
 *
 * Target: the ~243-PNG scale demanded by SDS (2026-07-14) — one PNG + one .md
 * note per distinct legacy UI state, organized by the RIZZOMA_FEATURES_STATUS
 * comparison tracks, so the parity gate can compare old-vs-new per feature.
 *
 * READ-ONLY DISCIPLINE (per rizzoma SKILL):
 *  - auth via scripts/rizzoma-session-state.json (canonical path string);
 *  - NO content writes anywhere: no typing into editors, no Ctrl+Enter on live
 *    topics, no Done-after-modification;
 *  - edit-mode chrome captured ONLY on the sanctioned sandbox Try topic
 *    (8738c4e1a37aa1118ff3f6318b086734 — "safe to add content to", May 2026),
 *    entered and exited via the Edit/Done toggle with zero keystrokes;
 *  - blip ACTIVATION (marks-read side effect) only inside the sandbox;
 *  - popups dismissed with Escape.
 *
 * Resume-capable: a capture whose PNG already exists is skipped ('a'-mode rule).
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

const OUT = process.env.LEGACY_OUT || '/mnt/c/Rizzoma/screenshots/260714-legacy-reference-archive';
const SANDBOX = 'https://rizzoma.com/topic/8738c4e1a37aa1118ff3f6318b086734/0_b_ck1g_cp839/';
const SANDBOX_TOPIC = 'https://rizzoma.com/topic/8738c4e1a37aa1118ff3f6318b086734/';
const log = m => console.log(`[archive] ${m}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

await fs.mkdir(OUT, { recursive: true });
const results = [];
let captured = 0, skipped = 0, failed = 0;

const browser = await chromium.launch({ headless: true });

function ctxOpts(extra = {}) {
  return { storageState: 'scripts/rizzoma-session-state.json', viewport: { width: 1440, height: 950 }, ...extra };
}

async function note(file, section, name, detail, ok) {
  const md = `# ${name}\n\n- Section: ${section}\n- File: ${file}\n- Captured: 2026-07-14 from live rizzoma.com (legacy)\n- Status: ${ok ? 'captured' : 'CAPTURE FAILED'}\n\n${detail}\n`;
  await fs.writeFile(path.join(OUT, file.replace(/\.png$/, '.md')), md);
}

async function shoot(page, spec) {
  const file = `${spec.id}-${spec.slug}.png`;
  if (fsSync.existsSync(path.join(OUT, file))) { skipped++; return; }
  try {
    if (spec.run) await spec.run(page);
    await sleep(spec.settle ?? 1200);
    await page.screenshot({ path: path.join(OUT, file), fullPage: false });
    await note(file, spec.section, spec.name, spec.detail, true);
    captured++;
    log(`✓ ${file}`);
  } catch (e) {
    failed++;
    log(`✗ ${file}: ${String(e).split('\n')[0].slice(0, 140)}`);
    try { await page.screenshot({ path: path.join(OUT, file), fullPage: false }); await note(file, spec.section, spec.name, `${spec.detail}\n\nError: ${String(e).split('\n')[0]}`, false); } catch {}
  }
  results.push({ file, section: spec.section, name: spec.name });
}

// helper: dispatch-click a possibly-CSS-hidden element (THE documented way)
const dclick = (page, sel) => page.evaluate(s => {
  const el = Array.from(document.querySelectorAll(s)).find(x => x.offsetParent !== null) || document.querySelector(s);
  if (!el) return false;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return true;
}, sel);
const esc = page => page.keyboard.press('Escape').catch(() => {});

// ============================================================ P1 LOGGED OUT
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = ctx.newPage ? await ctx.newPage() : null;
  page.on('dialog', d => d.dismiss().catch(() => {}));
  const P = [
    { id: '001', slug: 'landing-logged-out', section: 'Authentication', name: 'Landing page (logged out)', detail: 'rizzoma.com root for an anonymous visitor: hero, value prop, sign-in entry points.', run: async p => { await p.goto('https://rizzoma.com/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(6000); } },
    { id: '002', slug: 'signin-form', section: 'Authentication', name: 'Sign-in form', detail: 'The legacy sign-in surface: email/password + Google/Facebook OAuth buttons.', run: async p => { const b = p.locator('a:has-text("Sign in"), button:has-text("Sign in"), .js-login-button').first(); await b.click({ timeout: 8000 }).catch(() => {}); await sleep(3000); } },
    { id: '003', slug: 'signup-form', section: 'Authentication', name: 'Sign-up form', detail: 'Registration surface (email or OAuth).', run: async p => { const b = p.locator('a:has-text("Sign up"), button:has-text("Sign up"), a:has-text("Register")').first(); await b.click({ timeout: 8000 }).catch(() => {}); await sleep(3000); } },
    { id: '004', slug: 'anon-wall-private-topic', section: 'Authentication', name: 'Anonymous-access wall on a private topic', detail: 'What an anonymous visitor sees on a private topic URL: "Anonymous access is disabled" sign-in wall.', run: async p => { await p.goto(SANDBOX_TOPIC, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(8000); } },
  ];
  for (const s of P) await shoot(page, s);
  await ctx.close();
}

// ============================================================ P2-P6 LOGGED IN DESKTOP
{
  const ctx = await browser.newContext(ctxOpts());
  const page = await ctx.newPage();
  page.on('dialog', d => d.dismiss().catch(() => {}));

  const gotoTopics = async () => { await page.goto('https://rizzoma.com/topic/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(10000); };
  const gotoSandbox = async () => { await page.goto(SANDBOX_TOPIC, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(9000); };

  // ---------- P2: topics list + global nav ----------
  await gotoTopics();
  const P2 = [
    { id: '010', slug: 'topics-list-default', section: 'User Interface', name: 'Topics list (default)', detail: 'Left rail topic list with unread badges, search box, topic previews; main pane shows last-open topic.', settle: 500 },
    { id: '011', slug: 'topics-search-typed', section: 'Search', name: 'Topic search — query typed', detail: 'Search box (#js-search-query) with a query typed; suggestions/filter state before running.', run: async p => { await p.fill('#js-search-query', 'test').catch(() => {}); await sleep(1500); } },
    { id: '012', slug: 'topics-search-results', section: 'Search', name: 'Topic search — results', detail: 'Results after running the search (js-run-search).', run: async p => { await dclick(p, '#js-run-search'); await sleep(5000); } },
    { id: '013', slug: 'topics-search-cleared', section: 'Search', name: 'Topic search — cleared', detail: 'List restored after clearing the query.', run: async p => { await p.fill('#js-search-query', '').catch(() => {}); await dclick(p, '#js-run-search'); await sleep(4000); } },
    { id: '014', slug: 'nav-mentions', section: 'User Interface', name: 'Mentions inbox', detail: 'The @-mentions inbox tab (js-mentions button) — unread mention rows.', run: async p => { await dclick(p, 'button.js-mentions, .js-mentions'); await sleep(4000); } },
    { id: '015', slug: 'nav-tasks', section: 'User Interface', name: 'Tasks inbox', detail: 'The ~tasks inbox tab — task rows with states.', run: async p => { await dclick(p, 'button.js-tasks, .js-tasks'); await sleep(4000); } },
    { id: '016', slug: 'nav-publics', section: 'User Interface', name: 'Publics directory', detail: 'Public topics directory tab.', run: async p => { await dclick(p, 'button.js-publics, .js-publics, [title*="ublic"]'); await sleep(5000); } },
    { id: '017', slug: 'nav-store', section: 'Inline Widgets', name: 'Gadget store', detail: 'The gadget/extension Store tab (legacy gadget catalog).', run: async p => { await dclick(p, 'button.js-store, .js-store, [title*="tore"]'); await sleep(5000); } },
    { id: '018', slug: 'nav-teams', section: 'User Interface', name: 'Teams page', detail: 'Teams management tab.', run: async p => { await dclick(p, 'button.js-teams, .js-teams, [title*="eam"]'); await sleep(5000); } },
    { id: '019', slug: 'new-topic-button', section: 'Waves & Blips', name: 'New topic affordance', detail: 'The new-topic (+) button area in the left rail header (NOT clicked — creation is a write).', run: async p => { await gotoTopics(); } },
    { id: '020', slug: 'settings-menu', section: 'User Interface', name: 'Account/settings menu', detail: 'The account settings menu opened from the header (js-show-settings-button).', run: async p => { await dclick(p, 'button.js-show-settings-button'); await sleep(2500); } },
  ];
  for (const s of P2) await shoot(page, s);
  await esc(page);

  // ---------- P3: sandbox topic — view-mode states ----------
  await gotoSandbox();
  const P3 = [
    { id: '030', slug: 'topic-view-default', section: 'Waves & Blips', name: 'Topic view (default)', detail: 'Sandbox Try topic as it loads: root blip, bullets, [+] markers folded, right toolbar.', settle: 500 },
    { id: '031', slug: 'topic-header-bar', section: 'User Interface', name: 'Topic header bar', detail: 'Participants avatars, Share button, settings gear, topic title row.', settle: 300 },
    { id: '032', slug: 'share-modal', section: 'User Interface', name: 'Share/access modal', detail: 'The Share dialog: private/public access levels (js-show-share-button).', run: async p => { await dclick(p, 'button.js-show-share-button'); await sleep(2500); } },
    { id: '033', slug: 'share-modal-closed', section: 'User Interface', name: 'After closing share modal', detail: 'Topic restored after Escape.', run: async p => { await esc(p); await sleep(1500); } },
    { id: '034', slug: 'manage-members', section: 'User Interface', name: 'Manage topic members', detail: 'Participants management (js-show-more-participants).', run: async p => { await dclick(p, 'button.js-show-more-participants'); await sleep(2500); } },
    { id: '035', slug: 'members-closed', section: 'User Interface', name: 'After closing members', detail: 'Restored view.', run: async p => { await esc(p); await sleep(1200); } },
    { id: '036', slug: 'text-view', section: 'User Interface', name: 'Text view mode', detail: 'Right-rail "Text view" (js-text-view) — the linear text rendering.', run: async p => { await dclick(p, 'button.js-text-view'); await sleep(3500); } },
    { id: '037', slug: 'mindmap-view', section: 'User Interface', name: 'Mind-map view mode', detail: 'Right-rail "Mind map" (js-mindmap-view) — the tree visualization of the topic.', run: async p => { await dclick(p, 'button.js-mindmap-view'); await sleep(4500); } },
    { id: '038', slug: 'mindmap-short', section: 'User Interface', name: 'Mind map — short mode', detail: 'Mindmap with short labels (js-mindmap-short-view).', run: async p => { await dclick(p, 'button.js-mindmap-short-view'); await sleep(2500); } },
    { id: '039', slug: 'mindmap-expanded', section: 'User Interface', name: 'Mind map — expanded mode', detail: 'Mindmap with expanded labels (js-mindmap-long-view).', run: async p => { await dclick(p, 'button.js-mindmap-long-view'); await sleep(2500); } },
    { id: '040', slug: 'back-to-text-view', section: 'User Interface', name: 'Back to text view', detail: 'Returned from mindmap.', run: async p => { await dclick(p, 'button.js-text-view'); await sleep(3000); } },
    { id: '041', slug: 'hide-all-comments', section: 'Inline Comments', name: 'Hide all comments (Ctrl+Shift+Up)', detail: 'All inline [+] threads hidden via js-hide-all-inlines.', run: async p => { await dclick(p, 'button.js-hide-all-inlines'); await sleep(2500); } },
    { id: '042', slug: 'show-all-comments', section: 'Inline Comments', name: 'Show all comments', detail: 'Inline threads restored (js-show-all-inlines).', run: async p => { await dclick(p, 'button.js-show-all-inlines'); await sleep(2500); } },
  ];
  for (const s of P3) await shoot(page, s);

  // ---------- P4: fractal unfold sequence (the BLB core) ----------
  await gotoSandbox();
  for (let lvl = 1; lvl <= 8; lvl++) {
    await shoot(page, {
      id: String(50 + lvl).padStart(3, '0'), slug: `fractal-unfold-level-${lvl}`, section: 'BLB',
      name: `Fractal unfold — level ${lvl}`,
      detail: `Depth-${lvl} state of the sandbox fractal: one more folded [+] thread expanded (js-fold-button dispatch — does NOT mark read). Shows nesting indentation, thread lines, boxed blip blocks.`,
      run: async p => {
        await p.evaluate(() => {
          const fb = Array.from(document.querySelectorAll('.blip-thread.folded .js-fold-button, .js-fold-button.fold-button'))
            .find(el => el.closest('.blip-thread')?.classList.contains('folded'));
          fb?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        await sleep(2500);
      },
    });
  }
  await shoot(page, { id: '059', slug: 'fractal-refolded', section: 'BLB', name: 'Fractal re-folded to ToC', detail: 'Fresh navigation: collapse-by-default restores the clean ToC — the BLB reading surface.', run: async p => { await gotoSandbox(); } });

  // ---------- P5: active blip + menus + edit chrome (sandbox only) ----------
  const P5 = [
    { id: '060', slug: 'blip-activated-menu', section: 'Blip Operations', name: 'Active blip — view menu', detail: 'A sandbox blip activated by real click: Edit / Hide / Delete comment / Get direct link / gear buttons appear on ONE blip only.', run: async p => { const c = p.locator('.blip-container').first(); await c.click({ timeout: 8000 }).catch(() => {}); await sleep(2000); } },
    { id: '061', slug: 'blip-gear-menu', section: 'Blip Operations', name: 'Blip gear menu open', detail: 'The per-blip gearwheel dropdown (copy/paste/history options).', run: async p => { await p.evaluate(() => { const ac = document.querySelector('.blip-container.active'); const g = ac && Array.from(ac.querySelectorAll('button')).find(b => /gear|settings|more/i.test(b.className + (b.title || ''))); g?.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await sleep(2000); } },
    { id: '062', slug: 'gear-closed', section: 'Blip Operations', name: 'Gear closed', detail: 'Menu dismissed.', run: async p => { await esc(p); await sleep(800); } },
    { id: '063', slug: 'root-edit-mode-ribbon', section: 'Rich Text', name: 'Root blip EDIT mode — full ribbon', detail: 'The legacy CKEditor-derived ribbon: B/I/S/U, size, format, Bg, color, lists, tasks, link, @, emoji, undo/redo, Tx, gadgets. Entered via js-change-mode (real click), NO typing.', run: async p => { await p.locator('button.js-change-mode[title^="To edit"]').first().click({ timeout: 8000 }); await sleep(3000); } },
    { id: '064', slug: 'edit-link-popup', section: 'Rich Text', name: 'Insert-link popup', detail: 'The Ctrl+L popup: js-link-editor-text-input + js-link-editor-url-input fields.', run: async p => { await dclick(p, 'button.js-manage-link'); await sleep(1800); } },
    { id: '065', slug: 'link-popup-closed', section: 'Rich Text', name: 'Link popup dismissed', detail: 'Escape pressed; no content change.', run: async p => { await esc(p); await sleep(1000); } },
    { id: '066', slug: 'edit-done-back-to-view', section: 'Rich Text', name: 'Done — back to view mode', detail: 'Edit/Done toggle exits edit mode with zero keystrokes typed (content untouched).', run: async p => { await p.locator('button.js-change-mode[title^="Done"]').first().click({ timeout: 8000 }); await sleep(3000); } },
    { id: '067', slug: 'reply-box', section: 'Waves & Blips', name: 'Write-a-reply affordance', detail: 'The reply input at the bottom of the active blip thread.', settle: 800 },
    { id: '068', slug: 'insert-reply-sidebar', section: 'User Interface', name: 'Right-rail INSERT panel', detail: 'The right-rail insert-into-active-blip buttons (reply / @ / ~ / # / gadgets).', settle: 500 },
    { id: '069', slug: 'playback-ui', section: 'History', name: 'Playback (topic history)', detail: 'The Playback timeline UI — legacy wave history scrubber (view-only load).', run: async p => { await p.evaluate(() => { const b = Array.from(document.querySelectorAll('button,a')).find(x => /playback|history/i.test((x.title || '') + x.textContent)); b?.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await sleep(5000); } },
    { id: '070', slug: 'playback-closed', section: 'History', name: 'Playback exited', detail: 'Returned to live topic view.', run: async p => { await gotoSandbox(); } },
  ];
  for (const s of P5) await shoot(page, s);

  // ---------- P6: publics + store depth ----------
  await gotoTopics();
  const P6 = [
    { id: '080', slug: 'publics-list', section: 'User Interface', name: 'Publics — directory list', detail: 'Public topics directory (read-only browse).', run: async p => { await dclick(p, 'button.js-publics, .js-publics'); await sleep(5000); } },
    { id: '081', slug: 'public-topic-view', section: 'Waves & Blips', name: 'A public topic (read-only)', detail: 'First public topic opened WITHOUT activating any blip (no read-marking).', run: async p => { await p.evaluate(() => { const r = document.querySelector('.js-search-result, .search-result-item'); r?.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await sleep(8000); } },
    { id: '082', slug: 'store-catalog', section: 'Inline Widgets', name: 'Store — gadget catalog', detail: 'The legacy gadget store: available inline widgets/gadgets.', run: async p => { await gotoTopics(); await dclick(p, 'button.js-store, .js-store'); await sleep(5000); } },
  ];
  for (const s of P6) await shoot(page, s);
  await ctx.close();
}

// ============================================================ P7 MOBILE (390x844)
{
  const ctx = await browser.newContext(ctxOpts({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 9 Pro XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36' }));
  const page = await ctx.newPage();
  page.on('dialog', d => d.dismiss().catch(() => {}));
  const M = [
    { id: '090', slug: 'mobile-topics-list', section: 'Mobile', name: 'Mobile — topics list', detail: 'Legacy layout at phone width: how the 3-pane desktop UI renders on mobile.', run: async p => { await p.goto('https://rizzoma.com/topic/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(10000); } },
    { id: '091', slug: 'mobile-topic-view', section: 'Mobile', name: 'Mobile — topic view', detail: 'Sandbox topic at phone width: content pane, toolbar accessibility.', run: async p => { await p.goto(SANDBOX_TOPIC, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(9000); } },
    { id: '092', slug: 'mobile-topic-scrolled', section: 'Mobile', name: 'Mobile — topic scrolled', detail: 'Mid-topic scroll position: bullets + [+] markers at phone width.', run: async p => { await p.mouse.wheel(0, 600); await sleep(1500); } },
    { id: '093', slug: 'mobile-fractal-expanded', section: 'Mobile', name: 'Mobile — fractal level expanded', detail: 'One [+] thread unfolded at phone width (fold dispatch, no read-marking).', run: async p => { await p.evaluate(() => { const fb = Array.from(document.querySelectorAll('.blip-thread.folded .js-fold-button')).find(Boolean); fb?.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await sleep(2500); } },
  ];
  for (const s of M) await shoot(page, s);
  await ctx.close();
}

// ============================================================ P8 SECONDARY WIDTH (1280)
{
  const ctx = await browser.newContext(ctxOpts({ viewport: { width: 1280, height: 900 } }));
  const page = await ctx.newPage();
  page.on('dialog', d => d.dismiss().catch(() => {}));
  const W = [
    { id: '100', slug: 'w1280-topics-list', section: 'User Interface', name: '1280px — topics list', detail: 'Layout at 1280 width (common laptop).', run: async p => { await p.goto('https://rizzoma.com/topic/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(10000); } },
    { id: '101', slug: 'w1280-topic-view', section: 'User Interface', name: '1280px — topic view', detail: 'Sandbox topic at 1280.', run: async p => { await p.goto(SANDBOX_TOPIC, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(9000); } },
  ];
  for (const s of W) await shoot(page, s);
  await ctx.close();
}

await browser.close();
const manifest = [`# Legacy reference archive — run of 2026-07-14`, ``,
  `- Captured: ${captured}`, `- Skipped (already existed): ${skipped}`, `- Failed: ${failed}`, ``,
  ...results.map(r => `- [${r.section}] ${r.file} — ${r.name}`)].join('\n');
await fs.writeFile(path.join(OUT, 'ARCHIVE_MANIFEST.md'), manifest);
log(`DONE: captured=${captured} skipped=${skipped} failed=${failed} → ${OUT}`);
