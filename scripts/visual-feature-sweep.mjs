import { chromium, devices } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'https://138-201-62-161.nip.io';
const stamp = process.env.RIZZOMA_SWEEP_STAMP || new Date().toISOString().replace(/[-:T]/g, '').slice(2, 12);
const outDir = process.env.RIZZOMA_SWEEP_DIR || path.resolve('screenshots', `${stamp}-feature-sweep`);
const password = process.env.RIZZOMA_E2E_PASSWORD || 'VisualSweep!1';
const ownerEmail = process.env.RIZZOMA_E2E_USER_A || `visual-owner+${Date.now()}@example.com`;
const observerEmail = process.env.RIZZOMA_E2E_USER_B || `visual-observer+${Date.now()}@example.com`;
const headless = process.env.RIZZOMA_E2E_HEADED !== '1';
const slowMo = Number(process.env.RIZZOMA_E2E_SLOWMO || 0);

const visualSectionPrefixes = [
  'Authentication',
  'Waves',
  'Rich Text',
  'Real-time',
  'Unread',
  'Inline Comments',
  'File Uploads',
  'Search',
  'Blip Operations',
  'History',
  'Email',
  'Mobile',
  'User Interface',
  'BLB',
  'Inline Widgets',
];

const dynamicPattern = /\b(add|create|edit|delete|resolve|unresolve|toggle|click|expand|collapse|fold|unfold|hide|show|login|registration|invite|share|export|search|jump|play|pause|stop|step|upload|retry|cancel|install|offline|sync|swipe|pull|navigation|autocomplete|dropdown|modal|menu|copy|paste|mark|follow|reconnection|typing|selection|cursor|mention|task|gadget|insert|filter|view|switch|open|close)\b/i;

const manifest = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  branch: null,
  commit: null,
  outputDir: outDir,
  documentedRows: [],
  visualRows: [],
  dynamicRows: [],
  captures: [],
  assertions: [],
  residuals: [],
};

const log = (message) => console.log(`=> [visual-sweep] ${message}`);

function safeName(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}

async function shellValue(args) {
  const { spawn } = await import('node:child_process');
  return await new Promise((resolve) => {
    const child = spawn(args[0], args.slice(1), { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk.toString(); });
    child.on('close', () => resolve(out.trim()));
  });
}

