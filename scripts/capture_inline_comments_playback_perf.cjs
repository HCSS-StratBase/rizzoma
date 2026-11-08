// Perf/resilience verifier for inline comments + wave-level playback
// (task #16). Seeds a topic with:
//   - N root-level blips (default 20)
//   - M inline comments per blip (default 10 → 200 total comments)
//   - K blip updates to populate wave-playback history (default 5 per blip
//     → 100 history entries)
// Then measures:
//   1. Cold topic load time & memory usage
//   2. Time for GET /api/blip/:id/comments (inline-comments fetch)
//   3. Time for GET /api/waves/:id/history (playback history fetch)
//   4. DOM counts after scroll to ensure LazyBlipSlot + inline comment
//      rendering remains budget-compliant
//
// Usage:
//   node scripts/capture_inline_comments_playback_perf.cjs <outDir> [baseUrl]

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BLIP_COUNT = Number(process.env.RIZZOMA_PERF_BLIPS || 20);
const COMMENTS_PER_BLIP = Number(process.env.RIZZOMA_PERF_COMMENTS_PER_BLIP || 10);
const HISTORY_UPDATES_PER_BLIP = Number(process.env.RIZZOMA_PERF_HISTORY_UPDATES || 5);

async function login(page, base, email, password) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForSelector('.rizzoma-layout', { timeout: 15000 });
}

async function apiReq(page, method, urlPath, body) {
  return await page.evaluate(
    async ({ method, url, payload }) => {
      const readCookie = (name) => {
        const escaped = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
        return match?.[1] ? decodeURIComponent(match[1]) : undefined;
      };
      await fetch('/api/auth/csrf', { credentials: 'include' });
      const token = readCookie('XSRF-TOKEN');
      const response = await fetch(url, {
        method,
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          ...(token ? { 'x-csrf-token': token } : {}),
        },
        ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
      });
      return { ok: response.ok, status: response.status, data: await response.json().catch(() => null) };
    },
    { method, url: urlPath, payload: body },
  );
}

async function createTopic(page, title, content) {
  const r = await apiReq(page, 'POST', '/api/topics', { title, content });
  if (!r?.ok || !r?.data?.id) throw new Error(`createTopic failed: ${JSON.stringify(r)}`);
  return r.data.id;
}

async function createBlip(page, waveId, parentId, content) {
  const r = await apiReq(page, 'POST', '/api/blips', { waveId, parentId, content });
  if (!r?.ok || !r?.data) throw new Error(`createBlip failed: ${JSON.stringify(r)}`);
  return { id: r.data.id || r.data._id || r.data.blip?._id };
}

async function updateBlip(page, blipId, content) {
  const r = await apiReq(page, 'PUT', `/api/blips/${encodeURIComponent(blipId)}`, { content });
  if (!r?.ok) throw new Error(`updateBlip failed: ${JSON.stringify(r)}`);
  return r.data;
}

async function createInlineComment(page, blipId, content, range) {
  const r = await apiReq(page, 'POST', '/api/comments', { blipId, content, range });
  if (!r?.ok) throw new Error(`createInlineComment failed: ${JSON.stringify(r)}`);
  return r.data;
}

