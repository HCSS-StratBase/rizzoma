import type { NextFunction, Request, Response } from 'express';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_INVITE_UNITS = 60;
const buckets = new Map<string, { used: number; resetAt: number }>();

function units(req: Request): number {
  const body = (req.body || {}) as Record<string, unknown>;
  if (Array.isArray(body['participants'])) return body['participants'].length;
  if (Array.isArray(body['emails'])) return body['emails'].length;
  return body['recipientEmail'] ? 1 : 0;
}

export function inviteRateLimit(req: Request, res: Response, next: NextFunction): void {
  const cost = Math.max(0, Math.min(20, units(req)));
  if (cost === 0) { next(); return; }
  const now = Date.now();
  const identity = (req as any).user?.id || (req as any).session?.userId;
  const keys = [identity ? `user:${identity}` : '', `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`].filter(Boolean);
  for (const key of keys) {
    const prior = buckets.get(key);
    const bucket = !prior || prior.resetAt <= now ? { used: 0, resetAt: now + WINDOW_MS } : prior;
    if (bucket.used + cost > MAX_INVITE_UNITS) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      res.status(429).json({ error: 'invite_rate_limited' });
      return;
    }
  }
  for (const key of keys) {
    const prior = buckets.get(key);
    const bucket = !prior || prior.resetAt <= now ? { used: 0, resetAt: now + WINDOW_MS } : prior;
    bucket.used += cost;
    buckets.set(key, bucket);
  }
  next();
}

export function resetInviteRateLimitsForTests(): void {
  buckets.clear();
}
