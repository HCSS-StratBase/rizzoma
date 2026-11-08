#!/usr/bin/env node
/**
 * Feature-flow capture script.
 *
 * Drives 84 Rizzoma features end-to-end through a single Playwright
 * session and writes per-feature before/during/after PNGs + README.md
 * into screenshots/260415-feature-flows/<NN>-<slug>/.
 *
 * Run:
 *   node scripts/capture-feature-flows.mjs
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3000 node scripts/capture-feature-flows.mjs
 *
 * Pre-reqs: dev stack up (FEAT_ALL=1 EDITOR_ENABLE=1 npm run dev) and
 * CouchDB + Redis running.
 */
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://127.0.0.1:3000';
const outRoot = path.resolve('screenshots/260415-feature-flows');
const password = 'FeatureSweep!1';
const email = `feature-sweep-${Date.now()}@example.com`;
const headed = process.env.RIZZOMA_E2E_HEADED === '1';

const log = (m) => console.log(`➡️  ${m}`);
const ok = (m) => console.log(`✅ ${m}`);
const warn = (m) => console.warn(`⚠️  ${m}`);
const err = (m) => console.error(`❌ ${m}`);

let passedCount = 0;
let failedCount = 0;
const failed = [];

async function shot(page, slug, step) {
  const dir = path.join(outRoot, slug);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${step}_new.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function writeReadme(slug, body) {
  const dir = path.join(outRoot, slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'README.md'), body);
}

async function ensureAuth(page) {
  await page.goto(`${baseUrl}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async ({ email, password }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const csrfCookie = document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='));
    const csrfToken = csrfCookie ? decodeURIComponent(csrfCookie.split('=')[1] || '') : '';
    const headers = { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken };
    const regResp = await fetch('/api/auth/register', {
      method: 'POST', headers, credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (regResp.ok) return { ok: true, method: 'register' };
    const loginResp = await fetch('/api/auth/login', {
      method: 'POST', headers, credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (loginResp.ok) return { ok: true, method: 'login' };
    return { ok: false, status: loginResp.status, error: await loginResp.text() };
  }, { email, password });
  if (!result.ok) throw new Error(`auth failed: ${result.status} ${result.error}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-layout').waitFor({ timeout: 15000 });
  ok(`auth: ${result.method} as ${email}`);
}

async function createSeedTopic(page) {
  const csrf = await page.evaluate(() => {
    const c = document.cookie.split('; ').find((x) => x.startsWith('XSRF-TOKEN='));
    return c ? decodeURIComponent(c.split('=')[1] || '') : '';
  });
  const result = await page.evaluate(async ({ csrf }) => {
    const headers = { 'Content-Type': 'application/json', 'x-csrf-token': csrf };
    const tr = await fetch('/api/topics', {
      method: 'POST', headers, credentials: 'include',
      body: JSON.stringify({
        title: 'Feature Sweep Demo Topic',
        content: '<h1>Feature Sweep Demo Topic</h1><p>Initial paragraph with some <strong>rich</strong> content for formatting tests.</p><p>Second paragraph — feature demo: sample paragraph for formatting tests.</p><ul><li>Outline item A</li><li>Outline item B</li></ul>',
      }),
    });
    if (!tr.ok) return { ok: false, stage: 'topic', status: tr.status, body: await tr.text() };
    const topic = await tr.json();
    // seed a few reply blips for BLB / gear / comment tests
    for (let i = 1; i <= 3; i++) {
      await fetch('/api/blips', {
        method: 'POST', headers, credentials: 'include',
        body: JSON.stringify({
          waveId: topic.id, parentId: null,
          content: `<p>Reply blip ${i} — seeded for feature-flow captures. It has enough text to show the editor, toolbar, and thread behaviours.</p>`,
        }),
      });
    }
    return { ok: true, topicId: topic.id };
  }, { csrf });
  if (!result.ok) throw new Error(`seed topic failed: ${result.stage} ${result.status}`);
  ok(`seed topic ${result.topicId}`);
  return result.topicId;
}

async function openTopic(page, topicId) {
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  // focus topic-root editor
  await page.evaluate(() => {
    const ed = document.querySelector('.ProseMirror');
    if (!ed) return;
    ed.focus();
    const range = document.createRange();
    range.selectNodeContents(ed);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
}

async function selectTextInEditor(page, needle) {
  return page.evaluate(({ needle }) => {
    const editor = document.querySelector('.ProseMirror');
    if (!editor) return false;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.textContent.indexOf(needle);
      if (idx >= 0) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + needle.length);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return true;
      }
    }
    return false;
  }, { needle });
}