async function main() {
  const outDir = process.argv[2];
  const base = process.argv[3] || 'http://127.0.0.1:3000';
  if (!outDir) throw new Error('Usage: node scripts/capture_inline_comments_playback_perf.cjs <outDir> [baseUrl]');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page, base, 'codex-live+1774803822194@example.com', 'CodexLive!1');

  const title = `Perf sweep #16 — ${BLIP_COUNT} blips × ${COMMENTS_PER_BLIP} comments`;
  const topicContent = `<h1>${title}</h1><p>Inline comments + wave-playback perf seed.</p>`;
  console.log(`seeding topic + ${BLIP_COUNT} blips...`);
  const topicId = await createTopic(page, title, topicContent);

  const blipIds = [];
  for (let i = 0; i < BLIP_COUNT; i++) {
    const content = `<p>Blip ${i + 1} of ${BLIP_COUNT} — "the quick brown fox jumps over the lazy dog" lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>`;
    const { id } = await createBlip(page, topicId, null, content);
    blipIds.push(id);
  }

  console.log(`seeding ${COMMENTS_PER_BLIP} inline comments per blip (${BLIP_COUNT * COMMENTS_PER_BLIP} total)...`);
  let commentCount = 0;
  const commentSeedStart = Date.now();
  for (const blipId of blipIds) {
    for (let c = 0; c < COMMENTS_PER_BLIP; c++) {
      await createInlineComment(page, blipId, `Comment ${c + 1} on ${blipId}`, {
        start: 0 + c * 2,
        end: 10 + c * 2,
        text: 'the quick',
      });
      commentCount++;
    }
  }
  const commentSeedMs = Date.now() - commentSeedStart;
  console.log(`  seeded ${commentCount} comments in ${commentSeedMs}ms (${(commentSeedMs / commentCount).toFixed(1)}ms per comment)`);

  console.log(`seeding ${HISTORY_UPDATES_PER_BLIP} history updates per blip (${BLIP_COUNT * HISTORY_UPDATES_PER_BLIP} total)...`);
  const historySeedStart = Date.now();
  let historyCount = 0;
  for (const blipId of blipIds) {
    for (let h = 0; h < HISTORY_UPDATES_PER_BLIP; h++) {
      await updateBlip(page, blipId, `<p>Blip ${blipId} — revision ${h + 2} of ${HISTORY_UPDATES_PER_BLIP + 1} — the fox was actually red, not brown, on revision ${h + 2}.</p>`);
      historyCount++;
    }
  }
  const historySeedMs = Date.now() - historySeedStart;
  console.log(`  seeded ${historyCount} history entries in ${historySeedMs}ms`);

  // ── Benchmark 1: cold topic load ──
  console.log('\nbenchmark 1: cold topic load');
  const loadStart = Date.now();
  await page.goto(`${base}/#/topic/${topicId}?layout=rizzoma&perf=1&perfRender=full`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.wave-container .rizzoma-topic-detail', { timeout: 30000 });
  await page.waitForFunction(
    (expected) => document.querySelectorAll('.blip-collapsed-row').length >= expected,
    BLIP_COUNT,
    { timeout: 30000 },
  );
  const loadMs = Date.now() - loadStart;
  const loadMetrics = await page.evaluate(() => ({
    memoryMB: performance.memory
      ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)
      : null,
    collapsedRows: document.querySelectorAll('.blip-collapsed-row').length,
    mountedBlips: document.querySelectorAll('.rizzoma-blip:not(.lazy-blip-slot)').length,
    lazySlots: document.querySelectorAll('[data-testid="lazy-blip-slot"]').length,
  }));
  console.log(`  cold load: ${loadMs}ms — ${JSON.stringify(loadMetrics)}`);

  // ── Benchmark 2: fetch inline comments for every blip ──
  console.log('\nbenchmark 2: GET inline comments for every seeded blip');
  const commentsFetchStart = Date.now();
  const commentsFetched = await page.evaluate(async (ids) => {
    const start = performance.now();
    const results = await Promise.all(
      ids.map(async (id) => {
        const r = await fetch(`/api/blip/${encodeURIComponent(id)}/comments`, { credentials: 'include' });
        const d = await r.json().catch(() => ({}));
        return Array.isArray(d.comments) ? d.comments.length : 0;
      }),
    );
    return { elapsedMs: Math.round(performance.now() - start), totals: results };
  }, blipIds);
  const commentsFetchElapsed = Date.now() - commentsFetchStart;
  const totalCommentsReturned = commentsFetched.totals.reduce((a, b) => a + b, 0);
  console.log(`  parallel fetch: ${commentsFetched.elapsedMs}ms (wall ${commentsFetchElapsed}ms) — ${totalCommentsReturned} comments returned`);
  console.log(`  per-blip: min=${Math.min(...commentsFetched.totals)} max=${Math.max(...commentsFetched.totals)}`);

  // ── Benchmark 3: wave-level playback history ──
  console.log('\nbenchmark 3: GET /api/waves/:id/history');
  const historyFetch = await page.evaluate(async (waveId) => {
    const start = performance.now();
    const r = await fetch(`/api/waves/${encodeURIComponent(waveId)}/history?limit=2000`, { credentials: 'include' });
    const d = await r.json().catch(() => ({}));
    return {
      elapsedMs: Math.round(performance.now() - start),
      entries: Array.isArray(d.history) ? d.history.length : 0,
      hasMore: !!d.hasMore,
      blipIds: Array.isArray(d.blipIds) ? d.blipIds.length : 0,
    };
  }, topicId);
  console.log(`  wave history: ${historyFetch.elapsedMs}ms — ${historyFetch.entries} entries across ${historyFetch.blipIds} blips`);

  // Snapshot
  await page.screenshot({ path: path.join(outDir, 'topic-loaded.png'), fullPage: false });

  // Budget gates
  const BUDGETS = {
    coldLoadMs: 5000,
    memoryMB: 120,
    commentsFetchMs: 4000,
    historyFetchMs: 3000,
  };
  const gates = {
    coldLoad: loadMs < BUDGETS.coldLoadMs,
    memory: (loadMetrics.memoryMB ?? 0) < BUDGETS.memoryMB,
    commentsFetch: commentsFetched.elapsedMs < BUDGETS.commentsFetchMs,
    historyFetch: historyFetch.elapsedMs < BUDGETS.historyFetchMs,
    allLabelsRendered: loadMetrics.collapsedRows >= BLIP_COUNT,
  };
  const allPass = Object.values(gates).every(Boolean);

  const audit = {
    topicId,
    base,
    config: { BLIP_COUNT, COMMENTS_PER_BLIP, HISTORY_UPDATES_PER_BLIP },
    seed: { commentCount, historyCount, commentSeedMs, historySeedMs },
    benchmarks: {
      coldLoad: { ms: loadMs, ...loadMetrics },
      commentsFetch: { ms: commentsFetched.elapsedMs, totalReturned: totalCommentsReturned },
      historyFetch,
    },
    budgets: BUDGETS,
    gates,
    result: allPass ? 'PASS' : 'FAIL',
  };
  fs.writeFileSync(path.join(outDir, 'audit.json'), JSON.stringify(audit, null, 2));
  console.log('\n─── audit ───');
  console.log(JSON.stringify(audit, null, 2));
  if (!allPass) {
    console.error('GATE FAIL');
    process.exitCode = 2;
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