async function loadFeatureRows() {
  const file = await fs.readFile('RIZZOMA_FEATURES_STATUS.md', 'utf8');
  const start = file.indexOf('## Comprehensive Feature Comparison');
  if (start < 0) return;

  let section = '';
  for (const line of file.slice(start).split('\n')) {
    if (line.startsWith('### ')) {
      section = line.replace(/^###\s+\d+\.\s*/, '').trim();
    }
    if (!line.startsWith('|') || line.includes('Functionality') || line.includes('---')) continue;
    const parts = line.slice(1, -1).split('|').map((part) => part.trim());
    if (parts.length < 4) continue;
    const row = {
      section,
      functionality: parts[0],
      status: parts[1],
      screenshotValid: visualSectionPrefixes.some((prefix) => section.startsWith(prefix)),
      dynamicCandidate: false,
    };
    row.dynamicCandidate = row.screenshotValid && dynamicPattern.test(row.functionality);
    manifest.documentedRows.push(row);
    if (row.screenshotValid) manifest.visualRows.push(row);
    if (row.dynamicCandidate) manifest.dynamicRows.push(row);
  }
}

async function capture(page, label, featureRefs, assertion, options = {}) {
  await fs.mkdir(outDir, { recursive: true });
  const fileName = `${String(manifest.captures.length + 1).padStart(3, '0')}-${safeName(label)}.png`;
  const filePath = path.join(outDir, fileName);
  await page.screenshot({ path: filePath, fullPage: options.fullPage !== false });
  const entry = {
    id: safeName(label),
    label,
    file: path.relative(process.cwd(), filePath),
    featureRefs,
    assertion,
    dynamicStep: options.dynamicStep || null,
  };
  manifest.captures.push(entry);
  log(`Captured ${entry.file}`);
  return entry;
}

async function waitForAny(page, selectors, timeout = 10000) {
  await Promise.race(selectors.map((selector) => page.locator(selector).first().waitFor({ timeout })));
}

async function writeManifest() {
  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const lines = [
    '# Rizzoma Visual Feature Sweep',
    '',
    `- Generated: ${manifest.generatedAt}`,
    `- Base URL: ${manifest.baseUrl}`,
    `- Branch: ${manifest.branch || 'unknown'}`,
    `- Commit: ${manifest.commit || 'unknown'}`,
    `- Documented rows parsed: ${manifest.documentedRows.length}`,
    `- Screenshot-valid rows: ${manifest.visualRows.length}`,
    `- Dynamic candidate rows: ${manifest.dynamicRows.length}`,
    `- Captures: ${manifest.captures.length}`,
    '',
    '## Captures',
    '',
  ];
  for (const captureEntry of manifest.captures) {
    lines.push(`- ${captureEntry.label}`);
    lines.push(`  - File: ${captureEntry.file}`);
    lines.push(`  - Assertion: ${captureEntry.assertion}`);
    if (captureEntry.featureRefs?.length) lines.push(`  - Feature refs: ${captureEntry.featureRefs.join('; ')}`);
  }
  if (manifest.residuals.length) {
    lines.push('', '## Residuals', '');
    for (const residual of manifest.residuals) lines.push(`- ${residual}`);
  }
  await fs.writeFile(path.join(outDir, 'manifest.md'), `${lines.join('\n')}\n`);
}

async function gotoApp(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
}

async function getXsrfToken(page) {
  const token = await page.evaluate(() => {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    return raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
  });
  if (!token) throw new Error('Missing XSRF token');
  return token;
}

async function ensureAuth(page, email, label) {
  log(`${label}: authenticating ${email}`);
  await gotoApp(page);
  const result = await page.evaluate(async ({ email, password }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith('XSRF-TOKEN='));
    const csrf = raw ? decodeURIComponent(raw.split('=')[1] || '') : '';
    const headers = { 'content-type': 'application/json', 'x-csrf-token': csrf };
    const login = await fetch('/api/auth/login', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (login.ok) return { ok: true, method: 'login' };
    const register = await fetch('/api/auth/register', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ email, password, name: email.split('@')[0] }),
    });
    if (register.ok) return { ok: true, method: 'register' };
    return { ok: false, status: register.status, text: await register.text() };
  }, { email, password });
  if (!result.ok) throw new Error(`${label} auth failed: ${result.status} ${result.text}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-layout').waitFor({ timeout: 20000 });
}

async function api(page, method, apiPath, body) {
  const token = await getXsrfToken(page);
  const result = await page.evaluate(async ({ method, apiPath, body, token }) => {
    const resp = await fetch(apiPath, {
      method,
      headers: { 'content-type': 'application/json', 'x-csrf-token': token },
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await resp.json(); } catch { data = await resp.text(); }
    return { ok: resp.ok, status: resp.status, data };
  }, { method, apiPath, body, token });
  if (!result.ok) throw new Error(`${method} ${apiPath} failed ${result.status}: ${JSON.stringify(result.data)}`);
  return result.data;
}

async function apiRetry(page, method, apiPath, body, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await api(page, method, apiPath, body);
    } catch (error) {
      lastError = error;
      if (!String(error.message || error).includes('409') || attempt === attempts) break;
      await page.waitForTimeout(300 * attempt);
    }
  }
  throw lastError;
}

async function focusEditorWithoutPointer(editor) {
  await editor.evaluate((node) => {
    const el = node;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
}

async function createFixture(page) {
  const title = `Visual Sweep ${stamp}`;
  const wave = await api(page, 'POST', '/api/topics', {
    title,
    content: `<h1>${title}</h1><p>Visual sweep topic root with @mention, ~task, #tag, and inline marker below.</p>`,
  });
  const waveId = wave.id;
  const mainBlip = await api(page, 'POST', '/api/blips', {
    waveId,
    parentId: null,
    content: '<p>Main sweep blip for toolbar, comments, history, uploads, and gear menu.</p>',
  });
  const mainBlipId = mainBlip.id || mainBlip.blip?._id || mainBlip.blip?.id;
  const childBlip = await api(page, 'POST', '/api/blips', {
    waveId,
    parentId: mainBlipId,
    content: '<p>Nested reply child with collapsed label and expandable body.</p>',
  });
  const childBlipId = childBlip.id || childBlip.blip?._id || childBlip.blip?.id;
  const inlineBlip = await api(page, 'POST', '/api/blips', {
    waveId,
    parentId: null,
    anchorPosition: 8,
    content: '<p>Inline child body created for dynamic BLB expansion.</p>',
  });
  const inlineBlipId = inlineBlip.id || inlineBlip.blip?._id || inlineBlip.blip?.id;
  const marker = `<span class="blip-thread-marker has-unread" data-blip-thread="${inlineBlipId}">+</span>`;
  await apiRetry(page, 'PATCH', `/api/topics/${encodeURIComponent(waveId)}`, {
    content: `<h1>${title}</h1><p>Inline ${marker} marker with @mention, ~task, and #tag evidence.</p>`,
  });
  await api(page, 'POST', '/api/comments', {
    blipId: mainBlipId,
    content: 'Inline comment evidence for sweep.',
    range: { start: 0, end: 10, text: 'Main sweep' },
  });
  await apiRetry(page, 'PUT', `/api/blips/${encodeURIComponent(mainBlipId)}`, {
    content: '<p>Main sweep blip history version one.</p>',
  });
  await apiRetry(page, 'PUT', `/api/blips/${encodeURIComponent(mainBlipId)}`, {
    content: '<p>Main sweep blip history version two with changed text.</p>',
  });
  return { waveId, title, mainBlipId, childBlipId, inlineBlipId };
}

