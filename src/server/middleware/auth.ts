import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session || !req.session.userId) {
    console.warn('[auth] unauthenticated access blocked', { path: req.path, method: req.method, requestId: (req as any)?.id });
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  
  // Add user to request
  req.user = {
    id: req.session.userId,
    email: req.session.userEmail || '',
    name: req.session.userName || 'Anonymous'
  };
  
  next();
}

// Extend Express Request type
/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name: string;
      };
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */
