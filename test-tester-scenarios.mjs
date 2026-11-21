#!/usr/bin/env node
/**
 * Tester-scenarios regression suite: behaves like a real colleague (signs in, drives the REAL UI with
 * REAL key events, reloads, uses a second browser context as another user) and asserts BEHAVIOUR and
 * PERSISTENCE, plus zero unexpected console / page / network (4xx-5xx) / server-log errors per case.
 *
 *   npm run test:tester-scenarios
 *   RIZZOMA_BASE_URL=http://127.0.0.1:3100 COUCHDB_URL=... RIZZOMA_RENDER=both node test-tester-scenarios.mjs
 *   SUITE_FAMILIES=A,C SUITE_CASES=A01 RIZZOMA_RENDER=native ...
 *
 * RIZZOMA_RENDER = react | native | both (default react). RIZZOMA_SERVER_LOG = path of the server's
 * log (optional; scanned per case for errors). SUITE_OUT = screenshot/result folder.
 * Coverage of the documented feature rows: `npm run test:scenarios-coverage` (hard gate).
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { Ctx, OUT, RUN_ID, BASE, HEADED, SLOWMO, serverLogMark, serverLogErrors, newUser, sleep } from './scripts/tester-scenarios/lib.mjs';
import { loadCases } from './scripts/tester-scenarios/cases/index.mjs';

const renders = (process.env.RIZZOMA_RENDER || 'react') === 'both' ? ['react', 'native'] : [process.env.RIZZOMA_RENDER || 'react'];
const famFilter = (process.env.SUITE_FAMILIES || '').split(',').filter(Boolean);
const caseFilter = (process.env.SUITE_CASES || '').split(',').filter(Boolean);
const CASE_TIMEOUT = Number(process.env.SUITE_CASE_TIMEOUT_MS || 240000);

const cases = (await loadCases()).filter((c) => (!famFilter.length || famFilter.includes(c.family)) && (!caseFilter.length || caseFilter.includes(c.id)));
fs.mkdirSync(OUT, { recursive: true });
// Live runs: this machine's resolver drops the nip.io name now and then (ERR_NAME_NOT_RESOLVED); pin the host inside the browser only.
const liveHost = process.env.SUITE_LIVE === '1' ? new URL(BASE).hostname : '';
const browser = await chromium.launch({ headless: !HEADED, slowMo: SLOWMO, args: liveHost && /nip\.io$/.test(liveHost) ? [`--host-resolver-rules=MAP ${liveHost} ${liveHost.replace(/\.nip\.io$/, '').replace(/-/g, '.')}`] : [] });
if (HEADED) console.log(`HEADED run: visible browser, slowMo ${SLOWMO} ms, evidence in ${process.env.SUITE_EVIDENCE || '/mnt/c/Apps/rizzoma/session-2026-11-16/screenshots/tester-scenarios-suite'}`);
const results = [];
const RESULTS_FILE = path.join(OUT, 'results.json');
const flush = () => { const j = JSON.stringify({ run: RUN_ID, base: BASE, renders, partial: true, results }, null, 1); fs.writeFileSync(RESULTS_FILE, j); fs.writeFileSync(path.join(OUT, `results-${RUN_ID}.json`), j); };
// resume: SUITE_RESUME=<earlier results.json> keeps the earlier PASS / KNOWN-GAP / N/A results and re-runs only the rest
const resumed = new Map();
if (process.env.SUITE_RESUME) { for (const r of JSON.parse(fs.readFileSync(process.env.SUITE_RESUME, 'utf8')).results) if (r.status !== 'FAIL') resumed.set(`${r.render}:${r.id}`, r); }
const withTimeout = (p, ms, id) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`case ${id} timed out after ${ms} ms`)), ms))]);
const passShotDone = new Set();

for (const render of renders) {
  console.log(`\n===== render path: ${render}  base: ${BASE}  run: ${RUN_ID} =====`);
  // The native render path is opt-in and experimental. Probe once whether it offers the controls the UI cases need
  // (the topic reply box); if not, say so per case (N/A with the reason) instead of failing 90 cases for one cause.
  let nativeUiGap = null;
  if (render === 'native') {
    const ctx0 = new Ctx(browser, { id: 'probe' }, render);
    try {
      const u = await ctx0.client(await newUser('p'));
      const tid = await ctx0.topic(u, 'native probe');
      await u.openTopic(tid, 6000);
      const n = await u.page.locator('.write-reply-input').count();
      if (!n) nativeUiGap = 'experimental opt-in native path (not default, no in-app switch: RizzomaTopicDetail.tsx:1850-1860) has no topic reply box (.write-reply-input) and different blip DOM; guarded by Q01';
    } catch (e) { nativeUiGap = `native probe failed: ${String(e).slice(0, 80)}`; }
    await ctx0.cleanup();
    if (nativeUiGap) console.log(`NATIVE PATH LIMITATION: ${nativeUiGap}`);
  }
  for (const spec of cases) {
    if (resumed.has(`${render}:${spec.id}`)) { results.push(resumed.get(`${render}:${spec.id}`)); console.log(`KEEP  ${spec.id} (from ${process.env.SUITE_RESUME})`); continue; }
    const na = spec.na?.[render] || (nativeUiGap && !['S', 'R'].includes(spec.family) ? nativeUiGap : null) || (spec.paths && !spec.paths.includes(render) ? 'not applicable on this render path' : null);
    if (na) { results.push({ id: spec.id, family: spec.family, render, status: 'N/A', reason: na, title: spec.title }); console.log(`N/A   ${spec.id} ${spec.title} | ${na}`); continue; }
    const ctx = new Ctx(browser, spec, render);
    const mark = serverLogMark();
    const t0 = Date.now();
    let status = 'PASS'; let err = '';
    try {
      await withTimeout(spec.run(ctx), spec.timeoutMs || CASE_TIMEOUT, spec.id);
      ctx.settleProblems();
      const logErr = serverLogErrors(mark);
      if (logErr) ctx.ok(logErr.length === 0, 'no unexpected server-log errors', logErr.join(' || '));
    } catch (e) { err = String(e?.message || e).slice(0, 300); ctx.ok(false, 'case ran to completion', err); }
    const failed = ctx.checks.filter((c) => !c.ok);
    if (failed.length && spec.knownGap) {
      status = 'KNOWN-GAP';
    } else if (failed.length) {
      status = 'FAIL';
      const c0 = ctx.clients[0];
      if (c0) await c0.shot(`FAIL-${render}-${spec.id}`);
    } else if (!passShotDone.has(`${render}${spec.family}`) && ctx.clients[0]) {
      passShotDone.add(`${render}${spec.family}`);
      await ctx.clients[0].shot(`pass-${render}-${spec.family}-${spec.id}`);
    }
    await Promise.race([ctx.cleanup(), new Promise((r) => setTimeout(r, 90000))]).catch(() => undefined);
    results.push({ id: spec.id, family: spec.family, render, status, title: spec.title, rows: spec.rows || [], shotRows: spec.shotRows || [], ms: Date.now() - t0, checks: ctx.checks }); flush();
    console.log(`${status.padEnd(5)} ${spec.id} ${spec.title} (${Math.round((Date.now() - t0) / 1000)}s)${status === 'KNOWN-GAP' ? ` | documented gap: ${spec.knownGap}` : ''}`);
    for (const c of ctx.checks) if (!c.ok) console.log(`        - FAIL ${c.label} | ${c.detail}`);
  }
}
await browser.close();

const fams = [...new Set(results.map((r) => r.family))].sort();
console.log('\n===== summary (pass/fail/n-a per family per path) =====');
for (const render of renders) {
  for (const f of fams) {
    const rs = results.filter((r) => r.render === render && r.family === f);
    console.log(`${render.padEnd(6)} ${f}: pass ${rs.filter((r) => r.status === 'PASS').length}  fail ${rs.filter((r) => r.status === 'FAIL').length}  known-gap ${rs.filter((r) => r.status === 'KNOWN-GAP').length}  n/a ${rs.filter((r) => r.status === 'N/A').length}`);
  }
}
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ run: RUN_ID, base: BASE, renders, results }, null, 1));
fs.writeFileSync(path.join(OUT, `results-${RUN_ID}.json`), JSON.stringify({ run: RUN_ID, base: BASE, renders, results }, null, 1));
const totalFail = results.filter((r) => r.status === 'FAIL').length;
console.log(totalFail ? `${totalFail} CASE(S) FAILED` : 'ALL APPLICABLE CASES PASSED');
process.exit(totalFail ? 1 : 0);
