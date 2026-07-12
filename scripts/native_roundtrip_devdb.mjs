#!/usr/bin/env node
/**
 * Round-trip parser/serializer test against every blip in a CouchDB.
 *
 * The original Rizzoma stored each blip's content as a ContentArray-like
 * structure with field names like `{t, params: {__TYPE, L_BULLETED, …}}`.
 * The modernized port (this codebase) uses the same conceptual model but
 * with TS-friendly field names (`{type, text, params: {bulleted, …}}`).
 *
 * This script:
 *   1. Pulls every doc from the DB with `type === "blip"`
 *   2. Adapts the legacy on-disk shape → our ContentArray model
 *   3. Serializes via `serializeContentArrayToHtml()` → HTML
 *   4. Re-parses via `parseHtmlToContentArray()` → ContentArray
 *   5. Compares normalized first/second arrays
 *
 * Usage:
 *   COUCH_URL=http://127.0.0.1:5984 COUCH_AUTH=admin:password DB=project_rizzoma \
 *     node scripts/native_roundtrip_devdb.mjs
 *
 *   # Limit to N blips (smoke test)
 *   COUCH_URL=... node scripts/native_roundtrip_devdb.mjs --limit 25
 *
 * Exit 0 if all blips round-trip cleanly; non-zero on any divergence
 * (prints all failures before exiting).
 */

import { argv, env, exit } from 'node:process';
import { JSDOM } from 'jsdom';

// Bootstrap jsdom-like globals for the parser (which uses DOMParser).
const { window } = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
});
globalThis.window = window;
globalThis.document = window.document;
globalThis.DOMParser = window.DOMParser;
globalThis.Node = window.Node;
globalThis.Element = window.Element;
globalThis.HTMLElement = window.HTMLElement;

// Note: launch via `node --import tsx scripts/native_roundtrip_devdb.mjs`
// so tsx can transpile the .ts imports. Pure node can't import .ts files.
const { parseHtmlToContentArray } = await import('../src/client/native/parser.ts');
const { serializeContentArrayToHtml } = await import('../src/client/native/serializer.ts');

// ─── CLI ───
const args = argv.slice(2);
const limit = (() => {
  const i = args.indexOf('--limit');
  return i >= 0 ? parseInt(args[i + 1], 10) : Infinity;
})();
const couchUrl = env.COUCH_URL;
const couchAuth = env.COUCH_AUTH; // user:pass
if (!couchUrl) {
  console.error('error: COUCH_URL not set');
  console.error('  e.g. COUCH_URL=http://admin:secret@127.0.0.1:5984 node scripts/native_roundtrip_devdb.mjs');
  exit(2);
}

const headers = { 'content-type': 'application/json' };
if (couchAuth) {
  headers['authorization'] = 'Basic ' + Buffer.from(couchAuth).toString('base64');
}

// ─── Helpers ───
const fetchJson = async (path) => {
  const res = await fetch(couchUrl.replace(/\/$/, '') + path, { headers });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
};

const normalize = (arr) =>
  arr.map((el) => {
    if (el.type === 'text') return { ...el, text: el.text.replace(/\s+/g, ' ') };
    return { ...el };
  });

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ─── Probe ───
console.log(`▶ COUCH_URL=${couchUrl.replace(/\/\/[^@]+@/, '//***@')}`);
let info;
try {
  info = await fetchJson('/');
} catch (err) {
  console.error('error: cannot reach CouchDB —', err.message);
  exit(2);
}
console.log(`✓ CouchDB ${info.version} reachable\n`);

const dbName = env.DB || 'project_rizzoma';
try {
  await fetchJson('/' + dbName);
} catch (err) {
  console.error(`error: DB '${dbName}' not reachable:`, err.message);
  exit(2);
}
console.log(`▶ Using DB: ${dbName}`);

// Enumerate all docs, filter to blips.
const all = await fetchJson(`/${dbName}/_all_docs?include_docs=true`);
const blips = all.rows
  .map((r) => r.doc)
  .filter((d) => d && d.type === 'blip' && Array.isArray(d.content));
console.log(`▶ Found ${blips.length} blips in ${dbName}`);

const subset = blips.slice(0, limit);
console.log(`▶ Round-tripping ${subset.length} blip(s)\n`);

// ─── Legacy → modern adapter ──────────────────────────────────────────
// Original Rizzoma's ContentArray uses {t, params: {__TYPE, L_BULLETED, ...}}.
// Modern code uses {type, text, params: {bulleted, ...}}.
const LEGACY_TYPE = { LINE: 'line', TEXT: 'text', BLIP: 'blip', ATTACHMENT: 'attachment' };

const adaptElement = (el) => {
  const legacyType = el.params?.__TYPE;
  const type = LEGACY_TYPE[legacyType];
  if (!type) return null; // unknown type; skip
  const params = {};
  if (typeof el.params.L_BULLETED === 'number') params.bulleted = el.params.L_BULLETED;
  if (typeof el.params.L_NUMBERED === 'number') params.numbered = el.params.L_NUMBERED;
  if (typeof el.params.L_HEADING === 'number') params.heading = el.params.L_HEADING;
  if (el.params.T_BOLD) params.bold = true;
  if (el.params.T_ITALIC) params.italic = true;
  if (el.params.T_UNDERLINED) params.underlined = true;
  if (el.params.T_STRUCK_THROUGH) params.struckthrough = true;
  if (el.params.T_URL) params.url = el.params.T_URL;
  if (el.params.__ID) params.id = el.params.__ID;
  if (el.params.__THREAD_ID) params.threadId = el.params.__THREAD_ID;
  return { type, text: el.t ?? ' ', params };
};

const adaptContent = (legacyArr) =>
  legacyArr.map(adaptElement).filter((x) => x !== null);

// ─── Round-trip ───
let pass = 0;
const failures = [];

for (const blip of subset) {
  let modern;
  try {
    modern = adaptContent(blip.content);
  } catch (err) {
    failures.push({ id: blip._id, reason: 'adapter: ' + err.message });
    continue;
  }
  try {
    const html = serializeContentArrayToHtml(modern);
    const reparsed = parseHtmlToContentArray(html);
    if (deepEqual(normalize(modern), normalize(reparsed))) {
      pass++;
    } else {
      const m = normalize(modern);
      const r = normalize(reparsed);
      let diffIdx = -1;
      for (let i = 0; i < Math.max(m.length, r.length); i++) {
        if (JSON.stringify(m[i]) !== JSON.stringify(r[i])) {
          diffIdx = i;
          break;
        }
      }
      const detail = diffIdx >= 0
        ? `diff @${diffIdx}: modern=${JSON.stringify(m[diffIdx])} reparsed=${JSON.stringify(r[diffIdx])}`
        : `length: modern=${m.length}, reparsed=${r.length}`;
      failures.push({ id: blip._id, reason: detail });
    }
  } catch (err) {
    failures.push({ id: blip._id, reason: err.message });
  }
}

// ─── Report ───
console.log(`✓ ${pass}/${subset.length} round-tripped cleanly`);
if (failures.length) {
  console.log(`✗ ${failures.length} failures:`);
  for (const f of failures.slice(0, 30)) {
    console.log(`  - ${f.id}: ${f.reason}`);
  }
  if (failures.length > 30) console.log(`  …and ${failures.length - 30} more`);
  exit(1);
}
exit(0);
