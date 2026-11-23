import { describe, expect, it } from 'vitest';
import { parseBackupHtml, parseExportTimestamp, importParsedTopic, canonicalUserIdForEmail, type ImportDeps } from '../server/lib/backupImport';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
const ID = 'f332ed607ec554ad305a5d2b78b803be';
const author = (mail: string, name: string) => `<a href="mailto:${mail}" title="${name}" class="export-reply-author " style="background-image: url(https://lh3.googleusercontent.com/a/x=s96-c)"></a>`;
const info = (mail: string, name: string, ts: string) => `<div class="export-reply-info">${author(mail, name)}<span class="export-reply-timestamp" title="${ts}">x</span></div>`;
const FIXTURE = `<html><body><div class="export-content" id="c"><style scoped>.x{background:url(data:image/png;base64,AAAA)}</style>
<div class="export-header"><h1>Access to GT</h1><a href="https://rizzoma.com/topic/${ID}/">Original topic</a></div>
<span class="export-thread-control "></span>
<div class="export-thread "><div class="export-reply">${info('owner@x.org', 'Olga Owner', '2021-10-7 5:16 PM')}
<div class="export-paragraph"><span class="export-text">Access to GT</span></div>
<div class="export-paragraph"><span class="export-tag">#HCSSOrg</span><span class="export-tag">#Tools</span></div>
<ul class="export-list export-list-unordered-0"><li class="export-list-item"><span class="export-text">It's the <span class="export-text export-text-bold">first</span> step &amp; more</span><span class="export-thread-control export-thread-folded"></span>
  <div class="export-thread export-thread-folded"><div class="export-reply">${info('reader@x.org', 'Rita Reader', '2019-2-25 12:05 AM')}
    <div class="export-paragraph"><span class="export-text export-text-italic">don't</span> <a class="export-recipient" href="mailto:owner@x.org">@Olga Owner</a> see <a class="export-link" href="http://libguides.gatech.edu/az.php"><span class="export-text">here</span></a>
    <a class="export-file" href="https://rizzoma.com/r/files/${ID}-a-0-0.1"><img src="https://rizzoma.com/r/files/thumbnail/${ID}-a-0-0.1" title="image.png"></a>
    <span class="export-thread-control export-thread-folded"></span><div class="export-thread export-thread-folded"><div class="export-reply">${info('noone@x.org', 'Nora New', '2019-2-26 11:59 AM')}<div class="export-paragraph"><span class="export-text">deep</span></div></div></div></div>
  </div></div></li>
  <li class="export-list-item"><span class="export-text">second</span></li></ul></div>
<div class="export-reply">${info('reader@x.org', 'Rita Reader', '2022-1-3 1:00 PM')}<div class="export-paragraph"><span class="export-text">late root reply</span>
<a class="export-attachment" href="x"><img src="data:image/png;base64,${PNG}" title="pasted.png"></a></div></div></div></div></body></html>`;

function memoryDeps(existingUsers: Record<string, any> = {}) {
  const store = new Map<string, any>();
  const stored: any[] = [];
  const deps: ImportDeps = {
    getDoc: async (id) => (store.has(id) ? structuredClone(store.get(id)) : null),
    insertDoc: async (d) => { if (store.has(d._id)) throw new Error('409'); store.set(d._id, { ...d, _rev: '1-a' }); },
    updateDoc: async (d) => { store.set(d._id, { ...d, _rev: '2-b' }); },
    findUserByEmail: async (e) => existingUsers[e] || null,
    storeFile: async (a) => { stored.push(a); return { id: 'upload:u1', url: '/uploads/upload%3Au1' }; },
  };
  return { store, stored, deps };
}

describe('backup import: parsing', () => {
  const parsed = parseBackupHtml(FIXTURE);

  it('reads title, original topic id, replies, threads and the counts', () => {
    expect(parsed.title).toBe('Access to GT');
    expect(parsed.originalTopicId).toBe(ID);
    expect(parsed.replies).toHaveLength(2);
    expect(parsed.stats).toMatchObject({ replies: 4, inlineThreads: 2, authors: 3, tags: 2, mentions: 1, images: 2 });
    expect(parsed.stats.unknownClasses).toEqual({});
  });

  it('escapes an apostrophe and an ampersand exactly once (the prototype double-escaped)', () => {
    const html = parsed.replies[0]!.html;
    expect(html).toContain('It\'s the <strong>first</strong> step &amp; more');
    expect(html).not.toContain('&amp;amp;');
    expect(html).not.toContain('&#39;');
    expect(parsed.replies[0]!.threads[0]![0]!.html).toContain('<em>don\'t</em>');
  });

  it('turns the export clock into epoch ms (12 AM and 12 PM are right) and applies an offset', () => {
    expect(parseExportTimestamp('2019-2-25 12:05 AM')).toBe(Date.UTC(2019, 1, 25, 0, 5));
    expect(parseExportTimestamp('2019-2-25 12:05 PM')).toBe(Date.UTC(2019, 1, 25, 12, 5));
    expect(parseExportTimestamp('2021-10-7 5:16 PM', 120)).toBe(Date.UTC(2021, 9, 7, 17, 16) - 120 * 60_000);
    expect(parseExportTimestamp('garbage')).toBeNull();
  });
});

