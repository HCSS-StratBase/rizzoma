import { describe, it, expect, vi } from 'vitest';
import express from 'express';

const { couchDatabaseInfoMock } = vi.hoisted(() => ({
  couchDatabaseInfoMock: vi.fn(),
}));

// Stub the application database check so the health route can be exercised
// without needing a real CouchDB instance running locally.
vi.mock('../server/lib/couch.js', () => ({
  couchDatabaseInfo: couchDatabaseInfoMock,
}));

import healthRouter from '../server/routes/health';

describe('routes: /api/health', () => {
  const app = express();
  app.use('/api', healthRouter);

  it('returns ok status payload', async () => {
    couchDatabaseInfoMock.mockResolvedValueOnce({ db_name: 'project_rizzoma' });
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body).toMatchObject({ status: 'ok' });
  });

  it('returns degraded when the application database is missing', async () => {
    couchDatabaseInfoMock.mockRejectedValueOnce(new Error('404 Database does not exist.'));
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(503);
    expect(body).toMatchObject({
      status: 'degraded',
      checks: { couchdb: { status: 'error', error: '404 Database does not exist.' } },
    });
  });
});
