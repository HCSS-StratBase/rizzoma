#!/usr/bin/env node
// FEATURE LEDGER generator. Row sources: (A) the 240-row contract RIZZOMA_FEATURES_STATUS.md, (B) every gadget in the
// client registry, (C) every client module of the ORIGINAL source (original-rizzoma-src/src/client/*), (D) every legacy
// reference screenshot (screenshots/260714-legacy-reference-archive/*.png). Rows without a covering case stay UNCHECKED
// and are counted loudly at the top. A row is WORKS only when every covering case passed AND at least one drove the real
// GUI (family S is API contract and never counts). Dimension columns (old stored state, edit AND read mode, phone
// 390x844 touch, live host) default to UNCHECKED until a case covers them.
//   node scripts/tester-scenarios/ledger.mjs <local results.json> [--live <live results.json>] [--evidence <steps dir>] [--out <dir>] [--build <sha>]
import fs from 'node:fs';
import path from 'node:path';
import { parseFeatureRows, repoRoot } from './feature-rows.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const resFile = args.find((a) => a.split(',')[0].endsWith('.json') && !['--live', '--reviews'].includes(args[args.indexOf(a) - 1]));
const parityDir = opt('--parity', '/home/stephan/ledger-evidence/parity1');
const liveFile = opt('--live', '');
const evid = opt('--evidence', '/mnt/c/Apps/rizzoma/session-2026-11-16/screenshots/tester-scenarios-suite/steps');
const outDir = opt('--out', repoRoot);
const build = opt('--build', 'unknown build');
const origSrc = opt('--orig', '/mnt/c/Rizzoma/original-rizzoma-src/src/client');
const reviewsFile = opt('--reviews', path.join(repoRoot, 'scripts/tester-scenarios/reviews.json'));
const reviews = fs.existsSync(reviewsFile) ? JSON.parse(fs.readFileSync(reviewsFile, 'utf8')) : {};
// several results files may be given comma-separated: later files override earlier ones per (render, case id)
const load = (f) => {
  if (!f) return null;
  const merged = new Map(); let first = null;
  for (const one of f.split(',')) { const j = JSON.parse(fs.readFileSync(one, 'utf8')); first = first || j; for (const r of j.results) merged.set(`${r.render}:${r.id}`, r); }
  return { ...first, results: [...merged.values()] };
};
const run = load(resFile); const live = load(liveFile);
const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
const react = (r) => (r ? r.results.filter((x) => x.render === 'react') : []);
const local = react(run); const liveRes = react(live);

