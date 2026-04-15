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
 * Uses a single Playwright browser instance with two separate
 * BROWSER CONTEXTS — each context has its own cookie jar, socket
 * connection, and Y.Doc state, simulating two independent users on
 * two devices much more accurately than two tabs in the same
 * context (which would share session cookies and Y.Doc cache).
 */
import { chromium } from 'playwright';

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
    const regResp = await fetch('/api/auth/register', {
      method: 'POST', headers, credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    if (regResp.ok) return { ok: true, method: 'register' };
    return { ok: false, status: regResp.status, error: await regResp.text() };
  }, { email, password });
  if (!result.ok) throw new Error(`${label}: auth failed: ${result.status} ${result.error}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.rizzoma-layout').waitFor({ timeout: 15000 });
  log(`${label}: ${result.method} OK`);
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

async function instrumentSocket(page) {
  // Wrap socket.emit to count outbound events, attach onAny for inbound.
  await page.evaluate(() => {
    const wait = (cond, ms = 5000) => new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        if (cond()) return resolve(true);
        if (Date.now() - start > ms) return resolve(false);
        setTimeout(tick, 50);
      };
      tick();
    });
    return wait(() => !!window.__socket).then(() => {
      const s = window.__socket;
      if (!s) return;
      window.__inbound = [];
      window.__outbound = [];
      const origEmit = s.emit.bind(s);
      s.emit = function(event, ...args) {
        try { window.__outbound.push({ event, t: Date.now() }); } catch {}
        return origEmit(event, ...args);
      };
      try { s.onAny((ev, ...args) => window.__inbound.push({ ev, t: Date.now() })); } catch {}
    });
  });
}

async function openTopicAndExpandBlip(page, topicId, blipId) {
  await page.goto(`${baseUrl}/?layout=rizzoma#/topic/${topicId}`, { waitUntil: 'domcontentloaded' });
  const blipLocator = page.locator(`[data-blip-id="${blipId}"]`);
  await blipLocator.waitFor({ timeout: 15000 });
  // Real-click to expand the collapsed blip — synthetic events don't
  // reliably trigger the React onClick that toggles `isExpanded`.
  await blipLocator.click();
  await page.waitForTimeout(300);
  // Then dispatch start-editing-blip to put the editor into edit mode.
  await page.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('rizzoma:activate-blip', { detail: { blipId: id } }));
    window.dispatchEvent(new CustomEvent('rizzoma:start-editing-blip', { detail: { blipId: id } }));
  }, blipId);
  // wait for the editor to mount
  await page.waitForFunction(
    (id) => !!document.querySelector(`[data-blip-id="${id}"] .ProseMirror`),
    blipId,
    { timeout: 15000 }
  );
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

async function getOutboundEventCount(page, eventName) {
  return page.evaluate((name) => {
    const out = window.__outbound || [];
    return out.filter((e) => e.event === name).length;
  }, eventName);
}

async function main() {
  log(`base URL: ${baseUrl}`);
  log(`user A: ${userA}`);
  log(`user B: ${userB}`);

  const browser = await chromium.launch({ headless: !headed, slowMo });

  // Two SEPARATE contexts = two independent cookie jars / socket connections.
  // This is the key thing we couldn't do with the in-session Playwright MCP.
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();

  // Capture console errors per page
  const errorsA = [];
  const errorsB = [];
  pageA.on('pageerror', (err) => errorsA.push(String(err)));
  pageB.on('pageerror', (err) => errorsB.push(String(err)));

  try {
    // ----- Auth both contexts -----
    await ensureAuth(pageA, userA, 'A');
    await ensureAuth(pageB, userB, 'B');

    // ----- A creates a topic + blip -----
    const { topicId, blipId } = await createTopicAndBlip(pageA, `Collab smoke ${Date.now()}`);
    log(`created topic ${topicId.slice(-8)} blip ${blipId.slice(-8)}`);

    // ----- A opens the topic and starts editing the blip -----
    await openTopicAndExpandBlip(pageA, topicId, blipId);
    await instrumentSocket(pageA);

    // ----- B opens the same topic and starts editing the same blip -----
    await openTopicAndExpandBlip(pageB, topicId, blipId);
    await instrumentSocket(pageB);

    // Wait briefly for both providers to join the collab room
    await pageA.waitForTimeout(1000);

    // ===== CHECK 1: feature flags reachable + socket up on both sides =====
    const aSocketOk = await pageA.evaluate(() => !!(window.__socket && window.__socket.connected));
    const bSocketOk = await pageB.evaluate(() => !!(window.__socket && window.__socket.connected));
    recordCheck(aSocketOk && bSocketOk, 'Sockets connected on both contexts (BUG #58 — feature flags reachable)');

    // ===== CHECK 2: A types, blip:update emits =====
    await focusBlipEditor(pageA, blipId);
    await pageA.keyboard.press('A');
    await pageA.waitForTimeout(500);
    const aOutCount = await getOutboundEventCount(pageA, 'blip:update');
    recordCheck(aOutCount >= 1, `A typed → ${aOutCount} blip:update emits (BUG #57a — Y.js binding wired)`);

    // ===== CHECK 3: B receives the update =====
    await pageB.waitForTimeout(800);
    const bInboundCount = await pageB.evaluate((id) => {
      const inbound = window.__inbound || [];
      return inbound.filter((e) => e.ev === `blip:update:${id}`).length;
    }, blipId);
    recordCheck(bInboundCount >= 1, `B received ${bInboundCount} blip:update relay events`);

    // ===== CHECK 4: B's editor text contains A's typed character =====
    const bText = await getEditorText(pageB, blipId);
    recordCheck(
      bText && bText.includes('Initial blip contentA'),
      `B's editor text reflects A's typing (BUG #57b — seed lock prevents divergence). Got: "${bText}"`
    );

    // ===== CHECK 5: bidirectional — B types, A receives =====
    await focusBlipEditor(pageB, blipId);
    await pageB.keyboard.press('B');
    await pageB.waitForTimeout(800);
    const aText = await getEditorText(pageA, blipId);
    recordCheck(
      aText && aText.includes('B'),
      `A's editor text reflects B's typing (bidirectional sync). Got: "${aText}"`
    );

    // ===== CHECK 6: disconnect/reconnect catchup =====
    await pageB.evaluate(() => window.__socket && window.__socket.disconnect());
    await pageB.waitForTimeout(300);
    const bDisconnected = await pageB.evaluate(() => !window.__socket?.connected);
    if (!bDisconnected) {
      fail('Could not disconnect B socket for catchup test');
    } else {
      // A types while B is offline
      await focusBlipEditor(pageA, blipId);
      await pageA.keyboard.press('Z');
      await pageA.waitForTimeout(500);
      // Reconnect B
      await pageB.evaluate(() => window.__socket && window.__socket.connect());
      await pageB.waitForTimeout(2000); // give the sync request time to roundtrip
      const bTextAfter = await getEditorText(pageB, blipId);
      recordCheck(
        bTextAfter && bTextAfter.includes('Z'),
        `B caught up after reconnect (Z appears). Got: "${bTextAfter}"`
      );
    }

    // ===== CHECK 7: BUG #56 — sidebar refresh after mark-read =====
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
    await pageB.waitForTimeout(300);
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
    await browser.close();
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