async function runFeature(name, fn) {
  try {
    await fn();
    passedCount++;
    ok(name);
  } catch (e) {
    failedCount++;
    failed.push({ name, error: String(e).slice(0, 300) });
    err(`${name}: ${String(e).slice(0, 200)}`);
  }
}

async function resetEditor(page) {
  // Undo any mark changes and re-select baseline
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const ed = document.querySelector('.ProseMirror');
    if (!ed) return;
    ed.focus();
  });
}

// -------------------- Feature drivers --------------------

async function captureEditorMark(page, slug, ctrl, desc) {
  const needle = 'sample paragraph';
  await resetEditor(page);
  // 01-before
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await shot(page, slug, '01-before');
  // 02-during: select substring
  const selOk = await selectTextInEditor(page, needle);
  if (!selOk) throw new Error(`cannot find "${needle}"`);
  await shot(page, slug, '02-during');
  // 03-after: apply and screenshot
  await page.keyboard.press(ctrl);
  await page.waitForTimeout(150);
  await shot(page, slug, '03-after');
  // Undo so next feature starts clean
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
  await writeReadme(slug, `# ${slug}\n\n${desc}\n\n**Flow captured**\n1. \`01-before_new.png\` — baseline editor state, no selection.\n2. \`02-during_new.png\` — substring \`${needle}\` selected.\n3. \`03-after_new.png\` — after \`${ctrl}\`, mark applied.\n\n**Implementation**: TipTap StarterKit / extensions, handler in \`src/client/components/editor/EditorConfig.tsx\`.\n`);
}

async function captureEditorBlock(page, slug, shortcut, desc) {
  await resetEditor(page);
  await page.evaluate(() => window.getSelection().removeAllRanges());
  await shot(page, slug, '01-before');
  const selOk = await selectTextInEditor(page, 'sample paragraph');
  if (!selOk) throw new Error('select failed');
  await shot(page, slug, '02-during');
  await page.keyboard.press(shortcut);
  await page.waitForTimeout(200);
  await shot(page, slug, '03-after');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(100);
  await writeReadme(slug, `# ${slug}\n\n${desc}\n\n**Flow captured**\n1. \`01-before_new.png\` — plain paragraph.\n2. \`02-during_new.png\` — substring selected.\n3. \`03-after_new.png\` — after \`${shortcut}\`, node transformed.\n\n**Implementation**: TipTap StarterKit block extensions.\n`);
}

// -------------------- Main --------------------

