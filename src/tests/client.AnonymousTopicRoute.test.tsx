import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => vi.fn());

vi.mock('../client/lib/api', () => ({ api: apiMock }));
vi.mock('../client/components/AuthPanel', () => ({
  AuthPanel: ({ onSignedIn }: { onSignedIn: (user: { id: string }) => void }) => (
    <button type="button" data-testid="auth-panel" onClick={() => onSignedIn({ id: 'signed-in' })}>
      Complete sign in
    </button>
  ),
}));
vi.mock('../client/components/RizzomaTopicDetail', () => ({
  RizzomaTopicDetail: ({ id, isAuthed }: { id: string; isAuthed: boolean }) => (
    <article data-testid="topic-detail" data-topic-id={id} data-authed={String(isAuthed)}>
      Shared topic content
    </article>
  ),
}));

import { AnonymousTopicRoute } from '../client/components/AnonymousTopicRoute';

describe('AnonymousTopicRoute', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    apiMock.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderRoute(onSignedIn = vi.fn()): Promise<void> {
    await act(async () => {
      root.render(<AnonymousTopicRoute topicId="shared-topic" onSignedIn={onSignedIn} />);
    });
  }

  it('renders public/link content read-only with a visible sign-in action', async () => {
    apiMock.mockResolvedValue({ ok: true, status: 200, data: { id: 'shared-topic' } });
    const onSignedIn = vi.fn();
    await renderRoute(onSignedIn);

    expect(container.querySelector('[data-testid="topic-detail"]')?.getAttribute('data-authed')).toBe('false');
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.some((button) => button.textContent === 'Sign in')).toBe(true);
    expect(buttons.some((button) => /new topic|edit|share/i.test(button.textContent || ''))).toBe(false);

    act(() => buttons.find((button) => button.textContent === 'Sign in')!.click());
    act(() => (container.querySelector('[data-testid="auth-panel"]') as HTMLButtonElement).click());
    expect(onSignedIn).toHaveBeenCalledWith({ id: 'signed-in' });
  });

  it('shows the sign-in panel instead of private topic content', async () => {
    apiMock.mockResolvedValue({ ok: false, status: 401, data: { error: 'unauthenticated' } });
    await renderRoute();

    expect(container.querySelector('h1')?.textContent).toBe('Sign in to open this topic');
    expect(container.querySelector('[data-testid="auth-panel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="topic-detail"]')).toBeNull();
  });

  it('does not reveal a deleted topic as a sign-in challenge', async () => {
    apiMock.mockResolvedValue({ ok: false, status: 404, data: { error: 'not_found' } });
    await renderRoute();

    expect(container.querySelector('h1')?.textContent).toBe('Topic not found');
    expect(container.querySelector('[data-testid="auth-panel"]')).toBeNull();
    expect(container.querySelector('[data-testid="topic-detail"]')).toBeNull();
  });
});