async function openWave(page, waveId) {
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${encodeURIComponent(waveId)}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 30000 });
  await page.locator('.blip-collapsed-row, [data-blip-id]').first().waitFor({ timeout: 30000 });
}

async function clickText(page, text, options = {}) {
  await page.getByText(text, { exact: options.exact ?? false }).first().click({ timeout: options.timeout || 10000 });
}

async function closeOpenModal(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.getByRole('button', { name: /^Close$/ }).first().click({ timeout: 2000 }).catch(() => {});
  const closeTargets = [
    '.modal-close',
    '.btn-cancel',
    '.modal-footer button:has-text("Cancel")',
    '.modal-footer button:has-text("Close")',
    '.export-modal-close',
    '.history-modal-close',
    '.wave-playback-close',
    '.history-modal button:has-text("Close")',
    '.export-modal-overlay',
    '.modal-overlay',
    '.history-modal-overlay',
  ];
  for (const selector of closeTargets) {
    const target = page.locator(selector).first();
    if (await target.count()) {
      await target.click({ timeout: 3000, position: { x: 8, y: 8 } }).catch(() => {});
      await page.waitForTimeout(200);
    }
    if (!(await page.locator('.modal-overlay, .export-modal-overlay').count())) return;
  }
}

async function closeTransientEditorOverlays(page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.mouse.click(1240, 850).catch(() => {});
  await page.waitForTimeout(200);
}

async function captureNavigationTabs(page) {
  await clickText(page, 'Topics');
  await capture(page, 'nav topics tab and searchable topic list', ['User Interface: Navigation panel', 'User Interface: Topics list', 'Waves: wave list'], 'Topics tab is active and searchable topic cards are visible.');
  const search = page.locator('input[placeholder="Search topics..."]').first();
  await search.fill('Visual Sweep');
  await capture(page, 'topics search filter typed', ['Search: topic search', 'User Interface: Topics list search'], 'Search input accepts text and filters visible topic list state.', { dynamicStep: 'after-search' });
  await search.fill('');
  for (const label of ['Mentions', 'Tasks', 'Publics', 'Store', 'Teams']) {
    await clickText(page, label);
    await page.waitForTimeout(400);
    await capture(page, `nav ${label.toLowerCase()} tab`, [`User Interface: ${label} tab`], `${label} navigation tab opens its dedicated panel.`, { dynamicStep: 'after-tab-click' });
  }
  await clickText(page, 'Topics');
}

