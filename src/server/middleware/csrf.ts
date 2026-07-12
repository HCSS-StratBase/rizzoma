import { randomBytes } from 'crypto';

const TOKEN_COOKIE = 'XSRF-TOKEN';
const HEADER_NAME = 'x-csrf-token';

export function csrfInit() {
  return (req: any, res: any, next: any) => {
    const sess = (req as any).session as any;
    // Do not turn every anonymous page/API/asset request into a saved session.
    // A first page load fans out many concurrent requests; when each response
    // creates a different anonymous session cookie, a late asset response can
    // overwrite the freshly regenerated login cookie. The dedicated endpoint
    // is the only anonymous request allowed to mint the pre-auth CSRF session.
    const requestPath = String(req.originalUrl || req.url || req.path || '').split('?')[0];
    const isTokenEndpoint = requestPath === '/api/auth/csrf';
    if (sess && !sess.csrfToken && isTokenEndpoint) {
      sess.csrfToken = randomBytes(16).toString('hex');
    }
    // A request that loaded the old pre-auth session before login regeneration
    // may complete afterwards. Restrict the readable cookie too, otherwise it
    // could overwrite the fresh post-login XSRF token even though the SID is
    // now safe. establishAuthenticatedSession emits the post-login token.
    if (isTokenEndpoint && sess?.csrfToken) {
      const isProd = process.env['NODE_ENV'] === 'production';
      res.cookie(TOKEN_COOKIE, sess.csrfToken, {
        httpOnly: false,
        sameSite: 'lax',
        secure: isProd,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }
    next();
  };
}

export function csrfProtect() {
  return (req: any, res: any, next: any) => {
    // allow safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const sess = (req as any).session as any;

    // Allow explicit demo-mode bypass when configured
    const demoBypass = process.env['DEMO_MODE'] === '1';
    if (!sess) {
      return next();
    }
    if (demoBypass && !sess.userId) {
      return next();
    }

    // Enforce CSRF for any state-changing request when a session exists
    const headerGet = typeof (req as any).get === 'function' ? (req as any).get(HEADER_NAME) : undefined;
    const token = headerGet || (req as any).headers?.[HEADER_NAME] || (req as any).body?.csrfToken;
    if (!sess?.csrfToken || !token || token !== sess.csrfToken) {
      return res.status(403).json({ error: 'csrf_failed' });
    }
    next();
  };
}

export function getCsrfTokenFromSession(req: any): string | undefined {
  return (req as any).session?.csrfToken as string | undefined;
}
