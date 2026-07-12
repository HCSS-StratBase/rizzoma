#!/usr/bin/env node

/**
 * Read-only inventory for the bounded legacy sharing fallback.
 *
 * Counts topic/wave metadata documents that have neither the modern
 * top-level `shareLevel` nor the briefly-supported nested
 * `sharing.shareLevel`. It never writes to CouchDB.
 *
 * Usage:
 *   COUCHDB_URL=http://admin:password@127.0.0.1:5984 \
 *   COUCHDB_DB=project_rizzoma npm run sharing:count-legacy
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

async function findPage(bookmark) {
  const { url, auth } = couchEndpoint('/_find');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: auth } : {}),
    },
    body: JSON.stringify({
      selector: {
        type: { $in: ['topic', 'wave'] },
        shareLevel: { $exists: false },
        'sharing.shareLevel': { $exists: false },
      },
      fields: ['_id', 'type', 'title', 'authorId', 'createdAt'],
      limit: pageSize,
      ...(bookmark ? { bookmark } : {}),
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`CouchDB ${response.status}: ${text || response.statusText}`);
  return JSON.parse(text);
}

const counts = { topic: 0, wave: 0 };
const sample = [];
let bookmark;
let pages = 0;

for (;;) {
  const page = await findPage(bookmark);
  const docs = Array.isArray(page.docs) ? page.docs : [];
  pages += 1;
  for (const doc of docs) {
    if (doc.type === 'topic' || doc.type === 'wave') counts[doc.type] += 1;
    if (sample.length < 10) {
      sample.push({ id: doc._id, type: doc.type, title: doc.title || null, authorId: doc.authorId || null });
    }
  }
  if (docs.length < pageSize || !page.bookmark || page.bookmark === bookmark) break;
  bookmark = page.bookmark;
}

const result = {
  missingPolicyDocuments: counts.topic + counts.wave,
  byType: counts,
  pagesRead: pages,
  sample,
  readOnly: true,
};

console.log(JSON.stringify(result, null, 2));