async function captureTopicChrome(page) {
  await page.locator('.new-button').click();
  await page.locator('.modal-content, .create-topic-modal').first().waitFor({ timeout: 10000 }).catch(() => {});
  await capture(page, 'create topic modal open', ['Waves: create topic', 'User Interface: New topic modal'], 'New topic action opens the create topic modal.', { dynamicStep: 'after-new-click' });
  await closeOpenModal(page);

  await page.locator('.invite-btn').click();
  await capture(page, 'invite participants modal open', ['User Interface: Participants bar', 'Email: invite emails'], 'Invite button opens participant invitation modal.', { dynamicStep: 'after-invite-click' });
  const inviteEmail = page.locator('input[type="email"], input[placeholder*="email" i]').first();
  if (await inviteEmail.count()) {
    await inviteEmail.fill(observerEmail);
    await capture(page, 'invite participants modal filled email', ['Email: invite emails', 'Authentication: participant invite form'], 'Invite modal accepts an email recipient before sending.', { dynamicStep: 'after-invite-email-fill' });
  }
  await closeOpenModal(page);

  await page.locator('.share-btn').click();
  await capture(page, 'share settings modal open', ['User Interface: Share modal', 'Authentication: share permissions'], 'Share button opens share settings modal with privacy choices.', { dynamicStep: 'after-share-click' });
  const shareChoice = page.getByText(/public|anyone|private|link/i).first();
  if (await shareChoice.count()) {
    await shareChoice.click({ timeout: 3000 }).catch(() => {});
    await capture(page, 'share settings option selected', ['User Interface: Share modal', 'Authentication: share permissions'], 'Share settings modal exposes selectable access-state controls.', { dynamicStep: 'after-share-option-click' });
  }
  await closeOpenModal(page);

  await page.locator('.topic-collab-toolbar .gear-btn').click();
  await capture(page, 'topic gear dropdown open', ['Blip Operations: gear dropdown menu', 'User Interface: topic settings'], 'Topic gear menu opens and exposes read/follow/export/embed/playback actions.', { dynamicStep: 'after-gear-click' });
  await clickText(page, 'Export topic');
  await capture(page, 'export topic modal open', ['History: export topic', 'User Interface: export modal'], 'Export topic action opens format-selection modal.', { dynamicStep: 'after-export-click' });
  await closeOpenModal(page);

  await page.locator('.topic-collab-toolbar .gear-btn').click();
  await clickText(page, 'Wave Timeline');
  await page.waitForTimeout(800);
  await capture(page, 'wave timeline playback modal open', ['History & Playback: wave timeline', 'Blip Operations: playback history'], 'Wave Timeline opens playback modal with controls/timeline.', { dynamicStep: 'after-wave-timeline-click' });
  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('.wave-playback-close, .modal-close').first().click({ timeout: 3000 }).catch(() => {});
}

