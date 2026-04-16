#!/usr/bin/env node
/**
 * Re-run the 7 editor features that failed in capture-feature-flows.mjs.
 * Fix: always re-inject "sample paragraph" before each feature so text
 * selection never depends on a persistent state across undos.
 */
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const baseUrl = 'http://127.0.0.1:3000';
const outRoot = path.resolve('/mnt/c/Rizzoma/screenshots/260415-feature-flows');
const password = 'FeatureSweep!1';
const email = `feature-sweep-fix-${Date.now()}@example.com`;

const log = (m) => console.log(`➡️  ${m}`);
const ok = (m) => console.log(`✅ ${m}`);
const err = (m) => console.error(`❌ ${m}`);

async function shot(page, slug, step) {
  const dir = path.join(outRoot, slug);
  await fs.mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${step}_new.png`) });
}
async function writeReadme(slug, body) {
  await fs.writeFile(path.join(outRoot, slug, 'README.md'), body);
}

async function ensureAuth(page) {
  await page.goto(`${baseUrl}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  const r = await page.evaluate(async ({ email, password }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const cc = document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='));
    const csrf = cc ? decodeURIComponent(cc.split('=')[1] || '') : '';
    const headers = { 'Content-Type': 'application/json', 'x-csrf-token': csrf };
    const reg = await fetch('/api/auth/register', { method: 'POST', headers, credentials: 'include', body: JSON.stringify({ email, password }) });
    if (reg.ok) return { ok: true };
    const lg = await fetch('/api/auth/login', { method: 'POST', headers, credentials: 'include', body: JSON.stringify({ email, password }) });
    return lg.ok ? { ok: true } : { ok: false };
  }, { email, password });
  if (!r.ok) throw new Error('auth failed');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-layout').waitFor({ timeout: 15000 });
}

async function createSeedTopic(page) {
  const csrf = await page.evaluate(() => {
    const c = document.cookie.split('; ').find((x) => x.startsWith('XSRF-TOKEN='));
    return c ? decodeURIComponent(c.split('=')[1] || '') : '';
  });
  const r = await page.evaluate(async ({ csrf }) => {
    const headers = { 'Content-Type': 'application/json', 'x-csrf-token': csrf };
    const tr = await fetch('/api/topics', {
      method: 'POST', headers, credentials: 'include',
      body: JSON.stringify({
        title: 'Feature Sweep Fix Topic',
        content: '<h1>Feature Sweep Fix Topic</h1><p>sample paragraph for formatting tests.</p>',
      }),
    });
    const t = await tr.json();
    return t.id;
  }, { csrf });
  return r;
}

async function reloadAndSelect(page, topicId) {
  // reload topic so the editor is in a clean baseline
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const ed = document.querySelector('.ProseMirror');
    if (!ed) return false;
    ed.focus();
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf('sample paragraph');
      if (idx >= 0) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + 'sample paragraph'.length);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
    }
    return false;
  });
}

async function captureFix(page, topicId, slug, shortcut, desc) {
  // 01-before
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('.ProseMirror')?.focus());
  await shot(page, slug, '01-before');
  // 02-during: reload + select
  await reloadAndSelect(page, topicId);
  await shot(page, slug, '02-during');
  // 03-after: apply
  await page.keyboard.press(shortcut);
  await page.waitForTimeout(250);
  await shot(page, slug, '03-after');
  await writeReadme(slug, `# ${slug}\n\n${desc}\n\n**Flow captured**\n1. \`01-before_new.png\` — clean topic view, no selection.\n2. \`02-during_new.png\` — substring \`sample paragraph\` selected.\n3. \`03-after_new.png\` — after \`${shortcut}\`, transformation applied.\n\n**Implementation**: TipTap StarterKit block/mark extensions in \`src/client/components/editor/EditorConfig.tsx\`.\n`);
  ok(slug);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  try {
    await ensureAuth(page);
    ok(`auth as ${email}`);
    const topicId = await createSeedTopic(page);
    ok(`seed topic ${topicId}`);

    const targets = [
      { slug: '05-editor-headings',      shortcut: 'Control+Alt+1',  desc: 'Heading H1 via Ctrl+Alt+1 (TipTap Heading extension).' },
      { slug: '06-editor-bullet-list',   shortcut: 'Control+Shift+8', desc: 'Bullet list toggle (Ctrl+Shift+8).' },
      { slug: '07-editor-ordered-list',  shortcut: 'Control+Shift+7', desc: 'Ordered list toggle (Ctrl+Shift+7).' },
      { slug: '08-editor-task-list',     shortcut: 'Control+Shift+9', desc: 'Task list toggle (Ctrl+Shift+9).' },
      { slug: '09-editor-blockquote',    shortcut: 'Control+Shift+b', desc: 'Blockquote toggle (Ctrl+Shift+B).' },
      { slug: '10-editor-code-inline',   shortcut: 'Control+e',       desc: 'Inline code mark (Ctrl+E).' },
      { slug: '11-editor-code-block',    shortcut: 'Control+Alt+c',   desc: 'Code block with lowlight syntax highlighting (30 languages).' },
    ];
    for (const t of targets) {
      try { await captureFix(page, topicId, t.slug, t.shortcut, t.desc); }
      catch (e) { err(`${t.slug}: ${e}`); }
    }
  } finally { await browser.close(); }
}
main().catch((e) => { err(e); process.exit(1); });
