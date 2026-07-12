import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';

const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, any>>(),
  sent: [] as Array<Record<string, any>>,
  mailSucceeds: true,
  disconnectUserSockets: vi.fn(() => 0),
  revokeUserSessions: vi.fn(async () => 0),
}));

function valueAtPath(doc: Record<string, any>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  ), doc);
}

function matches(doc: Record<string, any>, selector: Record<string, any>): boolean {
  return Object.entries(selector).every(([key, value]) => valueAtPath(doc, key) === value);
}

vi.mock('../server/lib/couch.js', () => ({
  getDoc: vi.fn(async (id: string) => {
    const doc = state.docs.get(id);
    if (!doc) throw new Error('404 not_found');
    return structuredClone(doc);
  }),
  find: vi.fn(async (selector: Record<string, any>) => ({
    docs: [...state.docs.values()].filter((doc) => matches(doc, selector)).map((doc) => structuredClone(doc)),
  })),
  findOne: vi.fn(async (selector: Record<string, any>) => {
    const doc = [...state.docs.values()].find((candidate) => matches(candidate, selector));
    return doc ? structuredClone(doc) : null;
  }),
  insertDoc: vi.fn(async (doc: Record<string, any>) => {
    const id = String(doc['_id'] || `doc-${state.docs.size + 1}`);
    if (state.docs.has(id)) throw new Error('409 conflict');
    state.docs.set(id, { ...structuredClone(doc), _id: id, _rev: '1-test' });
    return { ok: true, id, rev: '1-test' };
  }),
  updateDoc: vi.fn(async (doc: Record<string, any>) => {
    const id = String(doc['_id'] || '');
    const current = state.docs.get(id);
    if (!current) throw new Error('404 not_found');
    if (String(doc['_rev'] || '') !== String(current['_rev'] || '')) throw new Error('409 conflict');
    const nextRevision = `${Number.parseInt(String(current['_rev']), 10) + 1}-test`;
    const serialized = JSON.parse(JSON.stringify({ ...doc, _rev: nextRevision }));
    state.docs.set(id, serialized);
    return { ok: true, id, rev: nextRevision };
  }),
}));

vi.mock('../server/services/email.js', () => ({
  sendPasswordResetEmail: vi.fn(async (data: Record<string, any>) => {
    state.sent.push(structuredClone(data));
    return state.mailSucceeds ? { success: true, messageId: 'mail-1' } : { success: false, error: 'smtp unavailable' };
  }),
}));

vi.mock('../server/lib/bcrypt.js', () => ({
  hash: vi.fn(async (password: string) => `hash:${password}`),
  compare: vi.fn(async (password: string, digest: string) => digest === `hash:${password}`),
}));
vi.mock('../server/lib/socket.js', () => ({
  disconnectSessionSockets: vi.fn(() => 0),
  disconnectUserSockets: state.disconnectUserSockets,
}));
vi.mock('../server/middleware/session.js', () => ({ revokeUserSessions: state.revokeUserSessions }));
vi.mock('../server/lib/logger.js', () => ({ logAuthEvent: vi.fn() }));
vi.mock('../server/lib/saml.js', () => ({
  isSamlEnabled: () => false,
  getSamlInstance: vi.fn(),
  extractUserFromProfile: vi.fn(),
  generateMetadata: vi.fn(),
}));

import authRouter from '../server/routes/auth.js';
import {
  consumePasswordReset,
  deliverPasswordReset,
  waitForPasswordResetDeliveriesForTests,
} from '../server/lib/passwordReset.js';

const csrf = 'reset-csrf';

