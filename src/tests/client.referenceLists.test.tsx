import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { vi } from 'vitest';

const apiMock = vi.hoisted(() => vi.fn());
const ensureCsrfMock = vi.hoisted(() => vi.fn(async () => 'csrf'));
vi.mock('../client/lib/api', () => ({ api: apiMock, ensureCsrf: ensureCsrfMock }));

import { MentionsList } from '../client/components/MentionsList';
import { TasksList } from '../client/components/TasksList';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function ok(data: unknown) {
  return { ok: true, status: 200, data };
}

describe('mentions and tasks reference lists', () => {
  beforeEach(() => {
    apiMock.mockReset();
    ensureCsrfMock.mockClear();
  });

  it('deep-links a mention to its exact blip and keeps unread state when mark-read fails', async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path.startsWith('/api/mentions?')) return ok({
        mentions: [{
          id: 'm1', topicId: 'wave-1', topicTitle: 'Wave', blipId: 'wave-1:b-deep',
          mentionText: '@Viewer', authorName: 'Editor', authorId: 'editor',
          timestamp: new Date().toISOString(), isRead: false,
        }],
        total: 1,
        unreadCount: 1,
        hasMore: false,
      });
      return { ok: false, status: 500, data: { error: 'failed' } };
    });
    const selected = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => { root.render(<MentionsList isAuthed onSelectMention={selected} />); });

    const item = container.querySelector('.mention-item') as HTMLElement;
    await act(async () => { item.click(); });

    expect(selected).toHaveBeenCalledWith('wave-1', 'wave-1:b-deep');
    expect(item.classList.contains('unread')).toBe(true);
    await act(async () => { root.unmount(); });
  });

  it('loads later mention pages instead of stopping at the first page', async () => {
    apiMock.mockImplementation(async (path: string) => ok({
      mentions: path.includes('offset=0')
        ? [{ id: 'm1', topicId: 'w', topicTitle: 'Wave', blipId: 'w:b1', mentionText: 'first', authorName: 'A', authorId: 'a', timestamp: new Date().toISOString(), isRead: true }]
        : [{ id: 'm2', topicId: 'w', topicTitle: 'Wave', blipId: 'w:b2', mentionText: 'second', authorName: 'A', authorId: 'a', timestamp: new Date().toISOString(), isRead: true }],
      total: 2,
      unreadCount: 0,
      hasMore: path.includes('offset=0'),
    }));
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => { root.render(<MentionsList isAuthed onSelectMention={() => undefined} />); });
    const loadMore = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Load more')) as HTMLButtonElement;
    await act(async () => { loadMore.click(); });
    expect(container.textContent).toContain('first');
    expect(container.textContent).toContain('second');
    expect(apiMock).toHaveBeenCalledWith(expect.stringContaining('offset=1'));
    await act(async () => { root.unmount(); });
  });

  it('pages tasks and passes the exact backing blip to navigation', async () => {
    apiMock.mockImplementation(async (path: string) => ok({
      tasks: path.includes('offset=0')
        ? [{ id: 't1', topicId: 'w', topicTitle: 'Wave', blipId: 'w:b1', taskText: 'first task', authorName: 'A', isCompleted: false, createdAt: new Date().toISOString() }]
        : [{ id: 't2', topicId: 'w', topicTitle: 'Wave', blipId: 'w:b2', taskText: 'second task', authorName: 'A', isCompleted: false, createdAt: new Date().toISOString() }],
      total: 2,
      pendingCount: 2,
      completedCount: 0,
      hasMore: path.includes('offset=0'),
    }));
    const selected = vi.fn();
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => { root.render(<TasksList isAuthed onSelectTask={selected} />); });
    await act(async () => { (container.querySelector('.task-item') as HTMLElement).click(); });
    expect(selected).toHaveBeenCalledWith('w', 'w:b1');
    const loadMore = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Load more')) as HTMLButtonElement;
    await act(async () => { loadMore.click(); });
    expect(container.textContent).toContain('second task');
    expect(apiMock).toHaveBeenCalledWith(expect.stringContaining('offset=1'));
    await act(async () => { root.unmount(); });
  });
});
