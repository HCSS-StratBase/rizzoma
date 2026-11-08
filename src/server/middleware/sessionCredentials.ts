import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { checkSessionCredentialVersion } from '../lib/sessionCredentials.js';
import { disconnectSessionSockets } from '../lib/socket.js';

function clearSessionCookie(res: Response): void {
  res.clearCookie('rizzoma.sid', {
    path: '/',
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'lax',
  });
}

async function destroyInvalidSession(req: Request, res: Response): Promise<void> {
  const sessionId = String((req as any).sessionID || '');
  const session = req.session;
  if (session && typeof session.destroy === 'function') {
    const error = await new Promise<unknown>((resolve) => session.destroy((failure) => resolve(failure)));
    if (error) {
      console.error('[auth] invalid session cleanup failed', {
        requestId: (req as any)?.id,
        error: String((error as any)?.message || error),
      });
    }
  }
  clearSessionCookie(res);
  disconnectSessionSockets(sessionId);
}

/**
 * Mount after `/api/auth` and before every data/upload route. Auth endpoints
 * remain able to establish a replacement session, while all authenticated
 * application access validates the password-reset generation first.
 */
export function sessionCredentialGuard(): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const check = await checkSessionCredentialVersion(req.session);
    if (check.status === 'valid') {
      next();
      return;
    }
    if (check.status === 'unavailable') {
      res.status(503).json({
        error: 'session_verification_unavailable',
        requestId: (req as any)?.id,
      });
      return;
    }
    await destroyInvalidSession(req, res);
    res.status(401).json({
      error: 'session_invalidated',
      requestId: (req as any)?.id,
    });
  };
}