describe('backup import: writing', () => {
  it('keeps authors, times, nesting, tags and plain @mentions; images without bytes become marked placeholders, never links', async () => {
    const { store, stored, deps } = memoryDeps({ 'owner@x.org': { _id: 'user:real-owner', email: 'owner@x.org' } });
    const report = await importParsedTopic(parseBackupHtml(FIXTURE), deps, { idPrefix: 'scratch-', titlePrefix: 'ZZ SCRATCH ', now: 1_800_000_000_000 });
    const wave = `scratch-${ID}`;
    expect(report.topic).toBe('created');
    expect(report.blips).toEqual({ planned: 3, created: 3, updated: 0, unchanged: 0 });
    // people: the existing user is matched by e-mail, the others become labelled credential-less placeholders on the canonical id
    expect(report.users.matched).toEqual([{ email: 'owner@x.org', id: 'user:real-owner' }]);
    expect(report.users.placeholders.map((p) => p.email).sort()).toEqual(['noone@x.org', 'reader@x.org']);
    const reader = store.get(canonicalUserIdForEmail('reader@x.org'));
    expect(reader).toMatchObject({ type: 'user', name: 'Rita Reader', placeholder: true, importedFrom: 'rizzoma.com backup' });
    expect(reader.passwordHash).toBeUndefined();
    // topic: original author as owner, time span of the replies, tag text kept, first paragraph (the title) dropped
    const topic = store.get(wave);
    expect(topic).toMatchObject({ title: 'ZZ SCRATCH Access to GT', authorId: 'user:real-owner', createdAt: Date.UTC(2019, 1, 25, 0, 5), updatedAt: Date.UTC(2022, 0, 3, 13, 0), shareLevel: 'private' });
    expect(topic.content).toContain('#HCSSOrg #Tools');
    expect(topic.content).toContain('data-blip-thread="scratch-' + ID + ':bi0"');
    expect(topic.content).not.toContain('<p>Access to GT</p>');
    // blips: depth-first ids, original author and time, nesting by parentId and inline marker
    const b0 = store.get(`${wave}:bi0`); const b1 = store.get(`${wave}:bi1`); const b2 = store.get(`${wave}:bi2`);
    expect(b0).toMatchObject({ parentId: null, authorId: canonicalUserIdForEmail('reader@x.org'), authorName: 'Rita Reader', createdAt: Date.UTC(2019, 1, 25, 0, 5), importedFrom: { originalAuthorEmail: 'reader@x.org', originalTime: '2019-2-25 12:05 AM' } });
    expect(b1).toMatchObject({ parentId: `${wave}:bi0`, authorName: 'Nora New', createdAt: Date.UTC(2019, 1, 26, 11, 59) });
    expect(b0.content).toContain(`data-blip-thread="${wave}:bi1"`);
    expect(b2).toMatchObject({ parentId: null, content: expect.stringContaining('late root reply'), createdAt: Date.UTC(2022, 0, 3, 13, 0) });
    expect(b0.content).toContain('@Olga Owner');
    expect(b0.content).toContain('<a href="http://libguides.gatech.edu/az.php">here</a>');
    // the rizzoma.com image is NOT linked or fetched: a marked placeholder plus a record
    expect(b0.content).not.toMatch(/rizzoma\.com/);
    expect(b0.content).not.toContain('<img');
    expect(b0.content).toContain('[Image from the original Rizzoma, not part of the backup: image.png]');
    expect(b0.importedFiles).toEqual([{ name: 'image.png', originalUrl: `https://rizzoma.com/r/files/${ID}-a-0-0.1`, kind: 'image', status: 'missing-in-backup' }]);
    // real bytes (a data: image) are copied into the app's own store and referenced by /uploads
    expect(stored).toHaveLength(1);
    expect(stored[0].bytes.subarray(0, 4).toString('hex')).toBe('89504e47');
    expect(b2.content).toContain('<img src="/uploads/upload%3Au1" alt="pasted.png">');
    expect(report.files).toMatchObject({ stored: 1, missingInBackup: 1 });
    // participants: original author owns, contributors edit
    expect(store.get(`participant:wave:${wave}:user:user:real-owner`)).toMatchObject({ role: 'owner', status: 'accepted' });
    expect(store.get(`participant:wave:${wave}:user:${canonicalUserIdForEmail('reader@x.org')}`)).toMatchObject({ role: 'editor' });
  });

  it('is idempotent: a second run changes nothing, an edited source updates in place', async () => {
    const { store, deps } = memoryDeps();
    await importParsedTopic(parseBackupHtml(FIXTURE), deps, { now: 1 });
    const before = store.size;
    const again = await importParsedTopic(parseBackupHtml(FIXTURE), deps, { now: 2 });
    expect(again.blips).toEqual({ planned: 3, created: 0, updated: 0, unchanged: 3 });
    expect(again.topic).toBe('unchanged');
    expect(store.size).toBe(before);
    const changed = await importParsedTopic(parseBackupHtml(FIXTURE.replace('late root reply', 'late root reply, edited')), deps, { now: 3 });
    expect(changed.blips.updated).toBe(1);
  });

  it('a dry run writes nothing', async () => {
    const { store, stored, deps } = memoryDeps();
    const r = await importParsedTopic(parseBackupHtml(FIXTURE), deps, { dryRun: true });
    expect(store.size).toBe(0);
    expect(stored).toHaveLength(0);
    expect(r).toMatchObject({ dryRun: true, topic: 'dry-run', blips: { planned: 3 } });
  });

  it('refuses a page that is not an export', () => {
    expect(() => parseBackupHtml('<html><body>hello</body></html>')).toThrow('not_a_rizzoma_export');
  });
});
