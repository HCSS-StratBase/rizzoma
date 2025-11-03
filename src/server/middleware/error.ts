import { logger } from '../lib/logger.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, req: any, res: any, _next: any) {
  const status = typeof err?.status === 'number' ? err.status : 500;
  const code = err?.code || 'server_error';
  const message = err?.message || 'Internal Server Error';
  logger.error('Unhandled error', { status, code, message, stack: err?.stack });
  // ensure request id header is present on error paths
  if (!res.getHeader('x-request-id') && (res as any).locals?.reqId) {
    res.setHeader('x-request-id', (res as any).locals.reqId);
  }
  const requestId = (req as any)?.id || (res as any).locals?.reqId;
  res.status(status).json({ error: code, message, requestId });
}
