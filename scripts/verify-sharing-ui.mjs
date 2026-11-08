#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseUrl = process.env.RIZZOMA_UI_URL || 'http://127.0.0.1:4174';
const outputDir = process.env.RIZZOMA_UI_OUTPUT || 'screenshots/260712-122218-sharing-access-ui';
const widths = [1280, 1366, 1440, 1600];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const manifest = { baseUrl, outputDir, viewports: [] };

const json = (route, body, status = 200) => route.fulfill({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

for (const width of widths) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('rizzoma:calendarBannerDismissed', '1');
    localStorage.setItem('rizzoma:rightPaneCollapsed', '1');
  });
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path === '/api/auth/me') return json(route, { id: 'owner', email: 'owner@example.test', name: 'Owner' });
    if (path === '/api/auth/csrf') return json(route, { csrfToken: 'visual' });
    if (path === '/api/topics/topic-visual') {
      return json(route, {
        id: 'topic-visual',
        title: 'Sharing policy verification',
        content: '<p>Visual verification fixture for persisted topic access.</p>',
        authorId: 'owner',
        authorName: 'Owner',
        createdAt: 1,
        updatedAt: 2,
        sharing: { shareLevel: 'public', allowComments: true, allowEdits: false },
        permissions: { role: 'owner', canRead: true, canComment: true, canEdit: true, canManage: true },
      });
    }
    if (path === '/api/topics') {
      return json(route, { topics: [{ id: 'topic-visual', title: 'Sharing policy verification', authorId: 'owner', createdAt: 1, updatedAt: 2 }], hasMore: false });
    }
    if (path === '/api/waves/topic-visual/participants') {
      return json(route, { participants: [
        { id: 'p-owner', userId: 'owner', email: 'owner@example.test', role: 'owner', status: 'accepted' },
        { id: 'p-viewer', userId: 'viewer', email: 'viewer@example.test', role: 'viewer', status: 'accepted' },
      ] });
    }
    if (path === '/api/waves/topic-visual/sharing') {
      return json(route, {
        sharing: { shareLevel: 'public', allowComments: true, allowEdits: false },
        role: 'owner',
        canManage: true,
      });
    }
    if (path === '/api/blips') return json(route, { blips: [] });
    if (path.endsWith('/unread')) return json(route, { unread: [], total: 0, read: 0 });
    if (path.endsWith('/unread_counts')) return json(route, { counts: [] });
    if (path.includes('/comments')) return json(route, { comments: [] });
    if (path === '/api/mentions') return json(route, { mentions: [], unreadCount: 0, total: 0, hasMore: false });
    if (path === '/api/tasks') return json(route, { tasks: [], pendingCount: 0, completedCount: 0, total: 0, hasMore: false });
    return json(route, {});
  });

  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/topic-visual`, { waitUntil: 'domcontentloaded' });
  const shareButton = page.getByTitle('Share settings');
  await shareButton.waitFor({ state: 'visible' });
  await shareButton.click();
  const shareModal = page.locator('.modal-content');
  await shareModal.waitFor({ state: 'visible' });
  await page.locator('input[value="public"]').waitFor({ state: 'visible' });
  const sharePath = `${outputDir}/share-${width}.png`;
  await page.screenshot({ path: sharePath, fullPage: false });
  const shareBox = await shareModal.boundingBox();
  const publicChecked = await page.locator('input[value="public"]').isChecked();
  const saveEnabled = await page.getByRole('button', { name: 'Save Settings' }).isEnabled();

  await shareModal.locator('.close-btn').click();
  await page.getByTitle('Invite participants').click();
  const inviteModal = page.locator('.modal-content');
  await inviteModal.waitFor({ state: 'visible' });
  const roleSelect = page.locator('#invite-role');
  await roleSelect.waitFor({ state: 'visible' });
  const invitePath = `${outputDir}/invite-${width}.png`;
  await page.screenshot({ path: invitePath, fullPage: false });
  const inviteBox = await inviteModal.boundingBox();

  manifest.viewports.push({
    width,
    height: 900,
    sharePath,
    invitePath,
    shareBox,
    inviteBox,
    publicChecked,
    saveEnabled,
    inviteRole: await roleSelect.inputValue(),
  });
  await context.close();
}

await browser.close();
await writeFile(`${outputDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(manifest, null, 2));
