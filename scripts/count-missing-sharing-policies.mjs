#!/usr/bin/env node

/**
 * Exact, read-only sharing/owner inventory. Every topic row is emitted; no
 * sample cap can hide an unowned or credential-less document.
 */
const couchUrl = process.env.COUCHDB_URL || 'http://admin:password@127.0.0.1:5984';
const database = process.env.COUCHDB_DB || 'project_rizzoma';
const pageSize = 500;

function couchEndpoint(pathname) {
  const url = new URL(couchUrl);
  const auth = url.username || url.password
    ? `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64')}`
    : undefined;
  url.username = '';
  url.password = '';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${encodeURIComponent(database)}${pathname}`;
  return { url, auth };
}

async function couch(pathname, init = {}) {
  const { url, auth } = couchEndpoint(pathname);
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: auth } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`CouchDB ${response.status}: ${text || response.statusText}`);
  return text ? JSON.parse(text) : null;
}

const topics = [];
let bookmark;
let pagesRead = 0;
for (;;) {
  const page = await couch('/_find', {
    method: 'POST',
    body: JSON.stringify({
      selector: { type: 'topic' },
      fields: ['_id', 'type', 'title', 'authorId', 'shareLevel', 'sharing', 'deleted', 'createdAt'],
      limit: pageSize,
      ...(bookmark ? { bookmark } : {}),
    }),
  });
  const docs = Array.isArray(page.docs) ? page.docs : [];
  topics.push(...docs);
  pagesRead += 1;
  if (docs.length < pageSize || !page.bookmark || page.bookmark === bookmark) break;
  bookmark = page.bookmark;
}

const authorIds = [...new Set(topics.map((topic) => topic.authorId).filter(Boolean))];
const usersResponse = authorIds.length === 0
  ? { rows: [] }
  : await couch('/_all_docs?include_docs=true', {
      method: 'POST',
      body: JSON.stringify({ keys: authorIds }),
    });
const users = new Map(
  (usersResponse.rows || [])
    .filter((row) => row.doc)
    .map((row) => [row.id, row.doc]),
);

function policyState(topic) {
  const raw = topic.shareLevel ?? topic.sharing?.shareLevel;
  if (raw === undefined) return 'missing';
  return ['private', 'link', 'public'].includes(raw) ? 'explicit' : 'malformed';
}

function ownerState(topic) {
  if (!topic.authorId) return 'missing-author';
  const user = users.get(topic.authorId);
  if (!user) return 'unresolved-author';
  // Password users have a hash; OAuth users intentionally store ''. A legacy
  // placeholder has no passwordHash property at all and requires a verified
  // OAuth or admin-minted one-time recovery token.
  return user.passwordHash !== undefined ? 'credentialed' : 'claimable-placeholder';
}

const rows = topics.map((topic) => ({
  id: topic._id,
  title: topic.title || null,
  authorId: topic.authorId || null,
  policy: policyState(topic),
  owner: ownerState(topic),
  deleted: Boolean(topic.deleted),
}));

const count = (field, value) => rows.filter((row) => row[field] === value).length;
const result = {
  totalTopics: rows.length,
  distinctAuthorIds: authorIds.length,
  resolvedAuthorIds: authorIds.filter((id) => users.has(id)).length,
  policies: {
    explicit: count('policy', 'explicit'),
    missing: count('policy', 'missing'),
    malformed: count('policy', 'malformed'),
  },
  owners: {
    credentialedTopics: count('owner', 'credentialed'),
    claimablePlaceholderTopics: count('owner', 'claimable-placeholder'),
    missingAuthorTopics: count('owner', 'missing-author'),
    unresolvedAuthorTopics: count('owner', 'unresolved-author'),
  },
  deletedTopics: rows.filter((row) => row.deleted).length,
  pagesRead,
  rows,
  assertions: {
    everyTopicEmitted: rows.length === topics.length,
    everyTopicHasAuthor: rows.every((row) => row.authorId),
    everyAuthorResolves: authorIds.every((id) => users.has(id)),
  },
  readOnly: true,
};

console.log(JSON.stringify(result, null, 2));
if (!result.assertions.everyTopicEmitted || !result.assertions.everyTopicHasAuthor || !result.assertions.everyAuthorResolves) {
  process.exitCode = 2;
}
