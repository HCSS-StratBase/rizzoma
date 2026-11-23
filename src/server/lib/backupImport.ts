// Server-side import of a topic from the HTML export of the ORIGINAL rizzoma.com (the nightly backup format,
// /data/backups/rizzoma-backups/data/backups/*.html). Admin-only by construction: it is a library for the CLI
// script scripts/import-rizzoma-backup.ts, which needs shell access to the server and to CouchDB; nothing here is
// reachable from the HTTP API.
//
// What it keeps: every reply as a blip with its ORIGINAL author (matched by e-mail to an existing user, otherwise a
// labelled credential-less placeholder user, the same kind of document an invitation creates, which the person
// claims by signing in with that e-mail) and its ORIGINAL time; the thread nesting (a thread inside a bullet
// becomes child blips with an inline [+] marker; replies after the first of the top thread become root-level
// blips); bold, italic, links, lists, tags (#word stays text, the reader draws it as a tag); @mentions as plain text
// (no mention document, so nobody is notified).
//
// Images: the export holds NO image bytes, only links to rizzoma.com (and to Google's CDN for pasted
// pictures). Fetching them is not allowed, so every such image becomes a clearly marked placeholder and is
// listed in the blip's `importedFiles` with its original link and status `missing-in-backup`. Only a `data:` URI
// found in an <img> is real bytes: that one is stored in the app's own file store and referenced as /uploads/<id>.
//
// Idempotent: every id is derived from the original topic id and the position of the reply, so a second run
// updates in place (or reports `unchanged`) and never duplicates.
import { createHash } from 'node:crypto';
import { parse } from 'parse5';
import { ensureBlbHtml, ensureTopicBlbHtml } from '../../shared/blbContent.js';

type PNode = any;

export type ImportedFile = { name: string; originalUrl: string; kind: 'image' | 'file'; status: 'missing-in-backup' | 'stored'; uploadId?: string };
export type ReplyAuthor = { email: string; name: string; avatar: string };
export type ParsedReply = {
  author: ReplyAuthor;
  tsRaw: string;
  createdAt: number | null;
  /** Reply HTML with <n> placeholders where an inline thread was anchored and <n> where real image bytes sit. */
  html: string;
  threads: ParsedReply[][];
  files: Array<ImportedFile & { bytes?: Buffer }>;
};
export type ParseStats = { replies: number; inlineThreads: number; authors: number; tags: number; mentions: number; images: number; files: number; unknownClasses: Record<string, number> };
export type ParsedTopic = { title: string; originalTopicId: string; replies: ParsedReply[]; stats: ParseStats };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => esc(s).replace(/"/g, '&quot;');
const attr = (n: PNode, name: string): string => (n?.attrs || []).find((a: any) => a.name === name)?.value ?? '';
const classes = (n: PNode): string[] => attr(n, 'class').split(/\s+/).filter(Boolean);
const hasClass = (n: PNode, c: string) => classes(n).includes(c);
const isEl = (n: PNode) => typeof n?.tagName === 'string';
const textOf = (n: PNode): string => n.nodeName === '#text' ? n.value : (n.childNodes || []).map(textOf).join('');
const findNode = (n: PNode, pred: (x: PNode) => boolean): PNode | null => {
  if (isEl(n) && pred(n)) return n;
  for (const c of n.childNodes || []) { const r = findNode(c, pred); if (r) return r; }
  return null;
};

/** "2021-10-7 5:16 PM" (the export's tooltip) to epoch ms. The export does not state its time zone: `offsetMinutes` is the zone of its clock, default UTC. */
export function parseExportTimestamp(raw: string, offsetMinutes = 0): number | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(raw.trim());
  if (!m) return null;
  let h = Number(m[4]);
  if (m[6]) { const pm = m[6].toUpperCase() === 'PM'; if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, Number(m[5])) - offsetMinutes * 60_000;
}

const THREAD = (code: number) => `${code}`;
const SAFE_HREF = /^(https?:|mailto:|\/)/i;
const KNOWN_CLASSES = new Set(['export-text', 'export-paragraph', 'export-list-item', 'export-list', 'export-reply', 'export-thread', 'export-thread-folded', 'export-reply-author', 'export-reply-timestamp', 'export-reply-author-no-avatar']);

