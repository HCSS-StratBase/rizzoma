import express from 'express';
import session from 'express-session';
import { createServer, type Server as HttpServer } from 'node:http';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type StoredDoc = Record<string, any> & { _id: string };

const state = vi.hoisted(() => ({
  docs: new Map<string, StoredDoc>(),
}));

function matches(doc: StoredDoc, selector: Record<string, any>): boolean {
  return Object.entries(selector).every(([key, expected]) => doc[key] === expected);
}

vi.mock('../server/lib/couch.js', () => ({
  getDoc: vi.fn(async (id: string) => {
    const doc = state.docs.get(id);
    if (!doc) throw new Error('404 not_found');
    return { ...doc };
  }),
  find: vi.fn(async (selector: Record<string, any>) => ({
    docs: [...state.docs.values()].filter((doc) => matches(doc, selector)).map((doc) => ({ ...doc })),
  })),
  findOne: vi.fn(async (selector: Record<string, any>) => {
    const doc = [...state.docs.values()].find((candidate) => matches(candidate, selector));
    return doc ? { ...doc } : null;
  }),
  insertDoc: vi.fn(async () => ({ ok: true, id: 'created', rev: '1-test' })),
  updateDoc: vi.fn(async (doc: StoredDoc) => ({ ok: true, id: doc._id, rev: '2-test' })),
}));

import { closeSocket, initSocket, refreshWaveSocketAccess } from '../server/lib/socket.js';

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler);
  });
}

describe('Socket.IO session-backed authorization', () => {
  let server: HttpServer;
  let origin = '';
  const clients: Socket[] = [];

  beforeAll(async () => {
    state.docs.set('topic-private', {
      _id: 'topic-private',
      type: 'topic',
      authorId: 'owner',
      shareLevel: 'private',
      allowComments: false,
      allowEdits: false,
    });
    state.docs.set('blip-private', {
      _id: 'blip-private',
      type: 'blip',
      waveId: 'topic-private',
      content: '<p>Secret</p>',
    });
    for (const role of ['viewer', 'editor'] as const) {
      state.docs.set(`participant-${role}`, {
        _id: `participant-${role}`,
        type: 'participant',
        waveId: 'topic-private',
        userId: role,
        role,
        status: 'accepted',
      });
    }

    const app = express();
    const sessionMiddleware = session({
      secret: 'socket-auth-test-secret',
      resave: false,
      saveUninitialized: false,
      store: new session.MemoryStore(),
      cookie: { sameSite: 'lax' },
    });
    app.use(sessionMiddleware);
    app.get('/login/:userId', (req, res) => {
      const userId = String(req.params['userId'] || '');
      req.session.userId = userId;
      req.session.userName = `Server ${userId}`;
      req.session.userEmail = `${userId}@example.test`;
      res.json({ ok: true });
    });

    server = createServer(app);
    initSocket(server, ['*'], sessionMiddleware);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server port');
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    for (const client of clients) client.disconnect();
    await closeSocket();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function connectAs(userId?: string): Promise<Socket> {
    let cookie: string | undefined;
    if (userId) {
      const login = await fetch(`${origin}/login/${encodeURIComponent(userId)}`);
      cookie = login.headers.get('set-cookie')?.split(';')[0];
    }
    const socket = createClient(origin, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      ...(cookie ? { extraHeaders: { Cookie: cookie } } : {}),
    });
    clients.push(socket);
    await waitForEvent(socket, 'hello');
    return socket;
  }

  it('rejects a private-wave outsider even when the client claims the owner identity', async () => {
    const outsider = await connectAs('outsider');
    const denied = waitForEvent<any>(outsider, 'access:error');
    outsider.emit('editor:join', {
      waveId: 'topic-private',
      blipId: 'blip-private',
      userId: 'owner',
      name: 'Forged owner',
    });
    await expect(denied).resolves.toMatchObject({
      event: 'editor:join',
      waveId: 'topic-private',
      permission: 'read',
      error: 'forbidden',
    });
  });

  it('lets a viewer sync but rejects document and awareness writes', async () => {
    const viewer = await connectAs('viewer');
    const sync = waitForEvent<any>(viewer, 'blip:sync:blip-private');
    viewer.emit('blip:join', { blipId: 'blip-private', userId: 'owner' });
    await expect(sync).resolves.toMatchObject({ shouldSeed: false });

    const updateDenied = waitForEvent<any>(viewer, 'access:error');
    viewer.emit('blip:update', { blipId: 'blip-private', update: [0, 0] });
    await expect(updateDenied).resolves.toMatchObject({ event: 'blip:update', permission: 'edit' });

    const awarenessDenied = waitForEvent<any>(viewer, 'access:error');
    viewer.emit('awareness:update', { blipId: 'blip-private', states: { forged: true } });
    await expect(awarenessDenied).resolves.toMatchObject({ event: 'awareness:update', permission: 'edit' });
  });

  it('grants seed authority only to an editor admitted by the server-side role', async () => {
    const editor = await connectAs('editor');
    const sync = waitForEvent<any>(editor, 'blip:sync:blip-private');
    editor.emit('blip:join', { blipId: 'blip-private', userId: 'outsider' });
    await expect(sync).resolves.toMatchObject({ shouldSeed: true });
  });

  it('revokes live write authority immediately when an editor is demoted', async () => {
    state.docs.set('participant-editor', {
      ...state.docs.get('participant-editor')!,
      role: 'editor',
    });
    const editor = await connectAs('editor');
    const sync = waitForEvent<any>(editor, 'blip:sync:blip-private');
    editor.emit('blip:join', { blipId: 'blip-private' });
    await sync;

    state.docs.set('participant-editor', {
      ...state.docs.get('participant-editor')!,
      role: 'viewer',
    });
    const changed = waitForEvent<any>(editor, 'access:changed');
    expect(await refreshWaveSocketAccess('topic-private')).toBeGreaterThan(0);
    await expect(changed).resolves.toMatchObject({ waveId: 'topic-private', role: 'viewer', canRead: true, canEdit: false });

    const denied = waitForEvent<any>(editor, 'access:error');
    editor.emit('blip:update', { blipId: 'blip-private', update: [0, 0] });
    await expect(denied).resolves.toMatchObject({ event: 'blip:update', permission: 'edit' });
  });
});
