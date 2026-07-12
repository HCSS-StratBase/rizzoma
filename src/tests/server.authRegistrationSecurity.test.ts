import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const securityState = vi.hoisted(() => ({
  docs: new Map<string, Record<string, any>>(),
  forceInsertConflictOnce: false,
}));

function matches(doc: Record<string, any>, selector: Record<string, any>): boolean {
  return Object.entries(selector).every(([key, value]) => doc[key] === value);
}

vi.mock('../server/lib/couch.js', () => ({
  getDoc: vi.fn(async (id: string) => {
    const doc = securityState.docs.get(id);
    if (!doc) throw new Error('404 not_found');
    return { ...doc };
  }),
  find: vi.fn(async (selector: Record<string, any>) => ({
    docs: [...securityState.docs.values()].filter((doc) => matches(doc, selector)).map((doc) => ({ ...doc })),
  })),
  findOne: vi.fn(async (selector: Record<string, any>) => {
    const doc = [...securityState.docs.values()].find((candidate) => matches(candidate, selector));
    return doc ? { ...doc } : null;
  }),
  insertDoc: vi.fn(async (doc: Record<string, any>) => {
    if (securityState.forceInsertConflictOnce) {
      securityState.forceInsertConflictOnce = false;
      throw new Error('409 conflict');
    }
    const id = String(doc['_id'] || `doc-${securityState.docs.size + 1}`);
    if (securityState.docs.has(id)) throw new Error('409 conflict');
    securityState.docs.set(id, { ...doc, _id: id, _rev: '1-test' });
    return { ok: true, id, rev: '1-test' };
  }),
  updateDoc: vi.fn(async (doc: Record<string, any>) => {
    const id = String(doc['_id'] || '');
    if (!id || !securityState.docs.has(id)) throw new Error('404 not_found');
    securityState.docs.set(id, { ...doc, _rev: '2-test' });
    return { ok: true, id, rev: '2-test' };
  }),
}));

vi.mock('../server/lib/bcrypt.js', () => ({
  hash: vi.fn(async (password: string) => `hash:${password}`),
  compare: vi.fn(async (password: string, digest: string) => digest === `hash:${password}`),
}));

vi.mock('../server/lib/socket.js', () => ({
  disconnectSessionSockets: vi.fn(() => 0),
}));

vi.mock('../server/lib/logger.js', () => ({ logAuthEvent: vi.fn() }));
vi.mock('../server/lib/saml.js', () => ({
  isSamlEnabled: () => false,
  getSamlInstance: vi.fn(),
  extractUserFromProfile: vi.fn(),
  generateMetadata: vi.fn(),
}));

import authRouter from '../server/routes/auth.js';
import { hashInviteToken, invitationTokenDocId } from '../server/lib/invitations.js';

const csrf = 'pre-auth-csrf';
const inviteToken = 'valid-invitation-token-aaaaaaaaaaaaaaaaaaaaaaaa';
const existingInviteToken = 'valid-invitation-token-bbbbbbbbbbbbbbbbbbbbbbbb';
const recoveryToken = 'valid-owner-recovery-cccccccccccccccccccccccc';