// ---- rows
const rows = parseFeatureRows().map((r) => ({ id: r.id, group: `contract ${r.section}. ${r.sectionTitle}`, text: r.text, source: `RIZZOMA_FEATURES_STATUS.md line ${r.line}`, caseIds: null, cites: r.id }));
const gadgets = { youtube: ['X08'], code: ['X11'], poll: ['X05'], latex: ['X07'], iframe: ['X10'], spreadsheet: ['X09'], image: ['X11'], kanbanApp: ['X01'], calendarApp: ['X02'], focusApp: ['X03'], notesApp: ['X04'] };
for (const [g, ids] of Object.entries(gadgets)) rows.push({ id: `G-${g}`, group: 'gadget', text: `Gadget "${g}" inserted from the palette renders what a user sees`, source: 'src/client/gadgets/registry.ts', caseIds: ids });
const modMap = { blip: /blip|inline|thread|fold|nest/i, editor: /format|bold|italic|underline|list|link|toolbar|undo|redo|paste|code|clear/i, wave: /topic|root/i, search_panel: /search/i, playback: /playback/i, mindmap: /mind ?map/i, export: /export/i, navigation: /navigat|mention|task|public|store|team|tab/i, user: /avatar|participant|profile|contributor|author/i, auth: /sign|login|logout|password|register/i, tag: /tag/i, file: /attach|upload|file|image/i, creating_topic_wizard: /new topic|create.*topic|wizard/i, market_panel: /store|gadget|market/i, account_setup_wizard: /account|setup/i, account_merge: /merge/i };
let mods = [];
try { mods = fs.readdirSync(origSrc, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort(); } catch { /* source not present */ }
const contract = rows.filter((r) => r.cites);
for (const m of mods) {
  const n = fs.readdirSync(path.join(origSrc, m)).length;
  const re = modMap[m];
  rows.push({ id: `O-${m}`, group: 'original client module', text: `Original client module "${m}" (${n} files): its user-visible behaviour`, source: `original-rizzoma-src/src/client/${m}/`, caseIds: null, derivedFrom: re ? contract.filter((r) => re.test(r.text)).map((r) => r.id) : [] });
}
let shots = [];
try { shots = fs.readdirSync(path.join(repoRoot, 'screenshots/260714-legacy-reference-archive')).filter((f) => f.endsWith('.png')).sort(); } catch { /* none */ }
for (const f of shots) rows.push({ id: `S-${f.replace(/\.png$/, '').slice(0, 48)}`, group: 'legacy screenshot', text: `Original screen "${f.replace(/\.png$/, '')}": ours looks and behaves like it`, source: `screenshots/260714-legacy-reference-archive/${f}`, caseIds: [], shotRow: true, shotKey: f.replace(/\.png$/, '') });

// ---- evaluate
const GUI = (r) => r.family !== 'S';
function shotFor(r) {
  const dir = path.join(evid, `${r.render}-${r.id}`);
  try { const fl = fs.readdirSync(dir).sort(); const bad = fl.find((f) => /-FAIL-/.test(f)); const p = bad || fl[fl.length - 1] || fl[0]; return p ? path.join(dir, p) : ''; } catch { return ''; }
}
function evaluate(cs) {
  if (!cs.length) return { result: 'UNCHECKED', reason: 'no case covers this row', shotCase: null };
  const failed = cs.filter((c) => c.status === 'FAIL'); const gap = cs.filter((c) => c.status === 'KNOWN-GAP'); const pass = cs.filter((c) => c.status === 'PASS');
  const det = (c) => `${c.id}: ${(c.checks || []).filter((k) => !k.ok).map((k) => k.label).join('; ').slice(0, 160)}`;
  let result; let reason;
  if (failed.length && pass.length) { result = 'PARTIAL'; reason = `fails: ${failed.map(det).join(' | ')}; passes: ${pass.map((c) => c.id).join(', ')}`; }
  else if (failed.length) { result = 'BROKEN'; reason = failed.map(det).join(' | '); }
  else if (gap.length) { result = 'PARTIAL'; reason = `documented gap in ${gap.map((c) => c.id).join(', ')}`; }
  else if (pass.some(GUI)) { result = 'WORKS'; reason = `GUI case(s) passed: ${pass.filter(GUI).map((c) => c.id).join(', ')}`; }
  else if (pass.length) { result = 'UNCHECKED'; reason = `only API contract cases (${pass.map((c) => c.id).join(', ')}); no user-visible check`; }
  else { result = 'UNCHECKED'; reason = 'not applicable on this render path'; }
  return { result, reason, shotCase: failed[0] || pass.find(GUI) || cs[0] };
}
const casesFor = (res, row) => (row.shotRow ? res.filter((r) => (r.shotRows || []).includes(row.shotKey)) : row.cites ? res.filter((r) => (r.rows || []).includes(row.cites)) : (row.caseIds || []).map((id) => res.find((r) => r.id === id)).filter(Boolean));
const rank = { BROKEN: 0, PARTIAL: 1, UNCHECKED: 2, UNREVIEWED: 2.5, NEEDS_SDS: 2.7, WORKS: 3 };
function rowResult(res, row, byId) {
  const rv0 = res === local ? reviews[row.id] : null;
  if (rv0 && (row.derivedFrom || row.shotRow) && ['NEEDS_SDS', 'WORKS', 'PARTIAL', 'BROKEN'].includes(rv0.verdict) && row.derivedFrom && !row.derivedFrom.length) return { result: rv0.verdict, reason: `${rv0.verdict === 'NEEDS_SDS' ? 'no user-visible check possible: ' : 'recorded reading: '}${rv0.note}`, shotCase: null, cs: [] };
  if (row.derivedFrom) {
    if (!row.derivedFrom.length) return { result: 'UNCHECKED', reason: 'no contract row maps to this original module and no case exercises it', shotCase: null, cs: [] };
    const subs = row.derivedFrom.map((id) => byId.get(id)).filter(Boolean);
    const worst = subs.reduce((a, b) => (rank[b.result] < rank[a.result] ? b : a), subs[0]);
    const allWorks = subs.every((s) => s.result === 'WORKS');
    const result = allWorks ? 'WORKS' : (subs.some((s) => s.result === 'BROKEN' || s.result === 'PARTIAL') ? 'PARTIAL' : 'UNCHECKED');
    return { result, reason: `derived from ${subs.length} contract rows (${subs.filter((s) => s.result === 'WORKS').length} WORKS, ${subs.filter((s) => s.result === 'BROKEN').length} BROKEN, ${subs.filter((s) => s.result === 'PARTIAL').length} PARTIAL, ${subs.filter((s) => s.result === 'UNCHECKED').length} UNCHECKED); worst: ${worst.id}`, shotCase: null, cs: [] };
  }
  if (row.shotRow && !casesFor(res, row).length) return { result: 'UNCHECKED', reason: 'no case compares this original screen with the modernized one', shotCase: null, cs: [] };
  const cs = casesFor(res, row); const e = evaluate(cs);
  // A passing case is not enough: a WORKS row also needs a person's (or agent's) recorded reading of its screenshot.
  const rv = res === local ? reviews[row.id] : null;
  // NEEDS_SDS: a row with no user-visible behaviour (or none in the modernized product) that a person must accept or reject; never counts as WORKS.
  if (rv && rv.verdict === 'NEEDS_SDS' && e.result !== 'BROKEN' && e.result !== 'PARTIAL') return { ...e, result: 'NEEDS_SDS', reason: `no user-visible check possible: ${rv.note}`, cs };
  if (res === local && e.result === 'WORKS' && !rv) return { ...e, result: 'UNREVIEWED', reason: `${e.reason}; the screenshot has not been read yet`, cs };
  if (rv && rv.verdict && rv.verdict !== 'WORKS' && e.result !== 'BROKEN') return { ...e, result: rv.verdict, reason: `screenshot review: ${rv.note}`, cs };
  if (rv && e.result === 'WORKS') return { ...e, reason: `${e.reason}; screenshot read: ${rv.note}`, cs };
  return { ...e, cs };
}
function build1(res) {
  const byId = new Map();
  const out = new Map();
  for (const row of rows.filter((r) => r.cites || r.caseIds)) { const r = rowResult(res, row, byId); byId.set(row.id, { ...r, id: row.id }); out.set(row.id, r); }
  for (const row of rows.filter((r) => r.derivedFrom || r.shotRow)) out.set(row.id, rowResult(res, row, byId));
  return out;
}
const L = build1(local); const V = liveRes.length ? build1(liveRes) : null;
const dim = (row, cs) => {
  const ph = cs.filter((c) => c.family === 'I'); const both = cs.filter((c) => /^X(0[7-9]|1[01])$/.test(c.id));
  const st = (a) => (!a.length ? 'UNCHECKED' : a.every((c) => c.status === 'PASS') ? 'WORKS' : 'BROKEN');
  return { old: 'UNCHECKED', mode: st(both), phone: st(ph) };
};
const count = (m) => { const c = { WORKS: 0, BROKEN: 0, PARTIAL: 0, UNCHECKED: 0, UNREVIEWED: 0, NEEDS_SDS: 0 }; for (const v of m.values()) c[v.result] += 1; return c; };
const cl = count(L); const total = rows.length;
const top = `${total} rows. LOCAL: WORKS ${cl.WORKS}, BROKEN ${cl.BROKEN}, PARTIAL ${cl.PARTIAL}, **UNCHECKED ${cl.UNCHECKED}**, passed but screenshot not yet read ${cl.UNREVIEWED}, NEEDS SDS DECISION ${cl.NEEDS_SDS}` + (V ? `. LIVE: ${Object.entries(count(V)).map(([k, v]) => `${k} ${v}`).join(', ')}` : '. LIVE: not yet run, every row UNCHECKED on live');
const colour = { WORKS: '#1b7a3a', BROKEN: '#b3261e', PARTIAL: '#b26a00', UNCHECKED: '#555', UNREVIEWED: '#2a5db0', NEEDS_SDS: '#7a3fb0' };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rel = (p) => (p ? path.relative(outDir, p) : '');
const header = `Build under test: ${build}. Generated ${when}. Evidence: headed Chromium on a private Xvfb display, signed in as a seeded non-owner user. Dimensions OLD STORED STATE, EDIT+READ MODE, PHONE 390x844 default to UNCHECKED until a case covers them (old state: no fixtures yet, so UNCHECKED everywhere).`;
const shotOf = (row, l) => (row.shotRow ? (() => { const f = path.join(parityDir, 'parity', `${row.shotKey}-compare.png`); return fs.existsSync(f) ? f : ''; })() : (l.shotCase ? shotFor(l.shotCase) : ''));
const lines = [];
const md = ['# Feature ledger', '', header, '', `**${top.replace(/\*\*/g, '')}**`, '',
  '| Row | Group | Feature (expected per the original, source) | Local | Live | Old state | Edit+read | Phone | Why | Evidence | Case | Who / when |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
for (const row of rows) {
  const l = L.get(row.id); const v = V ? V.get(row.id) : null; const d = dim(row, l.cs || []);
  const sh = shotOf(row, l);
  lines.push({ row, l, v, d, sh });
  md.push(`| ${row.id} | ${row.group} | ${row.text.replace(/\|/g, '/')} (${row.source}) | ${l.result} | ${v ? v.result : 'UNCHECKED'} | ${d.old} | ${d.mode} | ${d.phone} | ${l.reason.replace(/\|/g, '/')} | ${sh ? rel(sh) : '-'} | ${(l.cs || []).map((c) => c.id).join(', ') || '-'} | suite ${when} |`);
}
fs.writeFileSync(path.join(outDir, 'FEATURE_LEDGER.md'), md.join('\n') + '\n');
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Feature ledger</title>
<style>body{font:15px system-ui,sans-serif;margin:0 16px 40px;max-width:1100px}h1{font-size:20px}.top{background:#fff3cd;border:2px solid #b26a00;border-radius:6px;padding:8px 12px;color:#222}.row{border:1px solid #ccc;border-left:6px solid var(--c);border-radius:6px;margin:8px 0;padding:8px 10px}.res{font-weight:700;color:var(--c)}small{color:#555}img{max-width:100%;border:1px solid #ddd;margin-top:6px}.dims span{display:inline-block;margin-right:10px}
@media(prefers-color-scheme:dark){body{background:#111;color:#eee}.row{border-color:#444}small{color:#aaa}}</style>
<h1>Feature ledger</h1><p><small>${esc(header)}</small></p><p class="top"><b>${esc(top.replace(/\*\*/g, ''))}</b></p>
${lines.map(({ row, l, v, d, sh }) => `<div class="row" style="--c:${colour[l.result]}"><b>${esc(row.id)}</b> <small>${esc(row.group)}</small><br>${esc(row.text)}<br><small>expected per: ${esc(row.source)}</small><br><span class="res">LOCAL ${l.result}</span> <small>${esc(l.reason)}</small><br><span class="dims"><span>LIVE ${v ? v.result : 'UNCHECKED'}</span><span>old state ${d.old}</span><span>edit+read ${d.mode}</span><span>phone ${d.phone}</span></span><br><small>case ${esc((l.cs || []).map((c) => c.id).join(', ') || '-')} · suite ${when}</small>${sh && fs.existsSync(sh) ? `<br><a href="${esc(rel(sh))}"><img loading="lazy" src="${esc(rel(sh))}"></a>` : ''}</div>`).join('\n')}`;
fs.writeFileSync(path.join(outDir, 'FEATURE_LEDGER.html'), html);
console.log(top.replace(/\*\*/g, ''));
