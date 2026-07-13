import express from 'express';
import session from 'express-session';
import { createServer, type Server as HttpServer } from 'node:http';
import { io as createClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { Schema } from '@tiptap/pm/model';
import { prosemirrorJSONToYDoc } from 'y-prosemirror';

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
  clearBlipSeedAuthority,
  closeSocket,
  disconnectSessionSockets,
  disconnectWaveSockets,
  emitEvent,
  initSocket,
  refreshWaveSocketAccess,
  revokeBlipSockets,
} from '../server/lib/socket.js';
import { find, findOne, getDoc } from '../server/lib/couch.js';
import { yjsDocCache } from '../server/lib/yjsDocCache.js';

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

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 1500): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

async function joinCollaboration(
  socket: Socket,
  blipId: string,
  yjsGeneration = 0,
): Promise<{ ack: any; sync: any }> {
  const syncPromise = waitForEvent<any>(socket, `blip:sync:${blipId}`);
  const ackPromise = new Promise<any>((resolve) => {
    socket.emit('blip:join', { blipId, yjsGeneration }, resolve);
  });
  const [ack, sync] = await Promise.all([
    withTimeout(ackPromise, `join acknowledgement for ${blipId}`),
    syncPromise,
  ]);
  return { ack, sync };
}

describe('Socket.IO session-backed authorization', () => {
  let server: HttpServer;
  let origin = '';
  const clients: Socket[] = [];
  const sessionIds = new Map<string, string[]>();
  let sessionStore: session.MemoryStore;

  beforeAll(async () => {
    for (const userId of ['owner', 'viewer', 'editor', 'outsider']) {
      state.docs.set(userId, {
        _id: userId,
        type: 'user',
        email: `${userId}@example.test`,
        authVersion: 0,
      });
    }
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
    state.docs.set('blip-blb-shape', {
      _id: 'blip-blb-shape',
      type: 'blip',
      waveId: 'topic-private',
      content: '<ul><li><p>Durable bullet</p></li></ul>',
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
      req.session.authVersion = Number(state.docs.get(userId)?.['authVersion'] || 0);
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

  it('disconnects an established socket when password reset advances its credential generation', async () => {
    const editor = await connectAs('editor');
    const ended = waitForEvent<any>(editor, 'session:ended');
    state.docs.set('editor', { ...state.docs.get('editor')!, authVersion: 1 });
    await expect(ended).resolves.toMatchObject({ reason: 'invalidated' });
    await vi.waitFor(() => expect(editor.connected).toBe(false));
    state.docs.set('editor', { ...state.docs.get('editor')!, authVersion: 0 });
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
      seedContent: '<p>Secret</p>',
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

  it('deduplicates concurrent joins without dropping either acknowledgement or leaking a ref', async () => {
    const blipId = 'blip-duplicate-join';
    state.docs.set(blipId, {
      _id: blipId,
      type: 'blip',
      waveId: 'topic-private',
      content: '<p>Duplicate join</p>',
      updatedAt: 10,
    });
    const editor = await connectAs('editor');
    try {
      const ack = () => new Promise<any>((resolve) => editor.emit('blip:join', { blipId }, resolve));
      const [first, second] = await withTimeout(
        Promise.all([ack(), ack()]),
        'both duplicate join acknowledgements',
      );
      expect(first).toMatchObject({ ok: true, waveId: 'topic-private' });
      expect(second).toMatchObject({ ok: true, waveId: 'topic-private' });
      expect(yjsDocCache.hasActiveRefs(blipId)).toBe(true);

      editor.emit('blip:leave', { blipId });
      await vi.waitFor(() => expect(yjsDocCache.hasActiveRefs(blipId)).toBe(false));
    } finally {
      editor.disconnect();
    }
  });

  it('cancels a delayed join when leave wins before Couch resolution', async () => {
    const blipId = 'blip-delayed-leave';
    state.docs.set(blipId, {
      _id: blipId,
      type: 'blip',
      waveId: 'topic-private',
      content: '<p>Delayed join</p>',
      updatedAt: 10,
    });
    const originalGetDoc = vi.mocked(getDoc).getMockImplementation();
    if (!originalGetDoc) throw new Error('Missing getDoc mock implementation');
    let releaseLookup!: () => void;
    let markLookupStarted!: () => void;
    const lookupStarted = new Promise<void>((resolve) => { markLookupStarted = resolve; });
    const lookupGate = new Promise<void>((resolve) => { releaseLookup = resolve; });
    let delayed = true;
    vi.mocked(getDoc).mockImplementation(async (id: string) => {
      if (id === blipId && delayed) {
        markLookupStarted();
        await lookupGate;
      }
      return originalGetDoc(id);
    });

    const editor = await connectAs('editor');
    try {
      editor.emit('blip:join', { blipId }, () => undefined);
      await withTimeout(lookupStarted, 'delayed blip lookup');
      editor.emit('blip:leave', { blipId });
      delayed = false;
      releaseLookup();
      await new Promise((resolve) => setTimeout(resolve, 75));
      expect(yjsDocCache.hasActiveRefs(blipId)).toBe(false);
    } finally {
      vi.mocked(getDoc).mockImplementation(originalGetDoc);
      editor.disconnect();
    }
  });

  it('fails a join closed on snapshot lookup error and seeds only after a successful empty retry', async () => {
    const blipId = 'blip-snapshot-load-outage';
    state.docs.set(blipId, {
      _id: blipId,
      type: 'blip',
      waveId: 'topic-private',
      content: '<p>Durable HTML may be stale</p>',
      updatedAt: 10,
    });
    vi.mocked(findOne).mockRejectedValueOnce(new Error('snapshot storage unavailable'));

    const editor = await connectAs('editor');
    let syncPublished = false;
    editor.on(`blip:sync:${blipId}`, () => { syncPublished = true; });
    try {
      const acknowledgement = await withTimeout(new Promise<any>((resolve) => editor.emit('blip:join', {
        blipId,
        yjsGeneration: 0,
      }, resolve)), 'snapshot lookup failure acknowledgement');

      expect(acknowledgement).toMatchObject({
        ok: false,
        error: 'collaboration_storage_unavailable',
        retryable: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(syncPublished).toBe(false);
      expect(yjsDocCache.getState(blipId)).toBeNull();
      expect(yjsDocCache.hasActiveRefs(blipId)).toBe(false);
      expect(yjsDocCache.isDirty(blipId)).toBe(false);

      const retry = await joinCollaboration(editor, blipId);
      expect(retry.ack).toMatchObject({ ok: true, canEdit: true, waveId: 'topic-private' });
      expect(retry.sync).toMatchObject({
        ok: true,
        shouldSeed: true,
        seedContent: '<p>Durable HTML may be stale</p>',
      });
    } finally {
      editor.emit('blip:leave', { blipId });
      editor.disconnect();
    }
  });

  it('rejects a partially decodable snapshot and joins only after a valid snapshot retry', async () => {
    const blipId = 'blip-truncated-snapshot';
    state.docs.set(blipId, {
      _id: blipId,
      type: 'blip',
      waveId: 'topic-private',
      content: '<p>Older durable HTML</p>',
      updatedAt: 10,
      yjsGeneration: 2,
    });
    const sourceDoc = new Y.Doc();
    const expected = Array.from({ length: 256 }, (_, index) => `newer-${index}`).join('|');
    sourceDoc.getText('default').insert(0, expected);
    const validUpdate = Y.encodeStateAsUpdate(sourceDoc);
    const truncatedUpdate = validUpdate.slice(0, -1);
    const partiallyApplied = new Y.Doc();
    expect(() => Y.applyUpdate(partiallyApplied, truncatedUpdate)).toThrow();
    expect(partiallyApplied.store.clients.size).toBeGreaterThan(0);
    partiallyApplied.destroy();
    state.docs.set('snapshot-truncated', {
      _id: 'snapshot-truncated',
      type: 'yjs_snapshot',
      blipId,
      waveId: 'topic-private',
      yjsGeneration: 2,
      snapshotB64: Buffer.from(truncatedUpdate).toString('base64'),
    });

    const editor = await connectAs('editor');
    let syncPublished = false;
    editor.on(`blip:sync:${blipId}`, () => { syncPublished = true; });
    try {
      const failed = await withTimeout(new Promise<any>((resolve) => editor.emit('blip:join', {
        blipId,
        yjsGeneration: 2,
      }, resolve)), 'truncated snapshot acknowledgement');
      expect(failed).toMatchObject({
        ok: false,
        error: 'collaboration_storage_unavailable',
        retryable: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(syncPublished).toBe(false);
      expect(yjsDocCache.getState(blipId)).toBeNull();
      expect(yjsDocCache.hasActiveRefs(blipId)).toBe(false);

      state.docs.set('snapshot-truncated', {
        ...state.docs.get('snapshot-truncated')!,
        snapshotB64: Buffer.from(validUpdate).toString('base64'),
      });
      const retry = await joinCollaboration(editor, blipId, 2);
      expect(retry.ack).toMatchObject({ ok: true, yjsGeneration: 2 });
      expect(retry.sync).toMatchObject({ ok: true, shouldSeed: false, yjsGeneration: 2 });
      const joinedDoc = new Y.Doc();
      Y.applyUpdate(joinedDoc, new Uint8Array(retry.sync.state));
      expect(joinedDoc.getText('default').toString()).toBe(expected);
      joinedDoc.destroy();
    } finally {
      editor.emit('blip:leave', { blipId });
      editor.disconnect();
      sourceDoc.destroy();
      state.docs.delete('snapshot-truncated');
    }
  });

  it('re-resolves a delayed join after snapshot load before granting write authority', async () => {
    const blipId = 'blip-delayed-join-demotion';
    state.docs.set(blipId, {
      _id: blipId,
      type: 'blip',
      waveId: 'topic-private',
      content: '<p>Demote while snapshot loads</p>',
      updatedAt: 10,
    });
    state.docs.set('participant-editor', { ...state.docs.get('participant-editor')!, role: 'editor' });
    const originalLoadFromDb = yjsDocCache.loadFromDb.bind(yjsDocCache);
    let releaseLoad!: () => void;
    let markLoadStarted!: () => void;
    const loadStarted = new Promise<void>((resolve) => { markLoadStarted = resolve; });
    const loadGate = new Promise<void>((resolve) => { releaseLoad = resolve; });
    const loadSpy = vi.spyOn(yjsDocCache, 'loadFromDb').mockImplementation(async (id, generation) => {
      if (id === blipId) {
        markLoadStarted();
        await loadGate;
      }
      await originalLoadFromDb(id, generation);
    });
    const editor = await connectAs('editor');
    try {
      const sync = waitForEvent<any>(editor, `blip:sync:${blipId}`);
      const acknowledgement = new Promise<any>((resolve) => editor.emit('blip:join', {
        blipId,
        yjsGeneration: 0,
      }, resolve));
      await withTimeout(loadStarted, 'delayed snapshot load');

      state.docs.set('participant-editor', { ...state.docs.get('participant-editor')!, role: 'viewer' });
      releaseLoad();
      const [ack, payload] = await Promise.all([
        withTimeout(acknowledgement, 'post-demotion join acknowledgement'),
        sync,
      ]);
      expect(ack).toMatchObject({ ok: true, canEdit: false, waveId: 'topic-private' });
      expect(payload).toMatchObject({
        ok: true,
        canEdit: false,
        shouldSeed: false,
        waveId: 'topic-private',
      });

      const denied = waitForEvent<any>(editor, 'access:error');
      const updateResult = await new Promise<any>((resolve) => editor.emit('blip:update', {
        blipId,
        yjsGeneration: 0,
        update: [0, 0],
      }, resolve));
      expect(updateResult).toMatchObject({ ok: false, error: 'forbidden', blipId });
      await expect(denied).resolves.toMatchObject({ event: 'blip:update', permission: 'edit' });
    } finally {
      releaseLoad?.();
      loadSpy.mockRestore();
      state.docs.set('participant-editor', { ...state.docs.get('participant-editor')!, role: 'editor' });
      editor.emit('blip:leave', { blipId });
      editor.disconnect();
    }
  });

  it('invalidates a pending join when policy refresh races its stale final participant lookup', async () => {
    const blipId = 'blip-second-lookup-demotion';
    state.docs.set(blipId, {
      _id: blipId,
      type: 'blip',
      waveId: 'topic-private',
      content: '<p>Second lookup demotion</p>',
      updatedAt: 10,
    });
    state.docs.set('participant-editor', { ...state.docs.get('participant-editor')!, role: 'editor' });
    const originalFind = vi.mocked(find).getMockImplementation();
    if (!originalFind) throw new Error('Missing find mock implementation');
    let participantLookupCount = 0;
    let releaseSecondLookup!: () => void;
    let markSecondLookupCaptured!: () => void;
    const secondLookupCaptured = new Promise<void>((resolve) => { markSecondLookupCaptured = resolve; });
    const secondLookupGate = new Promise<void>((resolve) => { releaseSecondLookup = resolve; });
    vi.mocked(find).mockImplementation(async (selector: Record<string, any>, options?: any) => {
      if (
        selector['type'] === 'participant'
        && selector['waveId'] === 'topic-private'
        && selector['userId'] === 'editor'
      ) {
        participantLookupCount += 1;
        if (participantLookupCount === 2) {
          // Capture the stale editor result before the durable demotion, then
          // hold it until refreshWaveSocketAccess has advanced the wave epoch.
          const captured = await originalFind(selector, options);
          markSecondLookupCaptured();
          await secondLookupGate;
          return captured;
        }
      }
      return originalFind(selector, options);
    });

    const editor = await connectAs('editor');
    let staleSyncPublished = false;
    editor.on(`blip:sync:${blipId}`, () => { staleSyncPublished = true; });
    try {
      const acknowledgement = new Promise<any>((resolve) => editor.emit('blip:join', {
        blipId,
        yjsGeneration: 0,
      }, resolve));
      await withTimeout(secondLookupCaptured, 'captured stale second participant lookup');

      state.docs.set('participant-editor', { ...state.docs.get('participant-editor')!, role: 'viewer' });
      await refreshWaveSocketAccess('topic-private');
      releaseSecondLookup();

      await expect(withTimeout(acknowledgement, 'policy-invalidated join acknowledgement')).resolves.toMatchObject({
        ok: false,
        error: 'access_changed',
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(staleSyncPublished).toBe(false);
      expect(yjsDocCache.hasActiveRefs(blipId)).toBe(false);

      const retry = await joinCollaboration(editor, blipId);
      expect(retry.ack).toMatchObject({ ok: true, canEdit: false, waveId: 'topic-private' });
      expect(retry.sync).toMatchObject({ ok: true, canEdit: false, shouldSeed: false });
    } finally {
      releaseSecondLookup?.();
      vi.mocked(find).mockImplementation(originalFind);
      state.docs.set('participant-editor', { ...state.docs.get('participant-editor')!, role: 'editor' });
      editor.emit('blip:leave', { blipId });
      editor.disconnect();
    }
  });

  it('invalidates a pending join when topic deletion races its stale final participant lookup', async () => {
    const blipId = 'blip-second-lookup-deletion';
    const originalTopic = { ...state.docs.get('topic-private')! };
    state.docs.set(blipId, {
      _id: blipId,
      type: 'blip',
      waveId: 'topic-private',
      content: '<p>Second lookup deletion</p>',
      updatedAt: 10,
    });
    state.docs.set('participant-editor', { ...state.docs.get('participant-editor')!, role: 'editor' });
    const originalFind = vi.mocked(find).getMockImplementation();
    if (!originalFind) throw new Error('Missing find mock implementation');
    let participantLookupCount = 0;
    let releaseSecondLookup!: () => void;
    let markSecondLookupCaptured!: () => void;
    const secondLookupCaptured = new Promise<void>((resolve) => { markSecondLookupCaptured = resolve; });
    const secondLookupGate = new Promise<void>((resolve) => { releaseSecondLookup = resolve; });
    vi.mocked(find).mockImplementation(async (selector: Record<string, any>, options?: any) => {
      if (
        selector['type'] === 'participant'
        && selector['waveId'] === 'topic-private'
        && selector['userId'] === 'editor'
      ) {
        participantLookupCount += 1;
        if (participantLookupCount === 2) {
          const captured = await originalFind(selector, options);
          markSecondLookupCaptured();
          await secondLookupGate;
          return captured;
        }
      }
      return originalFind(selector, options);
    });

    const editor = await connectAs('editor');
    let staleSyncPublished = false;
    editor.on(`blip:sync:${blipId}`, () => { staleSyncPublished = true; });
    try {
      const acknowledgement = new Promise<any>((resolve) => editor.emit('blip:join', {
        blipId,
        yjsGeneration: 0,
      }, resolve));
      await withTimeout(secondLookupCaptured, 'captured stale deletion lookup');

      state.docs.set('topic-private', {
        ...originalTopic,
        type: 'topic_tombstone',
        deleted: true,
      });
      disconnectWaveSockets('topic-private');
      releaseSecondLookup();

      await expect(withTimeout(acknowledgement, 'deletion-invalidated join acknowledgement')).resolves.toMatchObject({
        ok: false,
        error: 'access_changed',
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(staleSyncPublished).toBe(false);
      expect(yjsDocCache.hasActiveRefs(blipId)).toBe(false);
    } finally {
      releaseSecondLookup?.();
      vi.mocked(find).mockImplementation(originalFind);
      state.docs.set('topic-private', originalTopic);
      state.docs.set('participant-editor', { ...state.docs.get('participant-editor')!, role: 'editor' });
      editor.disconnect();
    }
  });

  it('does not publish a delayed join after tombstone revocation claims the blip', async () => {
    const blipId = 'blip-delayed-join-revocation';
    state.docs.set(blipId, {
      _id: blipId,
      type: 'blip',
      waveId: 'topic-private',
      content: '<p>Revoke while snapshot loads</p>',
      updatedAt: 10,
    });
    const originalLoadFromDb = yjsDocCache.loadFromDb.bind(yjsDocCache);
    let releaseLoad!: () => void;
    let markLoadStarted!: () => void;
    const loadStarted = new Promise<void>((resolve) => { markLoadStarted = resolve; });
    const loadGate = new Promise<void>((resolve) => { releaseLoad = resolve; });
    const loadSpy = vi.spyOn(yjsDocCache, 'loadFromDb').mockImplementation(async (id, generation) => {
      if (id === blipId) {
        markLoadStarted();
        await loadGate;
      }
      await originalLoadFromDb(id, generation);
    });
    const editor = await connectAs('editor');
    let syncPublished = false;
    editor.on(`blip:sync:${blipId}`, () => { syncPublished = true; });
    try {
      const acknowledgement = new Promise<any>((resolve) => editor.emit('blip:join', {
        blipId,
        yjsGeneration: 0,
      }, resolve));
      await withTimeout(loadStarted, 'revoked delayed snapshot load');

      const revocation = revokeBlipSockets([blipId]);
      releaseLoad();
      const [ack, revoked] = await Promise.all([
        withTimeout(acknowledgement, 'post-revocation join acknowledgement'),
        revocation,
      ]);
      expect(ack).toMatchObject({ ok: false, error: 'not_found' });
      expect(revoked).toBe(0);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(syncPublished).toBe(false);
      expect(yjsDocCache.hasActiveRefs(blipId)).toBe(false);
      expect(yjsDocCache.getState(blipId)).toBeNull();
    } finally {
      releaseLoad?.();
      loadSpy.mockRestore();
      editor.disconnect();
    }
  });

  it('re-elects an already joined writable peer when the empty seeder leaves', async () => {
    const blipId = 'blip-seed-reelection';
    state.docs.set(blipId, {
      _id: blipId,
      type: 'blip',
      waveId: 'topic-private',
      content: '<p>Authoritative re-election seed</p>',
      updatedAt: 10,
    });
    clearBlipSeedAuthority(blipId);
    const first = await connectAs('editor');
    const second = await connectAs('owner');
    try {
      const firstJoin = await joinCollaboration(first, blipId);
      expect(firstJoin.sync).toMatchObject({ shouldSeed: true });
      const secondJoin = await joinCollaboration(second, blipId);
      expect(secondJoin.sync).toMatchObject({ shouldSeed: false });

      const retryRequested = waitForEvent<any>(second, `blip:seed:retry:${blipId}`, 1200);
      first.emit('blip:leave', { blipId });
      await expect(retryRequested).resolves.toMatchObject({ yjsGeneration: 0 });
      const reelected = await joinCollaboration(second, blipId);
      expect(reelected.sync).toMatchObject({
        shouldSeed: true,
        seedContent: '<p>Authoritative re-election seed</p>',
        canEdit: true,
      });
    } finally {
      first.disconnect();
      second.disconnect();
    }
  });

  it('does not release an empty seed lease when a non-seeding peer leaves', async () => {
    const blipId = 'blip-seed-non-owner-leave';
    state.docs.set(blipId, {
      _id: blipId,
      type: 'blip',
      waveId: 'topic-private',
      content: '<p>Only the elected socket may release this seed</p>',
      updatedAt: 10,
    });
    clearBlipSeedAuthority(blipId);
    const seeder = await connectAs('editor');
    const nonSeeder = await connectAs('owner');
    const laterPeer = await connectAs('editor');
    let retryEvents = 0;
    seeder.on(`blip:seed:retry:${blipId}`, () => { retryEvents += 1; });
    try {
      expect((await joinCollaboration(seeder, blipId)).sync).toMatchObject({ shouldSeed: true });
      expect((await joinCollaboration(nonSeeder, blipId)).sync).toMatchObject({ shouldSeed: false });

      nonSeeder.emit('blip:leave', { blipId });
      await new Promise((resolve) => setTimeout(resolve, 75));
      expect(retryEvents).toBe(0);
      expect((await joinCollaboration(laterPeer, blipId)).sync).toMatchObject({ shouldSeed: false });
    } finally {
      seeder.disconnect();
      nonSeeder.disconnect();
      laterPeer.disconnect();
    }
  });

  it('seeds a topic root from durable HTML instead of a crash-stale snapshot', async () => {
    const topicId = 'topic-root-stale-snapshot';
    const staleDoc = new Y.Doc();
    staleDoc.getText('default').insert(0, 'stale root');
    state.docs.set(topicId, {
      _id: topicId,
      type: 'topic',
      authorId: 'owner',
      shareLevel: 'private',
      content: '<h1>Current root</h1><p>Task-bearing durable content</p>',
      updatedAt: 200,
    });
    state.docs.set(`snapshot-${topicId}`, {
      _id: `snapshot-${topicId}`,
      type: 'yjs_snapshot',
      waveId: topicId,
      blipId: topicId,
      snapshotB64: Buffer.from(Y.encodeStateAsUpdate(staleDoc)).toString('base64'),
      updatedAt: 100,
    });
    clearBlipSeedAuthority(topicId);
    const owner = await connectAs('owner');
    try {
      const { sync } = await joinCollaboration(owner, topicId);
      expect(sync).toMatchObject({
        waveId: topicId,
        state: [],
        shouldSeed: true,
        seedContent: '<h1>Current root</h1><p>Task-bearing durable content</p>',
        canEdit: true,
      });
    } finally {
      owner.disconnect();
      staleDoc.destroy();
    }
  });

  it('rejects a CRDT update from a superseded document generation', async () => {
    const blipId = 'blip-generation-isolation';
    state.docs.set(blipId, {
      _id: blipId,
      type: 'blip',
      waveId: 'topic-private',
      content: '<p>Generation two</p>',
      updatedAt: 20,
      yjsGeneration: 2,
    });
    clearBlipSeedAuthority(blipId);
    const editor = await connectAs('editor');
    const oldDoc = new Y.Doc();
    oldDoc.getText('default').insert(0, 'generation one must stay quarantined');
    try {
      const { sync } = await joinCollaboration(editor, blipId, 2);
      const result = await new Promise<any>((resolve) => editor.emit('blip:update', {
        blipId,
        yjsGeneration: 1,
        update: Array.from(Y.encodeStateAsUpdate(oldDoc)),
      }, resolve));

      expect.soft(sync).toMatchObject({ yjsGeneration: 2 });
      expect.soft(result).toMatchObject({
        ok: false,
        error: 'generation_mismatch',
        blipId,
      });
      expect(yjsDocCache.isEmpty(blipId)).toBe(true);
    } finally {
      editor.disconnect();
      oldDoc.destroy();
    }
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

  it('rejects an update already queued on the blip lock when the editor is demoted', async () => {
    const blipId = 'blip-queued-demotion';
    state.docs.set(blipId, {
      _id: blipId,
      type: 'blip',
      waveId: 'topic-private',
      content: '<p>Queued demotion</p>',
      updatedAt: 10,
    });
    state.docs.set('participant-editor', { ...state.docs.get('participant-editor')!, role: 'editor' });
    const editor = await connectAs('editor');
    const source = new Y.Doc();
    source.getMap('content').set('text', 'must be rejected after demotion');
    let releaseLock!: () => void;
    let markLocked!: () => void;
    const lockStarted = new Promise<void>((resolve) => { markLocked = resolve; });
    const lockGate = new Promise<void>((resolve) => { releaseLock = resolve; });
    let blocker: Promise<void> | null = null;
    let runExclusiveCallCount = () => 0;
    let restoreRunExclusive = () => undefined;
    try {
      await joinCollaboration(editor, blipId);
      blocker = yjsDocCache.runExclusive(blipId, async () => {
        markLocked();
        await lockGate;
      });
      await lockStarted;
      const runExclusiveSpy = vi.spyOn(yjsDocCache, 'runExclusive');
      runExclusiveCallCount = () => runExclusiveSpy.mock.calls.length;
      restoreRunExclusive = () => { runExclusiveSpy.mockRestore(); };
      let acknowledgementSettled = false;
      const acknowledgement = new Promise<any>((resolve) => editor.emit('blip:update', {
        blipId,
        yjsGeneration: 0,
        update: Array.from(Y.encodeStateAsUpdate(source)),
      }, resolve)).finally(() => { acknowledgementSettled = true; });
      await vi.waitFor(() => expect(runExclusiveCallCount()).toBeGreaterThanOrEqual(1));
      expect(acknowledgementSettled).toBe(false);

      state.docs.set('participant-editor', { ...state.docs.get('participant-editor')!, role: 'viewer' });
      await refreshWaveSocketAccess('topic-private');
      releaseLock();
      const result = await acknowledgement;
      expect(result).toMatchObject({ ok: false, error: 'forbidden', blipId });
      expect(yjsDocCache.isEmpty(blipId)).toBe(true);
      expect(yjsDocCache.isDirty(blipId)).toBe(false);
    } finally {
      releaseLock?.();
      await blocker?.catch(() => undefined);
      restoreRunExclusive();
      state.docs.set('participant-editor', { ...state.docs.get('participant-editor')!, role: 'editor' });
      editor.disconnect();
      source.destroy();
    }
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
    expect(await revokeBlipSockets(['blip-revoked'])).toBeGreaterThanOrEqual(2);
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

  it('rejects a queued update and discards only after tombstone revocation owns the lock', async () => {
    const blipId = 'blip-queued-delete';
    state.docs.set(blipId, {
      _id: blipId,
      type: 'blip',
      waveId: 'topic-private',
      content: '<p>Queued delete</p>',
      updatedAt: 10,
    });
    state.docs.set('participant-editor', { ...state.docs.get('participant-editor')!, role: 'editor' });
    const editor = await connectAs('editor');
    const source = new Y.Doc();
    source.getMap('content').set('text', 'must not recreate the tombstoned cache');
    let releaseLock!: () => void;
    let markLocked!: () => void;
    const lockStarted = new Promise<void>((resolve) => { markLocked = resolve; });
    const lockGate = new Promise<void>((resolve) => { releaseLock = resolve; });
    let blocker: Promise<void> | null = null;
    let runExclusiveCallCount = () => 0;
    let restoreRunExclusive = () => undefined;
    try {
      await joinCollaboration(editor, blipId);
      blocker = yjsDocCache.runExclusive(blipId, async () => {
        markLocked();
        await lockGate;
      });
      await lockStarted;
      const runExclusiveSpy = vi.spyOn(yjsDocCache, 'runExclusive');
      runExclusiveCallCount = () => runExclusiveSpy.mock.calls.length;
      restoreRunExclusive = () => { runExclusiveSpy.mockRestore(); };
      let acknowledgementSettled = false;
      const acknowledgement = new Promise<any>((resolve) => editor.emit('blip:update', {
        blipId,
        yjsGeneration: 0,
        update: Array.from(Y.encodeStateAsUpdate(source)),
      }, resolve)).finally(() => { acknowledgementSettled = true; });
      await vi.waitFor(() => expect(runExclusiveCallCount()).toBeGreaterThanOrEqual(1));
      expect(acknowledgementSettled).toBe(false);

      const revocation = revokeBlipSockets([blipId]);
      releaseLock();
      const [result, revoked] = await Promise.all([acknowledgement, revocation]);
      expect(revoked).toBeGreaterThanOrEqual(1);
      expect(result).toMatchObject({ ok: false, error: 'forbidden', blipId });
      expect(yjsDocCache.getState(blipId)).toBeNull();
      expect(yjsDocCache.isDirty(blipId)).toBe(false);
    } finally {
      releaseLock?.();
      await blocker?.catch(() => undefined);
      restoreRunExclusive();
      editor.disconnect();
      source.destroy();
    }
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

  it('rejects a collaboration transaction that flattens the BLB top level', async () => {
    const editor = await connectAs('editor');
    const owner = await connectAs('owner');
    await Promise.all([
      joinCollaboration(editor, 'blip-blb-shape'),
      joinCollaboration(owner, 'blip-blb-shape'),
    ]);

    const schema = new Schema({
      nodes: {
        doc: { content: 'block+' },
        paragraph: { content: 'inline*', group: 'block' },
        bulletList: { content: 'listItem+', group: 'block' },
        listItem: { content: 'paragraph block*' },
        text: { group: 'inline' },
      },
    });
    const flat = prosemirrorJSONToYDoc(schema, {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Flat escape' }] }],
    }, 'default');
    let relayed = false;
    owner.once('blip:update:blip-blb-shape', () => { relayed = true; });
    const rejected = await new Promise<any>((resolve) => {
      editor.emit('blip:update', {
        blipId: 'blip-blb-shape',
        update: Array.from(Y.encodeStateAsUpdate(flat)),
      }, resolve);
    });
    expect(rejected).toMatchObject({
      ok: false,
      error: 'invalid_blb_structure',
      blipId: 'blip-blb-shape',
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(relayed).toBe(false);
    expect(yjsDocCache.isEmpty('blip-blb-shape')).toBe(true);
    flat.destroy();
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