async function captureBlipAndToolbarStates(page, fixture) {
  await capture(page, 'topic landing collapsed blb toc', ['BLB: Collapsed TOC', 'Waves: topic view'], 'Landing view shows label-only BLB rows and topic chrome.');
  const main = page.locator(`[data-blip-id="${fixture.mainBlipId}"]`).first();
  await main.locator('.blip-collapsed-row').click();
  await main.locator('[data-testid="blip-menu-read-surface"]').waitFor({ timeout: 10000 });
  await capture(page, 'expanded blip read toolbar', ['BLB: section expanded', 'Rich Text: read mode toolbar'], 'Clicking a collapsed blip expands it and shows the read toolbar.', { dynamicStep: 'after-expand' });

  await main.locator('[data-testid="blip-menu-gear-toggle"]').click();
  await capture(page, 'read gear menu open', ['Blip Operations: gear dropdown', 'Blip Operations: copy/paste/history/delete variants'], 'Read toolbar gear opens copy/comment/history/paste/link actions.', { dynamicStep: 'after-read-gear-click' });
  await main.locator('[data-testid="blip-menu-gear-toggle"]').click().catch(() => {});

  await main.locator('[data-testid="blip-menu-edit"]').click();
  await main.locator('[data-testid="blip-menu-edit-surface"]').waitFor({ timeout: 10000 });
  await capture(page, 'edit toolbar full rich text controls', ['Rich Text: edit toolbar', 'Rich Text: formatting controls', 'File Uploads: upload buttons'], 'Edit action switches the blip into full rich-text toolbar state.', { dynamicStep: 'after-edit-click' });

  await main.locator('[data-testid="blip-menu-overflow-toggle"]').click();
  await capture(page, 'edit overflow menu open', ['Blip Operations: edit overflow menu', 'Blip Operations: paste/copy variants'], 'Edit overflow exposes send, copy, playback, paste, link, and destructive actions.', { dynamicStep: 'after-edit-overflow-click' });
  await main.locator('[data-testid="blip-menu-overflow-toggle"]').click().catch(() => {});

  await main.locator('[data-testid="blip-menu-emoji"]').click();
  await capture(page, 'emoji picker open', ['Rich Text: emoji picker', 'Inline Widgets: emoji insertion'], 'Emoji toolbar control opens picker UI.', { dynamicStep: 'after-emoji-click' });
  await page.keyboard.press('Escape').catch(() => {});

  const editor = main.locator('.ProseMirror').first();
  await focusEditorWithoutPointer(editor);
  await page.keyboard.type(' @');
  await capture(page, 'mention autocomplete active', ['Rich Text: mentions autocomplete', 'Inline Widgets: @mention pill'], 'Typing @ in edit mode opens or primes mention autocomplete state.', { dynamicStep: 'after-mention-trigger' });
  await page.keyboard.type(' ~');
  await capture(page, 'task trigger typed', ['Rich Text: task trigger', 'Inline Widgets: task styling'], 'Typing ~ in edit mode exercises task insertion trigger path.', { dynamicStep: 'after-task-trigger' });
  await page.keyboard.type(' #');
  await capture(page, 'tag trigger typed', ['Rich Text: tag trigger', 'Inline Widgets: tag styling'], 'Typing # in edit mode exercises tag insertion trigger path.', { dynamicStep: 'after-tag-trigger' });
  await page.getByText('#todo', { exact: true }).first().click({ timeout: 2000 }).catch(() => {});
  await closeTransientEditorOverlays(page);

  await page.locator('.gadget-btn').first().click();
  await capture(page, 'right panel gadget palette open', ['Rich Text: gadget palette', 'Inline Widgets: gadget insert shortcuts'], 'Right panel Gadgets button opens the gadget palette.', { dynamicStep: 'after-gadgets-click' });
  await page.locator('.gadget-palette-close').click().catch(() => {});

  await main.locator('[data-testid="blip-menu-done"]').click();
  await main.locator('[data-testid="blip-menu-read-surface"]').waitFor({ timeout: 10000 });
  await capture(page, 'done returns to read toolbar', ['Rich Text: Done action', 'Blip Operations: edit persistence'], 'Done exits edit mode and restores read toolbar.', { dynamicStep: 'after-done-click' });

  await main.locator('[data-testid="blip-menu-comments-show"], [data-testid="blip-menu-comments-hide"]').first().click().catch(() => {});
  await page.waitForTimeout(800);
  await capture(page, 'inline comments nav state', ['Inline Comments: sidebar/nav', 'Inline Comments: filters'], 'Inline comments control surfaces the comment navigation/filter area when available.', { dynamicStep: 'after-comments-toggle' });

  await main.locator('[data-testid="blip-menu-gear-toggle"]').click();
  await clickText(page, 'Playback history');
  await page.waitForTimeout(800);
  await capture(page, 'per blip playback history modal', ['History & Playback: per-blip playback', 'Blip Operations: playback history'], 'Playback history action opens per-blip timeline modal when history exists.', { dynamicStep: 'after-history-click' });
  await closeOpenModal(page);
  await page.locator('.modal-overlay, .history-modal-overlay, .export-modal-overlay').first().waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
}

async function enterMainBlipEdit(page, fixture) {
  const main = page.locator(`[data-blip-id="${fixture.mainBlipId}"]`).first();
  await main.locator('.blip-collapsed-row').click({ timeout: 5000 }).catch(() => {});
  if (!(await main.locator('[data-testid="blip-menu-edit-surface"]').first().count())) {
    await main.locator('[data-testid="blip-menu-read-surface"]').first().waitFor({ timeout: 10000 });
    await main.locator('[data-testid="blip-menu-edit"]').first().click();
  }
  await main.locator('[data-testid="blip-menu-edit-surface"]').first().waitFor({ timeout: 10000 });
  const editor = main.locator('.ProseMirror').first();
  await editor.waitFor({ timeout: 10000 });
  await focusEditorWithoutPointer(editor);
  return { main, editor };
}

