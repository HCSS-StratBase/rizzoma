import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Router } from 'express';
import blipsRouter from '../server/routes/blips';
import topicsRouter from '../server/routes/topics';

vi.mock('../server/lib/couch.js', () => {
  return {
    getDoc: vi.fn(),
    updateDoc: vi.fn(),
    insertDoc: vi.fn(),
    find: vi.fn().mockResolvedValue({ docs: [] }),
    deleteDoc: vi.fn(),
  };
});

vi.mock('../server/lib/socket.js', () => ({
  emitEvent: vi.fn(),
}));

const couch = vi.mocked(await import('../server/lib/couch.js'));

type InvokeOptions = {
  params?: Record<string, string>;
  body?: any;
  session?: Record<string, unknown>;
  headers?: Record<string, string>;
};

async function invokeRoute(router: Router, method: string, path: string, opts: InvokeOptions = {}) {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === path && entry.route?.methods?.[method.toLowerCase()]);
  if (!layer) throw new Error(`Route ${method} ${path} not found`);
  const stack = layer.route.stack;
  const req: any = {
    method,
    params: opts.params ?? {},
    body: opts.body ?? {},
    session: opts.session ?? {},
    headers: Object.fromEntries(Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
    get(name: string) {
      return this.headers[name.toLowerCase()];
    },
  };
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  for (const entry of stack) {
    let nextCalled = false;
    await entry.handle(req, res, () => {
      nextCalled = true;
    });
    if (!nextCalled) break;
  }
  return res;
}

describe('routes: blips permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects blip update when unauthenticated', async () => {
    const res = await invokeRoute(blipsRouter, 'put', '/:id', {
      params: { id: 'b1' },
      body: { content: '<p>new</p>' },
      session: {},
    });
    expect(res.statusCode).toBe(401);
    expect(couch.updateDoc).not.toHaveBeenCalled();
  });

  it('rejects blip update when user is not the author', async () => {
    couch.getDoc.mockResolvedValue({ _id: 'b1', waveId: 'w1', authorId: 'owner', content: '<p>old</p>' });
    const res = await invokeRoute(blipsRouter, 'put', '/:id', {
      params: { id: 'b1' },
      body: { content: '<p>new</p>' },
      session: { userId: 'other' },
    });
    expect(res.statusCode).toBe(403);
    expect(couch.updateDoc).not.toHaveBeenCalled();
  });

  it('allows the author to update a blip', async () => {
    couch.getDoc.mockResolvedValue({ _id: 'b1', waveId: 'w1', authorId: 'author', content: '<p>old</p>' });
    couch.updateDoc.mockResolvedValue({ id: 'b1', rev: '2-x' });
    const res = await invokeRoute(blipsRouter, 'put', '/:id', {
      params: { id: 'b1' },
      body: { content: '<p>new</p>' },
      session: { userId: 'author' },
    });
    expect(res.statusCode).toBe(200);
    expect(couch.updateDoc).toHaveBeenCalledTimes(1);
  });
});

describe('routes: topics permission checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('denies topic deletion for non-author', async () => {
    couch.getDoc.mockResolvedValue({ _id: 't1', _rev: '1-x', authorId: 'owner' });
    const res = await invokeRoute(topicsRouter, 'delete', '/:id', {
      params: { id: 't1' },
      session: { userId: 'other', csrfToken: 'tok' },
      headers: { 'x-csrf-token': 'tok' },
    });
    expect(res.statusCode).toBe(403);
    expect(couch.deleteDoc).not.toHaveBeenCalled();
  });
});
