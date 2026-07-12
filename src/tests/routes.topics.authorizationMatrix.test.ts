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
    if (expected && typeof expected === 'object' && '$gt' in expected) return Number(actual) > Number(expected.$gt);
    return actual === expected;
  });
}

vi.mock('../server/lib/couch.js', () => ({
  getDoc: vi.fn(async (id: string) => {
    const doc = state.docs.get(id);
    if (!doc) throw new Error('404 not_found');
    return { ...doc };
  }),
  find: vi.fn(async (selector: Record<string, any>, options: { limit?: number; skip?: number } = {}) => ({
    docs: [...state.docs.values()]
      .filter((doc) => matches(doc, selector))
      .slice(options.skip || 0, (options.skip || 0) + (options.limit || Number.MAX_SAFE_INTEGER))
      .map((doc) => ({ ...doc })),
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
  getDocsById: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, state.docs.get(id)]))),
  view: vi.fn(async () => ({ rows: [] })),
}));

vi.mock('../server/lib/socket.js', () => ({
  emitEvent: vi.fn(),
  disconnectWaveSockets: vi.fn(() => 0),
  revokeBlipSockets: vi.fn(() => 0),
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
import linksRouter from '../server/routes/links.js';
import tasksRouter from '../server/routes/tasks.js';
import mentionsRouter from '../server/routes/mentions.js';
import { hashInviteToken } from '../server/lib/invitations.js';
import { sendInviteEmail } from '../server/services/email.js';
import { find, insertDoc, updateDoc } from '../server/lib/couch.js';
import { revokeBlipSockets } from '../server/lib/socket.js';

type IdentityName = 'anonymous' | 'outsider' | 'viewer' | 'commenter' | 'editor' | 'owner';

const identities: Record<IdentityName, { userId?: string; userEmail?: string }> = {
  anonymous: {},
  outsider: { userId: 'outsider', userEmail: 'outsider@example.test' },
  viewer: { userId: 'viewer', userEmail: 'viewer@example.test' },
  commenter: { userId: 'commenter', userEmail: 'commenter@example.test' },
  editor: { userId: 'editor', userEmail: 'editor@example.test' },
  owner: { userId: 'owner', userEmail: 'owner@example.test' },
};

function lastEmailedInviteToken(): string {
  const call = vi.mocked(sendInviteEmail).mock.calls.at(-1)?.[0];
  const hash = new URL(String(call?.topicUrl || '')).hash;
  const token = new URLSearchParams(hash.split('?')[1] || '').get('invite');
  if (!token) throw new Error('invite token not captured from email');
  return token;
}

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
  query?: Record<string, string>;
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
    query: options.query || {},
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
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    getHeader(name: string) {
      return this.headers[name.toLowerCase()];
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

  it('derives section attribution server-side and ignores forged owner provenance', async () => {
    state.docs.set('topic-private', {
      ...state.docs.get('topic-private')!,
      content: '<p>Original block</p>',
      sectionAttribution: { forged: { authorId: 'owner', updatedAt: 1 } },
    });
    const response = await invokeRoute(topicsRouter, 'patch', '/:id', {
      identity: 'editor',
      params: { id: 'topic-private' },
      body: {
        content: '<p>Changed by editor</p>',
        sectionAttribution: { attacker: { authorId: 'owner', updatedAt: 0 } },
      },
    });
    expect(response.statusCode).toBe(200);
    const saved = state.docs.get('topic-private')?.['sectionAttribution'] || {};
    expect(Object.keys(saved)).not.toContain('attacker');
    expect(Object.values(saved)).toHaveLength(1);
    expect(Object.values(saved)[0]).toMatchObject({ authorId: 'editor' });
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

  it('deletes through a durable private tombstone and cascades every surviving blip', async () => {
    state.docs.set('blip-private-child', {
      _id: 'blip-private-child',
      _rev: '1-child',
      type: 'blip',
      waveId: 'topic-private',
      parentId: 'blip-private',
      content: '<p>Child</p>',
      createdAt: 2,
      updatedAt: 2,
    });
    const deleted = await invokeRoute(topicsRouter, 'delete', '/:id', {
      identity: 'owner',
      params: { id: 'topic-private' },
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.body).toMatchObject({ deleted: true, deletedBlips: 2 });
    expect(state.docs.get('topic-private')).toMatchObject({
      type: 'topic_tombstone',
      deleted: true,
      shareLevel: 'private',
      allowComments: false,
      allowEdits: false,
    });
    expect(state.docs.get('blip-private')).toMatchObject({ deleted: true, deletedBy: 'owner' });
    expect(state.docs.get('blip-private-child')).toMatchObject({ deleted: true, deletedBy: 'owner' });

    const topicRead = await invokeRoute(topicsRouter, 'get', '/:id', {
      identity: 'owner',
      params: { id: 'topic-private' },
    });
    expect(topicRead.statusCode).toBe(410);
    const waveRead = await invokeRoute(wavesRouter, 'get', '/:id', {
      identity: 'anonymous',
      params: { id: 'topic-private' },
    });
    expect(waveRead.statusCode).toBe(410);
    const directBlip = await invokeRoute(blipsRouter, 'get', '/:id', {
      identity: 'anonymous',
      params: { id: 'blip-private' },
    });
    expect(directBlip.statusCode).toBe(410);
  });

  it('keeps pending invitations private and redeems a valid token exactly once', async () => {
    const token = 'invite-token-that-is-long-enough-for-testing-123456789';
    state.docs.set('pending-invite', {
      _id: 'pending-invite',
      _rev: '1-pending',
      type: 'participant',
      waveId: 'topic-private',
      userId: 'invite:outsider@example.test',
      email: 'outsider@example.test',
      role: 'viewer',
      status: 'pending',
      invitedAt: Date.now(),
      inviteTokenHash: hashInviteToken(token),
      inviteExpiresAt: Date.now() + 60_000,
    });

    const before = await invokeRoute(topicsRouter, 'get', '/:id', {
      identity: 'outsider',
      params: { id: 'topic-private' },
    });
    expect(before.statusCode).toBe(403);
    const wrong = await invokeRoute(wavesRouter, 'post', '/invitations/accept', {
      identity: 'outsider',
      body: { token: `${token}-wrong` },
    });
    expect(wrong.statusCode).toBe(404);

    const accepted = await invokeRoute(wavesRouter, 'post', '/invitations/accept', {
      identity: 'outsider',
      body: { token },
    });
    expect(accepted.statusCode).toBe(200);
    expect(state.docs.get('pending-invite')).toMatchObject({
      userId: 'outsider',
      status: 'accepted',
    });
    expect(state.docs.get('pending-invite')).not.toHaveProperty('inviteTokenHash');

    const after = await invokeRoute(topicsRouter, 'get', '/:id', {
      identity: 'outsider',
      params: { id: 'topic-private' },
    });
    expect(after.statusCode).toBe(200);
    const reused = await invokeRoute(wavesRouter, 'post', '/invitations/accept', {
      identity: 'outsider',
      body: { token },
    });
    expect(reused.statusCode).toBe(200);
    expect(reused.body).toMatchObject({ accepted: true, alreadyAccepted: true });
  });

  it('rejects expired invitation tokens without binding the participant', async () => {
    const token = 'expired-invite-token-that-is-long-enough-123456789';
    state.docs.set('expired-invite', {
      _id: 'expired-invite',
      _rev: '1-expired',
      type: 'participant',
      waveId: 'topic-private',
      userId: 'invite:outsider@example.test',
      email: 'outsider@example.test',
      role: 'viewer',
      status: 'pending',
      invitedAt: 1,
      inviteTokenHash: hashInviteToken(token),
      inviteExpiresAt: Date.now() - 1,
    });
    const response = await invokeRoute(wavesRouter, 'post', '/invitations/accept', {
      identity: 'outsider',
      body: { token },
    });
    expect(response.statusCode).toBe(410);
    expect(state.docs.get('expired-invite')).toMatchObject({ status: 'pending' });
  });

  it('persists revocation, reuses the participant on reinvite, and never removes the owner', async () => {
    state.docs.set('outsider', {
      _id: 'outsider',
      _rev: '1-user',
      type: 'user',
      email: 'outsider@example.test',
      passwordHash: 'credential',
    });
    const granted = await invokeRoute(wavesRouter, 'post', '/:id/participants', {
      identity: 'owner',
      params: { id: 'topic-private' },
      body: { emails: ['outsider@example.test'], role: 'viewer' },
    });
    expect(granted.statusCode).toBe(200);
    expect(JSON.stringify(granted.body)).not.toContain('invite=');
    const participantId = 'participant:wave:topic-private:user:outsider';
    expect(state.docs.get(participantId)).toMatchObject({ status: 'pending', role: 'viewer' });
    const firstAccepted = await invokeRoute(wavesRouter, 'post', '/invitations/accept', {
      identity: 'outsider',
      body: { token: lastEmailedInviteToken() },
    });
    expect(firstAccepted.statusCode).toBe(200);
    expect(state.docs.get(participantId)).toMatchObject({ status: 'accepted', role: 'viewer' });

    const revoked = await invokeRoute(wavesRouter, 'delete', '/:id/participants/:participantId', {
      identity: 'owner',
      params: { id: 'topic-private', participantId },
    });
    expect(revoked.statusCode).toBe(200);
    expect(state.docs.get(participantId)).toMatchObject({ status: 'declined', declinedBy: 'owner' });

    const regranted = await invokeRoute(wavesRouter, 'post', '/:id/participants', {
      identity: 'owner',
      params: { id: 'topic-private' },
      body: { emails: ['outsider@example.test'], role: 'editor' },
    });
    expect(regranted.statusCode).toBe(200);
    expect(state.docs.get(participantId)).toMatchObject({ status: 'pending', role: 'editor' });
    const secondAccepted = await invokeRoute(wavesRouter, 'post', '/invitations/accept', {
      identity: 'outsider',
      body: { token: lastEmailedInviteToken() },
    });
    expect(secondAccepted.statusCode).toBe(200);
    expect(state.docs.get(participantId)).toMatchObject({ status: 'accepted', role: 'editor' });
    const matching = [...state.docs.values()].filter((doc) => doc['type'] === 'participant' && doc['waveId'] === 'topic-private' && doc['email'] === 'outsider@example.test');
    expect(matching).toHaveLength(1);

    state.docs.set('participant-owner', {
      _id: 'participant-owner',
      _rev: '1-owner-participant',
      type: 'participant',
      waveId: 'topic-private',
      userId: 'owner',
      email: 'owner@example.test',
      role: 'owner',
      status: 'accepted',
      invitedAt: 1,
    });
    const ownerRemoval = await invokeRoute(wavesRouter, 'delete', '/:id/participants/:participantId', {
      identity: 'owner',
      params: { id: 'topic-private', participantId: 'participant-owner' },
    });
    expect(ownerRemoval.statusCode).toBe(400);
  });

  it('never exposes pending email invitations in a public participant roster', async () => {
    state.docs.set('topic-private', { ...state.docs.get('topic-private')!, shareLevel: 'public' });
    state.docs.set('viewer', {
      _id: 'viewer',
      type: 'user',
      email: 'viewer@example.test',
      name: 'Safe Viewer',
      avatar: '/viewer.png',
    });
    state.docs.set('pending-secret', {
      _id: 'pending-secret',
      type: 'participant',
      waveId: 'topic-private',
      userId: 'invite:secret-person@example.test',
      email: 'secret-person@example.test',
      role: 'viewer',
      status: 'pending',
    });

    const anonymous = await invokeRoute(wavesRouter, 'get', '/:id/participants', {
      identity: 'anonymous',
      params: { id: 'topic-private' },
    });
    expect(anonymous.statusCode).toBe(200);
    expect(JSON.stringify(anonymous.body)).not.toContain('secret-person@example.test');
    expect(anonymous.body.participants).toContainEqual(expect.objectContaining({
      userId: 'viewer',
      name: 'Safe Viewer',
      role: 'viewer',
    }));
    expect(anonymous.body.participants.every((participant: any) => !('email' in participant))).toBe(true);

    const owner = await invokeRoute(wavesRouter, 'get', '/:id/participants', {
      identity: 'owner',
      params: { id: 'topic-private' },
    });
    expect(owner.body.participants).toContainEqual(expect.objectContaining({
      userId: 'invite:secret-person@example.test',
      email: 'secret-person@example.test',
      status: 'pending',
    }));
  });

  it('fails closed when the participant roster cannot be loaded', async () => {
    vi.mocked(find).mockRejectedValueOnce(new Error('503 couch unavailable'));
    const response = await invokeRoute(wavesRouter, 'get', '/:id/participants', {
      identity: 'owner',
      params: { id: 'topic-private' },
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).toMatchObject({ error: 'participants_load_error' });
  });

  it('downgrades and revokes every duplicate grant for the same identity', async () => {
    state.docs.set('participant-outsider-a', {
      _id: 'participant-outsider-a', _rev: '1-a', type: 'participant', waveId: 'topic-private',
      userId: 'outsider', email: 'outsider@example.test', role: 'editor', status: 'accepted', invitedAt: 1,
    });
    state.docs.set('participant-outsider-b', {
      _id: 'participant-outsider-b', _rev: '1-b', type: 'participant', waveId: 'topic-private',
      userId: 'outsider', email: 'outsider@example.test', role: 'commenter', status: 'accepted', invitedAt: 2,
    });

    const downgrade = await invokeRoute(wavesRouter, 'patch', '/:id/participants/:participantId', {
      identity: 'owner',
      params: { id: 'topic-private', participantId: 'participant-outsider-a' },
      body: { role: 'viewer' },
    });
    expect(downgrade.body).toMatchObject({ role: 'viewer', updated: 2 });
    expect(state.docs.get('participant-outsider-a')?.['role']).toBe('viewer');
    expect(state.docs.get('participant-outsider-b')?.['role']).toBe('viewer');

    const revoke = await invokeRoute(wavesRouter, 'delete', '/:id/participants/:participantId', {
      identity: 'owner',
      params: { id: 'topic-private', participantId: 'participant-outsider-a' },
    });
    expect(revoke.body).toMatchObject({ status: 'declined', updated: 2 });
    expect(state.docs.get('participant-outsider-a')?.['status']).toBe('declined');
    expect(state.docs.get('participant-outsider-b')?.['status']).toBe('declined');
  });

  it('rejects an owner self-invite before creating a duplicate grant', async () => {
    state.docs.set('owner', { _id: 'owner', type: 'user', email: 'owner@example.test', name: 'Owner' });
    const response = await invokeRoute(wavesRouter, 'post', '/:id/participants', {
      identity: 'owner',
      params: { id: 'topic-private' },
      body: { emails: ['OWNER@example.test'], role: 'editor' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({ error: 'owner_already_participant' });
    expect([...state.docs.values()].filter((doc) => doc['type'] === 'participant' && doc['email'] === 'owner@example.test')).toHaveLength(0);
  });

  it('rejects invite batches over the per-request cap', async () => {
    const response = await invokeRoute(wavesRouter, 'post', '/:id/participants', {
      identity: 'owner',
      params: { id: 'topic-private' },
      body: { emails: Array.from({ length: 21 }, (_, index) => `person-${index}@example.test`), role: 'viewer' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({ error: 'invalid_invite_request' });
  });

  it('allows a commenter to delete only an own leaf, never a foreign-author subtree', async () => {
    state.docs.set('commenter-parent', {
      _id: 'commenter-parent', _rev: '1-parent', type: 'blip', waveId: 'topic-private', parentId: null,
      authorId: 'commenter', content: '<p>Parent</p>', createdAt: 1, updatedAt: 1,
    });
    state.docs.set('owner-reply', {
      _id: 'owner-reply', _rev: '1-child', type: 'blip', waveId: 'topic-private', parentId: 'commenter-parent',
      authorId: 'owner', content: '<p>Owner reply</p>', createdAt: 2, updatedAt: 2,
    });
    const blocked = await invokeRoute(blipsRouter, 'delete', '/:id', {
      identity: 'commenter', params: { id: 'commenter-parent' },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.body).toMatchObject({ error: 'commenter_cannot_delete_subtree' });
    expect(state.docs.get('commenter-parent')?.['deleted']).not.toBe(true);
    expect(state.docs.get('owner-reply')?.['deleted']).not.toBe(true);

    const leaf = await invokeRoute(blipsRouter, 'delete', '/:id', {
      identity: 'commenter', params: { id: 'owner-reply' },
    });
    expect(leaf.statusCode).toBe(403);
  });

  it('paginates a cascade beyond 500 descendants and revokes every live blip', async () => {
    state.docs.set('large-parent', {
      _id: 'large-parent', _rev: '1-parent', type: 'blip', waveId: 'topic-private', parentId: null,
      authorId: 'owner', content: '<p>Parent</p>', createdAt: 1, updatedAt: 1,
    });
    for (let index = 0; index < 501; index += 1) {
      state.docs.set(`large-child-${index}`, {
        _id: `large-child-${index}`, _rev: '1-child', type: 'blip', waveId: 'topic-private', parentId: 'large-parent',
        authorId: index % 2 ? 'owner' : 'editor', content: '<p>Child</p>', createdAt: index + 2, updatedAt: index + 2,
      });
    }
    const response = await invokeRoute(blipsRouter, 'delete', '/:id', {
      identity: 'owner', params: { id: 'large-parent' },
    });
    expect(response.statusCode).toBe(200);
    expect([...state.docs.values()].filter((doc) => doc['_id'] === 'large-parent' || String(doc['_id']).startsWith('large-child-')).every((doc) => doc['deleted'] === true)).toBe(true);
    expect(vi.mocked(revokeBlipSockets)).toHaveBeenCalledWith(expect.arrayContaining(['large-parent', 'large-child-500']));
    expect(vi.mocked(revokeBlipSockets).mock.calls.at(-1)?.[0]).toHaveLength(502);
  });

  it('validates reparent targets and prevents self, descendant, cross-wave, and missing parents', async () => {
    state.docs.set('move-parent', {
      _id: 'move-parent', _rev: '1-parent', type: 'blip', waveId: 'topic-private', parentId: null,
      authorId: 'editor', content: '<p>Parent</p>', createdAt: 1, updatedAt: 1,
    });
    state.docs.set('move-child', {
      _id: 'move-child', _rev: '1-child', type: 'blip', waveId: 'topic-private', parentId: 'move-parent',
      authorId: 'editor', content: '<p>Child</p>', createdAt: 2, updatedAt: 2,
    });
    state.docs.set('other-parent', {
      _id: 'other-parent', _rev: '1-other', type: 'blip', waveId: 'topic-other', parentId: null,
      authorId: 'editor', content: '<p>Other</p>', createdAt: 1, updatedAt: 1,
    });
    for (const [parentId, status, error] of [
      ['move-parent', 400, 'cannot_move_to_self'],
      ['move-child', 400, 'cannot_move_to_descendant'],
      ['other-parent', 400, 'cross_wave_parent'],
      ['missing-parent', 404, 'parent_not_found'],
    ] as const) {
      const response = await invokeRoute(blipsRouter, 'patch', '/:id/reparent', {
        identity: 'editor', params: { id: 'move-parent' }, body: { parentId },
      });
      expect(response.statusCode).toBe(status);
      expect(response.body).toMatchObject({ error });
    }
  });

  it('uses collision-resistant ids and ignores client-forged author identity', async () => {
    const [first, second] = await Promise.all([
      invokeRoute(blipsRouter, 'post', '/', {
        identity: 'editor', body: { waveId: 'topic-private', content: '<p>First</p>', authorName: 'Forged Owner' },
      }),
      invokeRoute(blipsRouter, 'post', '/', {
        identity: 'editor', body: { waveId: 'topic-private', content: '<p>Second</p>', authorName: 'Forged Owner' },
      }),
    ]);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.body.id).not.toBe(second.body.id);
    expect(first.body.blip.authorId).toBe('editor');
    expect(first.body.blip.authorName).toBe('Anonymous');
    expect(first.body.blip.authorName).not.toBe('Forged Owner');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const histories = [...state.docs.values()].filter((doc) => doc['type'] === 'blip_history' && doc['blipId'] === first.body.id);
    expect(histories).toHaveLength(1);
    expect(histories[0]?.['authorId']).toBe('editor');
    expect(histories[0]?.['authorName']).toBe('Anonymous');
  });

  it('rejects dangling, deleted, and cross-wave parents during blip creation', async () => {
    state.docs.set('create-other-parent', {
      _id: 'create-other-parent', _rev: '1-other', type: 'blip', waveId: 'topic-other', parentId: null,
      authorId: 'owner', content: '<p>Other</p>', createdAt: 1, updatedAt: 1,
    });
    state.docs.set('create-deleted-parent', {
      _id: 'create-deleted-parent', _rev: '1-deleted', type: 'blip', waveId: 'topic-private', parentId: null,
      authorId: 'owner', content: '<p>Deleted</p>', deleted: true, createdAt: 1, updatedAt: 1,
    });
    for (const [parentId, status, error] of [
      ['missing-create-parent', 404, 'parent_not_found'],
      ['create-deleted-parent', 400, 'parent_deleted'],
      ['create-other-parent', 400, 'cross_wave_parent'],
    ] as const) {
      const response = await invokeRoute(blipsRouter, 'post', '/', {
        identity: 'editor', body: { waveId: 'topic-private', parentId, content: '<p>Child</p>' },
      });
      expect(response.statusCode).toBe(status);
      expect(response.body).toMatchObject({ error });
    }
  });

  it('rejects non-blip Couch documents across every blip-specific route', async () => {
    const task = {
      _id: 'task:type-confusion', _rev: '1-task', type: 'task', waveId: 'topic-private',
      blipId: 'blip-private', authorId: 'editor', content: 'must survive',
      createdAt: 1, updatedAt: 1,
    };
    state.docs.set(task._id, task);
    const cases: Array<[string, string, Record<string, any>]> = [
      ['get', '/:id', {}],
      ['put', '/:id', { content: '<p>overwrite</p>' }],
      ['delete', '/:id', {}],
      ['get', '/:id/links', {}],
      ['get', '/:id/history', {}],
      ['get', '/:id/collapse-default', {}],
      ['patch', '/:id/collapse-default', { collapseByDefault: true }],
      ['get', '/:id/inline-comments-visibility', {}],
      ['patch', '/:id/inline-comments-visibility', { isVisible: false }],
      ['post', '/:id/duplicate', {}],
      ['patch', '/:id/reparent', { parentId: null }],
      ['post', '/:id/move', { newParentId: null }],
    ];

    for (const [method, path, body] of cases) {
      const response = await invokeRoute(blipsRouter, method, path, {
        identity: 'editor', params: { id: task._id }, body,
      });
      expect(response.statusCode, `${method.toUpperCase()} ${path}`).toBe(404);
    }

    expect(state.docs.get(task._id)).toEqual(task);
  });

  it('keeps a delivered token redeemable when the post-SMTP status update fails', async () => {
    const originalUpdate = vi.mocked(updateDoc).getMockImplementation();
    vi.mocked(updateDoc).mockImplementation(async (doc: any) => {
      if (doc.type === 'invitation_token' && doc.status === 'sent') throw new Error('status_write_failed');
      return originalUpdate!(doc);
    });
    const invited = await invokeRoute(wavesRouter, 'post', '/:id/participants', {
      identity: 'owner',
      params: { id: 'topic-private' },
      body: { emails: ['outsider@example.test'], role: 'viewer' },
    });
    expect(invited.body.invited).toContainEqual(expect.objectContaining({ ok: true, status: 'pending' }));
    const token = lastEmailedInviteToken();
    const accepted = await invokeRoute(wavesRouter, 'post', '/invitations/accept', {
      identity: 'outsider',
      body: { token },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.body).toMatchObject({ accepted: true });
    expect(vi.mocked(insertDoc)).toHaveBeenCalledWith(expect.objectContaining({ type: 'invitation_token' }));
    vi.mocked(updateDoc).mockImplementation(originalUpdate!);
  });

  it('canonicalizes link authorization from the endpoint blips, not caller wave metadata', async () => {
    state.docs.set('topic-outsider', {
      _id: 'topic-outsider', type: 'topic', title: 'Outsider wave', authorId: 'outsider',
      shareLevel: 'private', allowComments: false, allowEdits: false, createdAt: 1, updatedAt: 1,
    });
    state.docs.set('blip-outsider', {
      _id: 'blip-outsider', type: 'blip', waveId: 'topic-outsider', authorId: 'outsider', createdAt: 1, updatedAt: 1,
    });
    state.docs.set('topic-public', {
      _id: 'topic-public', type: 'topic', title: 'Public', authorId: 'owner', shareLevel: 'public', createdAt: 1, updatedAt: 1,
    });
    state.docs.set('blip-public', {
      _id: 'blip-public', type: 'blip', waveId: 'topic-public', authorId: 'owner', createdAt: 1, updatedAt: 1,
    });

    const spoofed = await invokeRoute(linksRouter, 'post', '/', {
      identity: 'outsider',
      body: { fromBlipId: 'blip-private', toBlipId: 'blip-private', waveId: 'topic-outsider' },
    });
    expect(spoofed.statusCode).toBe(400);
    expect(spoofed.body).toMatchObject({ error: 'wave_mismatch' });

    const privateTarget = await invokeRoute(linksRouter, 'post', '/', {
      identity: 'outsider',
      body: { fromBlipId: 'blip-outsider', toBlipId: 'blip-private', waveId: 'topic-outsider' },
    });
    expect(privateTarget.statusCode).toBe(403);

    const valid = await invokeRoute(linksRouter, 'post', '/', {
      identity: 'outsider',
      body: { fromBlipId: 'blip-outsider', toBlipId: 'blip-public', waveId: 'topic-outsider' },
    });
    expect(valid.statusCode).toBe(201);
    expect(state.docs.get('link:blip-outsider:blip-public')).toMatchObject({ waveId: 'topic-outsider' });

    state.docs.set('spoofed-link', {
      _id: 'spoofed-link', _rev: '1-link', type: 'link', fromBlipId: 'blip-private',
      toBlipId: 'blip-public', waveId: 'topic-outsider', createdAt: 1,
    });
    const spoofedDelete = await invokeRoute(linksRouter, 'delete', '/:from/:to', {
      identity: 'outsider',
      params: { from: 'blip-private', to: 'blip-public' },
    });
    expect(spoofedDelete.statusCode).toBe(403);
    expect(state.docs.has('spoofed-link')).toBe(true);
  });

  it('shows private backlinks to a participant and hides the resource from an outsider', async () => {
    state.docs.set('blip-private-second', {
      _id: 'blip-private-second', type: 'blip', waveId: 'topic-private', authorId: 'owner', createdAt: 2, updatedAt: 2,
    });
    state.docs.set('private-link', {
      _id: 'private-link', type: 'link', fromBlipId: 'blip-private', toBlipId: 'blip-private-second',
      waveId: 'topic-private', createdAt: 2,
    });
    const participant = await invokeRoute(blipsRouter, 'get', '/:id/links', {
      identity: 'viewer',
      params: { id: 'blip-private' },
    });
    expect(participant.statusCode).toBe(200);
    expect(participant.body.out).toContainEqual(expect.objectContaining({ toBlipId: 'blip-private-second' }));

    const outsider = await invokeRoute(blipsRouter, 'get', '/:id/links', {
      identity: 'outsider',
      params: { id: 'blip-private' },
    });
    expect(outsider.statusCode).toBe(403);
  });

  it('keeps task and mention pagination open when a full raw page contains revoked rows', async () => {
    state.docs.set('topic-outsider', {
      _id: 'topic-outsider', type: 'topic', title: 'Accessible', authorId: 'outsider',
      shareLevel: 'private', createdAt: 1, updatedAt: 1,
    });
    for (const [id, topicId, createdAt] of [
      ['task-hidden', 'topic-private', 3],
      ['task-visible', 'topic-outsider', 2],
    ] as const) {
      state.docs.set(id, {
        _id: id, type: 'task', waveId: topicId, topicId, blipId: '', taskText: id,
        assigneeId: 'outsider', authorId: 'owner', authorName: 'Owner', isCompleted: false,
        createdAt, updatedAt: createdAt,
      });
    }
    for (const [id, topicId, createdAt] of [
      ['mention-hidden', 'topic-private', 3],
      ['mention-visible', 'topic-outsider', 2],
    ] as const) {
      state.docs.set(id, {
        _id: id, type: 'mention', topicId, blipId: '', mentionedUserId: 'outsider', mentionText: id,
        authorId: 'owner', authorName: 'Owner', isRead: false, createdAt,
      });
    }

    const tasks = await invokeRoute(tasksRouter, 'get', '/', {
      identity: 'outsider',
      query: { limit: '2', offset: '0' },
    });
    expect(tasks.body.tasks.map((task: any) => task.id)).toEqual(['task-visible']);
    expect(tasks.body.hasMore).toBe(true);

    const mentions = await invokeRoute(mentionsRouter, 'get', '/', {
      identity: 'outsider',
      query: { limit: '2', offset: '0' },
    });
    expect(mentions.body.mentions.map((mention: any) => mention.id)).toEqual(['mention-visible']);
    expect(mentions.body.hasMore).toBe(true);
  });

  it('returns 404 for a random wave id with no metadata or legacy blips', async () => {
    const response = await invokeRoute(wavesRouter, 'get', '/:id', {
      identity: 'anonymous',
      params: { id: 'definitely-not-a-wave' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.body).toMatchObject({ error: 'wave_not_found' });
  });
});
