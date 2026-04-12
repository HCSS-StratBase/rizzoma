const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function login(page, base, email, password) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForTimeout(1500);
}

async function readCookie(page, name) {
  return page.evaluate((cookieName) => {
    const escaped = cookieName.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    return match && match[1] ? decodeURIComponent(match[1]) : undefined;
  }, name);
}

async function createTopic(page, title, content) {
  await page.evaluate(async () => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
  });
  const token = await readCookie(page, 'XSRF-TOKEN');
  return page.evaluate(async ({ topicTitle, topicContent, csrfToken }) => {
    const response = await fetch('/api/topics', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: JSON.stringify({ title: topicTitle, content: topicContent }),
    });
    return response.json();
  }, { topicTitle: title, topicContent: content, csrfToken: token });
}

async function createBlip(page, payload) {
  await page.evaluate(async () => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
  });
  const token = await readCookie(page, 'XSRF-TOKEN');
  return page.evaluate(async ({ body, csrfToken }) => {
    const response = await fetch('/api/blips', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: JSON.stringify(body),
    });
    return response.json();
  }, { body: payload, csrfToken: token });
}

async function markBlipRead(page, waveId, blipId) {
  await page.evaluate(async () => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
  });
  const token = await readCookie(page, 'XSRF-TOKEN');
  return page.evaluate(async ({ currentWaveId, currentBlipId, csrfToken }) => {
    const response = await fetch(`/api/waves/${encodeURIComponent(currentWaveId)}/blips/${encodeURIComponent(currentBlipId)}/read`, {
      method: 'POST',
      credentials: 'include',
      headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
    });
    return response.json();
  }, { currentWaveId: waveId, currentBlipId: blipId, csrfToken: token });
}

