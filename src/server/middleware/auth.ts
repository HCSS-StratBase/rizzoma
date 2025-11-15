import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentication required' });
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