export function parseBackupHtml(html: string, opts: { offsetMinutes?: number } = {}): ParsedTopic {
  const doc: PNode = parse(html);
  const content = findNode(doc, (n) => hasClass(n, 'export-content'));
  if (!content) throw new Error('not_a_rizzoma_export');
  const h1 = findNode(content, (n) => n.tagName === 'h1');
  const title = (h1 ? textOf(h1).trim() : '') || 'Imported topic';
  const topicLink = findNode(content, (n) => n.tagName === 'a' && /\/topic\//.test(attr(n, 'href')));
  const orig = /\/topic\/([0-9a-f]{32})/.exec(attr(topicLink, 'href'));
  const stats: ParseStats = { replies: 0, inlineThreads: 0, authors: 0, tags: 0, mentions: 0, images: 0, files: 0, unknownClasses: {} };
  const authors = new Set<string>();

  const readReply = (el: PNode): ParsedReply => {
    stats.replies += 1;
    const aEl = findNode(el, (n) => hasClass(n, 'export-reply-author'));
    const mail = aEl ? attr(aEl, 'href').replace(/^mailto:/i, '').trim().toLowerCase() : '';
    const bg = aEl ? /url\(([^)]+)\)/.exec(attr(aEl, 'style')) : null;
    const avatar = bg && !/rizzoma\.com/i.test(bg[1]) ? bg[1].replace(/^["']|["']$/g, '') : '';
    const author: ReplyAuthor = { email: mail, name: (aEl ? attr(aEl, 'title') : '') || mail || 'Unknown author', avatar };
    authors.add(mail || author.name);
    const tsEl = findNode(el, (n) => hasClass(n, 'export-reply-timestamp'));
    const tsRaw = tsEl ? attr(tsEl, 'title') : '';
    const threads: ParsedReply[][] = []; const files: ParsedReply['files'] = [];

    const inline = (n: PNode): string => {
      if (n.nodeName === '#text') return esc(n.value.replace(/\s+/g, ' '));
      if (!isEl(n)) return '';
      const cls = classes(n);
      if (cls.includes('export-reply-info') || n.tagName === 'style' || n.tagName === 'script') return '';
      if (cls.includes('export-thread-control')) return '';           // the control only precedes its thread
      if (cls.includes('export-thread')) {
        const replies = (n.childNodes || []).filter((c: PNode) => isEl(c) && hasClass(c, 'export-reply')).map(readReply);
        stats.inlineThreads += 1; threads.push(replies);
        const ti = threads.length - 1;
        return replies.map((_r: ParsedReply, i: number) => THREAD(ti * 1000 + i)).join('');
      }
      const kids = () => (n.childNodes || []).map(inline).join('');
      if (cls.includes('export-text-bold')) return `<strong>${kids()}</strong>`;
      if (cls.includes('export-text-italic')) return `<em>${kids()}</em>`;
      if (cls.includes('export-tag')) { stats.tags += 1; return `${esc(textOf(n))} `; }
      if (cls.includes('export-recipient')) { stats.mentions += 1; return esc(textOf(n)); }
      if (cls.includes('export-file') || cls.includes('export-attachment')) {
        const img = findNode(n, (x) => x.tagName === 'img');
        const href = attr(n, 'href'); const name = (img && attr(img, 'title')) || textOf(n).trim() || 'file';
        if (img) {
          stats.images += 1;
          const src = attr(img, 'src');
          const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(src);
          if (m) {
            files.push({ name, originalUrl: '', kind: 'image', status: 'stored', bytes: Buffer.from(m[2]!, 'base64') });
            return `${files.length - 1}`;
          }
          files.push({ name, originalUrl: href || src, kind: 'image', status: 'missing-in-backup' });
          return `<em>[Image from the original Rizzoma, not part of the backup: ${esc(name)}]</em>`;
        }
        stats.files += 1;
        files.push({ name, originalUrl: href, kind: 'file', status: 'missing-in-backup' });
        return `<em>[File from the original Rizzoma, not part of the backup: ${esc(name)}]</em>`;
      }
      if (cls.includes('export-link') || n.tagName === 'a') {
        const href = attr(n, 'href');
        return SAFE_HREF.test(href) ? `<a href="${escAttr(href)}">${kids()}</a>` : kids();
      }
      if (n.tagName === 'br') return '<br>';
      if (n.tagName === 'img') return '';
      for (const c of cls) {
        if (c.startsWith('export-') && !KNOWN_CLASSES.has(c)) { const k = `${n.tagName}.${c}`; stats.unknownClasses[k] = (stats.unknownClasses[k] || 0) + 1; }
      }
      return kids();
    };
    const isList = (n: PNode) => isEl(n) && (n.tagName === 'ul' || n.tagName === 'ol' || hasClass(n, 'export-list'));
    const isPara = (n: PNode) => isEl(n) && hasClass(n, 'export-paragraph');
    const list = (ul: PNode): string => {
      const items = (ul.childNodes || []).filter((c: PNode) => isEl(c) && (c.tagName === 'li' || hasClass(c, 'export-list-item')));
      return `<ul>${items.map((li: PNode) => {
        const kids: PNode[] = li.childNodes || [];
        return `<li><p>${kids.filter((c) => !isList(c)).map(inline).join('')}</p>${kids.filter(isList).map(list).join('')}</li>`;
      }).join('')}</ul>`;
    };
    // paragraphs and lists stay blocks; a loose run of inline content becomes one paragraph
    const blocks = (children: PNode[]): string => {
      let out = ''; let run = '';
      const flush = () => { if (run.replace(/<[^>]*>|\s/g, '')) out += `<p>${run}</p>`; run = ''; };
      for (const c of children) {
        if (isPara(c)) { flush(); out += `<p>${(c.childNodes || []).map(inline).join('')}</p>`; }
        else if (isList(c)) { flush(); out += list(c); }
        else run += inline(c);
      }
      flush();
      return out;
    };
    const body = (el.childNodes || []).filter((c: PNode) => !(isEl(c) && hasClass(c, 'export-reply-info')));
    return { author, tsRaw, createdAt: parseExportTimestamp(tsRaw, opts.offsetMinutes), html: blocks(body).replace(/<p>\s+/g, '<p>').replace(/\s+<\/p>/g, '</p>'), threads, files };
  };

  const top = findNode(content, (n) => hasClass(n, 'export-thread'));
  const replies = top ? (top.childNodes || []).filter((c: PNode) => isEl(c) && hasClass(c, 'export-reply')).map(readReply) : [];
  stats.authors = authors.size;
  return { title, originalTopicId: orig?.[1] || createHash('sha1').update(html).digest('hex').slice(0, 32), replies, stats };
}

// ---------------------------------------------------------------------------------------------------------------

export type ImportDeps = {
  /** Returns the document or null when it does not exist. */
  getDoc(id: string): Promise<any | null>;
  insertDoc(doc: any): Promise<void>;
  updateDoc(doc: any): Promise<void>;
  findUserByEmail(email: string): Promise<any | null>;
  /** Copies real bytes into the app's own file store. Without it a data: image is reported, not stored. */
  storeFile?(args: { bytes: Buffer; name: string; waveId: string; blipId: string; uploaderId: string }): Promise<{ id: string; url: string }>;
};
export type ImportOptions = {
  idPrefix?: string;            // topic id = prefix + original topic id; default '' (the original id)
  titlePrefix?: string;         // e.g. 'ZZ SCRATCH ' for a trial run
  offsetMinutes?: number;       // zone of the export's clock (parse time), default UTC: the export does not say
  extraParticipants?: Array<{ email: string; role: 'viewer' | 'commenter' | 'editor' }>;
  dryRun?: boolean;
  now?: number;
};
export type ImportReport = {
  topicId: string; title: string; dryRun: boolean;
  blips: { planned: number; created: number; updated: number; unchanged: number };
  topic: 'created' | 'updated' | 'unchanged' | 'dry-run';
  users: { matched: Array<{ email: string; id: string }>; placeholders: Array<{ email: string; name: string; id: string }> };
  files: { stored: number; missingInBackup: number; list: ImportedFile[] };
  stats: ParseStats; parsedTimes: { with: number; without: number };
};

export const canonicalUserIdForEmail = (email: string) => `user:email:${createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex')}`;
const normEmail = (e: string) => e.trim().toLowerCase();

/** Deterministic ids in depth-first order, so a second run addresses the same documents. */
export function planBlips(topicId: string, parsed: ParsedTopic) {
  type Planned = { id: string; parentId: string | null; reply: ParsedReply; childIds: string[][] };
  const planned: Planned[] = []; let n = 0;
  const visit = (reply: ParsedReply, parentId: string | null): string => {
    const id = `${topicId}:bi${n++}`;
    const p: Planned = { id, parentId, reply, childIds: [] };
    planned.push(p);
    reply.threads.forEach((thread, ti) => { p.childIds[ti] = thread.map((r) => visit(r, id)); });
    return id;
  };
  const [first, ...rest] = parsed.replies;
  const rootChildIds: string[][] = [];
  if (first) first.threads.forEach((thread, ti) => { rootChildIds[ti] = thread.map((r) => visit(r, null)); });
  rest.forEach((r) => visit(r, null));
  return { planned, rootChildIds };
}

const withMarkers = (html: string, childIds: string[][], uploads: Map<number, string>, fileNames: string[]): string =>
  html
    .replace(/(\d+)/g, (_m, code) => {
      const c = Number(code); const id = childIds[Math.floor(c / 1000)]?.[c % 1000];
      return id ? `<span class="blip-thread-marker" data-blip-thread="${id}">+</span>` : '';
    })
    .replace(/(\d+)/g, (_m, i) => {
      const u = uploads.get(Number(i)); const name = fileNames[Number(i)] || 'image';
      return u ? `<img src="${escAttr(u)}" alt="${escAttr(name)}">` : `<em>[Image from the original Rizzoma, not stored: ${esc(name)}]</em>`;
    });

export async function importParsedTopic(parsed: ParsedTopic, deps: ImportDeps, opts: ImportOptions = {}): Promise<ImportReport> {
  const now = opts.now ?? Date.now();
  const topicId = `${opts.idPrefix ?? ''}${parsed.originalTopicId}`;
  const title = `${opts.titlePrefix ?? ''}${parsed.title}`;
  const dry = !!opts.dryRun;
  const report: ImportReport = {
    topicId, title, dryRun: dry, blips: { planned: 0, created: 0, updated: 0, unchanged: 0 }, topic: 'dry-run',
    users: { matched: [], placeholders: [] }, files: { stored: 0, missingInBackup: 0, list: [] }, stats: parsed.stats, parsedTimes: { with: 0, without: 0 },
  };

  const upsert = async (doc: any): Promise<'created' | 'updated' | 'unchanged'> => {
    const existing = await deps.getDoc(doc._id);
    if (!existing) { if (!dry) await deps.insertDoc(doc); return 'created'; }
    const canon = (d: any) => { const { _rev, ...rest } = d; return JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k]])); };
    const merged = { ...existing, ...doc };
    if (canon(merged) === canon(existing)) return 'unchanged';
    if (!dry) await deps.updateDoc({ ...merged, _rev: existing._rev });
    return 'updated';
  };

  // --- people: by e-mail to an existing user, else a labelled placeholder (written only on a real run)
  const userIds = new Map<string, string>();
  const keyOf = (a: ReplyAuthor) => normEmail(a.email) || `name:${a.name}`;
  const resolveUser = async (a: ReplyAuthor): Promise<string> => {
    const key = keyOf(a);
    const known = userIds.get(key); if (known) return known;
    const email = normEmail(a.email);
    const found = email ? await deps.findUserByEmail(email) : null;
    if (found?._id) { userIds.set(key, found._id); report.users.matched.push({ email, id: found._id }); return found._id; }
    const id = email ? canonicalUserIdForEmail(email) : `user:import:${createHash('sha256').update(a.name).digest('hex')}`;
    if (!(await deps.getDoc(id)) && !dry) {
      await deps.insertDoc({
        _id: id, type: 'user', email, name: a.name, ...(a.avatar ? { avatar: a.avatar } : {}),
        placeholder: true, importedFrom: 'rizzoma.com backup', createdAt: now, updatedAt: now,
      });
    }
    userIds.set(key, id); report.users.placeholders.push({ email, name: a.name, id });
    return id;
  };
  const authorsAll: ReplyAuthor[] = [];
  const times: number[] = [];
  const collect = (r: ParsedReply) => {
    authorsAll.push(r.author);
    if (r.createdAt) { times.push(r.createdAt); report.parsedTimes.with++; } else report.parsedTimes.without++;
    r.threads.forEach((t) => t.forEach(collect));
  };
  parsed.replies.forEach(collect);
  for (const a of authorsAll) await resolveUser(a);
  const uid = (a: ReplyAuthor) => userIds.get(keyOf(a))!;
  const firstTs = times.length ? Math.min(...times) : now; const lastTs = times.length ? Math.max(...times) : now;

  const { planned, rootChildIds } = planBlips(topicId, parsed);
  report.blips.planned = planned.length;
  const rootReply = parsed.replies[0];
  const topicAuthorId = rootReply ? uid(rootReply.author) : await resolveUser({ email: '', name: 'Unknown author', avatar: '' });

  const resolveFiles = async (reply: ParsedReply, blipId: string) => {
    const uploads = new Map<number, string>(); const list: ImportedFile[] = [];
    for (let i = 0; i < reply.files.length; i++) {
      const f = reply.files[i]!;
      if (f.bytes && deps.storeFile && !dry) {
        const stored = await deps.storeFile({ bytes: f.bytes, name: f.name, waveId: topicId, blipId, uploaderId: uid(reply.author) });
        uploads.set(i, stored.url); list.push({ name: f.name, originalUrl: '', kind: f.kind, status: 'stored', uploadId: stored.id }); report.files.stored++;
      } else if (f.bytes && dry) {
        uploads.set(i, '/uploads/(dry-run)'); list.push({ name: f.name, originalUrl: '', kind: f.kind, status: 'stored' }); report.files.stored++;
      } else {
        list.push({ name: f.name, originalUrl: f.originalUrl, kind: f.kind, status: 'missing-in-backup' }); report.files.missingInBackup++;
      }
    }
    report.files.list.push(...list);
    return { uploads, names: reply.files.map((f) => f.name), list };
  };

  // the root reply is the topic body; its first paragraph is dropped when it only repeats the title
  let rootHtml = ''; let rootFiles: ImportedFile[] = [];
  if (rootReply) {
    const f = await resolveFiles(rootReply, topicId); rootFiles = f.list;
    rootHtml = withMarkers(rootReply.html, rootChildIds, f.uploads, f.names)
      .replace(/^<p>([^<]*)<\/p>/, (m, t: string) => t.trim() === esc(parsed.title) ? '' : m);
  }
  for (const p of planned) {
    const { uploads, names, list } = await resolveFiles(p.reply, p.id);
    const created = p.reply.createdAt ?? firstTs;
    const r = await upsert({
      _id: p.id, type: 'blip', waveId: topicId, parentId: p.parentId,
      content: ensureBlbHtml(withMarkers(p.reply.html, p.childIds, uploads, names)),
      createdAt: created, updatedAt: created, yjsGeneration: 0,
      authorId: uid(p.reply.author), authorName: p.reply.author.name, deleted: false, isFoldedByDefault: true,
      importedFrom: { source: 'rizzoma.com backup', originalTopicId: parsed.originalTopicId, originalTime: p.reply.tsRaw, originalAuthorEmail: p.reply.author.email },
      ...(list.length ? { importedFiles: list } : {}),
    });
    report.blips[r]++;
  }

  const t = await upsert({
    _id: topicId, type: 'topic', title, content: ensureTopicBlbHtml(title, rootHtml),
    authorId: topicAuthorId, createdAt: firstTs, updatedAt: lastTs, yjsGeneration: 0,
    shareLevel: 'private', allowComments: false, allowEdits: false,
    importedFrom: { source: 'rizzoma.com backup', originalTopicId: parsed.originalTopicId, rootFiles },
  });
  report.topic = dry ? 'dry-run' : t;
  const roles = new Map<string, { email: string; role: 'owner' | 'editor' | 'commenter' | 'viewer'; at: number }>();
  for (const a of authorsAll) { const id = uid(a); if (!roles.has(id)) roles.set(id, { email: normEmail(a.email), role: id === topicAuthorId ? 'owner' : 'editor', at: firstTs }); }
  for (const x of opts.extraParticipants || []) {
    const u = await deps.findUserByEmail(normEmail(x.email));
    if (u?._id && !roles.has(u._id)) roles.set(u._id, { email: normEmail(x.email), role: x.role, at: now });
  }
  for (const [userId, r] of roles) {
    await upsert({ _id: `participant:wave:${topicId}:user:${userId}`, type: 'participant', waveId: topicId, userId, email: r.email, role: r.role, invitedAt: r.at, acceptedAt: r.at, status: 'accepted' });
  }
  return report;
}
