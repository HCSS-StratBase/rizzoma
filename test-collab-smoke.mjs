#!/usr/bin/env node
/**
 * Real-time collab smoke test (Playwright, two browser contexts).
 *
 * Verifies the three regressions fixed on 2026-04-15 stay fixed:
 *   - BUG #58: feature flags inlined in production builds
 *               (we check that REALTIME_COLLAB / LIVE_CURSORS code paths
 *                are reachable, indirectly via socket.io activity)
 *   - BUG #57a: Y.js `blip:update` events emit on real keystrokes
 *               (we wrap socket.emit and count outbound updates)
 *   - BUG #57b: Y.Doc seed lock prevents CRDT divergence
 *               (we verify both tabs converge to identical content)
 *   - BUG #56: `Cache-Control: no-store` on /api/topics keeps the
 *               sidebar fresh after mark-read
 *               (we mark-read and refetch, verify count went down)
 *   - Disconnect/reconnect catchup (sets up a missed update and
 *               verifies the receiver picks it up after reconnect)
 *
 * Run via:
 *   node test-collab-smoke.mjs
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3000 node test-collab-smoke.mjs
 *
 * Exit codes:
 *   0 = all PASS
 *   non-zero = at least one FAIL (printed to stderr)
 *
 * Uses two separate Playwright browser processes to model two independent
 * devices with isolated cookie jars, sockets, and Y.Doc state. This is an
 * acceptance-shape improvement, not a latency workaround: CI still measured
 * 13-14 second relays before the awareness feedback loop was fixed.
 */
import { chromium } from 'playwright';
import { seedAcceptedParticipant, seedVerifiedE2EAccount } from './scripts/lib/e2e-sharing-fixtures.mjs';

const baseUrl = process.env.RIZZOMA_BASE_URL || 'http://localhost:3000';
const headed = process.env.RIZZOMA_E2E_HEADED === '1';
const slowMo = Number(process.env.RIZZOMA_E2E_SLOWMO || (headed ? 100 : 0));
const password = process.env.RIZZOMA_E2E_PASSWORD || 'CollabTest!1';
const userA = process.env.RIZZOMA_E2E_USER_A || `collab-a-${Date.now()}@example.com`;
const userB = process.env.RIZZOMA_E2E_USER_B || `collab-b-${Date.now()}@example.com`;

const log = (msg) => console.log(`➡️  [collab] ${msg}`);
const fail = (msg) => {
  console.error(`❌ [collab] ${msg}`);
  process.exitCode = 1;
};
const pass = (msg) => console.log(`✅ [collab] ${msg}`);

let totalChecks = 0;
let passedChecks = 0;
const recordCheck = (ok, label) => {
  totalChecks++;
  if (ok) {
    passedChecks++;
    pass(label);
  } else {
    fail(label);
  }
};

