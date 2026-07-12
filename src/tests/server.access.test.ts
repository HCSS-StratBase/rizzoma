import { beforeEach, describe, expect, it, vi } from 'vitest';

type StoredDoc = Record<string, any> & { _id: string };

const state = vi.hoisted(() => ({
  docs: new Map<string, StoredDoc>(),
}));

function matches(doc: StoredDoc, selector: Record<string, any>): boolean {
  return Object.entries(selector).every(([key, expected]) => {
    const actual = doc[key];
    if (expected && typeof expected === 'object' && '$in' in expected) {
      return expected.$in.includes(actual);
    }
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
}));

import {
  buildAccessibleTopicSelector,
  hasWavePermission,
  normalizeSharingPolicy,
  resolveWaveAccess,
  type AccessIdentity,
  type WavePermission,
} from '../server/lib/access.js';

const identities: Record<string, AccessIdentity> = {
  anonymous: {},
  outsider: { id: 'outsider', email: 'outsider@example.test' },
  viewer: { id: 'viewer', email: 'viewer@example.test' },
  commenter: { id: 'commenter', email: 'commenter@example.test' },
  editor: { id: 'editor', email: 'editor@example.test' },
  owner: { id: 'owner', email: 'owner@example.test' },
};

function seedPrivateWave(): void {
  state.docs.set('wave-private', {
    _id: 'wave-private',
    type: 'topic',
    authorId: 'owner',
    shareLevel: 'private',
    allowComments: false,
    allowEdits: false,
  });
  for (const role of ['viewer', 'commenter', 'editor'] as const) {
    state.docs.set(`participant-${role}`, {
      _id: `participant-${role}`,
      type: 'participant',
      waveId: 'wave-private',
      userId: role,
      email: `${role}@example.test`,
      role,
      status: 'accepted',
    });
  }
}

describe('central wave authorization policy', () => {
  beforeEach(() => {
    state.docs.clear();
    seedPrivateWave();
  });

  it.each([
    ['anonymous', 'outsider', false, false, false, false],
    ['outsider', 'outsider', false, false, false, false],
    ['viewer', 'viewer', true, false, false, false],
    ['commenter', 'commenter', true, true, false, false],
    ['editor', 'editor', true, true, true, false],
    ['owner', 'owner', true, true, true, true],
  ])(
    'maps private-wave identity %s to %s and exact capabilities',
    async (identityName, role, canRead, canComment, canEdit, canManage) => {
      const access = await resolveWaveAccess('wave-private', identities[identityName]!);
      expect(access).toMatchObject({ role, canRead, canComment, canEdit, canManage });
      const expected: Record<WavePermission, boolean> = {
        read: canRead,
        comment: canComment,
        edit: canEdit,
        manage: canManage,
      };
      for (const permission of Object.keys(expected) as WavePermission[]) {
        expect(hasWavePermission(access, permission)).toBe(expected[permission]);
      }
    },
  );

  it.each([
    ['link', false, false, 'anonymous', 'viewer'],
    ['link', false, false, 'outsider', 'viewer'],
    ['link', true, false, 'outsider', 'commenter'],
    ['link', true, true, 'outsider', 'editor'],
    ['public', false, false, 'anonymous', 'viewer'],
    ['public', false, false, 'outsider', 'viewer'],
    ['public', true, false, 'outsider', 'commenter'],
    ['public', true, true, 'outsider', 'editor'],
  ])(
    '%s policy comments=%s edits=%s gives %s the %s role',
    async (shareLevel, allowComments, allowEdits, identityName, role) => {
      state.docs.set('shared', {
        _id: 'shared',
        type: 'topic',
        authorId: 'owner',
        shareLevel,
        allowComments,
        allowEdits,
      });
      const access = await resolveWaveAccess('shared', identities[identityName]!);
      expect(access.role).toBe(role);
    },
  );

  it('never lets public flags reduce an explicit participant or owner role', async () => {
    state.docs.set('wave-private', {
      ...state.docs.get('wave-private')!,
      shareLevel: 'public',
      allowComments: false,
      allowEdits: false,
    });
    expect((await resolveWaveAccess('wave-private', identities['editor']!)).role).toBe('editor');
    expect((await resolveWaveAccess('wave-private', identities['owner']!)).role).toBe('owner');
  });

  it('matches invitations by normalized email and ignores declined participants', async () => {
    state.docs.set('participant-email', {
      _id: 'participant-email',
      type: 'participant',
      waveId: 'wave-private',
      userId: 'invite:guest@example.test',
      email: 'guest@example.test',
      role: 'commenter',
      status: 'pending',
    });
    expect((await resolveWaveAccess('wave-private', { id: 'real-user', email: 'GUEST@EXAMPLE.TEST' })).role).toBe('commenter');

    state.docs.set('participant-email', {
      ...state.docs.get('participant-email')!,
      status: 'declined',
    });
    expect((await resolveWaveAccess('wave-private', { id: 'real-user', email: 'guest@example.test' })).role).toBe('outsider');
  });

  it('keeps legacy missing-policy docs public-read-only but malformed explicit policy private', () => {
    expect(normalizeSharingPolicy({})).toEqual({
      shareLevel: 'public',
      allowComments: false,
      allowEdits: false,
    });
    expect(normalizeSharingPolicy({ shareLevel: 'invalid' as any })).toEqual({
      shareLevel: 'private',
      allowComments: false,
      allowEdits: false,
    });
    expect(normalizeSharingPolicy({ sharing: { shareLevel: 'public', allowComments: true } })).toEqual({
      shareLevel: 'public',
      allowComments: true,
      allowEdits: false,
    });
  });

  it('bounds the missing-metadata fallback to public read-only', async () => {
    const access = await resolveWaveAccess('legacy-without-metadata', identities['outsider']!);
    expect(access).toMatchObject({
      role: 'viewer',
      canRead: true,
      canComment: false,
      canEdit: false,
      canManage: false,
    });
  });

  it('lists public topics plus owned and participant topics, never link-only topics', async () => {
    const selector = await buildAccessibleTopicSelector(identities['viewer']!);
    expect(selector).toEqual({
      $and: [
        { type: 'topic' },
        {
          $or: [
            { shareLevel: 'public' },
            {
              $and: [
                { shareLevel: { $exists: false } },
                { 'sharing.shareLevel': 'public' },
              ],
            },
            {
              $and: [
                { shareLevel: { $exists: false } },
                { 'sharing.shareLevel': { $exists: false } },
              ],
            },
            { authorId: 'viewer' },
            { _id: { $in: ['wave-private'] } },
          ],
        },
      ],
    });
  });
});
