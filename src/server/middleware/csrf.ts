import { randomBytes } from 'crypto';

const TOKEN_COOKIE = 'XSRF-TOKEN';
const HEADER_NAME = 'x-csrf-token';

export function csrfInit() {
  return (req: any, res: any, next: any) => {
    const sess = (req as any).session as any;
    if (sess && !sess.csrfToken) {
      sess.csrfToken = randomBytes(16).toString('hex');
    }
    if (sess?.csrfToken) {
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
    // Only enforce CSRF for authenticated sessions; otherwise let route-level auth return 401
    if (!sess?.userId) return next();
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
