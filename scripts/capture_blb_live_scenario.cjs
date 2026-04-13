const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function login(page, base, email, password) {
  // Hard Gap #14 (2026-04-13): replaced the previous fixed waitForTimeout(1500)
  // with a state-driven wait. The 1500ms padding was the main source of
  // cold-start jitter in the metrics — it added a fixed delta to every run
  // regardless of whether the topics list had finished hydrating. Waiting
  // for the rizzoma-layout shell + topics container to mount gives us a
  // tighter upper bound on "logged in and ready to load a topic" instead
  // of "logged in plus 1.5s of padding."
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForSelector('.rizzoma-layout', { timeout: 15000 });
  await page.waitForSelector('.rizzoma-topics-list, .topics-container, .navigation-panel', { timeout: 15000 });
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

async function waitForDenseState(page, predicate, arg, timeout = 8000) {
  await page.waitForFunction(predicate, arg, { timeout });
}

async function main() {
  const base = process.argv[2] || 'http://127.0.0.1:4196';
  const outDir = process.argv[3] || 'screenshots/260331-blb-live-scenario';
  const perfStartedAt = Date.now();

  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1680, height: 1200 } });

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

  const mainThread = await createBlip(page, {
    waveId: topic.id,
    parentId: null,
    content: [
      '<p>Main discussion thread for the business-topic parity pass. The detailed decisions should sit underneath this thread rather than flattening into separate root-level siblings.</p>',
      '<p>This keeps the topic body readable while making the reply hierarchy visually honest.</p>',
    ].join(''),
  }, csrfToken);
  const mainThreadId = mainThread?.id || mainThread?.blip?.id || mainThread?.blip?._id;
  if (!mainThreadId) throw new Error(`main thread create failed: ${JSON.stringify(mainThread)}`);

  const expandedReply = await createBlip(page, {
    waveId: topic.id,
    parentId: mainThreadId,
    content: [
      '<p>I checked the current business-topic shell against the older live screenshots. The density is much closer now, and the top section no longer feels like a demo harness.</p>',
      '<p>The remaining question is mostly about consistency: whether we keep this same visual restraint once there are a few more active subthreads in the wave.</p>',
    ].join(''),
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

  const midCollapsedReply = await createBlip(page, {
    waveId: topic.id,
    parentId: mainThreadId,
    content: '<p>I would keep this middle follow-up collapsed unless someone explicitly wants the extra implementation context.</p>',
  }, csrfToken);
  const midCollapsedReplyId = midCollapsedReply?.id || midCollapsedReply?.blip?.id || midCollapsedReply?.blip?._id;
  if (!midCollapsedReplyId) throw new Error(`mid collapsed reply create failed: ${JSON.stringify(midCollapsedReply)}`);

  const midCollapsedReplyChild = await createBlip(page, {
    waveId: topic.id,
    parentId: midCollapsedReplyId,
    content: '<p>That lets the denser decision threads stay visible while this note remains available if someone expands the middle row later.</p>',
  }, csrfToken);
  const midCollapsedReplyChildId = midCollapsedReplyChild?.id || midCollapsedReplyChild?.blip?.id || midCollapsedReplyChild?.blip?._id;
  if (!midCollapsedReplyChildId) throw new Error(`mid collapsed reply child create failed: ${JSON.stringify(midCollapsedReplyChild)}`);

  const secondaryExpandedReply = await createBlip(page, {
    waveId: topic.id,
    parentId: mainThreadId,
    content: '<p>I would leave the root topic body as-is and move any extra explanation into replies. That keeps the opening screen readable without losing context, especially when several shorter comments accumulate underneath.</p>',
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
    parentId: mainThreadId,
    content: '<p>One remaining question is whether we should tighten the onboarding sentence before sharing this topic more broadly.</p>',
  }, csrfToken);
  const collapsedUnreadReplyId = collapsedUnreadReply?.id || collapsedUnreadReply?.blip?.id || collapsedUnreadReply?.blip?._id;
  if (!collapsedUnreadReplyId) throw new Error(`collapsed unread reply create failed: ${JSON.stringify(collapsedUnreadReply)}`);

  const collapsedReadReplyChild = await createBlip(page, {
    waveId: topic.id,
    parentId: collapsedUnreadReplyId,
    content: '<p>Logging this here so the context is preserved, even if we do not act on it this week.</p>',
  }, csrfToken);
  const collapsedReadReplyChildId = collapsedReadReplyChild?.id || collapsedReadReplyChild?.blip?.id || collapsedReadReplyChild?.blip?._id;
  if (!collapsedReadReplyChildId) throw new Error(`collapsed read child create failed: ${JSON.stringify(collapsedReadReplyChild)}`);

  const collapsedUnreadReplyChild = await createBlip(page, {
    waveId: topic.id,
    parentId: collapsedUnreadReplyId,
    content: [
      '<p>I would keep it for now, but we should make a call before the next external walkthrough.</p>',
      '<p>If that sentence survives another review round, this thread can probably stay collapsed by default.</p>',
    ].join(''),
  }, csrfToken);
  const collapsedUnreadReplyChildId = collapsedUnreadReplyChild?.id || collapsedUnreadReplyChild?.blip?.id || collapsedUnreadReplyChild?.blip?._id;
  if (!collapsedUnreadReplyChildId) throw new Error(`collapsed unread child create failed: ${JSON.stringify(collapsedUnreadReplyChild)}`);

  const collapsedReadReply = await createBlip(page, {
    waveId: topic.id,
    parentId: mainThreadId,
    content: [
      '<p>I would leave this lower-priority follow-up collapsed unless somebody needs the full context during review.</p>',
      '<p>It is useful background, but it should not compete with the two active decision threads above it.</p>',
    ].join(''),
  }, csrfToken);
  const collapsedReadReplyId = collapsedReadReply?.id || collapsedReadReply?.blip?.id || collapsedReadReply?.blip?._id;
  if (!collapsedReadReplyId) throw new Error(`collapsed read reply create failed: ${JSON.stringify(collapsedReadReply)}`);

  const collapsedReadReplyGrandchild = await createBlip(page, {
    waveId: topic.id,
    parentId: collapsedReadReplyId,
    content: '<p>That keeps the thread list denser while still preserving the note if someone reopens it later.</p>',
  }, csrfToken);
  const collapsedReadReplyGrandchildId = collapsedReadReplyGrandchild?.id || collapsedReadReplyGrandchild?.blip?.id || collapsedReadReplyGrandchild?.blip?._id;
  if (!collapsedReadReplyGrandchildId) throw new Error(`collapsed read reply grandchild create failed: ${JSON.stringify(collapsedReadReplyGrandchild)}`);

  const rootFollowUpReply = await createBlip(page, {
    waveId: topic.id,
    parentId: null,
    content: '<p>Separate root-level follow-up: keep this as a sibling of the main discussion thread so the distinction between topic children and nested replies is visible.</p>',
  }, csrfToken);
  const rootFollowUpReplyId = rootFollowUpReply?.id || rootFollowUpReply?.blip?.id || rootFollowUpReply?.blip?._id;
  if (!rootFollowUpReplyId) throw new Error(`root follow-up create failed: ${JSON.stringify(rootFollowUpReply)}`);

  await markBlipRead(page, topic.id, inlineChildReadId, csrfToken);
  await markBlipRead(page, topic.id, inlineReadId, csrfToken);
  await markBlipRead(page, topic.id, mainThreadId, csrfToken);
  await markBlipRead(page, topic.id, expandedReplyId, csrfToken);
  await markBlipRead(page, topic.id, expandedReplyChildId, csrfToken);
  await markBlipRead(page, topic.id, midCollapsedReplyId, csrfToken);
  await markBlipRead(page, topic.id, midCollapsedReplyChildId, csrfToken);
  await markBlipRead(page, topic.id, secondaryExpandedReplyId, csrfToken);
  await markBlipRead(page, topic.id, secondaryExpandedReplyChildId, csrfToken);
  await markBlipRead(page, topic.id, collapsedUnreadReplyId, csrfToken);
  await markBlipRead(page, topic.id, collapsedReadReplyChildId, csrfToken);
  await markBlipRead(page, topic.id, collapsedReadReplyId, csrfToken);
  await markBlipRead(page, topic.id, collapsedReadReplyGrandchildId, csrfToken);
  await markBlipRead(page, topic.id, rootFollowUpReplyId, csrfToken);

  const timings = {};

  let stepStartedAt = Date.now();
  await page.goto(`${base}/#/topic/${topic.id}?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.wave-container .rizzoma-topic-detail', { timeout: 30000 });
  await waitForDenseState(
    page,
    () => document.querySelectorAll('.wave-container .blip-thread-marker').length >= 2,
    undefined,
    12000,
  );
  timings.initialLoadMs = Date.now() - stepStartedAt;

  // Hard Gap #36 (2026-04-13): this step measures the anchored inline
  // subblip round trip after Hard Gap Execution 2 (2026-03-31) changed
  // marker clicks from "expand inline in place" to "navigate to subblip
  // route." The old behavior (inline expansion) no longer exists in the
  // product. The renamed step measures the subblip-route navigation
  // round trip specifically: click marker → land in subblip-view → Hide
  // back to topic → measure total round-trip time.
  //
  // The previous #14 try/catch dual-path fallback is now gone; the step
  // expects the post-Execution-2 behavior and fails loudly if the marker
  // doesn't navigate to the subblip view.
  const inlineMarker = page.locator('.wave-container .blip-thread-marker.has-unread').first();
  stepStartedAt = Date.now();
  let inlineRoundTripOk = false;
  if (await inlineMarker.count()) {
    await inlineMarker.click();
    // Wait for the subblip view to mount. If it doesn't, the marker
    // behavior has regressed and we want to know.
    await page.waitForSelector('.wave-container .subblip-view', { timeout: 8000 });
    // Hide back to the topic so subsequent metrics see the topic shell
    // again (list-thread expansion steps assume we're on the topic).
    const hideBtn = page.locator('.subblip-view .subblip-hide-btn').first();
    if (await hideBtn.count()) {
      await hideBtn.click();
      await page.waitForSelector('.wave-container .topic-content-view, .wave-container .topic-content-edit', { timeout: 5000 });
      inlineRoundTripOk = true;
    }
  }
  // Record the measurement under the same key (inlineExpandMs) for
  // baseline-comparison continuity with the pre-#36 metrics files. The
  // semantics shifted from "inline expansion time" to "subblip round-trip
  // time" — the numbers aren't directly comparable across the boundary,
  // but the baseline file can be re-written via RIZZOMA_PERF_REBASELINE=1
  // once the numbers settle.
  timings.inlineExpandMs = Date.now() - stepStartedAt;
  timings.inlineRoundTripOk = inlineRoundTripOk ? 1 : 0;

  // The inline-text activation step below targeted the old .inline-child-expanded
  // DOM which no longer exists. Kept as a no-op so the rest of the timings
  // array stays stable for baseline comparison; the key is retained with 0ms.
  const inlineText = page.locator('.wave-container .inline-child-expanded .blip-text').first();
  stepStartedAt = Date.now();
  if (await inlineText.count()) {
    await inlineText.click();
    try {
      await waitForDenseState(
        page,
        () => {
          const activeInline = document.querySelector('.wave-container .inline-child-expanded > .blip-container[data-active-blip="true"]');
          return !!activeInline;
        },
        undefined,
        2000,
      );
    } catch {
      // Inline activation is useful but not required for the structural hierarchy probe.
    }
  }
  timings.inlineActivateMs = Date.now() - stepStartedAt;

  stepStartedAt = Date.now();
  await page.evaluate((targetBlipId) => {
    const target = document.querySelector(`.wave-container .rizzoma-blip[data-blip-id="${targetBlipId}"] .blip-collapsed-row`);
    if (target instanceof HTMLElement) {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }
  }, mainThreadId);
  await waitForDenseState(
    page,
    (targetBlipId) => {
      const target = document.querySelector(`.wave-container .rizzoma-blip[data-blip-id="${targetBlipId}"]`);
      return !!target && target.classList.contains('expanded');
    },
    mainThreadId,
    8000,
  );
  await page.waitForSelector(`.wave-container .child-blip-wrapper[data-blip-id="${expandedReplyId}"] .child-blip-collapsed`, { timeout: 8000 });
  timings.mainThreadExpandMs = Date.now() - stepStartedAt;

  stepStartedAt = Date.now();
  await page.evaluate((targetBlipId) => {
    const target = document.querySelector(`.wave-container .child-blip-wrapper[data-blip-id="${targetBlipId}"] .child-blip-collapsed`);
    if (target instanceof HTMLElement) {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }
  }, expandedReplyId);
  await waitForDenseState(
    page,
    (targetBlipId) => {
      const target = document.querySelector(`.wave-container .rizzoma-blip[data-blip-id="${targetBlipId}"]`);
      return !!target && target.classList.contains('expanded');
    },
    expandedReplyId,
    8000,
  );
  timings.primaryExpandMs = Date.now() - stepStartedAt;

  stepStartedAt = Date.now();
  await page.evaluate((targetBlipId) => {
    const target = document.querySelector(`.wave-container .child-blip-wrapper[data-blip-id="${targetBlipId}"] .child-blip-collapsed`);
    if (target instanceof HTMLElement) {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }
  }, secondaryExpandedReplyId);
  await waitForDenseState(
    page,
    ({ primaryId, secondaryId }) => {
      const primary = document.querySelector(`.wave-container .rizzoma-blip[data-blip-id="${primaryId}"]`);
      const secondary = document.querySelector(`.wave-container .rizzoma-blip[data-blip-id="${secondaryId}"]`);
      return !!primary && primary.classList.contains('expanded') && !!secondary && secondary.classList.contains('expanded');
    },
    { primaryId: expandedReplyId, secondaryId: secondaryExpandedReplyId },
    8000,
  );
  timings.secondaryExpandMs = Date.now() - stepStartedAt;

  stepStartedAt = Date.now();
  await page.evaluate((targetBlipId) => {
    window.dispatchEvent(new CustomEvent('rizzoma:activate-blip', {
      detail: { blipId: targetBlipId },
    }));
  }, expandedReplyId);
  try {
    await page.waitForFunction((targetBlipId) => {
      const target = document.querySelector(`.wave-container .rizzoma-blip[data-blip-id="${targetBlipId}"]`);
      return !!target && target.getAttribute('data-active-blip') === 'true';
    }, expandedReplyId, { timeout: 1500 });
  } catch {
    // Record the resulting state below; do not fail the structural capture on activation timing.
  }
  timings.primaryActivateMs = Date.now() - stepStartedAt;

  const state = await page.evaluate(({ primaryText, mainThreadId, primaryId, secondaryId, collapsedId, collapsedReadId, midCollapsedId, rootFollowUpId }) => {
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
      mainThreadExpandedVisible: !!document.querySelector(`.wave-container .rizzoma-blip[data-blip-id="${mainThreadId}"]`)?.classList.contains('expanded'),
      primaryExpandedVisible: !!primaryExpanded && primaryExpanded.classList.contains('expanded'),
      secondaryExpandedVisible: !!secondaryExpanded && secondaryExpanded.classList.contains('expanded'),
      midCollapsedVisible: !!document.querySelector(`.wave-container .child-blip-wrapper[data-blip-id="${midCollapsedId}"] .child-blip-collapsed`),
      collapsedUnreadVisible: !!document.querySelector(`.wave-container .child-blip-wrapper[data-blip-id="${collapsedId}"] .child-blip-collapsed`),
      collapsedUnreadHasUnreadIcon: !!document.querySelector(`.wave-container .child-blip-wrapper[data-blip-id="${collapsedId}"] .blip-expand-icon.has-unread`),
      collapsedReadVisible: !!document.querySelector(`.wave-container .child-blip-wrapper[data-blip-id="${collapsedReadId}"] .child-blip-collapsed`),
      rootFollowUpVisible: !!document.querySelector(`.wave-container .rizzoma-blip[data-blip-id="${rootFollowUpId}"]`)?.classList.contains('collapsed'),
    };
  }, {
    primaryText: 'I checked the current business-topic shell against the older live screenshots. The density is much closer now, and the top section no longer feels like a demo harness.',
    mainThreadId,
    primaryId: expandedReplyId,
    secondaryId: secondaryExpandedReplyId,
    collapsedId: collapsedUnreadReplyId,
    collapsedReadId: collapsedReadReplyId,
    midCollapsedId: midCollapsedReplyId,
    rootFollowUpId: rootFollowUpReplyId,
  });

  const perf = await page.evaluate(() => {
    const view = document.querySelector('.wave-container .rizzoma-topic-detail');
    const expandedReplies = document.querySelectorAll('.wave-container .rizzoma-blip.nested-blip.expanded:not(.inline-child)').length;
    const unreadIcons = document.querySelectorAll('.wave-container .blip-expand-icon.has-unread').length;
    const inlineExpanded = document.querySelectorAll('.wave-container .inline-child-expanded > .blip-container.expanded').length;
    return {
      expandedReplies,
      unreadIcons,
      inlineExpanded,
      topicHeight: view instanceof HTMLElement ? view.scrollHeight : null,
      topicWidth: view instanceof HTMLElement ? view.clientWidth : null,
      domBlipCount: document.querySelectorAll('.wave-container .rizzoma-blip').length,
      menuCount: document.querySelectorAll('.wave-container .blip-menu-container').length,
    };
  });

  timings.totalScenarioMs = Date.now() - perfStartedAt;

  const shotPath = path.join(outDir, 'blb-live-scenario-v3.png');
  const htmlPath = path.join(outDir, 'blb-live-scenario-v3.html');
  const perfPath = path.join(outDir, 'blb-live-scenario-v3.metrics.json');
  await page.locator('.wave-container').screenshot({ path: shotPath });
  fs.writeFileSync(htmlPath, await page.content());
  fs.writeFileSync(perfPath, JSON.stringify({
    base,
    topicId: topic.id,
    capturedAt: new Date().toISOString(),
    timings,
    state,
    perf,
  }, null, 2));

  // Hard Gap #14 (2026-04-13): baseline-aware metrics output. The first run
  // writes a baseline alongside the metrics. Each subsequent run compares
  // its timings against the baseline and prints per-step deltas + a warning
  // for any step that drifted more than ±25%. This makes the metrics file
  // useful for catching regressions instead of just being a coarse log.
  //
  // To re-baseline after an intentional perf change, set
  // RIZZOMA_PERF_REBASELINE=1 in the environment.
  const baselinePath = path.join(outDir, 'blb-live-scenario-baseline.metrics.json');
  let baseline = null;
  if (fs.existsSync(baselinePath) && !process.env.RIZZOMA_PERF_REBASELINE) {
    try {
      baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    } catch (err) {
      console.warn(`[perf] failed to read baseline at ${baselinePath}: ${err && err.message ? err.message : err}`);
    }
  }
  let regressionDeltas = null;
  let regressionWarnings = [];
  if (baseline && baseline.timings) {
    regressionDeltas = {};
    for (const stepKey of Object.keys(timings)) {
      const baselineMs = baseline.timings[stepKey];
      const currentMs = timings[stepKey];
      if (typeof baselineMs === 'number' && typeof currentMs === 'number' && baselineMs > 0) {
        const deltaMs = currentMs - baselineMs;
        const deltaPct = (deltaMs / baselineMs) * 100;
        regressionDeltas[stepKey] = {
          baselineMs,
          currentMs,
          deltaMs,
          deltaPct: Math.round(deltaPct * 10) / 10,
        };
        if (Math.abs(deltaPct) > 25 && Math.abs(deltaMs) > 50) {
          regressionWarnings.push(`${stepKey}: ${baselineMs}ms → ${currentMs}ms (${deltaPct >= 0 ? '+' : ''}${Math.round(deltaPct)}%)`);
        }
      }
    }
  } else {
    fs.writeFileSync(baselinePath, JSON.stringify({
      base,
      capturedAt: new Date().toISOString(),
      note: 'Baseline metrics for the BLB live scenario. Replace via RIZZOMA_PERF_REBASELINE=1 after an intentional perf change.',
      timings,
      perf,
    }, null, 2));
    console.log(`[perf] wrote baseline at ${baselinePath} (first run or RIZZOMA_PERF_REBASELINE=1 set)`);
  }

  if (regressionWarnings.length > 0) {
    console.log(`[perf] WARNING: ${regressionWarnings.length} step(s) drifted >25% vs baseline:`);
    for (const warning of regressionWarnings) {
      console.log(`  - ${warning}`);
    }
  } else if (regressionDeltas) {
    console.log(`[perf] all steps within ±25% of baseline`);
  }

  console.log(JSON.stringify({ id: topic.id, title: topic.title, shotPath, htmlPath, perfPath, state, timings, perf, regressionDeltas, regressionWarnings }));
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
