import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Router } from 'express';
import * as Y from 'yjs';
import { createHash } from 'node:crypto';
import blipsRouter from '../server/routes/blips';
import topicsRouter from '../server/routes/topics';

vi.mock('../server/lib/couch.js', () => {
  return {
    getDoc: vi.fn(),
    updateDoc: vi.fn(),
    insertDoc: vi.fn(),
    find: vi.fn().mockResolvedValue({ docs: [] }),
    findOne: vi.fn().mockResolvedValue(null),
    getDocsById: vi.fn().mockResolvedValue({}),
    deleteDoc: vi.fn(),
  };
});

vi.mock('../server/lib/socket.js', () => ({
  clearBlipSeedAuthority: vi.fn(),
  emitEvent: vi.fn(),
  hasWritableBlipSocket: vi.fn(() => false),
  revokeBlipSockets: vi.fn(() => 0),
}));

const couch = vi.mocked(await import('../server/lib/couch.js'));
const { hasWritableBlipSocket } = await import('../server/lib/socket.js');
const { yjsDocCache } = await import('../server/lib/yjsDocCache.js');

function collaborationDigest(blipId: string): string {
  const state = yjsDocCache.getState(blipId);
  if (!state) throw new Error(`Missing Yjs state for ${blipId}`);
  return createHash('sha256').update(state).digest('hex');
}

type InvokeOptions = {
  params?: Record<string, string>;
  body?: any;
  session?: Record<string, unknown>;
  headers?: Record<string, string>;
  sessionID?: string;
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
    sessionID: opts.sessionID ?? '',
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
    yjsDocCache.destroy();
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

  it('denies an authenticated outsider from updating a blip', async () => {
    couch.getDoc.mockImplementation(async (id: string) => id === 'b1'
      ? { _id: 'b1', type: 'blip', waveId: 'w1', authorId: 'owner', content: '<p>old</p>' }
      : {
          _id: 'w1', type: 'topic', authorId: 'owner',
          sharing: { shareLevel: 'private', allowComments: false, allowEdits: false },
        });
    couch.updateDoc.mockResolvedValue({ ok: true, id: 'b1', rev: '2-x' });
    const res = await invokeRoute(blipsRouter, 'put', '/:id', {
      params: { id: 'b1' },
      body: { content: '<p>new</p>' },
      session: { userId: 'other', csrfToken: 'tok' },
      headers: { 'x-csrf-token': 'tok' },
    });
    expect(res.statusCode).toBe(403);
    expect(couch.updateDoc).not.toHaveBeenCalled();
  });

  it('allows the author to update a blip', async () => {
    couch.getDoc.mockImplementation(async (id: string) => id === 'b1'
      ? { _id: 'b1', type: 'blip', waveId: 'w1', authorId: 'author', content: '<p>old</p>' }
      : {
          _id: 'w1', type: 'topic', authorId: 'author',
          sharing: { shareLevel: 'private', allowComments: false, allowEdits: false },
        });
    couch.updateDoc.mockResolvedValue({ ok: true, id: 'b1', rev: '2-x' });
    const res = await invokeRoute(blipsRouter, 'put', '/:id', {
      params: { id: 'b1' },
      body: { content: '<p>new</p>' },
      session: { userId: 'author', csrfToken: 'tok' },
      headers: { 'x-csrf-token': 'tok' },
    });
    expect(res.statusCode).toBe(200);
    expect(couch.updateDoc).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'b1',
      content: '<p>new</p>',
    }));
  });

  it('rejects an out-of-band replacement while collaboration is active', async () => {
    couch.getDoc.mockImplementation(async (id: string) => id === 'b1'
      ? { _id: 'b1', _rev: '1-x', type: 'blip', waveId: 'w1', authorId: 'author', content: '<p>old</p>' }
      : { _id: 'w1', type: 'topic', authorId: 'author', shareLevel: 'private' });
    yjsDocCache.addRef('b1');

    const res = await invokeRoute(blipsRouter, 'put', '/:id', {
      params: { id: 'b1' },
      body: { content: '<p>external</p>' },
      session: { userId: 'author', csrfToken: 'tok' },
      headers: { 'x-csrf-token': 'tok' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: 'collaboration_active' });
    expect(couch.updateDoc).not.toHaveBeenCalled();
  });

  it('accepts only an exact full-state-digest projection from the writable session', async () => {
    couch.getDoc.mockImplementation(async (id: string) => id === 'b1'
      ? { _id: 'b1', _rev: '1-x', type: 'blip', waveId: 'w1', authorId: 'author', content: '<p>old</p>' }
      : { _id: 'w1', type: 'topic', authorId: 'author', shareLevel: 'private' });
    couch.updateDoc.mockResolvedValue({ ok: true, id: 'b1', rev: '2-x' });
    yjsDocCache.addRef('b1');
    vi.mocked(hasWritableBlipSocket).mockReturnValue(true);
    const digest = collaborationDigest('b1');

    const accepted = await invokeRoute(blipsRouter, 'put', '/:id', {
      params: { id: 'b1' },
      body: { content: '<p>projected</p>' },
      sessionID: 'session-1',
      session: { userId: 'author', csrfToken: 'tok' },
      headers: {
        'x-csrf-token': 'tok',
        'x-rizzoma-yjs-state-digest': digest,
        'x-rizzoma-yjs-generation': '0',
      },
    });
    expect(accepted.statusCode).toBe(200);

    const stale = await invokeRoute(blipsRouter, 'put', '/:id', {
      params: { id: 'b1' },
      body: { content: '<p>stale</p>' },
      sessionID: 'session-1',
      session: { userId: 'author', csrfToken: 'tok' },
      headers: {
        'x-csrf-token': 'tok',
        'x-rizzoma-yjs-state-digest': '0'.repeat(64),
        'x-rizzoma-yjs-generation': '0',
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.body).toMatchObject({ error: 'collaboration_projection_stale' });
  });

  it('never downgrades a digest-bearing request without its writable socket lease', async () => {
    couch.getDoc.mockImplementation(async (id: string) => id === 'b1'
      ? { _id: 'b1', _rev: '1-x', type: 'blip', waveId: 'w1', authorId: 'author', content: '<p>old</p>' }
      : { _id: 'w1', type: 'topic', authorId: 'author', shareLevel: 'private' });
    couch.updateDoc.mockResolvedValue({ ok: true, id: 'b1', rev: '2-x' });
    yjsDocCache.getOrCreate('b1');
    vi.mocked(hasWritableBlipSocket).mockReturnValue(false);

    const res = await invokeRoute(blipsRouter, 'put', '/:id', {
      params: { id: 'b1' },
      body: { content: '<p>must not become an external replacement</p>' },
      sessionID: 'expired-lease',
      session: { userId: 'author', csrfToken: 'tok' },
      headers: {
        'x-csrf-token': 'tok',
        'x-rizzoma-yjs-state-digest': collaborationDigest('b1'),
        'x-rizzoma-yjs-generation': '0',
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: 'collaboration_projection_session_missing' });
    expect(couch.updateDoc).not.toHaveBeenCalled();
  });

  it('does not silently discard an acknowledged dirty Y.Doc with zero live refs', async () => {
    couch.getDoc.mockImplementation(async (id: string) => id === 'b1'
      ? { _id: 'b1', _rev: '1-x', type: 'blip', waveId: 'w1', authorId: 'author', content: '<p>durable base</p>' }
      : { _id: 'w1', type: 'topic', authorId: 'author', shareLevel: 'private' });
    couch.updateDoc.mockResolvedValue({ ok: true, id: 'b1', rev: '2-x' });
    const source = new Y.Doc();
    source.getText('default').insert(0, 'acknowledged but not projected');
    yjsDocCache.applyUpdate('b1', Y.encodeStateAsUpdate(source), 'accepted-socket-update');
    expect(yjsDocCache.hasActiveRefs('b1')).toBe(false);

    const res = await invokeRoute(blipsRouter, 'put', '/:id', {
      params: { id: 'b1' },
      body: { content: '<p>external replacement</p>' },
      session: { userId: 'author', csrfToken: 'tok' },
      headers: { 'x-csrf-token': 'tok' },
    });

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ error: 'collaboration_pending_projection' });
    expect(couch.updateDoc).not.toHaveBeenCalled();
    expect(yjsDocCache.getState('b1')).not.toBeNull();
    source.destroy();
  });
});

