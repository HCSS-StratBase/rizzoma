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

async function ensureCsrf(page) {
  await page.evaluate(async () => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
  });
  return readCookie(page, 'XSRF-TOKEN');
}

async function createTopic(page, title, content, csrfToken) {
  return page.evaluate(async ({ topicTitle, topicContent, token }) => {
    const response = await fetch('/api/topics', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-csrf-token': token } : {}),
      },
      body: JSON.stringify({ title: topicTitle, content: topicContent }),
    });
    return response.json();
  }, { topicTitle: title, topicContent: content, token: csrfToken });
}

async function createBlip(page, payload, csrfToken) {
  return page.evaluate(async ({ body, token }) => {
    const response = await fetch('/api/blips', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...(token ? { 'x-csrf-token': token } : {}),
      },
      body: JSON.stringify(body),
    });
    return response.json();
  }, { body: payload, token: csrfToken });
}

async function markBlipRead(page, waveId, blipId, csrfToken) {
  return page.evaluate(async ({ currentWaveId, currentBlipId, token }) => {
    const response = await fetch(`/api/waves/${encodeURIComponent(currentWaveId)}/blips/${encodeURIComponent(currentBlipId)}/read`, {
      method: 'POST',
      credentials: 'include',
      headers: token ? { 'x-csrf-token': token } : {},
    });
    return response.json();
  }, { currentWaveId: waveId, currentBlipId: blipId, token: csrfToken });
}

