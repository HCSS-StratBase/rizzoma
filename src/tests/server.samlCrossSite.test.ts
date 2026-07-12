import cookieParser from 'cookie-parser';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const samlMocks = vi.hoisted(() => ({
  relayState: '',
  validatePostResponseAsync: vi.fn(async () => ({ profile: { email: 'saml-user@example.test', displayName: 'SAML User' } })),
}));

vi.mock('../server/lib/saml.js', () => ({
  isSamlEnabled: () => true,
  generateMetadata: () => '<xml />',
  extractUserFromProfile: (profile: Record<string, unknown>) => ({
    email: String(profile['email']),
    name: String(profile['displayName']),
  }),
  getSamlInstance: () => ({
    getAuthorizeUrlAsync: async (relayState: string) => {
      samlMocks.relayState = relayState;
      return `https://idp.example.test/login?RelayState=${encodeURIComponent(relayState)}`;
    },
    validatePostResponseAsync: samlMocks.validatePostResponseAsync,
  }),
}));

vi.mock('../server/lib/couch.js', () => ({
  findOne: vi.fn(async (selector: Record<string, unknown>) => selector['email'] === 'saml-user@example.test'
    ? {
        _id: 'user-saml', _rev: '1-user', type: 'user', email: 'saml-user@example.test', passwordHash: '',
        name: 'SAML User', emailVerifiedAt: 1, createdAt: 1, updatedAt: 1,
      }
    : null),
  updateDoc: vi.fn(async (doc: Record<string, unknown>) => ({ ok: true, id: doc['_id'], rev: '2-user' })),
  insertDoc: vi.fn(),
  getDoc: vi.fn(),
  find: vi.fn(async () => ({ docs: [] })),
}));

vi.mock('../server/lib/bcrypt.js', () => ({ hash: vi.fn(), compare: vi.fn() }));
vi.mock('../server/lib/socket.js', () => ({ disconnectSessionSockets: vi.fn(() => 0) }));
vi.mock('../server/lib/logger.js', () => ({ logAuthEvent: vi.fn() }));

import authRouter from '../server/routes/auth.js';

describe('SAML cross-site POST correlation', () => {
  let server: ReturnType<express.Express['listen']>;
  let origin = '';
  let callbackSession: Record<string, any> | undefined;

  beforeAll(async () => {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(cookieParser());
    app.use((req, _res, next) => {
      // Deliberately create a fresh session on every request. This models an
      // IdP form POST where the browser omitted the main SameSite=Lax cookie.
      const session: Record<string, any> = {
        destroy: (callback: () => void) => callback(),
        save: (callback: () => void) => callback(),
      };
      (req as any).session = session;
      if (req.path.endsWith('/saml/callback')) callbackSession = session;
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

  it('accepts a valid ACS POST using only the scoped SameSite=None cookie and consumes RelayState', async () => {
    const start = await fetch(`${origin}/api/auth/saml`, { redirect: 'manual' });
    expect(start.status).toBe(302);
    expect(samlMocks.relayState).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const setCookie = start.headers.get('set-cookie') || '';
    expect(setCookie).toContain('rizzoma.saml=');
    expect(setCookie.toLowerCase()).toContain('samesite=none');
    expect(setCookie.toLowerCase()).toContain('secure');
    expect(setCookie.toLowerCase()).toContain('httponly');
    const correlationCookie = setCookie.split(';')[0];

    const form = new URLSearchParams({ RelayState: samlMocks.relayState, SAMLResponse: 'signed-assertion' });
    const callback = await fetch(`${origin}/api/auth/saml/callback`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        // No rizzoma.sid cookie: only the narrowly scoped SAML correlation.
        cookie: correlationCookie,
      },
      body: form,
    });
    expect(callback.status).toBe(302);
    expect(callback.headers.get('location')).toBe('/?layout=rizzoma');
    expect(callbackSession?.['userId']).toBe('user-saml');
    expect(samlMocks.validatePostResponseAsync).toHaveBeenCalledTimes(1);

    const replay = await fetch(`${origin}/api/auth/saml/callback`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: correlationCookie },
      body: form,
    });
    expect(replay.headers.get('location')).toBe('/?error=saml_state_failed');
    expect(samlMocks.validatePostResponseAsync).toHaveBeenCalledTimes(1);
  });
});
