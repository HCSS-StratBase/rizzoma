import { createHash } from 'node:crypto';
import { hash as bcryptHash } from 'bcryptjs';

const couchUrl = process.env.COUCHDB_URL || 'http://admin:password@127.0.0.1:5984';
const database = process.env.COUCHDB_DB || 'project_rizzoma';

function couchEndpoint(pathname = '') {
  const url = new URL(couchUrl);
  const authorization = url.username || url.password
    ? `Basic ${Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64')}`
    : undefined;
  url.username = '';
  url.password = '';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${encodeURIComponent(database)}${pathname}`;
  return { url, authorization };
}

async function couchRequest(pathname, init = {}) {
  const { url, authorization } = couchEndpoint(pathname);
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(authorization ? { authorization } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    throw new Error(`E2E CouchDB fixture request failed (${response.status} ${response.statusText})`);
  }
  return body;
}

async function findDocs(selector, limit = 100) {
  const result = await couchRequest('/_find', {
    method: 'POST',
    body: JSON.stringify({ selector, limit }),
  });
  return Array.isArray(result?.docs) ? result.docs : [];
}

function canonicalUserId(email) {
  return `user:email:${createHash('sha256').update(email, 'utf8').digest('hex')}`;
}

/**
 * Create a test-only, mailbox-verified account directly in the local E2E
 * database. Production registration deliberately requires a real invitation;
 * browser smokes must not weaken or bypass that contract through HTTP routes.
 */
export async function seedVerifiedE2EAccount(emailValue, password) {
  const email = String(emailValue || '').trim().toLowerCase();
  if (!email.includes('@') || String(password || '').length < 6) {
    throw new Error('Invalid E2E fixture account');
  }
  const matches = await findDocs({ type: 'user', email }, 2);
  if (matches.length > 1) throw new Error(`Duplicate E2E fixture users for ${email}`);
  if (matches[0]) return matches[0];

  const now = Date.now();
  const user = {
    _id: canonicalUserId(email),
    type: 'user',
    email,
    passwordHash: await bcryptHash(password, 4),
    name: email.split('@')[0],
    emailVerifiedAt: now,
    emailVerificationProvider: 'invitation',
    e2eFixture: true,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await couchRequest(`/${encodeURIComponent(user._id)}`, {
      method: 'PUT',
      body: JSON.stringify(user),
    });
    return user;
  } catch (error) {
    // Parallel CI workers can race on the deterministic account id. Accept a
    // winner only when it resolves to the exact normalized email.
    const raced = await findDocs({ type: 'user', email }, 2);
    if (raced.length === 1) return raced[0];
    throw error;
  }
}

/** Seed an accepted participant grant through the test database fixture path. */
export async function seedAcceptedParticipant(waveIdValue, emailValue, role, invitedBy) {
  const waveId = String(waveIdValue || '').trim();
  const email = String(emailValue || '').trim().toLowerCase();
  if (!waveId || !['viewer', 'commenter', 'editor'].includes(role)) {
    throw new Error('Invalid E2E participant fixture');
  }
  const users = await findDocs({ type: 'user', email }, 2);
  if (users.length !== 1 || !users[0]._id) throw new Error(`Missing unique E2E user for ${email}`);
  const userId = String(users[0]._id);
  const matches = await findDocs({ type: 'participant', waveId, userId }, 100);
  const now = Date.now();
  const existing = matches[0];
  const participant = {
    ...(existing || {}),
    _id: existing?._id || `participant:e2e:${createHash('sha256').update(`${waveId}\0${userId}`, 'utf8').digest('hex')}`,
    type: 'participant',
    waveId,
    userId,
    email,
    role,
    status: 'accepted',
    invitedBy: invitedBy || 'e2e-fixture',
    invitedAt: existing?.invitedAt || now,
    acceptedAt: now,
    updatedAt: now,
    e2eFixture: true,
  };
  await couchRequest(`/${encodeURIComponent(participant._id)}`, {
    method: 'PUT',
    body: JSON.stringify(participant),
  });
  return participant;
}