async function ensureAuth(page, email, label) {
  log(`${label}: signing in as ${email}`);
  await page.goto(`${baseUrl}/?layout=rizzoma`, { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async ({ email, password }) => {
    await fetch('/api/auth/csrf', { credentials: 'include' });
    const csrfCookie = document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='));
    const csrfToken = csrfCookie ? decodeURIComponent(csrfCookie.split('=')[1] || '') : '';
    const headers = { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken };
    const loginResp = await fetch('/api/auth/login', {
      method: 'POST', headers, credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (loginResp.ok) return { ok: true, method: 'login' };
    return { ok: false, status: loginResp.status, error: await loginResp.text() };
  }, { email, password });
  if (!result.ok) throw new Error(`${label}: auth failed: ${result.status} ${result.error}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-layout').waitFor({ timeout: 15000 });
  log(`${label}: ${result.method} OK`);
}

async function installSocketProbe(page) {
  // Install before the first navigation so room joins, initial sync, and any
  // lifecycle-driven leave are visible. Attaching onAny after the editor has
  // mounted misses exactly the events needed to distinguish "never joined"
  // from "joined, synced, then left".
  await page.addInitScript(() => {
    window.__inbound = [];
    window.__outbound = [];
    let socketValue;

    const wrapSocket = (socket) => {
      if (!socket || socket.__rizzomaCollabProbeWrapped) return;
      Object.defineProperty(socket, '__rizzomaCollabProbeWrapped', {
        value: true,
        configurable: false,
        enumerable: false,
      });
      const originalEmit = socket.emit.bind(socket);
      socket.emit = function(event, ...args) {
        try {
          window.__outbound.push({
            event,
            blipId: args[0]?.blipId || null,
            t: Date.now(),
          });
        } catch {}
        return originalEmit(event, ...args);
      };
      try {
        socket.onAny((event, ...args) => {
          window.__inbound.push({
            ev: event,
            blipId: args[0]?.blipId || null,
            t: Date.now(),
          });
        });
      } catch {}
    };

    Object.defineProperty(window, '__socket', {
      configurable: true,
      get: () => socketValue,
      set: (value) => {
        socketValue = value;
        wrapSocket(value);
      },
    });
  });
}

async function createTopicAndBlip(page, title) {
  const csrf = await page.evaluate(() => {
    const c = document.cookie.split('; ').find((x) => x.startsWith('XSRF-TOKEN='));
    return c ? decodeURIComponent(c.split('=')[1] || '') : '';
  });
  const result = await page.evaluate(async ({ title, csrf }) => {
    const headers = { 'Content-Type': 'application/json', 'x-csrf-token': csrf };
    const tr = await fetch('/api/topics', {
      method: 'POST', headers, credentials: 'include',
      body: JSON.stringify({ title, content: `<p>${title}</p>` }),
    });
    if (!tr.ok) return { ok: false, stage: 'topic', status: tr.status, body: await tr.text() };
    const topic = await tr.json();
    const br = await fetch('/api/blips', {
      method: 'POST', headers, credentials: 'include',
      body: JSON.stringify({
        waveId: topic.id,
        parentId: null,
        content: `<p>Initial blip content</p>`,
      }),
    });
    if (!br.ok) return { ok: false, stage: 'blip', status: br.status, body: await br.text() };
    const blip = await br.json();
    return { ok: true, topicId: topic.id, blipId: blip.id };
  }, { title, csrf });
  if (!result.ok) throw new Error(`createTopicAndBlip: ${result.stage} failed: ${result.status} ${result.body}`);
  return result;
}

async function openTopicAndExpandBlip(page, topicId, blipId) {
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  const blipLocator = page.locator(`[data-blip-id="${blipId}"]`);
  await blipLocator.waitFor({ timeout: 15000 });
  // Real-click to expand the collapsed blip — synthetic events don't
  // reliably trigger the React onClick that toggles `isExpanded`.
  await blipLocator.click();
  await page.waitForTimeout(300);
  // Then dispatch the current external edit-mode event. The app replaced the
  // old `rizzoma:start-editing-blip` name with `rizzoma:enter-edit-blip` when
  // single-active-editor ownership was introduced; using the retired event
  // leaves the blip active but never mounts its ProseMirror surface.
  await page.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('rizzoma:activate-blip', { detail: { blipId: id } }));
    window.dispatchEvent(new CustomEvent('rizzoma:enter-edit-blip', { detail: { blipId: id } }));
  }, blipId);
  // Wait for the editor to mount in genuinely editable mode. A read-only
  // ProseMirror can still display the saved HTML while collaboration remains
  // disabled, which used to let this helper report false readiness.
  await page.waitForFunction(
    (id) => !!document.querySelector(`[data-blip-id="${id}"] .ProseMirror[contenteditable="true"]`),
    blipId,
    { timeout: 15000 }
  );
  // Editor mount alone is not collaboration readiness. The non-authoritative
  // client intentionally starts with an empty Y.Doc and must receive the
  // first client's seed before the test types into either side.
  await waitForEditorText(page, blipId, 'Initial blip content', 15000);
  // Collaboration readiness includes a concrete room join and initial sync.
  // The server deliberately does not log joins once a Y.Doc has state, so the
  // client-side socket trace is the authoritative acceptance signal here.
  await page.waitForFunction((id) => {
    const outbound = window.__outbound || [];
    const inbound = window.__inbound || [];
    return outbound.some((entry) => entry.event === 'blip:join' && entry.blipId === id)
      && inbound.some((entry) => entry.ev === `blip:sync:${id}`);
  }, blipId, { timeout: 15000 });
}

async function getSocketProbe(page, blipId) {
  return page.evaluate((id) => ({
    connected: !!window.__socket?.connected,
    outbound: (window.__outbound || []).filter((entry) => !entry.blipId || entry.blipId === id),
    inbound: (window.__inbound || []).filter((entry) => entry.ev === `blip:sync:${id}` || entry.ev === `blip:update:${id}`),
  }), blipId);
}

async function focusBlipEditor(page, blipId) {
  await page.evaluate((id) => {
    const editor = document.querySelector(`[data-blip-id="${id}"] .ProseMirror`);
    if (!editor) throw new Error('editor not mounted');
    editor.focus();
    const p = editor.querySelector('p');
    if (p) {
      const range = document.createRange();
      range.selectNodeContents(p);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, blipId);
}

async function getEditorText(page, blipId) {
  return page.evaluate((id) => {
    const editor = document.querySelector(`[data-blip-id="${id}"] .ProseMirror`);
    if (!editor) return null;
    // Strip collaboration cursor labels — they're decorative and not part of the doc text
    const html = editor.innerHTML || '';
    const clean = html
      .replace(/<span class="collaboration-cursor[^"]*"[^>]*>.*?<\/span>/g, '')
      .replace(/<[^>]+>/g, '');
    return clean;
  }, blipId);
}

async function waitForEditorText(page, blipId, expected, timeout = 10000) {
  await page.waitForFunction(({ id, expectedText }) => {
    const editor = document.querySelector(`[data-blip-id="${id}"] .ProseMirror`);
    if (!editor) return false;
    const clean = (editor.innerHTML || '')
      .replace(/<span class="collaboration-cursor[^"]*"[^>]*>.*?<\/span>/g, '')
      .replace(/<[^>]+>/g, '');
    return clean === expectedText;
  }, { id: blipId, expectedText: expected }, { timeout });
}

async function getOutboundEventCount(page, eventName, blipId = null) {
  return page.evaluate(({ name, id }) => {
    const out = window.__outbound || [];
    return out.filter((e) => e.event === name && (!id || e.blipId === id)).length;
  }, { name: eventName, id: blipId });
}

async function getInboundEventCount(page, eventName) {
  return page.evaluate((name) => {
    const inbound = window.__inbound || [];
    return inbound.filter((entry) => entry.ev === name).length;
  }, eventName);
}

async function main() {
  log(`base URL: ${baseUrl}`);
  log(`user A: ${userA}`);
  log(`user B: ${userB}`);

  // Seed test-only verified identities directly. Normal registration now
  // requires mailbox proof, and normal invitations stay pending until their
  // bearer token is redeemed; CI fixtures must not weaken either invariant.
  const fixtureA = await seedVerifiedE2EAccount(userA, password);
  await seedVerifiedE2EAccount(userB, password);

  // Separate browser processes model two independent active devices. Relay
  // latency is measured below and must stand on its own acceptance budget.
  const browserA = await chromium.launch({ headless: !headed, slowMo });
  const browserB = await chromium.launch({ headless: !headed, slowMo });
  const ctxA = await browserA.newContext();
  const ctxB = await browserB.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  await installSocketProbe(pageA);
  await installSocketProbe(pageB);

  // Capture console errors per page
  const errorsA = [];
  const errorsB = [];
  const putRequestsB = [];
  pageA.on('pageerror', (err) => errorsA.push(String(err)));
  pageB.on('pageerror', (err) => errorsB.push(String(err)));
  pageB.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().includes('/api/blips/')) {
      let projectedContent = '';
      try { projectedContent = String(request.postDataJSON()?.content || ''); } catch {}
      putRequestsB.push({
        request,
        url: request.url(),
        startedAt: Date.now(),
        projectedContent,
        stateDigest: request.headers()['x-rizzoma-yjs-state-digest'] || '',
        yjsGeneration: request.headers()['x-rizzoma-yjs-generation'] || '',
        status: null,
      });
    }
  });
  pageB.on('response', (response) => {
    const entry = putRequestsB.find(({ request }) => request === response.request());
    if (entry) entry.status = response.status();
  });

  try {
    // ----- Auth both contexts -----
    await ensureAuth(pageA, userA, 'A');
    await ensureAuth(pageB, userB, 'B');

    // ----- A creates a topic + blip -----
    const { topicId, blipId } = await createTopicAndBlip(pageA, `Collab smoke ${Date.now()}`);
    log(`created topic ${topicId.slice(-8)} blip ${blipId.slice(-8)}`);

    // New topics are private. Seed the accepted grant through the E2E database
    // fixture path; the production invite endpoint intentionally remains
    // pending until the emailed bearer is redeemed.
    await seedAcceptedParticipant(topicId, userB, 'editor', fixtureA._id);
    const editorAccess = await pageB.evaluate(async (id) => {
      const response = await fetch(`/api/topics/${encodeURIComponent(id)}`, { credentials: 'include' });
      const data = await response.json().catch(() => null);
      return { status: response.status, canEdit: data?.permissions?.canEdit, role: data?.permissions?.role };
    }, topicId);
    recordCheck(
      editorAccess.status === 200 && editorAccess.canEdit === true && editorAccess.role === 'editor',
      `E2E fixture granted B editor access (${editorAccess.status}, ${editorAccess.role})`,
    );

    // ----- A opens the topic and starts editing the blip -----
    await openTopicAndExpandBlip(pageA, topicId, blipId);

    // ----- B opens the same topic and starts editing the same blip -----
    await openTopicAndExpandBlip(pageB, topicId, blipId);

    // ===== CHECK 1: feature flags reachable + socket up on both sides =====
    const aSocketOk = await pageA.evaluate(() => !!(window.__socket && window.__socket.connected));
    const bSocketOk = await pageB.evaluate(() => !!(window.__socket && window.__socket.connected));
    recordCheck(aSocketOk && bSocketOk, 'Sockets connected on both contexts (BUG #58 — feature flags reachable)');

    // ===== CHECK 2: A types, blip:update emits =====
    // Begin projection evidence at the exact action boundary. Captures from
    // initial mount/seeding must never satisfy the remote-materialization gate.
    putRequestsB.length = 0;
    const aOutboundBefore = await getOutboundEventCount(pageA, 'blip:update', blipId);
    const bInboundBefore = await getInboundEventCount(pageB, `blip:update:${blipId}`);
    await focusBlipEditor(pageA, blipId);
    await pageA.keyboard.press('A');
    await pageA.waitForFunction(({ before, id }) => (
      (window.__outbound || []).filter((entry) => entry.event === 'blip:update' && entry.blipId === id).length > before
    ), { before: aOutboundBefore, id: blipId }, { timeout: 10000 });
    const aOutCount = await getOutboundEventCount(pageA, 'blip:update', blipId);
    recordCheck(aOutCount >= 1, `A typed → ${aOutCount} blip:update emits (BUG #57a — Y.js binding wired)`);

    // ===== CHECK 3: B receives the update =====
    try {
      await pageB.waitForFunction(({ eventName, before }) => (
        (window.__inbound || []).filter((entry) => entry.ev === eventName).length > before
      ), { eventName: `blip:update:${blipId}`, before: bInboundBefore }, { timeout: 10000 });
    } catch (error) {
      console.error('[collab] A socket probe:', JSON.stringify(await getSocketProbe(pageA, blipId)));
      console.error('[collab] B socket probe:', JSON.stringify(await getSocketProbe(pageB, blipId)));
      throw error;
    }
    const bInboundCount = await getInboundEventCount(pageB, `blip:update:${blipId}`);
    const bInboundDelta = bInboundCount - bInboundBefore;
    recordCheck(bInboundDelta >= 1, `B received ${bInboundDelta} new blip:update relay event(s)`);
    const bRelayReceivedAt = await pageB.evaluate(({ id, before }) => {
      const inbound = (window.__inbound || [])
        .filter((entry) => entry.ev === `blip:update:${id}`);
      return inbound[before]?.t ?? null;
    }, { id: blipId, before: bInboundBefore });
    const aRelaySentAt = await pageA.evaluate(({ id, before }) => {
      const outbound = (window.__outbound || [])
        .filter((entry) => entry.event === 'blip:update' && entry.blipId === id);
      return outbound[before]?.t ?? null;
    }, { id: blipId, before: aOutboundBefore });
    const relayLatencyMs = typeof bRelayReceivedAt === 'number' && typeof aRelaySentAt === 'number'
      ? bRelayReceivedAt - aRelaySentAt
      : Number.NaN;
    recordCheck(
      Number.isFinite(relayLatencyMs) && relayLatencyMs >= 0 && relayLatencyMs <= 5000,
      `A → B relay latency ${relayLatencyMs}ms (budget ≤5000ms)`
    );

    // ===== CHECK 4: B's editor text contains A's typed character =====
    await waitForEditorText(pageB, blipId, 'Initial blip contentA');
    const bText = await getEditorText(pageB, blipId);
    recordCheck(
      bText && bText.includes('Initial blip contentA'),
      `B's editor text reflects A's typing (BUG #57b — seed lock prevents divergence). Got: "${bText}"`
    );

    // Give the 300ms materialization debounce time to fire. A remote peer now
    // projects the converged HTML too, carrying the exact full-state digest
    // and durable generation;
    // this keeps Couch HTML/task/mention side-documents durable if A closes
    // before its own debounce finishes.
    await pageB.waitForTimeout(750);
    for (let attempt = 0; attempt < 40 && !putRequestsB.some(({ status }) => status !== null); attempt += 1) {
      await pageB.waitForTimeout(100);
    }
    const bRemotePuts = putRequestsB.filter(({ url }) => url.includes(encodeURIComponent(blipId)) || url.includes(blipId));
    recordCheck(
      bRemotePuts.length >= 1 && bRemotePuts.every(({
        stateDigest,
        yjsGeneration,
        status,
        startedAt,
        projectedContent,
      }) => (
        /^[a-f0-9]{64}$/.test(stateDigest)
        && /^(0|[1-9][0-9]*)$/.test(yjsGeneration)
        && status >= 200
        && status < 300
        && typeof bRelayReceivedAt === 'number'
        && startedAt >= bRelayReceivedAt
        && projectedContent.includes('Initial blip contentA')
      )),
      `B emitted ${bRemotePuts.length} digest+generation-bound 2xx REST projection(s) for A's remote edit`,
    );
    const durableProjection = await pageA.evaluate(async ({ waveId, targetBlipId }) => {
      const response = await fetch(`/api/blips?waveId=${encodeURIComponent(waveId)}&limit=500`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      const blip = data?.blips?.find((candidate) => (candidate._id || candidate.id) === targetBlipId);
      return {
        status: response.status,
        content: blip?.content || '',
        yjsGeneration: blip?.yjsGeneration,
      };
    }, { waveId: topicId, targetBlipId: blipId });
    recordCheck(
      durableProjection.status === 200
        && durableProjection.content.includes('Initial blip contentA')
        && durableProjection.yjsGeneration === 0,
      `Couch readback contains A's converged edit in generation ${durableProjection.yjsGeneration}`,
    );

    // ===== CHECK 5: bidirectional — B types, A receives =====
    const aInboundBefore = await getInboundEventCount(pageA, `blip:update:${blipId}`);
    await focusBlipEditor(pageB, blipId);
    await pageB.keyboard.press('B');
    await pageA.waitForFunction(({ eventName, before }) => (
      (window.__inbound || []).filter((entry) => entry.ev === eventName).length > before
    ), { eventName: `blip:update:${blipId}`, before: aInboundBefore }, { timeout: 10000 });
    await waitForEditorText(pageA, blipId, 'Initial blip contentAB');
    await waitForEditorText(pageB, blipId, 'Initial blip contentAB');
    const aText = await getEditorText(pageA, blipId);
    recordCheck(
      aText && aText.includes('B'),
      `A's editor text reflects B's typing (bidirectional sync). Got: "${aText}"`
    );

    // ===== CHECK 6: disconnect/reconnect catchup =====
    await pageB.evaluate(() => window.__socket && window.__socket.disconnect());
    await pageB.waitForFunction(() => !window.__socket?.connected, null, { timeout: 5000 });
    const bDisconnected = await pageB.evaluate(() => !window.__socket?.connected);
    if (!bDisconnected) {
      fail('Could not disconnect B socket for catchup test');
    } else {
      const bSyncBefore = await getInboundEventCount(pageB, `blip:sync:${blipId}`);
      // A types while B is offline
      await focusBlipEditor(pageA, blipId);
      await pageA.keyboard.press('Z');
      await waitForEditorText(pageA, blipId, 'Initial blip contentABZ');
      // Reconnect B
      await pageB.evaluate(() => window.__socket && window.__socket.connect());
      await pageB.waitForFunction(() => window.__socket?.connected, null, { timeout: 10000 });
      await pageB.waitForFunction(({ eventName, before }) => (
        (window.__inbound || []).filter((entry) => entry.ev === eventName).length > before
      ), { eventName: `blip:sync:${blipId}`, before: bSyncBefore }, { timeout: 10000 });
      await waitForEditorText(pageB, blipId, 'Initial blip contentABZ');
      const bTextAfter = await getEditorText(pageB, blipId);
      recordCheck(
        bTextAfter && bTextAfter.includes('Z'),
        `B caught up after reconnect (Z appears). Got: "${bTextAfter}"`
      );
    }

    // ===== CHECK 7: BUG #56 — sidebar refresh after mark-read =====
    // Let the 300ms REST autosave for A's offline "Z" edit settle before
    // taking the unread baseline. Otherwise that legitimate late PUT can
    // race the mark-read request and recreate one unread item after the test
    // has already observed zero, making a cache-control check flaky.
    await pageA.waitForTimeout(750);
    // Use B's session (since B's reads are tracked separately from A's).
    const beforeUnread = await pageB.evaluate(async (waveId) => {
      const r = await fetch(`/api/topics?limit=5&_t=${Date.now()}`, { credentials: 'include', cache: 'no-store' });
      const j = await r.json();
      const t = j.topics?.find((x) => x.id === waveId);
      return t?.unreadCount ?? null;
    }, topicId);

    // Mark all blips in the topic as read for B
    await pageB.evaluate(async (waveId) => {
      const csrfCookie = document.cookie.split('; ').find((c) => c.startsWith('XSRF-TOKEN='));
      const csrf = csrfCookie ? decodeURIComponent(csrfCookie.split('=')[1] || '') : '';
      const blipsRes = await fetch(`/api/blips?waveId=${waveId}`, { credentials: 'include' });
      const blipsJson = await blipsRes.json();
      const ids = (blipsJson.blips || []).map((b) => b._id);
      await fetch(`/api/waves/${encodeURIComponent(waveId)}/read`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ blipIds: ids }),
      });
    }, topicId);
    await pageB.waitForFunction(async (waveId) => {
      const r = await fetch(`/api/topics?limit=5&_t=${Date.now()}`, { credentials: 'include', cache: 'no-store' });
      const j = await r.json();
      return j.topics?.find((topic) => topic.id === waveId)?.unreadCount === 0;
    }, topicId, { timeout: 10000, polling: 250 });
    await pageB.waitForTimeout(350);
    const afterUnread = await pageB.evaluate(async (waveId) => {
      const r = await fetch(`/api/topics?limit=5&_t=${Date.now()}`, { credentials: 'include', cache: 'no-store' });
      const j = await r.json();
      const t = j.topics?.find((x) => x.id === waveId);
      return t?.unreadCount ?? null;
    }, topicId);
    // Also verify the response carried Cache-Control: no-store so it
    // can't be 304-replayed by the browser cache (this is the BUG #56 fix)
    const cacheHeader = await pageB.evaluate(async () => {
      const r = await fetch(`/api/topics?limit=5&_t=${Date.now()}`, { credentials: 'include' });
      return r.headers.get('cache-control');
    });
    recordCheck(
      beforeUnread !== null && afterUnread === 0,
      `B marked-read drained unread to 0 (was ${beforeUnread}, now ${afterUnread}; BUG #56 fix)`
    );
    recordCheck(
      cacheHeader === 'no-store',
      `Cache-Control: no-store on /api/topics. Got: "${cacheHeader}"`
    );

    if (errorsA.length || errorsB.length) {
      console.error('Page errors observed:');
      for (const e of errorsA) console.error('  A:', e);
      for (const e of errorsB) console.error('  B:', e);
    }

  } finally {
    await ctxA.close();
    await ctxB.close();
    await browserA.close();
    await browserB.close();
  }

  console.log('');
  console.log(`[collab] ${passedChecks}/${totalChecks} checks passed`);
  if (passedChecks !== totalChecks) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[collab] Fatal error:', err);
  process.exit(1);
});
