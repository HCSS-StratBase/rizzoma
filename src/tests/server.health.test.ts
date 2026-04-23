import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import healthRouter from '../server/routes/health';
import { couchDbInfo } from '../server/lib/couch.js';

vi.mock('../server/lib/couch.js', () => ({
  couchDbInfo: vi.fn(),
}));

describe('routes: /api/health', () => {
  const app = express();
  app.use('/api', healthRouter);

  beforeEach(() => {
    vi.mocked(couchDbInfo).mockResolvedValue({ version: 'test-couchdb' });
  });

  it('returns ok status payload', async () => {
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body).toMatchObject({ status: 'ok' });
    expect(body.checks.couchdb).toMatchObject({ status: 'ok', version: 'test-couchdb' });
  });

  it('returns degraded status when CouchDB is unreachable', async () => {
    vi.mocked(couchDbInfo).mockRejectedValueOnce(new Error('couch down'));
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(503);
    expect(body).toMatchObject({ status: 'degraded' });
    expect(body.checks.couchdb).toMatchObject({ status: 'error', error: 'couch down' });
  });
});
