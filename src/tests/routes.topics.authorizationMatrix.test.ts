import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Router } from 'express';

type StoredDoc = Record<string, any> & { _id: string };

const state = vi.hoisted(() => ({
  docs: new Map<string, StoredDoc>(),
  sequence: 0,
}));

function matches(doc: StoredDoc, selector: Record<string, any>): boolean {
  return Object.entries(selector).every(([key, expected]) => {
    const actual = doc[key];
    if (expected && typeof expected === 'object' && '$in' in expected) return expected.$in.includes(actual);
    return actual === expected;
  });
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
  insertDoc: vi.fn(async (doc: StoredDoc) => {
    const id = doc._id || `created-${++state.sequence}`;
    state.docs.set(id, { ...doc, _id: id, _rev: '1-test' });
    return { ok: true, id, rev: '1-test' };
  }),
  updateDoc: vi.fn(async (doc: StoredDoc) => {
    const id = doc._id;
    if (!id) throw new Error('missing_id');
    state.docs.set(id, { ...doc, _rev: '2-test' });
    return { ok: true, id, rev: '2-test' };
  }),
  deleteDoc: vi.fn(async (id: string) => {
    state.docs.delete(id);
    return { ok: true, id, rev: '3-test' };
  }),
  view: vi.fn(async () => ({ rows: [] })),
}));

vi.mock('../server/lib/socket.js', () => ({
  emitEvent: vi.fn(),
  disconnectWaveSockets: vi.fn(() => 0),
  refreshWaveSocketAccess: vi.fn(async () => 0),
}));

vi.mock('../server/services/email.js', () => ({
  sendInviteEmail: vi.fn(async () => ({ success: true })),
}));

import topicsRouter from '../server/routes/topics.js';
import wavesRouter from '../server/routes/waves.js';
import blipsRouter from '../server/routes/blips.js';
import commentsRouter from '../server/routes/comments.js';
import notificationsRouter from '../server/routes/notifications.js';

type IdentityName = 'anonymous' | 'outsider' | 'viewer' | 'commenter' | 'editor' | 'owner';

const identities: Record<IdentityName, { userId?: string; userEmail?: string }> = {
  anonymous: {},
  outsider: { userId: 'outsider', userEmail: 'outsider@example.test' },
  viewer: { userId: 'viewer', userEmail: 'viewer@example.test' },
  commenter: { userId: 'commenter', userEmail: 'commenter@example.test' },
  editor: { userId: 'editor', userEmail: 'editor@example.test' },
  owner: { userId: 'owner', userEmail: 'owner@example.test' },
};

function seed(): void {
  state.docs.clear();
  state.sequence = 0;
  state.docs.set('topic-private', {
    _id: 'topic-private',
    _rev: '1-topic',
    type: 'topic',
    title: 'Private topic',
    content: '<p>Private</p>',
    authorId: 'owner',
    shareLevel: 'private',
    allowComments: false,
    allowEdits: false,
    createdAt: 1,
    updatedAt: 1,
  });
  state.docs.set('blip-private', {
    _id: 'blip-private',
    _rev: '1-blip',
    type: 'blip',
    waveId: 'topic-private',
    parentId: null,
    content: '<p>Private blip</p>',
    authorId: 'owner',
    createdAt: 1,
    updatedAt: 1,
  });
  for (const role of ['viewer', 'commenter', 'editor'] as const) {
    state.docs.set(`participant-${role}`, {
      _id: `participant-${role}`,
      type: 'participant',
      waveId: 'topic-private',
      userId: role,
      email: `${role}@example.test`,
      role,
      status: 'accepted',
    });
  }
}

type InvokeOptions = {
  params?: Record<string, string>;
  body?: any;
  identity: IdentityName;
};

async function invokeRoute(router: Router, method: string, path: string, options: InvokeOptions) {
  const layer = (router as any).stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method.toLowerCase()],
  );
  if (!layer) throw new Error(`Route ${method} ${path} not found`);

  const session = { ...identities[options.identity], csrfToken: 'csrf-test' };
  const req: any = {
    method: method.toUpperCase(),
    path,
    params: options.params || {},
    body: options.body || {},
    query: {},
    session,
    headers: { 'x-csrf-token': 'csrf-test', host: 'rizzoma.example.test' },
    protocol: 'https',
    get(name: string) {
      return this.headers[name.toLowerCase()];
    },
  };
  const res: any = {
    statusCode: 200,
    body: undefined,
    headers: {},
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
    set(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
  };

  for (const entry of layer.route.stack) {
    let nextCalled = false;
    await entry.handle(req, res, () => {
      nextCalled = true;
    });
    if (!nextCalled) break;
  }
  return res;
}