describe('routes: topics permission checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    yjsDocCache.destroy();
    vi.mocked(hasWritableBlipSocket).mockReturnValue(false);
  });

  it('enforces the same collaboration projection boundary for the topic root', async () => {
    couch.getDoc.mockResolvedValue({
      _id: 't1', _rev: '1-x', type: 'topic', authorId: 'author',
      title: 'Root title', content: '<h1>Root title</h1><p>old</p>',
      shareLevel: 'private', createdAt: 1, updatedAt: 1,
    });
    couch.updateDoc.mockResolvedValue({ ok: true, id: 't1', rev: '2-x' });
    yjsDocCache.addRef('t1');

    const external = await invokeRoute(topicsRouter, 'patch', '/:id', {
      params: { id: 't1' },
      body: { content: '<h1>Root title</h1><p>external</p>' },
      session: { userId: 'author', csrfToken: 'tok' },
      headers: { 'x-csrf-token': 'tok' },
    });
    expect(external.statusCode).toBe(409);
    expect(external.body).toMatchObject({ error: 'collaboration_active' });

    vi.mocked(hasWritableBlipSocket).mockReturnValue(true);
    const accepted = await invokeRoute(topicsRouter, 'patch', '/:id', {
      params: { id: 't1' },
      body: { content: '<h1>Root title</h1><p>projected</p>' },
      sessionID: 'session-1',
      session: { userId: 'author', csrfToken: 'tok' },
      headers: {
        'x-csrf-token': 'tok',
        'x-rizzoma-yjs-state-digest': collaborationDigest('t1'),
        'x-rizzoma-yjs-generation': '0',
      },
    });
    expect(accepted.statusCode).toBe(200);

    const stale = await invokeRoute(topicsRouter, 'patch', '/:id', {
      params: { id: 't1' },
      body: { content: '<h1>Root title</h1><p>stale</p>' },
      sessionID: 'session-1',
      session: { userId: 'author', csrfToken: 'tok' },
      headers: {
        'x-csrf-token': 'tok',
        'x-rizzoma-yjs-state-digest': '0'.repeat(64),
        'x-rizzoma-yjs-generation': '0',
      },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.body).toMatchObject({ error: 'collaboration_projection_stale' });
  });

  it('denies topic deletion for non-author', async () => {
    couch.getDoc.mockResolvedValue({
      _id: 't1', _rev: '1-x', type: 'topic', authorId: 'owner',
      title: 'Protected topic', createdAt: 1, updatedAt: 1,
      sharing: { shareLevel: 'private', allowComments: false, allowEdits: false },
    });
    const res = await invokeRoute(topicsRouter, 'delete', '/:id', {
      params: { id: 't1' },
      session: { userId: 'other', csrfToken: 'tok' },
      headers: { 'x-csrf-token': 'tok' },
    });
    expect(res.statusCode).toBe(403);
    expect(couch.deleteDoc).not.toHaveBeenCalled();
  });
});