describe('password reset security', () => {
  let server: ReturnType<express.Express['listen']>;
  let origin = '';

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).session = {
        csrfToken: csrf,
        destroy(callback: (error?: unknown) => void) { callback(); },
        regenerate(callback: (error?: unknown) => void) { callback(); },
        save(callback: (error?: unknown) => void) { callback(); },
      };
      (req as any).sessionID = 'reset-request-session';
      next();
    });
    app.use('/api/auth', authRouter);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await waitForPasswordResetDeliveriesForTests();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    state.docs.clear();
    state.sent.length = 0;
    state.mailSucceeds = true;
    state.disconnectUserSockets.mockClear();
    state.revokeUserSessions.mockClear();
    state.docs.set('user-password', {
      _id: 'user-password', _rev: '1-test', type: 'user', email: 'known@example.test',
      name: 'Known User', passwordHash: 'hash:old-password', authVersion: 0,
      createdAt: 1, updatedAt: 1,
    });
    state.docs.set('user-oauth', {
      _id: 'user-oauth', _rev: '1-test', type: 'user', email: 'oauth@example.test',
      name: 'OAuth User', createdAt: 1, updatedAt: 1,
    });
  });

  async function post(path: string, body: Record<string, unknown>, withCsrf = true) {
    const response = await fetch(`${origin}/api/auth${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(withCsrf ? { 'x-csrf-token': csrf } : {}),
      },
      body: JSON.stringify(body),
    });
    return { response, body: await response.json() as Record<string, any> };
  }

  it('returns the same generic response for known, unknown, OAuth-only, and malformed addresses', async () => {
    const bodies = [];
    for (const email of ['known@example.test', 'missing@example.test', 'oauth@example.test', 'not-an-email']) {
      const result = await post('/password-reset/request', { email });
      expect(result.response.status).toBe(202);
      bodies.push(result.body);
    }
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
    await waitForPasswordResetDeliveriesForTests();
    expect(state.sent).toHaveLength(1);
  });

  it('requires CSRF before accepting a reset request', async () => {
    const result = await post('/password-reset/request', { email: 'known@example.test' }, false);
    expect(result.response.status).toBe(403);
    expect(result.body['error']).toBe('csrf_failed');
  });

  it('stores only a token hash and places the bearer exclusively in the URL fragment', async () => {
    await deliverPasswordReset('known@example.test', 'https://rizzoma.example.test/app');
    const sent = state.sent[0]!;
    const resetUrl = new URL(String(sent['resetUrl']));
    const token = new URLSearchParams(resetUrl.hash.split('?', 2)[1]).get('passwordReset')!;
    const user = state.docs.get('user-password')!;

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(resetUrl.search).toBe('');
    expect(resetUrl.hash).toBe(`#/?passwordReset=${token}`);
    expect(user['passwordReset']).toMatchObject({ deliveryStatus: 'sent' });
    expect(user['passwordReset']['tokenHash']).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(user)).not.toContain(token);
  });

  it('atomically consumes a token once, changes the hash, and increments the session generation', async () => {
    await deliverPasswordReset('known@example.test', 'https://rizzoma.example.test');
    const token = new URLSearchParams(new URL(String(state.sent[0]!['resetUrl'])).hash.split('?', 2)[1]).get('passwordReset')!;
    const consumed = await consumePasswordReset(token, 'hash:new-password', Date.now());
    const replay = await consumePasswordReset(token, 'hash:attacker-password', Date.now());
    const user = state.docs.get('user-password')!;

    expect(consumed).toEqual({ userId: 'user-password', authVersion: 1 });
    expect(replay).toBeNull();
    expect(user['passwordHash']).toBe('hash:new-password');
    expect(user['authVersion']).toBe(1);
    expect(user['passwordReset']).toBeUndefined();
  });

  it('allows only one of two racing consumers to win the CouchDB revision compare-and-swap', async () => {
    await deliverPasswordReset('known@example.test', 'https://rizzoma.example.test');
    const token = new URLSearchParams(new URL(String(state.sent[0]!['resetUrl'])).hash.split('?', 2)[1]).get('passwordReset')!;
    const results = await Promise.all([
      consumePasswordReset(token, 'hash:first', Date.now()),
      consumePasswordReset(token, 'hash:second', Date.now()),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(['hash:first', 'hash:second']).toContain(state.docs.get('user-password')!['passwordHash']);
    expect(state.docs.get('user-password')!['authVersion']).toBe(1);
  });

  it('rejects expired and delivery-failed tokens without changing the password', async () => {
    const oldHash = state.docs.get('user-password')!['passwordHash'];
    await deliverPasswordReset('known@example.test', 'https://rizzoma.example.test', Date.now() - 31 * 60 * 1000);
    let token = new URLSearchParams(new URL(String(state.sent[0]!['resetUrl'])).hash.split('?', 2)[1]).get('passwordReset')!;
    expect(await consumePasswordReset(token, 'hash:expired', Date.now())).toBeNull();

    state.mailSucceeds = false;
    state.sent.length = 0;
    await deliverPasswordReset('known@example.test', 'https://rizzoma.example.test');
    token = new URLSearchParams(new URL(String(state.sent[0]!['resetUrl'])).hash.split('?', 2)[1]).get('passwordReset')!;
    expect(await consumePasswordReset(token, 'hash:undelivered', Date.now())).toBeNull();
    expect(state.docs.get('user-password')!['passwordHash']).toBe(oldHash);
  });

  it('enforces the new-password policy and eagerly revokes sessions after a valid completion', async () => {
    await deliverPasswordReset('known@example.test', 'https://rizzoma.example.test');
    const token = new URLSearchParams(new URL(String(state.sent[0]!['resetUrl'])).hash.split('?', 2)[1]).get('passwordReset')!;

    const short = await post('/password-reset/complete', { token, password: 'short123' });
    expect(short.response.status).toBe(400);
    expect(state.docs.get('user-password')!['passwordHash']).toBe('hash:old-password');

    const completed = await post('/password-reset/complete', { token, password: 'long-enough-password' });
    expect(completed.response.status).toBe(200);
    expect(state.docs.get('user-password')!['passwordHash']).toBe('hash:long-enough-password');
    expect(state.disconnectUserSockets).toHaveBeenCalledWith('user-password');
    expect(state.revokeUserSessions).toHaveBeenCalledWith('user-password');
  });
});
