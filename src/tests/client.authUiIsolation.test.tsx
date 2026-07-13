import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => vi.fn());

vi.mock('../client/lib/api', () => ({
  api: apiMock,
  ensureCsrf: vi.fn(async () => 'csrf'),
}));

vi.mock('@shared/featureFlags', () => ({
  FEATURES: {
    REALTIME_COLLAB: false,
    LIVE_CURSORS: false,
    RIZZOMA_NATIVE_RENDER: false,
    RIZZOMA_PARITY_RENDER: false,
    WAVE_PLAYBACK: false,
  },
}));

vi.mock('@tiptap/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiptap/react')>();
  return {
    ...actual,
    useEditor: vi.fn(() => null),
    EditorContent: () => null,
  };
});

vi.mock('../client/components/editor/useCollaboration', () => ({
  useCollaboration: vi.fn(() => null),
}));

vi.mock('../client/components/editor/extensions/TaskWidget', () => ({
  requestTaskCompletionHydration: vi.fn(),
}));

vi.mock('../client/lib/socket', () => ({
  subscribeBlipEvents: vi.fn(() => () => undefined),
  subscribeTopicDetail: vi.fn(() => () => undefined),
}));

vi.mock('../client/components/blip/RizzomaBlip', () => ({
  RizzomaBlip: ({ blip }: { blip: { id: string; content: string } }) => (
    <div data-testid={`blip-${blip.id}`} dangerouslySetInnerHTML={{ __html: blip.content }} />
  ),
}));

vi.mock('../client/components/blip/ActiveBlipContext', () => ({
  ActiveBlipProvider: ({ children }: { children: React.ReactNode }) => children,
  EditSurfaceActiveBridge: () => null,
}));

vi.mock('../client/components/InviteModal', () => ({ InviteModal: () => null }));
vi.mock('../client/components/ShareModal', () => ({ ShareModal: () => null }));
vi.mock('../client/components/ExportModal', () => ({ default: () => null }));
vi.mock('../client/components/WavePlaybackModal', () => ({ WavePlaybackModal: () => null }));

import { AuthProvider, type User } from '../client/hooks/useAuth';
import { RizzomaTopicDetail } from '../client/components/RizzomaTopicDetail';

const alice: User = { id: 'alice-id', email: 'alice@example.test', name: 'Alice' };
const bob: User = { id: 'bob-id', email: 'bob@example.test', name: 'Bob' };

function topicResponse(owner: User, marker: string) {
  return {
    ok: true,
    status: 200,
    data: {
      id: 'private-topic',
      title: `${owner.name} private topic`,
      content: `<h1>${owner.name} private topic</h1><p>${marker}</p>`,
      createdAt: 1,
      updatedAt: 2,
      authorId: owner.id,
      authorName: owner.name,
      permissions: {
        role: 'owner',
        canRead: true,
        canComment: true,
        canEdit: true,
        canManage: true,
      },
    },
  };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('client: authenticated UI owner isolation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    apiMock.mockReset();
    window.__rizzomaLoadingState?.clear();
  });

  it('removes A private content synchronously and retains nothing when B is denied', async () => {
    let activeOwner = alice.id;
    let resolveBobTopic!: (value: unknown) => void;
    const bobTopic = new Promise((resolve) => { resolveBobTopic = resolve; });

    apiMock.mockImplementation((path: string) => {
      if (activeOwner === alice.id) {
        if (path === '/api/topics/private-topic') {
          return Promise.resolve(topicResponse(alice, 'ALICE-PRIVATE-MARKER'));
        }
        if (path === '/api/waves/private-topic/participants') {
          return Promise.resolve({ ok: true, status: 200, data: { participants: [] } });
        }
        if (path.startsWith('/api/blips?waveId=private-topic')) {
          return Promise.resolve({ ok: true, status: 200, data: { blips: [], nextBookmark: null } });
        }
      }

      if (path === '/api/topics/private-topic') return bobTopic;
      if (path === '/api/waves/private-topic/participants') {
        return Promise.resolve({ ok: false, status: 403, data: { error: 'forbidden' } });
      }
      if (path.startsWith('/api/blips?waveId=private-topic')) {
        return Promise.resolve({ ok: false, status: 403, data: { error: 'forbidden' } });
      }
      throw new Error(`unexpected request: ${path}`);
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <AuthProvider user={alice} loading={false}>
          <RizzomaTopicDetail id="private-topic" isAuthed />
        </AuthProvider>,
      );
    });
    await flush();
    expect(container.textContent).toContain('ALICE-PRIVATE-MARKER');

    activeOwner = bob.id;
    act(() => {
      root.render(
        <AuthProvider user={bob} loading={false}>
          <RizzomaTopicDetail id="private-topic" isAuthed />
        </AuthProvider>,
      );
    });

    // The identity-keyed implementation is replaced in this commit, before
    // Bob's access check has resolved. Alice's DOM and backing state are gone.
    expect(container.textContent).not.toContain('ALICE-PRIVATE-MARKER');
    expect(container.textContent).toContain('Loading');
    expect(apiMock).toHaveBeenCalledTimes(6);

    await act(async () => {
      resolveBobTopic({ ok: false, status: 403, data: { error: 'forbidden' } });
      await bobTopic;
    });
    await flush();

    expect(container.textContent).toContain('You do not have access to this topic');
    expect(container.textContent).not.toContain('ALICE-PRIVATE-MARKER');
    expect(window.__rizzomaLoadingState?.has('authenticated:alice-id:private-topic')).toBe(true);
    expect(window.__rizzomaLoadingState?.has('authenticated:bob-id:private-topic')).toBe(true);
  });
});
