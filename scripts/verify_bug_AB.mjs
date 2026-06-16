// Verify Bug A (Ctrl+Enter latency) + Bug B (nested mount at depth 2+) on the live VPS dev container.
// Run: node /tmp/verify_bug_AB.mjs
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'https://dev.138-201-62-161.nip.io';
const TOPIC = '1a94345b983b3a1c78f2a2da1a02a5aa';
const STATE = '/tmp/dev-vps-state.json';
const OUT = '/mnt/c/Rizzoma/screenshots/260507-bug-AB-verify';
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log('[verify]', ...a);

const browser = await chromium.launch({
  headless: true,
  args: ['--ignore-certificate-errors'],
});
const context = await browser.newContext({
  storageState: STATE,
  ignoreHTTPSErrors: true,
  viewport: { width: 1400, height: 900 },
});
const page = await context.newPage();

page.on('console', m => {
  const t = m.text();
  if (/error|warn/i.test(m.type()) || /ctrl.*enter|toggle.*inline|enter.*edit/i.test(t)) {
    log('console', m.type(), t.slice(0, 200));
  }
});

log('Navigate to topic');
await page.goto(`${BASE}/?layout=rizzoma#/topic/${TOPIC}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500); // let blips load + editor mount

await page.screenshot({ path: `${OUT}/00-topic-loaded.png`, fullPage: false });

const editorCount0 = await page.locator('.ProseMirror').count();
log(`Initial ProseMirror count: ${editorCount0}`);

// Need to click into an editable blip. Find the topic-root blip's title or content first.
// Strategy: click on first .blip-content area to activate, then press its Edit button or just type.
// Original test from memory: enter edit mode then Ctrl+Enter.

// Click the topic-root blip's content
const firstBlip = page.locator('.blip-container').first();
await firstBlip.click();
await page.waitForTimeout(500);

// Find an Edit button visible in the right tools panel
const editBtn = page.locator('button:has-text("Edit")').first();
if (await editBtn.count() > 0) {
  log('Clicking Edit button');
  await editBtn.click();
  await page.waitForTimeout(1500);
} else {
  log('No Edit button found, trying double-click on blip content');
  await firstBlip.locator('.blip-content, .blip-text').first().dblclick().catch(() => {});
  await page.waitForTimeout(1000);
}

await page.screenshot({ path: `${OUT}/01-edit-mode.png`, fullPage: false });
const editorCount1 = await page.locator('.ProseMirror').count();
log(`After edit mode: ${editorCount1} ProseMirror editors`);

// Focus the first editor and place cursor at end
const firstEditor = page.locator('.ProseMirror').first();
await firstEditor.click();
await page.keyboard.press('End');
await page.waitForTimeout(300);

// === BUG A timing test: first Ctrl+Enter latency ===
log('--- Bug A test: first Ctrl+Enter ---');
const t1Start = Date.now();
await page.keyboard.press('Control+Enter');

// Poll for new editor up to 5s
let elapsed1 = null;
for (let i = 0; i < 50; i++) {
  await page.waitForTimeout(100);
  const n = await page.locator('.ProseMirror').count();
  if (n > editorCount1) {
    elapsed1 = Date.now() - t1Start;
    log(`✓ New editor mounted in ${elapsed1}ms (count: ${editorCount1} → ${n})`);
    break;
  }
}
if (elapsed1 === null) {
  log(`✗ FAIL: no new editor in 5s after first Ctrl+Enter`);
}

await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/02-after-first-ctrl-enter.png`, fullPage: false });

// Type into the new editor
const editorCount2 = await page.locator('.ProseMirror').count();
await page.keyboard.type('VERIFY-DEPTH1', { delay: 25 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/03-after-typing-depth1.png`, fullPage: false });

// === BUG B timing test: second Ctrl+Enter (depth 2 → 3) ===
log('--- Bug B test: second Ctrl+Enter (nested) ---');
const t2Start = Date.now();
await page.keyboard.press('Control+Enter');

let elapsed2 = null;
for (let i = 0; i < 50; i++) {
  await page.waitForTimeout(100);
  const n = await page.locator('.ProseMirror').count();
  if (n > editorCount2) {
    elapsed2 = Date.now() - t2Start;
    log(`✓ Second new editor mounted in ${elapsed2}ms (count: ${editorCount2} → ${n})`);
    break;
  }
}
if (elapsed2 === null) {
  const finalCount = await page.locator('.ProseMirror').count();
  log(`✗ FAIL: no new editor after 2nd Ctrl+Enter (count stayed at ${finalCount})`);
}

await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/04-after-second-ctrl-enter.png`, fullPage: false });

await page.keyboard.type('VERIFY-DEPTH2', { delay: 25 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/05-after-typing-depth2.png`, fullPage: false });

// Where did "VERIFY-DEPTH2" land?
const where = await page.evaluate(() => {
  const editors = Array.from(document.querySelectorAll('.ProseMirror'));
  return editors.map((ed, i) => ({
    idx: i,
    text: ed.innerText.slice(0, 100),
  }));
});
log('Editor contents after both tests:');
where.forEach(w => log(`  [${w.idx}] "${w.text}"`));

const summary = {
  topicId: TOPIC,
  testTime: new Date().toISOString(),
  bugA: {
    description: 'First Ctrl+Enter latency (depth 1 mount)',
    elapsedMs: elapsed1,
    expectedAfterFix: '~300-400ms (was 1434ms)',
    status: elapsed1 === null ? 'FAIL' : (elapsed1 < 600 ? 'PASS' : 'PARTIAL'),
  },
  bugB: {
    description: 'Second Ctrl+Enter latency (depth 2 nested mount)',
    elapsedMs: elapsed2,
    expectedAfterFix: 'mounts new editor (was: failed silently)',
    status: elapsed2 === null ? 'FAIL' : 'PASS',
  },
  finalEditors: where.length,
  editorContents: where,
};
fs.writeFileSync(`${OUT}/RESULTS.json`, JSON.stringify(summary, null, 2));
log('---SUMMARY---');
log(JSON.stringify(summary, null, 2));

await browser.close();