describe('auth registration and session security', () => {
  let server: ReturnType<express.Express['listen']>;
  let origin = '';
  let lastRequest: any;
  let regenerationCount = 0;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const session: Record<string, any> = {
        csrfToken: csrf,
        oauthTransactions: { stale: { createdAt: Date.now() } },
        arbitraryPreAuthState: 'must-disappear',
        regenerate(callback: (error?: unknown) => void) {
          regenerationCount += 1;
          for (const key of Object.keys(session)) {
            if (!['regenerate', 'save', 'destroy'].includes(key)) delete session[key];
          }
          (req as any).sessionID = `sid-after-${regenerationCount}`;
          callback();
        },
        save(callback: (error?: unknown) => void) { callback(); },
        destroy(callback: (error?: unknown) => void) { callback(); },
      };
      (req as any).session = session;
      (req as any).sessionID = 'sid-before';
      lastRequest = req;
      next();
    });
    app.use('/api/auth', authRouter);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    securityState.docs.clear();
    securityState.forceInsertConflictOnce = false;
    regenerationCount = 0;
    securityState.docs.set('user-existing', {
      _id: 'user-existing', _rev: '1-user', type: 'user', email: 'existing@example.test',
      passwordHash: 'hash:old-password', createdAt: 1, updatedAt: 1,
    });
    securityState.docs.set('user-placeholder', {
      _id: 'user-placeholder', _rev: '1-user', type: 'user', email: 'owner@example.test',
      createdAt: 1, updatedAt: 1,
    });
    securityState.docs.set('user-legacy-short', {
      _id: 'user-legacy-short', _rev: '1-user', type: 'user', email: 'short@example.test',
      passwordHash: 'hash:abc123', createdAt: 1, updatedAt: 1,
    });
    securityState.docs.set(invitationTokenDocId(hashInviteToken(inviteToken)), {
      _id: invitationTokenDocId(hashInviteToken(inviteToken)), _rev: '1-token', type: 'invitation_token',
      tokenHash: hashInviteToken(inviteToken), participantId: 'participant-new', waveId: 'topic-private',
      email: 'new@example.test', status: 'sent', expiresAt: Date.now() + 60_000,
    });
    securityState.docs.set(invitationTokenDocId(hashInviteToken(existingInviteToken)), {
      _id: invitationTokenDocId(hashInviteToken(existingInviteToken)), _rev: '1-token', type: 'invitation_token',
      tokenHash: hashInviteToken(existingInviteToken), participantId: 'participant-existing', waveId: 'topic-private',
      email: 'existing@example.test', status: 'sent', expiresAt: Date.now() + 60_000,
    });
    securityState.docs.set('recovery-valid', {
      _id: 'recovery-valid', _rev: '1-recovery', type: 'owner_recovery',
      tokenHash: hashInviteToken(recoveryToken), placeholderUserId: 'user-placeholder',
      email: 'owner@example.test', status: 'pending', expiresAt: Date.now() + 60_000,
    });
  });

  async function post(path: string, body: Record<string, unknown>) {
    const response = await fetch(`${origin}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify(body),
    });
    return { response, body: await response.json() as Record<string, any> };
  }

  it('never promotes an invitation into a password reset for a credentialed account', async () => {
    const result = await post('/register', {
      email: 'existing@example.test', password: 'replacement-password', inviteToken: existingInviteToken,
    });
    expect(result.response.status).toBe(409);
    expect(result.body['error']).toBe('email_in_use');
    expect(securityState.docs.get('user-existing')?.['passwordHash']).toBe('hash:old-password');
    expect(regenerationCount).toBe(0);
  });

  it('uses owner recovery once and regenerates the pre-auth session', async () => {
    const invalid = await post('/register', {
      email: 'owner@example.test', password: 'replacement-password', ownerRecoveryToken: 'wrong-owner-recovery-dddddddddddddddddddddddd',
    });
    expect(invalid.response.status).toBe(403);
    expect(invalid.body['error']).toBe('invalid_owner_recovery');

    const recovered = await post('/register', {
      email: 'owner@example.test', password: 'replacement-password', ownerRecoveryToken: recoveryToken,
    });
    expect(recovered.response.status).toBe(201);
    expect(securityState.docs.get('user-placeholder')?.['passwordHash']).toBe('hash:replacement-password');
    expect(securityState.docs.get('recovery-valid')).toMatchObject({ status: 'used', usedBy: 'user-placeholder' });
    expect(securityState.docs.get('recovery-valid')?.['tokenHash']).toBeUndefined();
    expect(regenerationCount).toBe(1);
    expect(lastRequest.sessionID).not.toBe('sid-before');
    expect(lastRequest.session.oauthTransactions).toBeUndefined();
    expect(lastRequest.session.arbitraryPreAuthState).toBeUndefined();
    expect(lastRequest.session.csrfToken).toMatch(/^[a-f0-9]{32}$/);
    expect(lastRequest.session.csrfToken).not.toBe(csrf);
    expect(recovered.response.headers.get('set-cookie')).toContain('XSRF-TOKEN=');

    const replay = await post('/register', {
      email: 'owner@example.test', password: 'second-replacement', ownerRecoveryToken: recoveryToken,
    });
    expect(replay.response.status).toBe(409);
    expect(securityState.docs.get('user-placeholder')?.['passwordHash']).toBe('hash:replacement-password');
  });

  it('maps a deterministic-id insert race to email_in_use', async () => {
    securityState.forceInsertConflictOnce = true;
    const result = await post('/register', {
      email: 'new@example.test', password: 'new-password', inviteToken,
    });
    expect(result.response.status).toBe(409);
    expect(result.body['error']).toBe('email_in_use');
    expect(regenerationCount).toBe(0);
  });

  it('requires 12 characters for new credentials but preserves six-character legacy login', async () => {
    const rejected = await post('/register', {
      email: 'new@example.test', password: 'short123', inviteToken,
    });
    expect(rejected.response.status).toBe(400);
    expect(rejected.body['error']).toBe('validation_error');

    const legacy = await post('/login', { email: 'short@example.test', password: 'abc123' });
    expect(legacy.response.status).toBe(200);
    expect(lastRequest.session.userId).toBe('user-legacy-short');
  });

  it('regenerates a login session and drops stale OAuth state', async () => {
    const result = await post('/login', { email: 'existing@example.test', password: 'old-password' });
    expect(result.response.status).toBe(200);
    expect(regenerationCount).toBe(1);
    expect(lastRequest.sessionID).toMatch(/^sid-after-/);
    expect(lastRequest.session.oauthTransactions).toBeUndefined();
    expect(lastRequest.session.userId).toBe('user-existing');
    expect(lastRequest.session.csrfToken).toMatch(/^[a-f0-9]{32}$/);
  });
});
