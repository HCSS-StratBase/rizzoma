#!/usr/bin/env node

/**
 * Admin-only owner recovery for credential-less legacy placeholders.
 *
 * The script writes one SHA-256 token hash and places the raw one-time URL in
 * a mode-0600 handoff file. Standard output contains only safe metadata and
 * that file path. It never changes topic ownership. The placeholder's owner
 * can use the URL to set a password on the existing user id; normal
 * registration without this token remains blocked.
 *
 * Usage:
 *   COUCHDB_URL=... COUCHDB_DB=project_rizzoma \
 *     node scripts/create-owner-recovery-token.mjs owner@example.com
 */
import { createHash, randomBytes } from 'node:crypto';
import { writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!email.includes('@')) throw new Error('Usage: create-owner-recovery-token.mjs <owner-email>');

const couchUrl = process.env.COUCHDB_URL || 'http://admin:password@127.0.0.1:5984';
const database = process.env.COUCHDB_DB || 'project_rizzoma';
const appUrl = process.env.APP_URL || process.env.APP_BASE_URL || 'http://localhost:3000';

function validatedAppUrl(raw) {
  const url = new URL(raw);
  if (url.username || url.password) throw new Error('APP_URL must not contain credentials');
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && url.protocol !== 'https:') {
    throw new Error('APP_URL must use HTTPS in production');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('APP_URL must be an HTTP(S) URL');
  return url;
}

function endpoint(pathname) {
  const url = new URL(couchUrl);
  const authorization = url.username || url.password
    ? `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64')}`
    : undefined;
  url.username = '';
  url.password = '';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${encodeURIComponent(database)}${pathname}`;
  return { url, authorization };
}

async function request(pathname, init = {}) {
  const { url, authorization } = endpoint(pathname);
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(authorization ? { authorization } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`CouchDB ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const users = await request('/_find', {
  method: 'POST',
  body: JSON.stringify({ selector: { type: 'user', email }, limit: 2 }),
});
const placeholder = users.docs?.find((user) => user.passwordHash === undefined);
if (!placeholder?._id) throw new Error('No credential-less owner placeholder found for that email');

const topics = await request('/_find', {
  method: 'POST',
  body: JSON.stringify({ selector: { type: 'topic', authorId: placeholder._id }, fields: ['_id'], limit: 500 }),
});
const topicIds = (topics.docs || []).map((topic) => topic._id).filter(Boolean);
if (topicIds.length === 0) throw new Error('Placeholder does not own any topic');

const token = randomBytes(32).toString('base64url');
const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
const now = Date.now();
const priorRecoveries = await request('/_find', {
  method: 'POST',
  body: JSON.stringify({
    selector: { type: 'owner_recovery', placeholderUserId: placeholder._id, status: 'pending' },
    limit: 500,
  }),
});
for (const prior of priorRecoveries.docs || []) {
  const revoked = { ...prior, status: 'revoked', revokedAt: now };
  delete revoked.tokenHash;
  await request(`/${encodeURIComponent(prior._id)}`, {
    method: 'PUT',
    body: JSON.stringify(revoked),
  });
}
const recovery = {
  _id: `owner-recovery:${tokenHash}`,
  type: 'owner_recovery',
  tokenHash,
  email,
  placeholderUserId: placeholder._id,
  topicIds,
  status: 'pending',
  createdAt: now,
  expiresAt: now + 24 * 60 * 60 * 1000,
};
await request('', { method: 'POST', body: JSON.stringify(recovery) });

const url = validatedAppUrl(appUrl);
url.searchParams.set('layout', 'rizzoma');
url.hash = `#/?ownerRecovery=${encodeURIComponent(token)}`;
const handoffPath = process.env.OWNER_RECOVERY_HANDOFF
  || join(tmpdir(), `rizzoma-owner-recovery-${process.pid}-${now}.json`);
await writeFile(handoffPath, JSON.stringify({
  email,
  placeholderUserId: placeholder._id,
  topicIds,
  expiresAt: recovery.expiresAt,
  recoveryUrl: url.toString(),
}, null, 2), { mode: 0o600, flag: 'wx' });
await chmod(handoffPath, 0o600);
console.log(JSON.stringify({
  email,
  placeholderUserId: placeholder._id,
  topicCount: topicIds.length,
  expiresAt: recovery.expiresAt,
  revokedPriorTokens: (priorRecoveries.docs || []).length,
  oneTimeHandoffPath: handoffPath,
}, null, 2));
