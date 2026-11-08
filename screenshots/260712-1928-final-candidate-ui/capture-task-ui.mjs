import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.RIZZOMA_CAPTURE_URL || 'http://127.0.0.1:4329';
const outputDir = path.resolve(
  process.env.RIZZOMA_CAPTURE_OUTPUT || 'screenshots/260712-1928-final-candidate-ui/tasks',
);
const viewports = [
  { label: '1280', width: 1280, height: 900 },
  { label: '1366', width: 1366, height: 900 },
  { label: '1440', width: 1440, height: 900 },
  { label: '1600', width: 1600, height: 900 },
  { label: 'mobile-390', width: 390, height: 844 },
];

const topicId = 'topic-task-visual';
const taskId = 'task:11111111-1111-4111-8111-111111111111';
const taskHtml = `<p>Release acceptance <span class="task-widget" data-task-widget="" data-task-id="${taskId}" data-assignee-id="owner" data-assignee="Owner">\u2610 Owner</span></p>`;
const manifest = [];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

const json = (route, body, status = 200, headers = {}) => route.fulfill({
  status,
  contentType: 'application/json',
  headers,
  body: JSON.stringify(body),
});

async function capture(viewport, mode) {
  const authenticated = mode === 'owner';
  let completed = true;
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const unexpectedConsoleErrors = [];
  const expectedConsoleErrors = [];

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (
      (!authenticated && text.includes('401 (Unauthorized)'))
      || text.includes('WebSocket connection to')
      || text.includes('[socket] connect_error')
    ) expectedConsoleErrors.push(text);
    else unexpectedConsoleErrors.push(text);
  });
  page.on('pageerror', (error) => unexpectedConsoleErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('rizzoma:calendarBannerDismissed', '1');
    localStorage.setItem('rizzoma:rightPaneCollapsed', '1');
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    if (pathname === '/api/auth/me') {
      if (authenticated) return json(route, { id: 'owner', email: 'owner@example.test', name: 'Owner' });
      return json(route, { error: 'unauthenticated' }, 401);
    }
    if (pathname === '/api/auth/oauth-status') {
      return json(route, { google: true, facebook: false, microsoft: false, twitter: false, saml: false });
    }
    if (pathname === '/api/auth/csrf') {
      return json(route, { csrfToken: 'visual' }, 200, { 'set-cookie': 'XSRF-TOKEN=visual; Path=/; SameSite=Lax' });
    }
    if (pathname === `/api/topics/${topicId}`) {
      return json(route, {
        id: topicId,
        title: 'Durable task acceptance',
        content: taskHtml,
        authorId: 'owner',
        authorName: 'Owner',
        createdAt: 1,
        updatedAt: 2,
        sharing: { shareLevel: 'public', allowComments: false, allowEdits: false },
        permissions: authenticated
          ? { role: 'owner', canRead: true, canComment: true, canEdit: true, canManage: true }
          : { role: 'viewer', canRead: true, canComment: false, canEdit: false, canManage: false },
      });
    }
    if (pathname === '/api/topics') {
      return json(route, {
        topics: [{ id: topicId, title: 'Durable task acceptance', authorId: 'owner', createdAt: 1, updatedAt: 2 }],
        hasMore: false,
      });
    }
    if (pathname === `/api/waves/${topicId}/participants`) {
      return json(route, { participants: [
        { id: 'p-owner', userId: 'owner', email: 'owner@example.test', name: 'Owner', role: 'owner', status: 'accepted' },
      ] });
    }
    if (pathname === `/api/waves/${topicId}/sharing`) {
      return json(route, {
        sharing: { shareLevel: 'public', allowComments: false, allowEdits: false },
        role: authenticated ? 'owner' : 'viewer',
        canManage: authenticated,
      });
    }
    if (pathname === `/api/tasks/by-blip/${topicId}`) {
      return json(route, { tasks: [{ id: taskId, isCompleted: completed, canToggle: authenticated }] });
    }
    if (pathname === `/api/tasks/${encodeURIComponent(taskId)}/toggle`) {
      completed = false;
      return json(route, { success: true, id: taskId, isCompleted: completed });
    }
    if (pathname === '/api/tasks') {
      return json(route, { tasks: [], pendingCount: 0, completedCount: 0, total: 0, hasMore: false });
    }
    if (pathname === '/api/mentions') {
      return json(route, { mentions: [], unreadCount: 0, total: 0, hasMore: false });
    }
    if (pathname === '/api/blips') return json(route, { blips: [] });
    if (pathname.endsWith('/unread')) return json(route, { unread: [], total: 0, read: 0 });
    if (pathname.endsWith('/unread_counts')) return json(route, { counts: [] });
    if (pathname.includes('/comments')) return json(route, { comments: [] });
    if (route.request().method() === 'PATCH') return json(route, { success: true });
    return json(route, {});
  });

  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  const task = page.locator('[data-task-widget]').first();
  await task.waitFor({ state: 'visible' });
  await page.waitForFunction(({ expectedRole }) => {
    const element = document.querySelector('[data-task-widget]');
    if (!element || !element.textContent?.includes('\u2611')) return false;
    return expectedRole ? element.getAttribute('role') === expectedRole : !element.hasAttribute('role');
  }, { expectedRole: authenticated ? 'button' : null });

  const beforeFile = `${mode}-${viewport.label}-checked.png`;
  await page.screenshot({ path: path.join(outputDir, beforeFile), fullPage: false });
  const before = await task.evaluate((element) => ({
    text: element.textContent,
    role: element.getAttribute('role'),
    tabIndex: element.getAttribute('tabindex'),
    className: element.className,
  }));
  const box = await task.boundingBox();
  const record = {
    mode,
    viewport,
    beforeFile,
    before,
    box,
    expectedConsoleErrors,
    unexpectedConsoleErrors,
  };

  if (authenticated) {
    await task.click();
    await page.waitForFunction(() => document.querySelector('[data-task-widget]')?.textContent?.includes('\u2610'));
    const toggledFile = `${mode}-${viewport.label}-confirmed-toggle.png`;
    await page.screenshot({ path: path.join(outputDir, toggledFile), fullPage: false });
    record.toggledFile = toggledFile;
    record.afterToggle = await task.evaluate((element) => ({
      text: element.textContent,
      role: element.getAttribute('role'),
      className: element.className,
    }));

    await page.getByTitle('Edit topic content').click();
    const editorTask = page.locator('.ProseMirror [data-task-widget]').first();
    await editorTask.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('.ProseMirror [data-task-widget]')?.textContent?.includes('\u2610'));
    const editFile = `${mode}-${viewport.label}-editor-handoff.png`;
    await page.screenshot({ path: path.join(outputDir, editFile), fullPage: false });
    record.editFile = editFile;
    record.editorText = await editorTask.textContent();
  }

  manifest.push(record);
  await context.close();
}

for (const viewport of viewports) {
  await capture(viewport, 'owner');
  await capture(viewport, 'public');
}

await browser.close();
await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const failures = manifest.flatMap((entry) => {
  const errors = entry.unexpectedConsoleErrors.map((error) => `${entry.mode}/${entry.viewport.label}: ${error}`);
  if (!entry.box || entry.box.x < 0 || entry.box.y < 0 || entry.box.x + entry.box.width > entry.viewport.width || entry.box.y + entry.box.height > entry.viewport.height) {
    errors.push(`${entry.mode}/${entry.viewport.label}: task outside viewport`);
  }
  if (entry.mode === 'owner' && (entry.before.role !== 'button' || !entry.editorText?.includes('\u2610'))) {
    errors.push(`${entry.mode}/${entry.viewport.label}: owner interaction/editor handoff failed`);
  }
  if (entry.mode === 'public' && (entry.before.role !== null || !entry.before.className.includes('task-readonly'))) {
    errors.push(`${entry.mode}/${entry.viewport.label}: public task exposed interactive semantics`);
  }
  return errors;
});
if (failures.length) throw new Error(failures.join('\n'));

console.log(JSON.stringify({ outputDir, captures: manifest.length, failures: 0 }));
