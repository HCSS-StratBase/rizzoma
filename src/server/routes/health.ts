import { Router } from 'express';
import { couchDbInfo } from '../lib/couch.js';

const healthRouter = Router();

const startedAt = Date.now();

healthRouter.get('/health', async (_req, res) => {
  const checks: Record<string, { status: 'ok' | 'error'; ms?: number; error?: string; version?: string }> = {};

  // CouchDB check
  const couchStart = Date.now();
  try {
    const info = await couchDbInfo();
    checks['couchdb'] = { status: 'ok', ms: Date.now() - couchStart, version: info?.version };
  } catch (e: any) {
    checks['couchdb'] = { status: 'error', ms: Date.now() - couchStart, error: e?.message || 'unreachable' };
  }

  const allOk = Object.values(checks).every(c => c.status === 'ok');
  const uptimeMs = Date.now() - startedAt;

  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    uptime: uptimeMs,
    uptimeHuman: formatUptime(uptimeMs),
    checks,
  });
});

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export default healthRouter;