async function main() {
  const base = process.argv[2] || 'http://127.0.0.1:4196';
  const outDir = process.argv[3] || 'screenshots/260331-blb-parity';
  const mode = process.argv[4] || 'shell';

  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });
  let toolbarListBlipId = null;
  let toolbarInlineBlipId = null;

  await login(page, base, 'codex-live+1774803822194@example.com', 'CodexLive!1');

  const topic = await createTopic(
    page,
    `BLB Parity Probe ${Date.now()}`,
    [
      '<h1>BLB Parity Probe</h1>',
      '<p>Short onboarding topic stub to compare dense root-topic reading against legacy BLB screenshots.</p>',
      '<ul>',
      '<li><p>Section One - Overview<span data-blip-thread="probe:inline1" class="blip-thread-marker has-unread">+</span></p></li>',
      '<li><p>Section Two - Details</p>',
      '<ul>',
      '<li><p>Key context for the second section with one nested follow-up and a second inline marker<span data-blip-thread="probe:inline3" class="blip-thread-marker">+</span>.</p></li>',
      '<li><p>Secondary detail<span data-blip-thread="probe:inline2" class="blip-thread-marker">+</span></p></li>',
      '</ul>',
      '</li>',
      '<li><p>Section Three - Nested Example</p>',
      '<ul>',
      '<li><p>Sub-point A</p></li>',
      '<li><p>Sub-point B</p></li>',
      '</ul>',
      '</li>',
      '</ul>',
      '<p>Closing note: reply box should sit directly beneath the unified topic-root surface while unread cues stay crisp.</p>',
    ].join(''),
  );

  if (!topic?.id) {
    throw new Error(`topic create failed: ${JSON.stringify(topic)}`);
  }

  if (mode === 'inline') {
    const rootInline = await createBlip(page, {
      waveId: topic.id,
      parentId: null,
      anchorPosition: 58,
      content: '<p>Inline child thread content with its own nested marker target in the middle.</p>',
    });
    const rootInlineId = rootInline?.id || rootInline?.blip?.id || rootInline?.blip?._id;
    if (!rootInlineId) {
      throw new Error(`root inline blip create failed: ${JSON.stringify(rootInline)}`);
    }

    const nestedInline = await createBlip(page, {
      waveId: topic.id,
      parentId: rootInlineId,
      anchorPosition: 18,
      content: '<p>Nested inline child for BLB parity verification.</p>',
    });
    const nestedInlineId = nestedInline?.id || nestedInline?.blip?.id || nestedInline?.blip?._id;
    if (!nestedInlineId) {
      throw new Error(`nested inline blip create failed: ${JSON.stringify(nestedInline)}`);
    }
  }

  if (mode === 'mixed') {
    const listParent = await createBlip(page, {
      waveId: topic.id,
      parentId: null,
      content: '<p>List-thread parent reply with one nested collapsed child.</p>',
    });
    const listParentId = listParent?.id || listParent?.blip?.id || listParent?.blip?._id;
    if (!listParentId) {
      throw new Error(`list parent blip create failed: ${JSON.stringify(listParent)}`);
    }

    const listNested = await createBlip(page, {
      waveId: topic.id,
      parentId: listParentId,
      content: '<p>Nested list child under the reply thread.</p>',
    });
    const listNestedId = listNested?.id || listNested?.blip?.id || listNested?.blip?._id;
    if (!listNestedId) {
      throw new Error(`list nested blip create failed: ${JSON.stringify(listNested)}`);
    }

    const rootInline = await createBlip(page, {
      waveId: topic.id,
      parentId: null,
      anchorPosition: 58,
      content: '<p>Inline child thread content with its own nested marker target in the middle.</p>',
    });
    const rootInlineId = rootInline?.id || rootInline?.blip?.id || rootInline?.blip?._id;
    if (!rootInlineId) {
      throw new Error(`root inline blip create failed: ${JSON.stringify(rootInline)}`);
    }

    const nestedInline = await createBlip(page, {
      waveId: topic.id,
      parentId: rootInlineId,
      anchorPosition: 18,
      content: '<p>Nested inline child for BLB parity verification.</p>',
    });
    const nestedInlineId = nestedInline?.id || nestedInline?.blip?.id || nestedInline?.blip?._id;
    if (!nestedInlineId) {
      throw new Error(`nested inline blip create failed: ${JSON.stringify(nestedInline)}`);
    }
  }

  if (mode === 'unread') {
    const listParent = await createBlip(page, {
      waveId: topic.id,
      parentId: null,
      content: '<p>List-thread parent reply kept read, but with one unread nested child.</p>',
    });
    const listParentId = listParent?.id || listParent?.blip?.id || listParent?.blip?._id;
    if (!listParentId) {
      throw new Error(`list parent blip create failed: ${JSON.stringify(listParent)}`);
    }

    const listNested = await createBlip(page, {
      waveId: topic.id,
      parentId: listParentId,
      content: '<p>Unread nested list child under the reply thread.</p>',
    });
    const listNestedId = listNested?.id || listNested?.blip?.id || listNested?.blip?._id;
    if (!listNestedId) {
      throw new Error(`list nested blip create failed: ${JSON.stringify(listNested)}`);
    }

    const rootInlineUnread = await createBlip(page, {
      waveId: topic.id,
      parentId: null,
      anchorPosition: 58,
      content: '<p>Unread inline child thread content with one read nested inline child.</p>',
    });
    const rootInlineUnreadId = rootInlineUnread?.id || rootInlineUnread?.blip?.id || rootInlineUnread?.blip?._id;
    if (!rootInlineUnreadId) {
      throw new Error(`root unread inline blip create failed: ${JSON.stringify(rootInlineUnread)}`);
    }

    const nestedInlineRead = await createBlip(page, {
      waveId: topic.id,
      parentId: rootInlineUnreadId,
      anchorPosition: 18,
      content: '<p>Nested inline child that should render as read.</p>',
    });
    const nestedInlineReadId = nestedInlineRead?.id || nestedInlineRead?.blip?.id || nestedInlineRead?.blip?._id;
    if (!nestedInlineReadId) {
      throw new Error(`nested inline read blip create failed: ${JSON.stringify(nestedInlineRead)}`);
    }

    const rootInlineRead = await createBlip(page, {
      waveId: topic.id,
      parentId: null,
      anchorPosition: 138,
      content: '<p>Read inline child used to keep the second marker neutral.</p>',
    });
    const rootInlineReadId = rootInlineRead?.id || rootInlineRead?.blip?.id || rootInlineRead?.blip?._id;
    if (!rootInlineReadId) {
      throw new Error(`root read inline blip create failed: ${JSON.stringify(rootInlineRead)}`);
    }

    const secondaryInlineRead = await createBlip(page, {
      waveId: topic.id,
      parentId: null,
      anchorPosition: 246,
      content: '<p>Read inline child anchored in the deeper list section.</p>',
    });
    const secondaryInlineReadId = secondaryInlineRead?.id || secondaryInlineRead?.blip?.id || secondaryInlineRead?.blip?._id;
    if (!secondaryInlineReadId) {
      throw new Error(`secondary read inline blip create failed: ${JSON.stringify(secondaryInlineRead)}`);
    }

    await markBlipRead(page, topic.id, listParentId);
    await markBlipRead(page, topic.id, nestedInlineReadId);
    await markBlipRead(page, topic.id, rootInlineReadId);
    await markBlipRead(page, topic.id, secondaryInlineReadId);
  }

  if (mode === 'toolbar') {
    const listExpandedParent = await createBlip(page, {
      waveId: topic.id,
      parentId: null,
      content: '<p>Expanded list-thread reply used to verify toolbar visibility on active non-inline blips.</p>',
    });
    const listExpandedParentId = listExpandedParent?.id || listExpandedParent?.blip?.id || listExpandedParent?.blip?._id;
    if (!listExpandedParentId) {
      throw new Error(`expanded list parent blip create failed: ${JSON.stringify(listExpandedParent)}`);
    }
    toolbarListBlipId = listExpandedParentId;

    const listExpandedNested = await createBlip(page, {
      waveId: topic.id,
      parentId: listExpandedParentId,
      content: '<p>Nested child under the expanded list-thread reply.</p>',
    });
    const listExpandedNestedId = listExpandedNested?.id || listExpandedNested?.blip?.id || listExpandedNested?.blip?._id;
    if (!listExpandedNestedId) {
      throw new Error(`expanded list nested blip create failed: ${JSON.stringify(listExpandedNested)}`);
    }

    const listCollapsedParent = await createBlip(page, {
      waveId: topic.id,
      parentId: null,
      content: '<p>Collapsed list-thread reply kept as the no-toolbar comparison row.</p>',
    });
    const listCollapsedParentId = listCollapsedParent?.id || listCollapsedParent?.blip?.id || listCollapsedParent?.blip?._id;
    if (!listCollapsedParentId) {
      throw new Error(`collapsed list parent blip create failed: ${JSON.stringify(listCollapsedParent)}`);
    }

    const listCollapsedNested = await createBlip(page, {
      waveId: topic.id,
      parentId: listCollapsedParentId,
      content: '<p>Nested child under the collapsed comparison reply.</p>',
    });
    const listCollapsedNestedId = listCollapsedNested?.id || listCollapsedNested?.blip?.id || listCollapsedNested?.blip?._id;
    if (!listCollapsedNestedId) {
      throw new Error(`collapsed list nested blip create failed: ${JSON.stringify(listCollapsedNested)}`);
    }

    const rootInlineToolbar = await createBlip(page, {
      waveId: topic.id,
      parentId: null,
      anchorPosition: 58,
      content: '<p>Inline child thread used to verify toolbar activation only after clicking into content.</p>',
    });
    const rootInlineToolbarId = rootInlineToolbar?.id || rootInlineToolbar?.blip?.id || rootInlineToolbar?.blip?._id;
    if (!rootInlineToolbarId) {
      throw new Error(`toolbar inline blip create failed: ${JSON.stringify(rootInlineToolbar)}`);
    }
    toolbarInlineBlipId = rootInlineToolbarId;

    const nestedInlineToolbar = await createBlip(page, {
      waveId: topic.id,
      parentId: rootInlineToolbarId,
      anchorPosition: 18,
      content: '<p>Nested inline child under the toolbar probe thread.</p>',
    });
    const nestedInlineToolbarId = nestedInlineToolbar?.id || nestedInlineToolbar?.blip?.id || nestedInlineToolbar?.blip?._id;
    if (!nestedInlineToolbarId) {
      throw new Error(`toolbar nested inline blip create failed: ${JSON.stringify(nestedInlineToolbar)}`);
    }

    const rootInlineRead = await createBlip(page, {
      waveId: topic.id,
      parentId: null,
      anchorPosition: 246,
      content: '<p>Read inline child used to keep the deeper marker neutral.</p>',
    });
    const rootInlineReadId = rootInlineRead?.id || rootInlineRead?.blip?.id || rootInlineRead?.blip?._id;
    if (!rootInlineReadId) {
      throw new Error(`toolbar read inline blip create failed: ${JSON.stringify(rootInlineRead)}`);
    }

    await markBlipRead(page, topic.id, listExpandedParentId);
    await markBlipRead(page, topic.id, listExpandedNestedId);
    await markBlipRead(page, topic.id, listCollapsedParentId);
    await markBlipRead(page, topic.id, nestedInlineToolbarId);
    await markBlipRead(page, topic.id, rootInlineReadId);
  }

  await page.goto(`${base}/#/topic/${topic.id}?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.wave-container .rizzoma-topic-detail', { timeout: 30000 });
  await page.waitForTimeout(1800);

  if (mode === 'inline' || mode === 'mixed' || mode === 'unread' || mode === 'toolbar') {
    const markers = page.locator('.wave-container .blip-thread-marker');
    await markers.first().click();
    await page.waitForTimeout(800);

    const nestedMarkers = page.locator('.wave-container .inline-child-expanded .blip-thread-marker');
    await nestedMarkers.first().click();
    await page.waitForTimeout(800);
  }

  if (mode === 'mixed' || mode === 'unread') {
    const collapsedRows = page.locator('.wave-container .child-blip-collapsed');
    if (await collapsedRows.count()) {
      await collapsedRows.first().click();
      await page.waitForTimeout(800);
    }
  }

  if (mode === 'unread' || mode === 'toolbar') {
    const inlineChildText = page.locator('.wave-container .inline-child-expanded .blip-text').first();
    if (await inlineChildText.count()) {
      await inlineChildText.click();
      await page.waitForTimeout(400);
    }
  }

  if (mode === 'toolbar') {
    const expandedRow = page.locator('.wave-container .rizzoma-blip.nested-blip.collapsed .blip-collapsed-row', {
      hasText: 'Expanded list-thread reply used to verify toolbar visibility on active non-inline blips.',
    }).first();
    if (await expandedRow.count()) {
      await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.wave-container .rizzoma-blip.nested-blip.collapsed .blip-collapsed-row'));
        const target = rows.find((row) => row.textContent?.includes('Expanded list-thread reply used to verify toolbar visibility on active non-inline blips.'));
        if (target instanceof HTMLElement) {
          target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        }
      });
      await page.waitForTimeout(600);
    }

    const expandedListText = page.locator('.wave-container .rizzoma-blip.nested-blip.expanded:not(.inline-child) .blip-text', {
      hasText: 'Expanded list-thread reply used to verify toolbar visibility on active non-inline blips.',
    }).first();
    if (await expandedListText.count()) {
      await expandedListText.click();
      await page.waitForTimeout(500);
    }

    if (toolbarListBlipId || toolbarInlineBlipId) {
      await page.evaluate(({ listBlipId, inlineBlipId }) => {
        if (listBlipId) {
          window.dispatchEvent(new CustomEvent('rizzoma:activate-blip', { detail: { blipId: listBlipId } }));
        }
        if (inlineBlipId) {
          window.dispatchEvent(new CustomEvent('rizzoma:activate-blip', { detail: { blipId: inlineBlipId } }));
        }
      }, { listBlipId: toolbarListBlipId, inlineBlipId: toolbarInlineBlipId });
      await page.waitForTimeout(500);
    }
  }

  const suffix = mode === 'inline'
    ? 'blb-inline-probe-v1'
    : mode === 'mixed'
      ? 'blb-mixed-probe-v1'
      : mode === 'unread'
        ? 'blb-unread-probe-v1'
        : mode === 'toolbar'
          ? 'blb-toolbar-probe-v1'
      : 'blb-probe-v1';
  const shotPath = path.join(outDir, `${suffix}.png`);
  const htmlPath = path.join(outDir, `${suffix}.html`);
  await page.locator('.wave-container').screenshot({ path: shotPath });
  fs.writeFileSync(htmlPath, await page.content());

  console.log(JSON.stringify({ id: topic.id, title: topic.title, shotPath, htmlPath }));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
