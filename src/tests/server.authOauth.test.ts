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

const buildApp = async () => {
  const authRouter = (await import('../server/routes/auth')).default;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const session: Record<string, unknown> = {
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
  });

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
    expect(redirect.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('returns 501 for Twitter/X when credentials are absent', async () => {
    const app = await buildApp();

    const resp = await fetchFromApp(app, '/api/auth/twitter');
    const body = await resp.json();

    expect(resp.status).toBe(501);
    expect(body.error).toBe('twitter_oauth_not_configured');
  });
});
