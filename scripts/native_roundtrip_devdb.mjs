#!/usr/bin/env node
/**
 * Round-trip parser/serializer test against every topic in a CouchDB.
 *
 * For each topic in the topics DB, fetch the root blip's HTML content,
 * round-trip it (parse → serialize → parse) and compare normalized
 * ContentArrays. Reports any divergence as a row in the failure table.
 *
 * Usage:
 *   COUCH_URL=http://user:pw@host:5984 \
 *     node scripts/native_roundtrip_devdb.mjs
 *
 *   COUCH_URL=http://couch:5984 COUCH_AUTH=admin:secret \
 *     node scripts/native_roundtrip_devdb.mjs
 *
 *   # Limit to N topics (smoke test)
 *   COUCH_URL=... node scripts/native_roundtrip_devdb.mjs --limit 25
 *
 * Exit 0 if all topics round-trip cleanly; non-zero on first divergence
 * batch (prints all failures before exiting).
 *
 * Loads `src/client/native/parser.ts` and `serializer.ts` via tsx, so
 * jsdom is required for the parser's DOMParser API. Auto-installs jsdom
 * into the global if missing.
 */

import { argv, env, exit } from 'node:process';
import { JSDOM } from 'jsdom';
import { register } from 'node:module';

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

// Register tsx so the .ts imports below resolve.
register('tsx/esm', import.meta.url);

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

// Try common DB names. Original Rizzoma uses `topics`, `blips`, `waves`.
const dbNames = ['topics', 'topic', 'rizzoma_topics'];
let topicsDb = null;
for (const name of dbNames) {
  try {
    await fetchJson('/' + name);
    topicsDb = name;
    break;
  } catch {}
}
if (!topicsDb) {
  console.error('error: no topics DB found (tried:', dbNames.join(', '), ')');
  exit(2);
}
console.log(`▶ Using DB: ${topicsDb}`);

// Enumerate topics.
const all = await fetchJson(`/${topicsDb}/_all_docs?include_docs=true`);
const docs = all.rows.map((r) => r.doc).filter((d) => d && !d._id.startsWith('_design/'));
console.log(`▶ Found ${docs.length} topics in ${topicsDb}`);

const subset = docs.slice(0, limit);
console.log(`▶ Round-tripping ${subset.length} topic(s)\n`);

// ─── Round-trip ───
let pass = 0;
const failures = [];

for (const topic of subset) {
  const html = topic.htmlContent || topic.html || topic.content;
  if (!html) {
    failures.push({ id: topic._id, reason: 'no html field on doc' });
    continue;
  }
  try {
    const first = parseHtmlToContentArray(html);
    const re = serializeContentArrayToHtml(first);
    const second = parseHtmlToContentArray(re);
    if (deepEqual(normalize(first), normalize(second))) {
      pass++;
    } else {
      failures.push({
        id: topic._id,
        reason: `ContentArray length: first=${first.length}, second=${second.length}`,
      });
    }
  } catch (err) {
    failures.push({ id: topic._id, reason: err.message });
  }
}

// ─── Report ───
console.log(`✓ ${pass}/${subset.length} round-tripped cleanly`);
if (failures.length) {
  console.log(`✗ ${failures.length} failures:`);
  for (const f of failures) {
    console.log(`  - ${f.id}: ${f.reason}`);
  }
  exit(1);
}
exit(0);
