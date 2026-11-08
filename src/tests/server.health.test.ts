import { describe, it, expect, vi } from 'vitest';
import express from 'express';

const { couchDatabaseInfoMock } = vi.hoisted(() => ({
  couchDatabaseInfoMock: vi.fn(),
}));

const { sessionStoreHealthMock } = vi.hoisted(() => ({
  sessionStoreHealthMock: vi.fn(),
}));

const { virusScannerHealthMock } = vi.hoisted(() => ({
  virusScannerHealthMock: vi.fn(),
}));

// Stub the application database check so the health route can be exercised
// without needing a real CouchDB instance running locally.
vi.mock('../server/lib/couch.js', () => ({
  couchDatabaseInfo: couchDatabaseInfoMock,
}));

vi.mock('../server/middleware/session.js', () => ({
  sessionStoreHealth: sessionStoreHealthMock,
}));

vi.mock('../server/lib/virusScan.js', () => ({
  virusScannerHealth: virusScannerHealthMock,
}));

import healthRouter from '../server/routes/health';

describe('routes: /api/health', () => {
  const app = express();
  app.use('/api', healthRouter);

  it('returns ok status payload', async () => {
    couchDatabaseInfoMock.mockResolvedValueOnce({ db_name: 'project_rizzoma' });
    sessionStoreHealthMock.mockResolvedValueOnce({ status: 'ok', mode: 'redis', ms: 1 });
    virusScannerHealthMock.mockResolvedValueOnce({ status: 'ok', ms: 1 });
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      checks: {
        sessions: { status: 'ok', mode: 'redis' },
        clamav: { status: 'ok' },
      },
    });
  });

  it('returns degraded when the application database is missing', async () => {
    couchDatabaseInfoMock.mockRejectedValueOnce(new Error('404 Database does not exist.'));
    sessionStoreHealthMock.mockResolvedValueOnce({ status: 'ok', mode: 'redis', ms: 1 });
    virusScannerHealthMock.mockResolvedValueOnce({ status: 'ok', ms: 1 });
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

  it('returns degraded when Redis-backed sessions are unavailable', async () => {
    couchDatabaseInfoMock.mockResolvedValueOnce({ db_name: 'project_rizzoma' });
    sessionStoreHealthMock.mockResolvedValueOnce({
      status: 'error',
      mode: 'redis',
      ms: 2,
      error: 'connection refused',
    });
    virusScannerHealthMock.mockResolvedValueOnce({ status: 'ok', ms: 1 });
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await resp.json();
    server.close();

    expect(resp.status).toBe(503);
    expect(body).toMatchObject({
      status: 'degraded',
      checks: { sessions: { status: 'error', mode: 'redis', error: 'connection refused' } },
    });
  });

  it('returns degraded when the mandatory production virus scanner is unavailable', async () => {
    couchDatabaseInfoMock.mockResolvedValueOnce({ db_name: 'project_rizzoma' });
    sessionStoreHealthMock.mockResolvedValueOnce({ status: 'ok', mode: 'redis', ms: 1 });
    virusScannerHealthMock.mockResolvedValueOnce({
      status: 'error',
      ms: 2,
      error: 'connection refused',
    });
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await resp.json();
    server.close();

    expect(resp.status).toBe(503);
    expect(body).toMatchObject({
      status: 'degraded',
      checks: { clamav: { status: 'error', error: 'connection refused' } },
    });
  });
});
