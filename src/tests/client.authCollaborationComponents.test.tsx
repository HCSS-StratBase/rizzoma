import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CollaborationUser } from '../client/components/editor/collaborationIdentity';

const collaborationCalls = vi.hoisted(() => [] as Array<{
  blipId: string;
  enabled: boolean;
  user: CollaborationUser | null;
}>);

vi.mock('../client/components/editor/useCollaboration', () => ({
  useCollaboration: vi.fn((
    _doc: unknown,
    blipId: string,
    enabled: boolean,
    user: CollaborationUser | null,
  ) => {
    collaborationCalls.push({ blipId, enabled, user });
    return null;
  }),
}));

vi.mock('../client/lib/api', () => ({
  // Keep topic-loading effects pending: this test exercises the synchronous
  // collaboration boundary only and must not schedule unrelated state updates.
  api: vi.fn(() => new Promise(() => {})),
  ensureCsrf: vi.fn(async () => 'test-csrf'),
}));

vi.mock('@tiptap/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiptap/react')>();
  return {
    ...actual,
    useEditor: vi.fn(() => null),
    EditorContent: () => null,
  };
});

import { AuthProvider, type User } from '../client/hooks/useAuth';
import { collaborationColorForUserId } from '../client/components/editor/collaborationIdentity';
import { RizzomaTopicDetail } from '../client/components/RizzomaTopicDetail';
import { RizzomaBlip, type BlipData } from '../client/components/blip/RizzomaBlip';
import { BlipEditor } from '../client/components/editor/BlipEditor';
import { api } from '../client/lib/api';

describe('client: authenticated collaboration component boundaries', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    collaborationCalls.length = 0;
    vi.mocked(api).mockClear();
    window.__rizzomaLoadingState?.clear();
  });

  it('does not request persisted blip preferences for the synthetic topic root', () => {
    const topicRoot: BlipData = {
      id: 'topic-root-has-no-blip-document',
      content: '<p>Topic root</p>',
      authorId: 'owner',
      authorName: 'Owner',
      createdAt: 1,
      updatedAt: 1,
      isRead: true,
      childBlips: [],
      permissions: { canRead: true, canComment: true, canEdit: true },
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<RizzomaBlip blip={topicRoot} renderMode="topic-root" />);
    });

    const requestedPaths = vi.mocked(api).mock.calls.map(([requestPath]) => String(requestPath));
    expect(requestedPaths).not.toContain('/api/blips/topic-root-has-no-blip-document/collapse-default');
    expect(requestedPaths).not.toContain('/api/blips/topic-root-has-no-blip-document/inline-comments-visibility');
  });

  it('passes the signed-in identity from each real editor surface to useCollaboration', () => {
    const user: User = {
      id: 'component-user-42',
      email: 'component@example.test',
      name: 'Component User',
    };
    const nestedBlip: BlipData = {
      id: 'nested-component-boundary',
      content: '<p>Nested</p>',
      authorId: user.id,
      authorName: user.name || user.email || user.id,
      createdAt: 1,
      updatedAt: 1,
      isRead: true,
      childBlips: [],
      permissions: { canRead: true, canComment: true, canEdit: true },
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <AuthProvider user={user}>
          <RizzomaTopicDetail id="topic-component-boundary" isAuthed />
          <RizzomaBlip blip={nestedBlip} />
          <BlipEditor blipId="generic-component-boundary" enableCollaboration />
        </AuthProvider>,
      );
    });

    const expectedUser = {
      id: user.id,
      name: user.name,
      color: collaborationColorForUserId(user.id),
    };
    for (const blipId of ['nested-component-boundary', 'generic-component-boundary']) {
      const call = collaborationCalls.find((candidate) => candidate.blipId === blipId);
      expect(call, `missing collaboration call for ${blipId}`).toBeDefined();
      expect(call?.enabled).toBe(true);
      expect(call?.user).toEqual(expectedUser);
    }

    // Topic collaboration is intentionally held closed until the
    // access-checked topic response grants canEdit. The mocked request never
    // resolves, so an authenticated identity alone must not open the room.
    const topicCall = collaborationCalls.find(
      (candidate) => candidate.blipId === 'topic-component-boundary',
    );
    expect(topicCall).toBeDefined();
    expect(topicCall?.enabled).toBe(false);
    expect(topicCall?.user).toEqual(expectedUser);
  });
});
