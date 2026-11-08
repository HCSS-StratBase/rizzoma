#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'https://138-201-62-161.nip.io';
const storageState = process.env.RIZZOMA_STORAGE_STATE
  || path.resolve('.claude/state/acceptance-owner-storage.json');
const draftPath = process.env.RIZZOMA_BLB_DRAFT
  || path.resolve('.claude/state/rz-status-public-demonstration-draft.json');
const outputDir = path.resolve(process.argv[2] || 'screenshots/260713-public-blb-creation-failure');
const topicTitle = process.env.RIZZOMA_TOPIC_TITLE
  || 'Rizzoma modernization reality check — core BLB failure — 2026-07-13';
const replyLabel = 'What we have actually achieved';

fs.mkdirSync(outputDir, { recursive: true });

const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
const lines = draft.bullets.map((bullet) => bullet.text);
const browserErrors = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState,
  viewport: { width: 1366, height: 900 },
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();

page.on('console', (message) => {
  if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));

const screenshot = async (name) => {
  await page.screenshot({ path: path.join(outputDir, name), fullPage: false });
};

const editorShape = async (locator) => locator.evaluate((element) => ({
  html: element.innerHTML,
  topLevelTags: Array.from(element.children).map((child) => child.tagName),
  bulletLists: element.querySelectorAll('ul').length,
  listItems: element.querySelectorAll('li').length,
  paragraphs: element.querySelectorAll('p').length,
  headings: element.querySelectorAll('h1,h2,h3').length,
}));

try {
  await page.goto(`${baseUrl}/#/topics?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  await page.locator('.new-button').waitFor({ timeout: 30_000 });

  const authStatus = await page.evaluate(async () => {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    return response.status;
  });
  if (authStatus !== 200) throw new Error(`stored owner session is not authenticated (${authStatus})`);

  let topicId = await page.evaluate(async (title) => {
    const response = await fetch('/api/topics', { credentials: 'include' });
    const data = await response.json().catch(() => null);
    const topics = Array.isArray(data) ? data : (data?.topics || data?.data || []);
    return topics.find((topic) => topic.title === title)?.id || null;
  }, topicTitle);

  if (!topicId) {
    await page.locator('.new-button').click();
    await page.locator('#topic-title').fill(topicTitle);
    await screenshot('01-create-topic-real-control.png');
    await page.getByRole('button', { name: 'Create Topic', exact: true }).click();
    await page.waitForURL(/#\/topic\/[a-f0-9]{32}/, { timeout: 30_000 });
    topicId = page.url().match(/#\/topic\/([a-f0-9]{32})/)?.[1] || null;
  } else {
    await page.goto(`${baseUrl}/#/topic/${topicId}?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  }
  if (!topicId) throw new Error(`could not determine topic id from ${page.url()}`);
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1_000);
  const topicUrl = `${baseUrl}/#/topic/${topicId}?layout=rizzoma`;

  const initialTopicHtml = await page.locator('.topic-content-view').first().innerHTML();
  await screenshot('02-new-topic-h1-only.png');

  let reply = page.locator('.topic-blip-children .rizzoma-blip', {
    hasText: /What we have actually achieved|Claude protocol followed/,
  }).last();
  if (await reply.count() === 0) {
    const rootReplyInput = page.locator('.write-reply-input').first();
    await rootReplyInput.fill(replyLabel);
    await rootReplyInput.press('Enter');
    reply = page.locator('.topic-blip-children .rizzoma-blip', { hasText: replyLabel }).last();
  }
  await reply.waitFor({ timeout: 20_000 });
  const replyId = await reply.getAttribute('data-blip-id');
  if (!replyId) throw new Error('created reply has no data-blip-id');
  reply = page.locator(`.rizzoma-blip[data-blip-id="${replyId}"]`).first();

  await reply.locator('.blip-collapsed-row').click();
  await reply.locator('[data-testid="blip-menu-read-surface"]').waitFor({ timeout: 20_000 });
  await screenshot('03-new-reply-flat-paragraph.png');

  await reply.locator('[data-testid="blip-menu-edit"]').click();
  const editor = reply.locator('.ProseMirror').first();
  await editor.waitFor({ timeout: 20_000 });
  const initialReplyShape = await editorShape(editor);

  await editor.focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  for (let index = 0; index < lines.length; index += 1) {
    await page.keyboard.insertText(lines[index]);
    if (index < lines.length - 1) await page.keyboard.press('Enter');
  }
  const typedReplyShape = await editorShape(editor);
  await screenshot('04-gated-spec-flattened-in-editor.png');

  await reply.locator('[data-testid="blip-menu-done"]').click();
  await page.waitForTimeout(2_000);
  await screenshot('05-gated-spec-flat-view.png');

  const storedBeforeReload = await page.evaluate(async ({ id }) => {
    const response = await fetch(`/api/blips/${encodeURIComponent(id)}`, { credentials: 'include' });
    return { status: response.status, data: await response.json().catch(() => null) };
  }, { id: replyId });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-topic-detail').waitFor({ timeout: 30_000 });
  const reloadedReply = page.locator(`.rizzoma-blip[data-blip-id="${replyId}"]`).first();
  await reloadedReply.waitFor({ timeout: 20_000 });
  const collapsed = reloadedReply.locator('.blip-collapsed-row');
  if (await collapsed.count()) await collapsed.click();
  await reloadedReply.locator('[data-testid="blip-menu-read-surface"]').waitFor({ timeout: 20_000 });
  await screenshot('06-flat-structure-persists-after-reload.png');

  await reloadedReply.locator('[data-testid="blip-menu-edit"]').click();
  const reloadedEditor = reloadedReply.locator('.ProseMirror').first();
  await reloadedEditor.waitFor({ timeout: 20_000 });
  const reloadedReplyShape = await editorShape(reloadedEditor);
  await screenshot('07-flat-structure-after-reload-editor.png');
  await reloadedReply.locator('[data-testid="blip-menu-done"]').click();

  const result = {
    result: initialReplyShape.bulletLists === 0
      && typedReplyShape.bulletLists === 0
      && reloadedReplyShape.bulletLists === 0
      ? 'FAIL_CONFIRMED'
      : 'CONTRACT_CHANGED',
    topicId,
    topicUrl,
    replyId,
    intendedBulletDepth: Math.max(...draft.bullets.map((bullet) => bullet.indent)),
    intendedBulletCount: draft.bullets.length,
    initialTopicHtml,
    initialReplyShape,
    typedReplyShape,
    reloadedReplyShape,
    storedStatus: storedBeforeReload.status,
    storedContent: storedBeforeReload.data?.content
      || storedBeforeReload.data?.blip?.content
      || null,
    browserErrors,
  };
  fs.writeFileSync(path.join(outputDir, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    result: result.result,
    topicUrl,
    intendedBulletCount: result.intendedBulletCount,
    intendedBulletDepth: result.intendedBulletDepth,
    initialTopicHtml,
    initialReplyShape,
    typedReplyShape,
    reloadedReplyShape,
    browserErrorCount: browserErrors.length,
  }, null, 2));
} finally {
  await browser.close();
}