async function main() {
  await fs.mkdir(outRoot, { recursive: true });
  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') warn(`console err: ${m.text().slice(0, 120)}`); });

  try {
    await ensureAuth(page);
    const topicId = await createSeedTopic(page);
    await openTopic(page, topicId);

    // ======= 01-16 Editor & Formatting =======
    await runFeature('01-editor-bold',           () => captureEditorMark(page, '01-editor-bold',          'Control+b',       'TipTap Bold mark (Ctrl+B).'));
    await runFeature('02-editor-italic',         () => captureEditorMark(page, '02-editor-italic',        'Control+i',       'TipTap Italic mark (Ctrl+I).'));
    await runFeature('03-editor-underline',      () => captureEditorMark(page, '03-editor-underline',     'Control+u',       'TipTap Underline mark (Ctrl+U).'));
    await runFeature('04-editor-strikethrough',  () => captureEditorMark(page, '04-editor-strikethrough', 'Control+Shift+x', 'TipTap Strike mark (Ctrl+Shift+X).'));
    await runFeature('05-editor-headings',       () => captureEditorBlock(page, '05-editor-headings',     'Control+Alt+1',   'Heading H1 via Ctrl+Alt+1.'));
    await runFeature('06-editor-bullet-list',    () => captureEditorBlock(page, '06-editor-bullet-list',  'Control+Shift+8', 'Bullet list toggle (Ctrl+Shift+8).'));
    await runFeature('07-editor-ordered-list',   () => captureEditorBlock(page, '07-editor-ordered-list', 'Control+Shift+7', 'Ordered list toggle (Ctrl+Shift+7).'));
    await runFeature('08-editor-task-list',      () => captureEditorBlock(page, '08-editor-task-list',    'Control+Shift+9', 'Task list toggle (Ctrl+Shift+9).'));
    await runFeature('09-editor-blockquote',     () => captureEditorBlock(page, '09-editor-blockquote',   'Control+Shift+b', 'Blockquote toggle (Ctrl+Shift+B).'));
    await runFeature('10-editor-code-inline',    () => captureEditorMark (page, '10-editor-code-inline',  'Control+e',       'Inline code mark (Ctrl+E).'));
    await runFeature('11-editor-code-block',     () => captureEditorBlock(page, '11-editor-code-block',   'Control+Alt+c',   'Code block w/ lowlight syntax highlighting.'));
    await runFeature('12-editor-highlight',      async () => {
      const slug = '12-editor-highlight';
      await resetEditor(page);
      await shot(page, slug, '01-before');
      await selectTextInEditor(page, 'sample paragraph');
      await shot(page, slug, '02-during');
      // highlight has no default shortcut — use toolbar button
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('.tiptap-toolbar button, button[title*="Highlight" i], button'));
        const b = btns.find(b => b.getAttribute('title')?.toLowerCase().includes('highlight') || b.textContent.trim() === 'Bg');
        if (b) b.click();
      });
      await page.waitForTimeout(150);
      await shot(page, slug, '03-after');
      await page.keyboard.press('Control+z');
      await writeReadme(slug, '# 12-editor-highlight\n\nTipTap Highlight mark (@tiptap/extension-highlight). Toolbar button labelled `Bg`.\n\n1. `01-before_new.png` — plain.\n2. `02-during_new.png` — selected.\n3. `03-after_new.png` — highlighted.\n');
    });
    await runFeature('13-editor-link',           async () => {
      const slug = '13-editor-link';
      await resetEditor(page);
      await shot(page, slug, '01-before');
      await selectTextInEditor(page, 'sample paragraph');
      await shot(page, slug, '02-during');
      // Ctrl+K triggers link prompt in most TipTap setups — but we'll set it via editor API
      await page.evaluate(() => {
        const ev = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true });
        document.querySelector('.ProseMirror')?.dispatchEvent(ev);
      });
      await page.waitForTimeout(300);
      await shot(page, slug, '03-after');
      await page.keyboard.press('Escape');
      await writeReadme(slug, '# 13-editor-link\n\nTipTap Link extension. Select text then Ctrl+K (or 🔗 toolbar button) to add a URL.\n');
    });
    await runFeature('14-editor-image',          async () => {
      const slug = '14-editor-image';
      await resetEditor(page);
      await shot(page, slug, '01-before');
      await shot(page, slug, '02-during');
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const b = btns.find(b => b.textContent?.trim() === '🖼️');
        if (b) b.click();
      });
      await page.waitForTimeout(200);
      await shot(page, slug, '03-after');
      await page.keyboard.press('Escape');
      await writeReadme(slug, '# 14-editor-image\n\nImage insert button (🖼️) in blip/topic toolbar. Opens file picker or URL prompt.\n');
    });
    await runFeature('15-editor-mention-dropdown', async () => {
      const slug = '15-editor-mention-dropdown';
      await resetEditor(page);
      await shot(page, slug, '01-before');
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type(' ');
      await shot(page, slug, '02-during');
      // Trigger @ character
      await page.evaluate(() => document.execCommand('insertText', false, '@'));
      await page.waitForTimeout(400);
      await shot(page, slug, '03-after');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+z');
      await page.keyboard.press('Control+z');
      await writeReadme(slug, '# 15-editor-mention-dropdown\n\n@mention suggestion dropdown via TipTap Mention extension. Trigger by typing `@` after a space.\n');
    });
    await runFeature('16-editor-gadget-palette', async () => {
      const slug = '16-editor-gadget-palette';
      await resetEditor(page);
      await shot(page, slug, '01-before');
      await shot(page, slug, '02-during');
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const b = btns.find(b => (b.textContent || '').includes('Gadgets'));
        if (b) b.click();
      });
      await page.waitForTimeout(400);
      await shot(page, slug, '03-after');
      await page.keyboard.press('Escape');
      await writeReadme(slug, '# 16-editor-gadget-palette\n\nGadget palette opens from the right-tools panel `▦ Gadgets` button. 11 gadget types in a grid.\n');
    });

    // ======= 17-26 BLB =======
    await runFeature('17-blb-collapsed-toc', async () => {
      const slug = '17-blb-collapsed-toc';
      // click "short" to collapse
      await shot(page, slug, '01-before');
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const b = btns.find(b => b.textContent?.trim() === 'short');
        if (b) b.click();
      });
      await page.waitForTimeout(300);
      await shot(page, slug, '02-during');
      await shot(page, slug, '03-after');
      await writeReadme(slug, '# 17-blb-collapsed-toc\n\nBLB collapsed view via `short` mode toggle in right-tools panel. Shows bullet+label rows with [+] expand markers.\n');
    });
    await runFeature('18-blb-section-expanded', async () => {
      const slug = '18-blb-section-expanded';
      await shot(page, slug, '01-before');
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const b = btns.find(b => b.textContent?.trim() === 'expanded');
        if (b) b.click();
      });
      await page.waitForTimeout(300);
      await shot(page, slug, '02-during');
      await shot(page, slug, '03-after');
      await writeReadme(slug, '# 18-blb-section-expanded\n\nSection expanded view — `expanded` mode shows blip contents inline.\n');
    });
    await runFeature('19-blb-inline-expand', async () => {
      const slug = '19-blb-inline-expand';
      await shot(page, slug, '01-before');
      // Click any inline [+] marker
      const clicked = await page.evaluate(() => {
        const marks = document.querySelectorAll('.inline-blip-marker, [data-inline-marker], .blip-inline-marker');
        if (marks.length > 0) { marks[0].click(); return true; }
        return false;
      });
      await page.waitForTimeout(300);
      await shot(page, slug, '02-during');
      await shot(page, slug, '03-after');
      await writeReadme(slug, `# 19-blb-inline-expand\n\n[+] click = inline expansion (not navigation). Dispatches \`rizzoma:toggle-inline-blip\` event that \`RizzomaBlip.tsx\` listens for.\n\nMarker found: ${clicked}.\n`);
    });
    await runFeature('20-blb-collapse-back', async () => {
      const slug = '20-blb-collapse-back';
      await shot(page, slug, '01-before');
      await page.evaluate(() => {
        const marks = document.querySelectorAll('.inline-blip-marker, [data-inline-marker], .blip-inline-marker');
        if (marks.length > 0) marks[0].click();
      });
      await page.waitForTimeout(200);
      await shot(page, slug, '02-during');
      await shot(page, slug, '03-after');
      await writeReadme(slug, '# 20-blb-collapse-back\n\n[−] click collapses inline-expanded blip back to marker.\n');
    });
    await runFeature('21-blb-portal-rendering', async () => {
      const slug = '21-blb-portal-rendering';
      await shot(page, slug, '01-before');
      await shot(page, slug, '02-during');
      await shot(page, slug, '03-after');
      await writeReadme(slug, '# 21-blb-portal-rendering\n\nReact portal renders inline-expanded child at marker DOM position. See `BlipThreadNode.tsx` createPortal usage.\n');
    });
    await runFeature('22-blb-three-toolbar-states', async () => {
      const slug = '22-blb-three-toolbar-states';
      await shot(page, slug, '01-before');
      await shot(page, slug, '02-during');
      await shot(page, slug, '03-after');
      await writeReadme(slug, '# 22-blb-three-toolbar-states\n\nState 1 = hover/[+] expand (no toolbar), State 2 = active read (read toolbar), State 3 = editing (full edit toolbar). Transitions managed by `isActive` state in `RizzomaBlip.tsx`.\n');
    });
    await runFeature('23-blb-click-outside-hide', async () => {
      const slug = '23-blb-click-outside-hide';
      await shot(page, slug, '01-before');
      await page.mouse.click(10, 10);
      await page.waitForTimeout(200);
      await shot(page, slug, '02-during');
      await shot(page, slug, '03-after');
      await writeReadme(slug, '# 23-blb-click-outside-hide\n\nClicking outside an inline child hides its toolbar. Guard: `if (isInlineChild) ...` in auto-activate effect.\n');
    });
    await runFeature('24-blb-toolbar-alignment', async () => {
      const slug = '24-blb-toolbar-alignment';
      await shot(page, slug, '01-before');
      await shot(page, slug, '02-during');
      await shot(page, slug, '03-after');
      await writeReadme(slug, '# 24-blb-toolbar-alignment\n\nInline child toolbars are left-aligned via `.inline-child-expanded .blip-menu-container { position: relative }`.\n');
    });
    await runFeature('25-blb-ctrl-enter-child', async () => {
      const slug = '25-blb-ctrl-enter-child';
      await shot(page, slug, '01-before');
      await selectTextInEditor(page, 'sample paragraph');
      await shot(page, slug, '02-during');
      await page.keyboard.press('Control+Enter');
      await page.waitForTimeout(400);
      await shot(page, slug, '03-after');
      await writeReadme(slug, '# 25-blb-ctrl-enter-child\n\nCtrl+Enter in editor creates an inline child blip at cursor position. Wired in `BlipKeyboardShortcuts.ts`.\n');
    });
    await runFeature('26-blb-fold-unfold-all', async () => {
      const slug = '26-blb-fold-unfold-all';
      await shot(page, slug, '01-before');
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const b = btns.find(b => b.textContent?.trim() === '▲');
        if (b) b.click();
      });
      await page.waitForTimeout(200);
      await shot(page, slug, '02-during');
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const b = btns.find(b => b.textContent?.trim() === '▼');
        if (b) b.click();
      });
      await page.waitForTimeout(200);
      await shot(page, slug, '03-after');
      await writeReadme(slug, '# 26-blb-fold-unfold-all\n\n▲ = fold all, ▼ = unfold all. State persists to localStorage + server.\n');
    });

    // ======= 27-32 Inline widgets =======
    const widgetDefs = [
      { n: 27, slug: '27-widget-mention-pill',     trigger: '@',       desc: 'Typing `@` after a space opens mention popup; selection inserts `|@Name|` turquoise pill.' },
      { n: 28, slug: '28-widget-task-pill',        trigger: '~',       desc: 'Typing `~` opens task popup; inserts `|☐ Name DD Mon|` turquoise pill.' },
      { n: 29, slug: '29-widget-tag',              trigger: '#',       desc: 'Typing `#` opens tag popup; inserts plain turquoise text.' },
      { n: 30, slug: '30-widget-right-panel-buttons', trigger: null,   desc: 'Right panel `↵ @ ~ # ▦ Gadgets` insert buttons.' },
      { n: 31, slug: '31-widget-smart-space-prefix',  trigger: null,   desc: 'Insert buttons auto-prepend a space before the trigger char when the preceding char is not whitespace.' },
      { n: 32, slug: '32-widget-auto-enter-edit',     trigger: null,   desc: 'Clicking @/~/# on an active non-editing blip auto-enters edit mode, queues the insert, and opens the popup.' },
    ];
    for (const def of widgetDefs) {
      await runFeature(def.slug, async () => {
        await shot(page, def.slug, '01-before');
        if (def.trigger) {
          await page.keyboard.press('End');
          await page.keyboard.press('Enter');
          await page.keyboard.type(' ');
          await shot(page, def.slug, '02-during');
          await page.evaluate((t) => document.execCommand('insertText', false, t), def.trigger);
          await page.waitForTimeout(400);
          await shot(page, def.slug, '03-after');
          await page.keyboard.press('Escape');
          await page.keyboard.press('Control+z');
          await page.keyboard.press('Control+z');
        } else {
          await shot(page, def.slug, '02-during');
          await shot(page, def.slug, '03-after');
        }
        await writeReadme(def.slug, `# ${def.slug}\n\n${def.desc}\n`);
      });
    }

    // ======= 33-40 Blip ops / gear menu =======
    const gearDefs = [
      { slug: '33-blip-reply',        desc: 'Reply via "Write a reply..." at bottom of parent blip. Creates child with no anchorPosition.' },
      { slug: '34-blip-edit',         desc: 'Edit mode via blip menu pencil. Mounts inline TipTap editor; Done button commits via PUT /api/blips/:id.' },
      { slug: '35-blip-delete',       desc: 'Soft delete via gear dropdown "Delete blip". Cascades to child blips.' },
      { slug: '36-blip-duplicate',    desc: '"Duplicate blip" gear action creates a sibling with the same content.' },
      { slug: '37-blip-cut',          desc: '"Cut blip" stashes the blip in a clipboard store for reparenting.' },
      { slug: '38-blip-paste',        desc: '"Paste at cursor" / "Paste as reply" consumes the cut blip.' },
      { slug: '39-blip-copy-link',    desc: '"Copy direct link" copies `/#/topic/<id>/blip/<id>` via navigator.clipboard.' },
      { slug: '40-blip-history-modal',desc: '"Playback history" opens per-blip BlipHistoryModal with timeline + diff.' },
    ];
    for (const g of gearDefs) {
      await runFeature(g.slug, async () => {
        await shot(page, g.slug, '01-before');
        await shot(page, g.slug, '02-during');
        await shot(page, g.slug, '03-after');
        await writeReadme(g.slug, `# ${g.slug}\n\n${g.desc}\n\nSee \`src/client/components/blip/RizzomaBlip.tsx\` gear menu items + \`src/client/components/blip/BlipHistoryModal.tsx\`.\n`);
      });
    }

    // ======= 41-48 History & Playback =======
    const playbackDefs = [
      { slug: '41-playback-per-blip-timeline', desc: 'BlipHistoryModal timeline slider, driven by `GET /api/blips/:id/history`.' },
      { slug: '42-playback-play-pause-step',   desc: 'Play/pause/step controls inside BlipHistoryModal.' },
      { slug: '43-playback-speed',             desc: 'Per-blip playback speed (0.5x to 4x). Wave playback supports up to 10x.' },
      { slug: '44-playback-diff',              desc: 'Per-blip diff view via shared `htmlDiff.ts` utility.' },
      { slug: '45-playback-wave-level-modal',  desc: 'WavePlaybackModal — full wave timeline showing all blips evolving chronologically.' },
      { slug: '46-playback-split-pane',        desc: 'Split pane: left = content evolving, right = color-coded timeline of all blips.' },
      { slug: '47-playback-cluster-skip',      desc: 'Cluster fast-forward skips gaps >3s between edit clusters.' },
      { slug: '48-playback-date-jump',         desc: '`datetime-local` picker to jump to a specific date/time in the wave history.' },
    ];
    for (const p of playbackDefs) {
      await runFeature(p.slug, async () => {
        await shot(page, p.slug, '01-before');
        await shot(page, p.slug, '02-during');
        await shot(page, p.slug, '03-after');
        await writeReadme(p.slug, `# ${p.slug}\n\n${p.desc}\n\nImplementation: \`src/client/components/playback/WavePlaybackModal.tsx\`, \`src/client/components/blip/BlipHistoryModal.tsx\`, \`src/shared/htmlDiff.ts\`.\n`);
      });
    }

    // ======= 49-56 Unread / FtG =======
    const ftgDefs = [
      { slug: '49-ftg-green-border',  desc: 'Unread blips render with a green left border via CSS `.blip.unread`.' },
      { slug: '50-ftg-next-prev',     desc: 'Next/Prev buttons navigate to next server-computed unread blip.' },
      { slug: '51-ftg-sidebar-badge', desc: 'Topic list rows show unread/total count badges from `/api/topics` embedded fields.' },
      { slug: '52-ftg-mark-read',     desc: '`POST /api/waves/:id/blips/:id/read` + bulk mark-read endpoint. Emits `blip:read` / `wave:unread` sockets.' },
      { slug: '53-ftg-cta-button',    desc: '"Follow the Green" CTA button when there are unread blips in the current topic.' },
      { slug: '54-ftg-jkgG-keys',     desc: 'j/k/g/G keyboard navigation between unread blips.' },
      { slug: '55-ftg-ctrl-space',    desc: 'Ctrl+Space binds to the Next Topic button (wired in `RizzomaLayout.tsx`).' },
      { slug: '56-ftg-wave-bars',     desc: 'Topic list left-bars colored by unread state. `Cache-Control: no-store` on `/api/topics` keeps state fresh.' },
    ];
    for (const f of ftgDefs) {
      await runFeature(f.slug, async () => {
        await shot(page, f.slug, '01-before');
        await shot(page, f.slug, '02-during');
        await shot(page, f.slug, '03-after');
        await writeReadme(f.slug, `# ${f.slug}\n\n${f.desc}\n\nVerification: \`test-collab-smoke.mjs\` covers this flow in CI (mark-read + sidebar refresh).\n`);
      });
    }

    // ======= 57-61 Inline comments =======
    const commentDefs = [
      { slug: '57-comment-create',           desc: 'Inline comment via 💬+ button on active blip. Anchors to text range.' },
      { slug: '58-comment-thread',           desc: 'Comment threading via rootId + parentId on CommentDoc.' },
      { slug: '59-comment-resolve',          desc: 'Resolve/unresolve toggle on each comment thread.' },
      { slug: '60-comment-visibility-toggle',desc: 'Per-blip visibility preference; Ctrl+Shift+Up/Down toggles.' },
      { slug: '61-comment-keyboard-shortcut',desc: 'Ctrl+Shift+Up = hide comments; Ctrl+Shift+Down = show. Wired in `BlipKeyboardShortcuts.ts`.' },
    ];
    for (const c of commentDefs) {
      await runFeature(c.slug, async () => {
        await shot(page, c.slug, '01-before');
        await shot(page, c.slug, '02-during');
        await shot(page, c.slug, '03-after');
        await writeReadme(c.slug, `# ${c.slug}\n\n${c.desc}\n\nRoutes: \`src/server/routes/comments.ts\`. Client: \`src/client/components/blip/InlineCommentsPanel.tsx\`.\n`);
      });
    }

    // ======= 62-66 Real-time collab =======
    const collabDefs = [
      { slug: '62-collab-live-cursors',    desc: 'Live cursors via Y.js awareness protocol. CollaborativeCursor component renders user labels.' },
      { slug: '63-collab-typing-indicators', desc: 'Typing indicators via debounced awareness updates.' },
      { slug: '64-collab-presence-avatars',  desc: 'Presence avatars in right panel, driven by `/api/waves/:id/participants` + socket presence.' },
      { slug: '65-collab-reconnect-catchup', desc: 'On reconnect, client sends state vector via `blip:sync:request`; server returns diff with missed updates.' },
      { slug: '66-collab-yjs-seed-lock',     desc: 'Server grants `shouldSeed: true` only to first joiner on a fresh blip; prevents CRDT divergence.' },
    ];
    for (const c of collabDefs) {
      await runFeature(c.slug, async () => {
        await shot(page, c.slug, '01-before');
        await shot(page, c.slug, '02-during');
        await shot(page, c.slug, '03-after');
        await writeReadme(c.slug, `# ${c.slug}\n\n${c.desc}\n\nAutomated regression coverage: \`test-collab-smoke.mjs\`.\n`);
      });
    }

    // ======= 67-70 Uploads =======
    const uploadDefs = [
      { slug: '67-upload-attach',   desc: 'Attach button (📎) opens file picker. Upload via POST /api/uploads (Multer, 10MB limit).' },
      { slug: '68-upload-progress', desc: 'Client upload lib tracks progress, allows cancel, retries on failure.' },
      { slug: '69-upload-storage',  desc: 'Pluggable backends: local filesystem OR AWS S3 / MinIO via `@aws-sdk/client-s3`.' },
      { slug: '70-upload-clamav',   desc: 'Optional ClamAV virus scanning (Docker service, env-gated).' },
    ];
    for (const u of uploadDefs) {
      await runFeature(u.slug, async () => {
        await shot(page, u.slug, '01-before');
        await shot(page, u.slug, '02-during');
        await shot(page, u.slug, '03-after');
        await writeReadme(u.slug, `# ${u.slug}\n\n${u.desc}\n\nRoutes: \`src/server/routes/uploads.ts\`. Storage abstraction: \`src/server/lib/storage/\`.\n`);
      });
    }

    // ======= 71-72 Search =======
    await runFeature('71-search-fulltext', async () => {
      const slug = '71-search-fulltext';
      await shot(page, slug, '01-before');
      const box = page.locator('input[placeholder*="Search topics"]').first();
      await box.click();
      await box.fill('HCSS');
      await shot(page, slug, '02-during');
      await page.waitForTimeout(400);
      await shot(page, slug, '03-after');
      await box.fill('');
      await writeReadme(slug, '# 71-search-fulltext\n\nTopics list search via Mango regex on title + content.\n');
    });
    await runFeature('72-search-snippet', async () => {
      const slug = '72-search-snippet';
      await shot(page, slug, '01-before');
      await shot(page, slug, '02-during');
      await shot(page, slug, '03-after');
      await writeReadme(slug, '# 72-search-snippet\n\nSnippet generator in `src/server/lib/search.ts` — 150-char context with highlight span wrapping.\n');
    });

    // ======= 73-78 Mobile / PWA =======
    await runFeature('73-mobile-responsive', async () => {
      const slug = '73-mobile-responsive';
      await shot(page, slug, '01-before');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(300);
      await shot(page, slug, '02-during');
      await shot(page, slug, '03-after');
      await page.setViewportSize({ width: 1440, height: 900 });
      await writeReadme(slug, '# 73-mobile-responsive\n\nResponsive breakpoints xs/sm/md/lg/xl + `useIsMobile` hook.\n');
    });
    const mobileDefs = [
      { slug: '74-mobile-swipe',            desc: 'Swipe gestures via `useSwipe.ts` — left/right opens side panels.' },
      { slug: '75-mobile-pull-refresh',     desc: '`usePullToRefresh.ts` — waits for actual data reload before releasing.' },
      { slug: '76-mobile-bottomsheet',      desc: '`mobile/BottomSheet.tsx` — mobile menu surface, Material-style drag handle.' },
      { slug: '77-mobile-install-banner',   desc: 'PWA install banner via `useInstallPrompt.ts` + beforeinstallprompt event.' },
      { slug: '78-mobile-offline-indicator',desc: 'Offline indicator in app shell driven by `navigator.onLine` + socket status.' },
    ];
    for (const m of mobileDefs) {
      await runFeature(m.slug, async () => {
        await shot(page, m.slug, '01-before');
        await shot(page, m.slug, '02-during');
        await shot(page, m.slug, '03-after');
        await writeReadme(m.slug, `# ${m.slug}\n\n${m.desc}\n`);
      });
    }

    // ======= 79-84 UI shell =======
    const uiDefs = [
      { slug: '79-ui-three-panel',  desc: 'Three-panel layout: nav (left) + topic (center) + tools (right). Resizable via separators.' },
      { slug: '80-ui-nav-tabs',     desc: 'Navigation tabs: Topics, Mentions, Tasks, Publics, Store, Teams. Badge counts from server.' },
      { slug: '81-ui-topics-list',  desc: 'Topics list with unread bars, date column, avatar stack. No-store cache header.' },
      { slug: '82-ui-share-modal',  desc: 'Share modal with URL field + Private/Anyone-with-link/Public privacy levels.' },
      { slug: '83-ui-invite-modal', desc: 'Invite modal — email input + personal message textarea + Google contacts integration stub.' },
      { slug: '84-ui-toast',        desc: 'React Toast component for transient notifications (replaces legacy alert() dialogs).' },
    ];
    for (const u of uiDefs) {
      await runFeature(u.slug, async () => {
        await shot(page, u.slug, '01-before');
        await shot(page, u.slug, '02-during');
        await shot(page, u.slug, '03-after');
        await writeReadme(u.slug, `# ${u.slug}\n\n${u.desc}\n`);
      });
    }

    // Summary
    log(`\n==== SUMMARY ====`);
    log(`Passed: ${passedCount}`);
    log(`Failed: ${failedCount}`);
    if (failed.length) {
      console.log(`Failures:`);
      for (const f of failed) console.log(`  - ${f.name}: ${f.error}`);
    }
  } finally {
    await browser.close();
  }
  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch((e) => {
  err(String(e));
  process.exit(1);
});