async function captureRealtimeCollaborationStates(baseContext, ownerPage, fixture) {
  const observerContext = await baseContext.browser().newContext({ viewport: { width: 1400, height: 900 } });
  const observerPage = await observerContext.newPage();
  try {
    await ensureAuth(observerPage, observerEmail, 'observer');
    await api(ownerPage, 'POST', `/api/waves/${encodeURIComponent(fixture.waveId)}/participants`, {
      emails: [observerEmail],
      message: 'Visual sweep realtime collaboration fixture.',
    }).catch(() => {});
    await openWave(ownerPage, fixture.waveId);
    await openWave(observerPage, fixture.waveId);

    const ownerEdit = await enterMainBlipEdit(ownerPage, fixture);
    const observerEdit = await enterMainBlipEdit(observerPage, fixture);

    await focusEditorWithoutPointer(ownerEdit.editor);
    await focusEditorWithoutPointer(observerEdit.editor);
    await observerPage.keyboard.type(' remote typing evidence', { delay: 45 });

    await ownerPage.locator('.collaboration-cursor, .typing-indicator').first().waitFor({ timeout: 8000 });
    await capture(
      ownerPage,
      'real time cursor and typing indicator visible',
      ['Real-time Collaboration: live cursors', 'Real-time Collaboration: typing indicators'],
      'A second authenticated editor produces remote cursor/typing UI in the owner editor.',
      { dynamicStep: 'after-second-client-typing' },
    );

    await ownerEdit.main.locator('[data-testid="blip-menu-done"]').click().catch(() => {});
  } catch (error) {
    manifest.residuals.push(`Realtime cursor/typing screenshot was not captured: ${error.message}`);
  } finally {
    await observerContext.close();
  }
}

async function captureBlbDynamics(page, fixture) {
  await closeOpenModal(page);
  await closeTransientEditorOverlays(page);
  const marker = page.locator(`[data-blip-thread="${fixture.inlineBlipId}"]`).first();
  if (await marker.count()) {
    await capture(page, 'inline marker before click', ['BLB: inline plus marker before', 'BLB: marker styling'], 'Inline [+] marker is visible before expansion.');
    await marker.click({ force: true });
    await page.waitForTimeout(700);
    await capture(page, 'inline marker after click expanded', ['BLB: inline expansion', 'BLB: portal rendering'], 'Clicking inline marker expands the inline child at the marker position.', { dynamicStep: 'after-inline-plus-click' });
  } else {
    manifest.residuals.push('Inline marker was not found during sweep; BLB inline expansion screenshot not captured.');
  }
  await page.locator('.fold-btn').first().click();
  await page.waitForTimeout(400);
  await capture(page, 'fold all after hide replies', ['BLB: fold all', 'BLB: hide replies'], 'Fold control collapses/hides reply bodies.', { dynamicStep: 'after-fold-click' });
  await page.locator('.fold-btn').nth(1).click();
  await page.waitForTimeout(400);
  await capture(page, 'unfold all after show replies', ['BLB: unfold all', 'BLB: show replies'], 'Unfold control restores reply visibility.', { dynamicStep: 'after-unfold-click' });
}

async function captureRightPanel(page) {
  await page.locator('.view-btn[title="Text view"]').click();
  await capture(page, 'right panel text view selected', ['User Interface: Text view toggle'], 'Text view is selected in the right tools panel.', { dynamicStep: 'after-text-view-click' });
  await page.locator('.view-btn[title="Mind map"]').click();
  await capture(page, 'right panel mind map selected', ['User Interface: Mind map toggle'], 'Mind map button can be selected in the right tools panel.', { dynamicStep: 'after-mindmap-click' });
  await page.locator('.display-btn[title="Short view"]').click();
  await capture(page, 'right panel short mode selected', ['User Interface: short display mode'], 'Short display mode toggle activates.', { dynamicStep: 'after-short-click' });
  await page.locator('.display-btn[title="Expanded view"]').click();
  await capture(page, 'right panel expanded mode selected', ['User Interface: expanded display mode'], 'Expanded display mode toggle activates.', { dynamicStep: 'after-expanded-click' });
}

async function captureToastState(page) {
  await closeOpenModal(page);
  await closeTransientEditorOverlays(page);
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('toast', {
      detail: { message: 'Toast evidence', type: 'info' },
    }));
  });
  await page.waitForTimeout(400);
  if (await page.locator('[data-testid="toast"], .toast, [role="status"], [aria-live="polite"]').count()) {
    await capture(page, 'toast notification component visible', ['User Interface: Toast notifications'], 'Toast component renders a visible status notification when the app emits a toast event.', { dynamicStep: 'after-toast-event' });
  } else {
    manifest.residuals.push('Toast/status notification was not visible after dispatching the app toast event.');
  }
  await closeTransientEditorOverlays(page);
}

