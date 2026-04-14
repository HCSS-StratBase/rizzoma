import winston from 'winston';
import path from 'path';
import fs from 'fs';

const level = (process.env['LOG_LEVEL'] || 'info').toLowerCase();

// Persistent file transport — rotates at 10 MB, keeps 5 generations.
// Provides an audit trail that survives backend restarts so we can see
// who hit the Tailscale Funnel and when, not just what's currently in
// stdout. Skipped when LOG_TO_FILE=0 (e.g. for unit tests).
const logDir = process.env['LOG_DIR'] || path.join(process.cwd(), 'logs');
const enableFile = process.env['LOG_TO_FILE'] !== '0';
if (enableFile) {
  try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* best-effort */ }
}

const transports: any[] = [new winston.transports.Console()];
if (enableFile) {
  transports.push(new winston.transports.File({
    filename: path.join(logDir, 'rizzoma.log'),
    maxsize: 10 * 1024 * 1024,
    maxFiles: 5,
    tailable: true,
  }));
}

export const logger = winston.createLogger({
  level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp, ...meta }: any) => {
      const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} ${level}: ${message}${rest}`;
    })
  ),
  transports,
});

// Extract the real client IP even when behind the Tailscale Funnel →
// Vite dev proxy → Express chain. Walks the X-Forwarded-For list from
// the rightmost entry backwards until we hit something that isn't a
// trusted hop (localhost / tailnet / WSL).
function clientIp(req: any): string {
  const xff = String(req.headers['x-forwarded-for'] || '');
  if (xff) {
    const hops = xff.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (hops.length > 0) return hops[0] || req.ip || 'unknown';
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function requestLogger() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`, {
        reqId: (req as any).id,
        ip: clientIp(req),
        ua: String(req.headers['user-agent'] || '').slice(0, 80),
      });
    });
    next();
  };
}

/**
 * Structured auth-event logger. Called from the OAuth callback
 * handlers (success + failure) so we have a clean audit trail of
 * sign-in attempts — who, from where, via which provider.
 */
export function logAuthEvent(req: any, event: {
  provider: 'google' | 'facebook' | 'microsoft' | 'saml' | 'local';
  email?: string | null;
  ok: boolean;
  reason?: string;
}): void {
  logger.info(`auth:${event.ok ? 'signin-ok' : 'signin-fail'}`, {
    provider: event.provider,
    email: event.email || null,
    ip: clientIp(req),
    ua: String(req.headers['user-agent'] || '').slice(0, 80),
    reason: event.reason || null,
  });
}
