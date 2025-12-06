import express from 'express';
import healthRouter from '../server/routes/health';

describe('routes: /api/health', () => {
  const app = express();
  app.use('/api', healthRouter);

  it('returns ok status payload', async () => {
    const server = app.listen(0);
    const addr = server.address();
    const port = typeof addr === 'string' ? 0 : (addr as import('net').AddressInfo).port;
    const resp = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await resp.json();
    server.close();
    expect(resp.status).toBe(200);
    expect(body).toMatchObject({ status: 'ok' });
  });
});