async function captureMobile(baseContext, fixture) {
  const mobileContext = await baseContext.browser().newContext({ ...devices['Pixel 5'] });
  const mobile = await mobileContext.newPage();
  await ensureAuth(mobile, ownerEmail, 'mobile owner');
  await mobile.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForAny(mobile, ['.rizzoma-layout', '.topic-card', '.mobile-topbar'], 20000).catch(() => {});
  await capture(mobile, 'mobile authenticated topic navigation', ['Mobile & PWA: responsive layout', 'Mobile & PWA: mobile navigation'], 'Mobile viewport renders the authenticated navigation shell and topic area without horizontal overflow.');

  const ownTopicCard = mobile.locator('.search-result-item', { hasText: `Visual Sweep ${stamp}` }).first();
  if (await ownTopicCard.count()) {
    await ownTopicCard.click({ timeout: 5000 }).catch(() => {});
  } else {
    await mobile.goto(`${baseUrl}/?layout=rizzoma#/topic/${encodeURIComponent(fixture.waveId)}`, { waitUntil: 'domcontentloaded' });
  }
  await waitForAny(mobile, ['.mobile-view-content .rizzoma-topic-detail', '.mobile-header', '.blip-collapsed-row', 'text=Visual Sweep'], 45000).catch(() => {});
  await mobile.locator('.mobile-view-content .rizzoma-loading, .mobile-view-content .loading').first().waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  const stillLoading = await mobile.locator('body').evaluate((body) => body.innerText.includes('Loading...') && !body.innerText.includes('Visual Sweep')).catch(() => true);
  if (stillLoading) {
    manifest.residuals.push('Mobile deep-link topic route remained on Loading; captured authenticated mobile navigation instead of topic body.');
  } else {
    await capture(mobile, 'mobile topic content view', ['Mobile & PWA: responsive layout', 'Mobile & PWA: mobile topic view'], 'Mobile viewport renders topic content without horizontal overflow and uses mobile layout classes.');
  }
  await mobile.close();
  await mobileContext.close();
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  manifest.branch = await shellValue(['git', 'branch', '--show-current']);
  manifest.commit = await shellValue(['git', 'rev-parse', '--short', 'HEAD']);
  await loadFeatureRows();

  const browser = await chromium.launch({ headless, slowMo });
  const loggedOut = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const loggedOutPage = await loggedOut.newPage();
  await gotoApp(loggedOutPage);
  await capture(loggedOutPage, 'logged out sign in form', ['Authentication: login modal', 'Authentication: email login', 'Authentication: OAuth buttons'], 'Unauthenticated session shows OAuth and email sign-in entry points.');
  const signUp = loggedOutPage.getByText('Sign up', { exact: false }).first();
  if (await signUp.count()) {
    await signUp.click();
    await loggedOutPage.waitForTimeout(500);
    await capture(loggedOutPage, 'logged out sign up form', ['Authentication: registration entry', 'Authentication: signup form'], 'Sign-up link opens the registration form state.', { dynamicStep: 'after-signup-click' });
  }
  await loggedOut.close();

  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  await ensureAuth(page, ownerEmail, 'owner');
  const fixture = await createFixture(page);
  await openWave(page, fixture.waveId);

  await captureNavigationTabs(page);
  await openWave(page, fixture.waveId);
  await captureTopicChrome(page);
  await openWave(page, fixture.waveId);
  await captureBlipAndToolbarStates(page, fixture);
  await captureBlbDynamics(page, fixture);
  await captureRightPanel(page);
  await captureMobile(context, fixture);
  await captureToastState(page);
  await captureRealtimeCollaborationStates(context, page, fixture);

  await browser.close();

  manifest.assertions.push(`Parsed ${manifest.visualRows.length} screenshot-valid rows and ${manifest.dynamicRows.length} dynamic candidates from RIZZOMA_FEATURES_STATUS.md.`);
  manifest.assertions.push(`Captured ${manifest.captures.length} fresh screenshots in ${outDir}.`);
  await writeManifest();
  log(`Manifest written to ${path.join(outDir, 'manifest.md')}`);
}

main().catch(async (error) => {
  manifest.residuals.push(`Sweep aborted: ${error.message}`);
  try { await writeManifest(); } catch {}
  console.error(error);
  process.exit(1);
});