async function main() {
  const base = process.argv[2] || 'http://127.0.0.1:4196';
  const outDir = process.argv[3] || 'screenshots/260331-blb-live-scenario-mobile';

  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 430, height: 1180 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });

  await login(page, base, 'codex-live+1774803822194@example.com', 'CodexLive!1');
  const csrfToken = await ensureCsrf(page);

  const topic = await createTopic(
    page,
    `HCSS Rizzoma Business Topic ${Date.now()}`,
    [
      '<h1>HCSS Rizzoma Business Topic</h1>',
      '<p>#MetaTopic</p>',
      '<ul>',
      '<li><p>Oneliner<span data-blip-thread="legacy:inline1" class="blip-thread-marker has-unread">+</span></p></li>',
      '<li><p>Relevant links</p></li>',
      '<li><p>New to Rizzoma<span data-blip-thread="legacy:inline2" class="blip-thread-marker">+</span></p></li>',
      '</ul>',
      '<p>This topic is intentionally light so the core business thread opens quickly, but it should still feel like a live working space rather than a fixture.</p>',
      '<p>For now the root should stay dense and readable, with most of the detail pushed into replies instead of stretching the main topic body.</p>',
    ].join(''),
    csrfToken,
  );

  if (!topic?.id) {
    throw new Error(`topic create failed: ${JSON.stringify(topic)}`);
  }

  const inlineUnread = await createBlip(page, {
    waveId: topic.id,
    parentId: null,
    anchorPosition: 45,
    content: '<p>Inline note on the one-liner: we should keep the wording tight, but the current phrasing is probably fine for the next review draft.</p>',
  }, csrfToken);
  const inlineUnreadId = inlineUnread?.id || inlineUnread?.blip?.id || inlineUnread?.blip?._id;
  if (!inlineUnreadId) throw new Error(`inline unread create failed: ${JSON.stringify(inlineUnread)}`);

  const inlineChildRead = await createBlip(page, {
    waveId: topic.id,
    parentId: inlineUnreadId,
    anchorPosition: 34,
    content: '<p>Agreed. We can revisit the wording later if the scope changes, so this child can stay read for now.</p>',
  }, csrfToken);
  const inlineChildReadId = inlineChildRead?.id || inlineChildRead?.blip?.id || inlineChildRead?.blip?._id;
  if (!inlineChildReadId) throw new Error(`inline child read create failed: ${JSON.stringify(inlineChildRead)}`);

  const inlineRead = await createBlip(page, {
    waveId: topic.id,
    parentId: null,
    anchorPosition: 72,
    content: '<p>Quick orientation note: the links are enough for first-time readers, so this thread should stay neutral and out of the way.</p>',
  }, csrfToken);
  const inlineReadId = inlineRead?.id || inlineRead?.blip?.id || inlineRead?.blip?._id;
  if (!inlineReadId) throw new Error(`inline read create failed: ${JSON.stringify(inlineRead)}`);

  const expandedReply = await createBlip(page, {
    waveId: topic.id,
    parentId: null,
    content: '<p>I checked the current business-topic shell against the older live screenshots. The density is much closer now, and the top section no longer feels like a demo harness.</p>',
  }, csrfToken);
  const expandedReplyId = expandedReply?.id || expandedReply?.blip?.id || expandedReply?.blip?._id;
  if (!expandedReplyId) throw new Error(`expanded reply create failed: ${JSON.stringify(expandedReply)}`);

  const expandedReplyChild = await createBlip(page, {
    waveId: topic.id,
    parentId: expandedReplyId,
    content: '<p>The next thing to watch is whether the reply distribution still feels balanced once we mix a few shorter comments into the same thread.</p>',
  }, csrfToken);
  const expandedReplyChildId = expandedReplyChild?.id || expandedReplyChild?.blip?.id || expandedReplyChild?.blip?._id;
  if (!expandedReplyChildId) throw new Error(`expanded reply child create failed: ${JSON.stringify(expandedReplyChild)}`);

  const expandedReplyUnreadChild = await createBlip(page, {
    waveId: topic.id,
    parentId: expandedReplyId,
    content: '<p>I still have not checked how this reads on a smaller laptop viewport, so that follow-up is still open.</p>',
  }, csrfToken);
  const expandedReplyUnreadChildId = expandedReplyUnreadChild?.id || expandedReplyUnreadChild?.blip?.id || expandedReplyUnreadChild?.blip?._id;
  if (!expandedReplyUnreadChildId) throw new Error(`expanded reply unread child create failed: ${JSON.stringify(expandedReplyUnreadChild)}`);

  const secondaryExpandedReply = await createBlip(page, {
    waveId: topic.id,
    parentId: null,
    content: '<p>I would leave the root topic body as-is and move any extra explanation into replies. That keeps the opening screen readable without losing context.</p>',
  }, csrfToken);
  const secondaryExpandedReplyId = secondaryExpandedReply?.id || secondaryExpandedReply?.blip?.id || secondaryExpandedReply?.blip?._id;
  if (!secondaryExpandedReplyId) throw new Error(`secondary expanded reply create failed: ${JSON.stringify(secondaryExpandedReply)}`);

  const secondaryExpandedReplyChild = await createBlip(page, {
    waveId: topic.id,
    parentId: secondaryExpandedReplyId,
    content: '<p>Yes, and that also makes the thread scan more naturally when several people are commenting in parallel.</p>',
  }, csrfToken);
  const secondaryExpandedReplyChildId = secondaryExpandedReplyChild?.id || secondaryExpandedReplyChild?.blip?.id || secondaryExpandedReplyChild?.blip?._id;
  if (!secondaryExpandedReplyChildId) throw new Error(`secondary expanded reply child create failed: ${JSON.stringify(secondaryExpandedReplyChild)}`);

  const secondaryExpandedReplyUnreadChild = await createBlip(page, {
    waveId: topic.id,
    parentId: secondaryExpandedReplyId,
    content: '<p>One thing we should still decide is whether the supporting note belongs here or should move into the collapsed follow-up thread below.</p>',
  }, csrfToken);
  const secondaryExpandedReplyUnreadChildId = secondaryExpandedReplyUnreadChild?.id || secondaryExpandedReplyUnreadChild?.blip?.id || secondaryExpandedReplyUnreadChild?.blip?._id;
  if (!secondaryExpandedReplyUnreadChildId) throw new Error(`secondary expanded reply unread child create failed: ${JSON.stringify(secondaryExpandedReplyUnreadChild)}`);

  const collapsedUnreadReply = await createBlip(page, {
    waveId: topic.id,
    parentId: null,
    content: '<p>One remaining question is whether we should tighten the onboarding sentence before sharing this topic more broadly.</p>',
  }, csrfToken);
  const collapsedUnreadReplyId = collapsedUnreadReply?.id || collapsedUnreadReply?.blip?.id || collapsedUnreadReply?.blip?._id;
  if (!collapsedUnreadReplyId) throw new Error(`collapsed unread reply create failed: ${JSON.stringify(collapsedUnreadReply)}`);

  const collapsedUnreadReplyChild = await createBlip(page, {
    waveId: topic.id,
    parentId: collapsedUnreadReplyId,
    content: '<p>I would keep it for now, but we should make a call before the next external walkthrough.</p>',
  }, csrfToken);
  const collapsedUnreadReplyChildId = collapsedUnreadReplyChild?.id || collapsedUnreadReplyChild?.blip?.id || collapsedUnreadReplyChild?.blip?._id;
  if (!collapsedUnreadReplyChildId) throw new Error(`collapsed unread child create failed: ${JSON.stringify(collapsedUnreadReplyChild)}`);

  const collapsedReadReplyChild = await createBlip(page, {
    waveId: topic.id,
    parentId: collapsedUnreadReplyId,
    content: '<p>Logging this here so the context is preserved, even if we do not act on it this week.</p>',
  }, csrfToken);
  const collapsedReadReplyChildId = collapsedReadReplyChild?.id || collapsedReadReplyChild?.blip?.id || collapsedReadReplyChild?.blip?._id;
  if (!collapsedReadReplyChildId) throw new Error(`collapsed read child create failed: ${JSON.stringify(collapsedReadReplyChild)}`);

  await markBlipRead(page, topic.id, inlineChildReadId, csrfToken);
  await markBlipRead(page, topic.id, inlineReadId, csrfToken);
  await markBlipRead(page, topic.id, expandedReplyId, csrfToken);
  await markBlipRead(page, topic.id, expandedReplyChildId, csrfToken);
  await markBlipRead(page, topic.id, secondaryExpandedReplyId, csrfToken);
  await markBlipRead(page, topic.id, secondaryExpandedReplyChildId, csrfToken);
  await markBlipRead(page, topic.id, collapsedUnreadReplyId, csrfToken);
  await markBlipRead(page, topic.id, collapsedReadReplyChildId, csrfToken);

  await page.goto(`${base}/#/topic/${topic.id}?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.wave-container .rizzoma-topic-detail', { timeout: 30000 });
  await page.waitForTimeout(1800);

  const inlineMarker = page.locator('.wave-container .blip-thread-marker.has-unread').first();
  await inlineMarker.click();
  await page.waitForTimeout(700);

  const inlineText = page.locator('.wave-container .inline-child-expanded .blip-text').first();
  if (await inlineText.count()) {
    await inlineText.click();
    await page.waitForTimeout(400);
  }

  await page.evaluate((targetBlipId) => {
    const target = document.querySelector(`.wave-container .rizzoma-blip[data-blip-id="${targetBlipId}"] .blip-collapsed-row`);
    if (target instanceof HTMLElement) {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }
  }, expandedReplyId);
  await page.waitForTimeout(700);

  await page.evaluate((targetBlipId) => {
    const target = document.querySelector(`.wave-container .rizzoma-blip[data-blip-id="${targetBlipId}"] .blip-collapsed-row`);
    if (target instanceof HTMLElement) {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }
  }, secondaryExpandedReplyId);
  await page.waitForTimeout(1800);

  await page.evaluate((targetBlipId) => {
    const target = document.querySelector(`.wave-container .rizzoma-blip[data-blip-id="${targetBlipId}"] .blip-text`);
    if (target instanceof HTMLElement) {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }
  }, expandedReplyId);
  await page.waitForTimeout(1200);

  const state = await page.evaluate(({ primaryText, primaryId, secondaryId, collapsedId }) => {
    const expandedListReplies = Array.from(document.querySelectorAll('.wave-container .rizzoma-blip.nested-blip.expanded:not(.inline-child)'));
    const visibleToolbars = Array.from(document.querySelectorAll('.wave-container .rizzoma-blip.nested-blip .blip-menu-container'))
      .filter((el) => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.opacity !== '0' && style.visibility !== 'hidden';
      });
    const activeExpanded = expandedListReplies.find((el) => el.classList.contains('active'));
    const primaryExpanded = document.querySelector(`.wave-container .rizzoma-blip[data-blip-id="${primaryId}"]`);
    const secondaryExpanded = document.querySelector(`.wave-container .rizzoma-blip[data-blip-id="${secondaryId}"]`);
    const collapsedReply = document.querySelector(`.wave-container .rizzoma-blip[data-blip-id="${collapsedId}"]`);
    return {
      expandedReplyCount: expandedListReplies.length,
      visibleToolbarCount: visibleToolbars.length,
      activeExpandedText: activeExpanded?.textContent?.slice(0, 180) || null,
      primaryExpandedIsActive: !!activeExpanded?.textContent?.includes(primaryText),
      primaryExpandedVisible: !!primaryExpanded && primaryExpanded.classList.contains('expanded'),
      secondaryExpandedVisible: !!secondaryExpanded && secondaryExpanded.classList.contains('expanded'),
      collapsedUnreadVisible: !!collapsedReply && collapsedReply.classList.contains('collapsed'),
      collapsedUnreadHasUnreadIcon: !!collapsedReply?.querySelector('.blip-expand-icon.has-unread'),
    };
  }, {
    primaryText: 'I checked the current business-topic shell against the older live screenshots. The density is much closer now, and the top section no longer feels like a demo harness.',
    primaryId: expandedReplyId,
    secondaryId: secondaryExpandedReplyId,
    collapsedId: collapsedUnreadReplyId,
  });

  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);

  const shotPath = path.join(outDir, 'blb-live-scenario-mobile-v1.png');
  const htmlPath = path.join(outDir, 'blb-live-scenario-mobile-v1.html');
  await page.locator('.wave-container').screenshot({ path: shotPath });
  fs.writeFileSync(htmlPath, await page.content());

  console.log(JSON.stringify({ id: topic.id, title: topic.title, shotPath, htmlPath, state }));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
