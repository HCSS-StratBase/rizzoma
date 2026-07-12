import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../server/lib/couch', () => ({
  findOne: vi.fn(async () => undefined),
  insertDoc: vi.fn(async () => ({ id: 'twitter-user', rev: '1-x' })),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('../server/lib/bcrypt', () => ({
  hash: vi.fn(),
  compare: vi.fn(),
}));

vi.mock('../server/lib/saml', () => ({
  isSamlEnabled: vi.fn(() => false),
  getSamlInstance: vi.fn(),
  extractUserFromProfile: vi.fn(),
  generateMetadata: vi.fn(() => '<xml />'),
}));

const buildApp = async (sessionState?: Record<string, any>) => {
  const authRouter = (await import('../server/routes/auth')).default;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const session: Record<string, unknown> = sessionState || {
      destroy: (cb: () => void) => cb(),
    };
    (req as any).session = session;
    next();
  });
  app.use('/api/auth', authRouter);
  return app;
};

const fetchFromApp = async (app: express.Express, path: string) => {
  const server = app.listen(0);
  const addr = server.address();
  const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
  try {
    return await fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual' });
  } finally {
    server.close();
  }
};

describe('auth OAuth provider coverage', () => {
  afterEach(() => {
    delete process.env['GOOGLE_CLIENT_ID'];
    delete process.env['GOOGLE_CLIENT_SECRET'];
    delete process.env['FACEBOOK_APP_ID'];
    delete process.env['MICROSOFT_CLIENT_ID'];
    delete process.env['TWITTER_CLIENT_ID'];
    vi.resetModules();
  });

  it('reports all supported OAuth providers, including Twitter/X', async () => {
    process.env['GOOGLE_CLIENT_ID'] = 'google-client';
    process.env['FACEBOOK_APP_ID'] = 'facebook-app';
    process.env['MICROSOFT_CLIENT_ID'] = 'microsoft-client';
    process.env['TWITTER_CLIENT_ID'] = 'twitter-client';
    const app = await buildApp();

    const resp = await fetchFromApp(app, '/api/auth/oauth-status');
    const body = await resp.json();

    expect(resp.status).toBe(200);
    expect(body).toEqual({
      google: true,
      facebook: true,
      microsoft: true,
      twitter: true,
      saml: false,
    });
  }, 15_000);

  it('starts the Twitter/X PKCE redirect flow when configured', async () => {
    process.env['TWITTER_CLIENT_ID'] = 'twitter-client';
    const app = await buildApp();

    const resp = await fetchFromApp(app, '/api/auth/twitter');
    const location = resp.headers.get('location') || '';
    const redirect = new URL(location);

    expect(resp.status).toBe(302);
    expect(redirect.origin).toBe('https://twitter.com');
    expect(redirect.pathname).toBe('/i/oauth2/authorize');
    expect(redirect.searchParams.get('client_id')).toBe('twitter-client');
    expect(redirect.searchParams.get('response_type')).toBe('code');
    expect(redirect.searchParams.get('code_challenge_method')).toBe('S256');
    expect(redirect.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    expect(redirect.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });

  it('returns 501 for Twitter/X when credentials are absent', async () => {
    const app = await buildApp();

    const resp = await fetchFromApp(app, '/api/auth/twitter');
    const body = await resp.json();

    expect(resp.status).toBe(501);
    expect(body.error).toBe('twitter_oauth_not_configured');
  });

  it('correlates desktop OAuth callbacks with bounded one-time state across tabs', async () => {
    process.env['GOOGLE_CLIENT_ID'] = 'google-client';
    process.env['GOOGLE_CLIENT_SECRET'] = 'google-secret';
    const session: Record<string, any> = { destroy: (cb: () => void) => cb() };
    const app = await buildApp(session);

    const first = new URL((await fetchFromApp(app, '/api/auth/google')).headers.get('location') || '');
    const second = new URL((await fetchFromApp(app, '/api/auth/google')).headers.get('location') || '');
    const firstState = first.searchParams.get('state') || '';
    const secondState = second.searchParams.get('state') || '';
    expect(firstState).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(secondState).not.toBe(firstState);
    expect(Object.keys(session['oauthTransactions'] || {})).toEqual(expect.arrayContaining([firstState, secondState]));

    const wrong = await fetchFromApp(app, '/api/auth/google/callback?code=x&state=wrong-state');
    expect(wrong.headers.get('location')).toBe('/?error=google_auth_failed');
    expect(session['oauthTransactions'][firstState]).toBeDefined();

    const consumed = await fetchFromApp(app, `/api/auth/google/callback?state=${encodeURIComponent(firstState)}`);
    expect(consumed.headers.get('location')).toBe('/?error=google_auth_failed');
    expect(session['oauthTransactions'][firstState]).toBeUndefined();
    expect(session['oauthTransactions'][secondState]).toBeDefined();

    const replay = await fetchFromApp(app, `/api/auth/google/callback?code=x&state=${encodeURIComponent(firstState)}`);
    expect(replay.headers.get('location')).toBe('/?error=google_auth_failed');
    expect(session['oauthTransactions'][secondState]).toBeDefined();
  });

  it('binds mobile OAuth to a verifier challenge and sends only random state to the provider', async () => {
    process.env['GOOGLE_CLIENT_ID'] = 'google-client';
    const session: Record<string, any> = { destroy: (cb: () => void) => cb() };
    const app = await buildApp(session);
    const verifierChallenge = 'A'.repeat(43);
    const response = await fetchFromApp(app, `/api/auth/google?mobile=1&challenge=${verifierChallenge}`);
    const redirect = new URL(response.headers.get('location') || '');
    const state = redirect.searchParams.get('state') || '';
    expect(state).not.toContain(verifierChallenge);
    expect(session['oauthTransactions'][state]).toMatchObject({ provider: 'google' });
    expect(session['oauthTransactions'][state].mobileChallenge).toBe(verifierChallenge);

    const withoutCallerNonce = await fetchFromApp(app, '/api/auth/google?mobile=1');
    expect(withoutCallerNonce.status).toBe(400);
  });

  it('keeps independent Twitter PKCE verifiers for concurrent tabs and consumes each state once', async () => {
    process.env['TWITTER_CLIENT_ID'] = 'twitter-client';
    const session: Record<string, any> = { destroy: (cb: () => void) => cb() };
    const app = await buildApp(session);
    const first = new URL((await fetchFromApp(app, '/api/auth/twitter')).headers.get('location') || '');
    const second = new URL((await fetchFromApp(app, '/api/auth/twitter')).headers.get('location') || '');
    const firstState = first.searchParams.get('state') || '';
    const secondState = second.searchParams.get('state') || '';
    expect(session['oauthTransactions'][firstState]?.codeVerifier).toMatch(/^[A-Za-z0-9_-]{60,}$/);
    expect(session['oauthTransactions'][secondState]?.codeVerifier).toMatch(/^[A-Za-z0-9_-]{60,}$/);

    await fetchFromApp(app, `/api/auth/twitter/callback?state=${encodeURIComponent(firstState)}`);
    expect(session['oauthTransactions'][firstState]).toBeUndefined();
    expect(session['oauthTransactions'][secondState]).toBeDefined();
    await fetchFromApp(app, `/api/auth/twitter/callback?code=x&state=${encodeURIComponent(firstState)}`);
    expect(session['oauthTransactions'][secondState]).toBeDefined();
  });
});