describe('authorization route matrix', () => {
  beforeEach(() => {
    seed();
    vi.clearAllMocks();
  });

  it.each([
    ['anonymous', 401],
    ['outsider', 403],
    ['viewer', 200],
    ['commenter', 200],
    ['editor', 200],
    ['owner', 200],
  ] as const)('GET topic: %s receives %i', async (identity, expectedStatus) => {
    const response = await invokeRoute(topicsRouter, 'get', '/:id', {
      identity,
      params: { id: 'topic-private' },
    });
    expect(response.statusCode).toBe(expectedStatus);
  });

  it.each([
    ['anonymous', 401],
    ['outsider', 403],
    ['viewer', 403],
    ['commenter', 403],
    ['editor', 200],
    ['owner', 200],
  ] as const)('PATCH topic: %s receives %i', async (identity, expectedStatus) => {
    const response = await invokeRoute(topicsRouter, 'patch', '/:id', {
      identity,
      params: { id: 'topic-private' },
      body: { title: `Edited by ${identity}` },
    });
    expect(response.statusCode).toBe(expectedStatus);
  });

  it.each([
    ['anonymous', 401],
    ['outsider', 403],
    ['viewer', 403],
    ['commenter', 201],
    ['editor', 201],
    ['owner', 201],
  ] as const)('POST topic comment: %s receives %i', async (identity, expectedStatus) => {
    const response = await invokeRoute(commentsRouter, 'post', '/topics/:id/comments', {
      identity,
      params: { id: 'topic-private' },
      body: { content: `Comment by ${identity}` },
    });
    expect(response.statusCode).toBe(expectedStatus);
  });

  it.each([
    ['anonymous', 401],
    ['outsider', 403],
    ['viewer', 403],
    ['commenter', 403],
    ['editor', 200],
    ['owner', 200],
  ] as const)('PUT blip: %s receives %i', async (identity, expectedStatus) => {
    const response = await invokeRoute(blipsRouter, 'put', '/:id', {
      identity,
      params: { id: 'blip-private' },
      body: { content: `<p>Edited by ${identity}</p>` },
    });
    expect(response.statusCode).toBe(expectedStatus);
  });

  it.each([
    ['anonymous', 401],
    ['outsider', 403],
    ['viewer', 403],
    ['commenter', 403],
    ['editor', 403],
    ['owner', 200],
  ] as const)('PATCH sharing policy: %s receives %i', async (identity, expectedStatus) => {
    const response = await invokeRoute(wavesRouter, 'patch', '/:id/sharing', {
      identity,
      params: { id: 'topic-private' },
      body: { shareLevel: 'public', allowComments: true, allowEdits: false },
    });
    expect(response.statusCode).toBe(expectedStatus);
    if (identity === 'owner') {
      expect(state.docs.get('topic-private')).toMatchObject({
        shareLevel: 'public',
        allowComments: true,
        allowEdits: false,
        sharingUpdatedBy: 'owner',
      });
    }
  });

  it.each([
    ['anonymous', 401],
    ['outsider', 403],
    ['viewer', 403],
    ['commenter', 403],
    ['editor', 403],
    ['owner', 200],
  ] as const)('POST alternate invite endpoint: %s receives %i', async (identity, expectedStatus) => {
    const response = await invokeRoute(notificationsRouter, 'post', '/invite', {
      identity,
      body: { topicId: 'topic-private', recipientEmail: 'invitee@example.test' },
    });
    expect(response.statusCode).toBe(expectedStatus);
  });

  it('canonicalizes public edit permission to include comments', async () => {
    const response = await invokeRoute(wavesRouter, 'patch', '/:id/sharing', {
      identity: 'owner',
      params: { id: 'topic-private' },
      body: { shareLevel: 'link', allowComments: false, allowEdits: true },
    });
    expect(response.statusCode).toBe(200);
    expect(state.docs.get('topic-private')).toMatchObject({ allowComments: true, allowEdits: true });
  });
});
