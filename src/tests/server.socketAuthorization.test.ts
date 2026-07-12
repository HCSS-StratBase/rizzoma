import express from 'express';
import session from 'express-session';
import { createServer, type Server as HttpServer } from 'node:http';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';

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

import {
  closeSocket,
  disconnectSessionSockets,
  disconnectWaveSockets,
  emitEvent,
  initSocket,
  refreshWaveSocketAccess,
  revokeBlipSockets,
} from '../server/lib/socket.js';

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
  const sessionIds = new Map<string, string[]>();
  let sessionStore: session.MemoryStore;

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
    sessionStore = new session.MemoryStore();
    const sessionMiddleware = session({
      secret: 'socket-auth-test-secret',
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: { sameSite: 'lax' },
    });
    app.use(sessionMiddleware);
    app.get('/login/:userId', (req, res) => {
      const userId = String(req.params['userId'] || '');
      req.session.userId = userId;
      req.session.userName = `Server ${userId}`;
      req.session.userEmail = `${userId}@example.test`;
      const ids = sessionIds.get(userId) || [];
      ids.push(req.sessionID);
      sessionIds.set(userId, ids);
      res.json({ ok: true, sessionId: req.sessionID });
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

  function latestSessionId(userId: string): string {
    const ids = sessionIds.get(userId) || [];
    const id = ids[ids.length - 1];
    if (!id) throw new Error(`Missing session id for ${userId}`);
    return id;
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
    await expect(sync).resolves.toMatchObject({
      ok: true,
      waveId: 'topic-private',
      shouldSeed: false,
      canEdit: false,
      user: { id: 'viewer', name: 'Server viewer' },
    });

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
    await expect(sync).resolves.toMatchObject({
      ok: true,
      waveId: 'topic-private',
      shouldSeed: true,
      canEdit: true,
      user: { id: 'editor', name: 'Server editor' },
    });

    const source = new Y.Doc();
    source.getMap('content').set('text', 'resync identity');
    await new Promise<void>((resolve, reject) => {
      editor.emit('blip:update', {
        blipId: 'blip-private',
        update: Array.from(Y.encodeStateAsUpdate(source)),
      }, (result: any) => result?.ok ? resolve() : reject(new Error(String(result?.error || 'update failed'))));
    });
    const empty = new Y.Doc();
    const resync = waitForEvent<any>(editor, 'blip:sync:blip-private');
    editor.emit('blip:sync:request', {
      blipId: 'blip-private',
      stateVector: Array.from(Y.encodeStateVector(empty)),
    });
    await expect(resync).resolves.toMatchObject({
      ok: true,
      waveId: 'topic-private',
      canEdit: true,
      user: { id: 'editor', name: 'Server editor' },
    });
    source.destroy();
    empty.destroy();
  });

  it('acknowledges an authorized join before initial sync', async () => {
    const editor = await connectAs('editor');
    const order: string[] = [];
    editor.once('blip:sync:blip-private', () => order.push('sync'));
    await new Promise<void>((resolve, reject) => {
      editor.emit('blip:join', { blipId: 'blip-private' }, (result: any) => {
        try {
          expect(result).toMatchObject({ ok: true, waveId: 'topic-private', canEdit: true });
          expect(result.user).toMatchObject({ id: 'editor', name: 'Server editor' });
          order.push('ack');
          resolve();
        } catch (error) { reject(error); }
      });
    });
    for (let attempt = 0; attempt < 20 && !order.includes('sync'); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(order[0]).toBe('ack');
    expect(order).toContain('sync');
  });

  it('rewrites awareness identity from the authenticated session and removes it on demotion', async () => {
    state.docs.set('participant-editor', { ...state.docs.get('participant-editor')!, role: 'editor' });
    const editor = await connectAs('editor');
    const owner = await connectAs('owner');
    const editorSync = waitForEvent<any>(editor, 'blip:sync:blip-private');
    const ownerSync = waitForEvent<any>(owner, 'blip:sync:blip-private');
    editor.emit('blip:join', { blipId: 'blip-private' });
    owner.emit('blip:join', { blipId: 'blip-private' });
    await Promise.all([editorSync, ownerSync]);

    const sourceDoc = new Y.Doc();
    const sourceAwareness = new Awareness(sourceDoc);
    sourceAwareness.setLocalStateField('user', { id: 'owner', name: 'Forged owner', color: '#000000' });
    const clientId = sourceAwareness.clientID;
    const update = encodeAwarenessUpdate(sourceAwareness, [clientId]);
    const relayed = waitForEvent<any>(owner, 'awareness:update:blip-private');
    editor.emit('awareness:update', { blipId: 'blip-private', update: Array.from(update) });
    const payload = await relayed;

    const peerDoc = new Y.Doc();
    const peerAwareness = new Awareness(peerDoc);
    applyAwarenessUpdate(peerAwareness, new Uint8Array(payload.update), 'server');
    expect(peerAwareness.getStates().get(clientId)?.['user']).toMatchObject({
      id: 'editor',
      name: 'Server editor',
    });
    expect(peerAwareness.getStates().get(clientId)?.['user']?.name).not.toMatch(/^User \d+$/);

    state.docs.set('participant-editor', { ...state.docs.get('participant-editor')!, role: 'viewer' });
    const removal = waitForEvent<any>(owner, 'awareness:update:blip-private');
    await refreshWaveSocketAccess('topic-private');
    applyAwarenessUpdate(peerAwareness, new Uint8Array((await removal).update), 'server');
    expect(peerAwareness.getStates().has(clientId)).toBe(false);
    sourceAwareness.destroy();
    sourceDoc.destroy();
    peerAwareness.destroy();
    peerDoc.destroy();
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

  it('disconnects every room when a topic becomes a deletion tombstone', async () => {
    state.docs.set('participant-editor', { ...state.docs.get('participant-editor')!, role: 'editor' });
    const editor = await connectAs('editor');
    const sync = waitForEvent<any>(editor, 'blip:sync:blip-private');
    editor.emit('blip:join', { blipId: 'blip-private' });
    await sync;
    state.docs.set('topic-private', {
      ...state.docs.get('topic-private')!,
      type: 'topic_tombstone',
      deleted: true,
      shareLevel: 'private',
    });
    state.docs.set('blip-private', { ...state.docs.get('blip-private')!, deleted: true });
    const changed = waitForEvent<any>(editor, 'access:changed');
    expect(disconnectWaveSockets('topic-private')).toBeGreaterThan(0);
    await expect(changed).resolves.toMatchObject({ waveId: 'topic-private' });
    const denied = waitForEvent<any>(editor, 'access:error');
    editor.emit('blip:update', { blipId: 'blip-private', update: [0, 0] });
    await expect(denied).resolves.toMatchObject({ event: 'blip:update' });
  });

  it('revokes a tombstoned blip before any later CRDT update can dirty or relay it', async () => {
    state.docs.set('topic-private', { ...state.docs.get('topic-private')!, type: 'topic', deleted: false });
    state.docs.set('blip-revoked', {
      _id: 'blip-revoked', type: 'blip', waveId: 'topic-private', content: '<p>Delete me</p>', deleted: false,
    });
    state.docs.set('participant-editor', { ...state.docs.get('participant-editor')!, role: 'editor' });
    const editor = await connectAs('editor');
    const owner = await connectAs('owner');
    const editorSync = waitForEvent<any>(editor, 'blip:sync:blip-revoked');
    const ownerSync = waitForEvent<any>(owner, 'blip:sync:blip-revoked');
    editor.emit('blip:join', { blipId: 'blip-revoked' });
    owner.emit('blip:join', { blipId: 'blip-revoked' });
    await Promise.all([editorSync, ownerSync]);

    let relayed = false;
    owner.on('blip:update:blip-revoked', () => { relayed = true; });
    const changed = waitForEvent<any>(editor, 'access:changed');
    const dirtyBefore = (await import('../server/lib/yjsDocCache.js')).yjsDocCache.getDirtyCount();
    expect(revokeBlipSockets(['blip-revoked'])).toBeGreaterThanOrEqual(2);
    await expect(changed).resolves.toMatchObject({ blipId: 'blip-revoked', deleted: true, canEdit: false });

    const source = new Y.Doc();
    source.getMap('content').set('text', 'must not persist');
    const denied = waitForEvent<any>(editor, 'access:error');
    const result = await new Promise<any>((resolve) => editor.emit('blip:update', {
      blipId: 'blip-revoked', update: Array.from(Y.encodeStateAsUpdate(source)),
    }, resolve));
    expect(result).toMatchObject({ ok: false, error: 'forbidden' });
    await expect(denied).resolves.toMatchObject({ event: 'blip:update', permission: 'edit' });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(relayed).toBe(false);
    expect((await import('../server/lib/yjsDocCache.js')).yjsDocCache.getDirtyCount()).toBe(dirtyBefore);
    source.destroy();
  });

  it('disconnects only the logging-out session while another session for the same user remains', async () => {
    state.docs.set('topic-private', { ...state.docs.get('topic-private')!, type: 'topic', deleted: false });
    state.docs.set('blip-private', { ...state.docs.get('blip-private')!, deleted: false });
    state.docs.set('participant-editor', { ...state.docs.get('participant-editor')!, role: 'editor' });
    const first = await connectAs('editor');
    const firstSessionId = latestSessionId('editor');
    const second = await connectAs('editor');
    const secondSessionId = latestSessionId('editor');
    expect(secondSessionId).not.toBe(firstSessionId);
    const firstDisconnected = waitForEvent(first, 'disconnect');
    expect(disconnectSessionSockets(firstSessionId)).toBe(1);
    await firstDisconnected;
    expect(first.connected).toBe(false);
    expect(second.connected).toBe(true);
  });

  it('publishes read-state events only to the matching user room', async () => {
    state.docs.set('topic-private', { ...state.docs.get('topic-private')!, type: 'topic', deleted: false });
    const owner = await connectAs('owner');
    const viewer = await connectAs('viewer');
    owner.emit('wave:unread:join', { waveId: 'topic-private' });
    viewer.emit('wave:unread:join', { waveId: 'topic-private' });
    await new Promise((resolve) => setTimeout(resolve, 75));

    let viewerSawPrivateRead = false;
    viewer.on('blip:read', () => { viewerSawPrivateRead = true; });
    const ownerRead = waitForEvent<any>(owner, 'blip:read');
    emitEvent('blip:read', { waveId: 'topic-private', blipId: 'blip-private', userId: 'owner', readAt: 123 });
    await expect(ownerRead).resolves.toMatchObject({ userId: 'owner', blipId: 'blip-private' });
    await new Promise((resolve) => setTimeout(resolve, 75));
    expect(viewerSawPrivateRead).toBe(false);
  });

  it('rejects malformed or oversized collaboration updates before relaying them', async () => {
    state.docs.set('participant-editor', { ...state.docs.get('participant-editor')!, role: 'editor' });
    const editor = await connectAs('editor');
    const owner = await connectAs('owner');
    const editorSync = waitForEvent<any>(editor, 'blip:sync:blip-private');
    const ownerSync = waitForEvent<any>(owner, 'blip:sync:blip-private');
    editor.emit('blip:join', { blipId: 'blip-private' });
    owner.emit('blip:join', { blipId: 'blip-private' });
    await Promise.all([editorSync, ownerSync]);

    let relayed = 0;
    owner.on('blip:update:blip-private', () => { relayed += 1; });
    const malformed = await new Promise<any>((resolve) => {
      editor.emit('blip:update', { blipId: 'blip-private', update: [255] }, resolve);
    });
    expect(malformed).toMatchObject({ ok: false, error: 'invalid_update' });

    const oversized = await new Promise<any>((resolve) => {
      editor.emit('blip:update', { blipId: 'blip-private', update: new Array(256 * 1024 + 1).fill(0) }, resolve);
    });
    expect(oversized).toMatchObject({ ok: false, error: 'update_too_large' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(relayed).toBe(0);

    const source = new Y.Doc();
    source.getMap('content').set('text', 'validated update');
    const update = Array.from(Y.encodeStateAsUpdate(source));
    const received = waitForEvent<any>(owner, 'blip:update:blip-private');
    const accepted = await new Promise<any>((resolve) => {
      editor.emit('blip:update', { blipId: 'blip-private', update }, resolve);
    });
    expect(accepted).toMatchObject({ ok: true, blipId: 'blip-private' });
    await expect(received).resolves.toMatchObject({ update });
    source.destroy();
  });

  it('fails closed after passive session-store invalidation', async () => {
    const editor = await connectAs('editor');
    const sessionId = latestSessionId('editor');
    const disconnected = waitForEvent(editor, 'disconnect', 2500);
    await new Promise<void>((resolve, reject) => sessionStore.destroy(sessionId, (error) => error ? reject(error) : resolve()));
    await disconnected;
    expect(editor.connected).toBe(false);
  });
});
