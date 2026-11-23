#!/usr/bin/env node
/**
 * Admin-only, server-side import of ONE topic from the HTML export of the original rizzoma.com
 * (/data/backups/rizzoma-backups/data/backups/<Title>_<id>.html). Needs shell access to the server and the app's
 * CouchDB credentials (COUCHDB_URL, COUCHDB_DB) and the app's working directory (so image bytes, if the export held
 * any, land in the same data/uploads folder the app serves). Nothing here is an HTTP endpoint.
 *
 *   node scripts/import-rizzoma-backup.mjs <file.html> [--dry-run] [--id-prefix scratch-] [--title-prefix "ZZ SCRATCH "]
 *                                        [--tz-offset-min 0] [--viewer email[:viewer|commenter|editor]] [--report out.json]
 *   node scripts/import-rizzoma-backup.mjs --delete <topicId>      (only a topic this importer made; removes its blips,
 *                                                                  participants, uploads and placeholder-free data)
 *
 * Runs against the COMPILED release (dist/server/server/...): the server has no tsx. From a release or lane directory, with the
 * service environment loaded (set -a; . /etc/rizzoma/production.env; set +a). Idempotent: ids come from the original topic id and the reply's position; run again to update in place.
 * Nothing is bulk-imported: one file per call. The default id prefix is empty (the original topic id is kept).
 */
import fs from 'node:fs';
const dist = new URL('../dist/server/server/', import.meta.url);
const { find, getDoc, insertDoc, updateDoc, deleteDoc } = await import(new URL('lib/couch.js', dist).href);
const { parseBackupHtml, importParsedTopic } = await import(new URL('lib/backupImport.js', dist).href);

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };

const notFound = (e) => String(e?.message || '').startsWith('404');
const deps = {
  getDoc: async (id) => { try { return await getDoc(id); } catch (e) { if (notFound(e)) return null; throw e; } },
  insertDoc: async (doc) => { await insertDoc(doc); },
  updateDoc: async (doc) => { await updateDoc(doc); },
  findUserByEmail: async (email) => (await find({ type: 'user', email }, { limit: 1 })).docs[0] || null,
  storeFile: async ({ bytes, name, waveId, blipId, uploaderId }) => {
    const { storeImportedImageBytes } = await import(new URL('routes/uploads.js', dist).href);
    return storeImportedImageBytes({ buffer: bytes, originalName: name, waveId, blipId, uploaderId });
  },
};

async function deleteImported(topicId) {
  const topic = await deps.getDoc(topicId);
  if (!topic || topic.type !== 'topic') throw new Error(`no topic ${topicId}`);
  if (!topic.importedFrom) throw new Error('refusing: this topic was not made by the importer');
  const docs = [topic];
  for (const type of ['blip', 'participant', 'upload']) {
    docs.push(...(await find({ type, waveId: topicId }, { limit: 20000 })).docs);
  }
  let removed = 0;
  for (const d of docs) {
    if (d.type === 'upload' && d.storageKey) { try { fs.unlinkSync(`${process.cwd()}/data/uploads/${String(d.storageKey).replace(/[^\w.-]/g, '')}`); } catch { /* already gone */ } }
    await deleteDoc(d._id, d._rev); removed++;
  }
  console.log(JSON.stringify({ deleted: topicId, documents: removed }));
}

async function main() {
  const del = opt('--delete');
  if (del) return deleteImported(del);
  const file = argv.find((a) => a.endsWith('.html'));
  if (!file) throw new Error('usage: import-rizzoma-backup.mjs <file.html> [options]  |  --delete <topicId>');
  const parsed = parseBackupHtml(fs.readFileSync(file, 'utf8'), { offsetMinutes: Number(opt('--tz-offset-min') || 0) });
  const extraParticipants = argv.flatMap((a, i) => a === '--viewer' && argv[i + 1]
    ? [(([email, role]) => ({ email, role: role || 'viewer' }))(String(argv[i + 1]).split(':'))] : []);
  const report = await importParsedTopic(parsed, deps, {
    idPrefix: opt('--id-prefix'), titlePrefix: opt('--title-prefix'), dryRun: flag('--dry-run'), extraParticipants,
  });
  const out = opt('--report');
  const text = JSON.stringify({ ...report, files: { ...report.files, list: report.files.list.map(({ name, kind, status, originalUrl }) => ({ name, kind, status, originalUrl })) } }, null, 2);
  if (out) fs.writeFileSync(out, text);
  console.log(JSON.stringify({ ...report, files: { stored: report.files.stored, missingInBackup: report.files.missingInBackup } }));
}

main().catch((e) => { console.error('import failed:', e?.message || e); process.exit(1); });
