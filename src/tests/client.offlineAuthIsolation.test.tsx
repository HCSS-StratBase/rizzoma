import type { JSX } from 'react';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, type User } from '../client/hooks/useAuth';
import { AUTH_CHANGE_STORAGE_KEY } from '../client/lib/authSessionSignal';
import { api } from '../client/lib/api';
import * as apiModule from '../client/lib/api';
import { OfflineQueueManager, offlineQueue } from '../client/lib/offlineQueue';
import { ShellAuthControls } from '../client/components/ShellAuthControls';
import { RizzomaApp } from '../client/RizzomaApp';
import { yjsDocManager } from '../client/components/editor/YjsDocumentManager';
import {
  acknowledgeCollaborationSnapshot,
  markCollaborationUpdatePending,
  resetPendingCollaborationChanges,
} from '../client/lib/collaborationPending';
import { useCollaborationUnloadGuard } from '../client/hooks/useCollaborationPending';

function mutation(ownerId: string, url = '/api/blips/b1') {
  return {
    id: `${ownerId}-mutation`,
    ownerId,
    timestamp: 1,
    method: 'PATCH' as const,
    url,
    body: { content: ownerId },
    retries: 0,
    status: 'pending' as const,
  };
}

const testReplayLock = async <T,>(_name: string, task: () => Promise<T>): Promise<T> => task();

function renderElement(element: JSX.Element): { container: HTMLDivElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, root };
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('client: authenticated offline isolation', () => {
  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
    offlineQueue.destroy();
    yjsDocManager.destroy();
    resetPendingCollaborationChanges();
    vi.restoreAllMocks();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    offlineQueue.destroy();
    yjsDocManager.destroy();
    resetPendingCollaborationChanges();
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; path=/';
    vi.restoreAllMocks();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    vi.useRealTimers();
  });

  it('does not load before auth resolves and quarantines the unsafe legacy global queue', () => {
    localStorage.setItem('auth-queue', JSON.stringify([mutation('unknown')]));
    localStorage.setItem('auth-queue:user:alice', JSON.stringify([mutation('alice')]));
    const fetchFn = vi.fn();
    const queue = new OfflineQueueManager({
      storageKey: 'auth-queue',
      autoSync: false,
      fetchFn: fetchFn as unknown as typeof fetch,
      csrfTokenProvider: async () => 'csrf',
      authUserProvider: async () => 'alice',
      replayLock: testReplayLock,
    });

    queue.initialize();
    expect(queue.userId).toBeNull();
    expect(queue.getQueue()).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(localStorage.getItem('auth-queue')).toBeNull();
    expect(Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)))
      .toContainEqual(expect.stringMatching(/^auth-queue:quarantine:unknown-legacy-owner:/));

    queue.activateUser('alice');
    expect(queue.getQueue()).toEqual([mutation('alice')]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('keeps A queued on logout and never replays A while B is active', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 200 }));
    const queue = new OfflineQueueManager({
      storageKey: 'switch-queue',
      autoSync: false,
      fetchFn: fetchFn as unknown as typeof fetch,
      csrfTokenProvider: async () => 'csrf',
      authUserProvider: async () => 'bob',
      replayLock: testReplayLock,
    });

    queue.initialize();
    queue.activateUser('alice');
    queue.enqueue({ method: 'PATCH', url: '/api/blips/alice', body: { content: 'A' } });
    queue.deactivateUser();
    expect(queue.getQueue()).toEqual([]);

    queue.activateUser('bob');
    expect(queue.getQueue()).toEqual([]);
    expect(await queue.sync()).toEqual({ success: 0, failed: 0 });
    expect(fetchFn).not.toHaveBeenCalled();

    queue.enqueue({ method: 'PATCH', url: '/api/blips/bob', body: { content: 'B' } });
    expect(await queue.sync()).toEqual({ success: 1, failed: 0 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect((fetchFn.mock.calls as unknown[][])[0]?.[0]).toBe('/api/blips/bob');
    expect(queue.getPersistedQueue('alice')).toHaveLength(1);
  });

  it('refreshes CSRF for replay, includes credentials, and never persists the token', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 200 }));
    const csrfTokenProvider = vi.fn(async () => 'fresh-csrf-token');
    const queue = new OfflineQueueManager({
      storageKey: 'csrf-queue',
      autoSync: false,
      fetchFn: fetchFn as unknown as typeof fetch,
      csrfTokenProvider,
      authUserProvider: async () => 'alice',
      replayLock: testReplayLock,
    });

    queue.initialize();
    queue.activateUser('alice');
    queue.enqueue({ method: 'PATCH', url: '/api/blips/a1', body: { content: 'offline' } });
    expect(await queue.sync()).toEqual({ success: 1, failed: 0 });

    expect(csrfTokenProvider).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith('/api/blips/a1', expect.objectContaining({
      method: 'PATCH',
      credentials: 'include',
      headers: expect.objectContaining({ 'x-csrf-token': 'fresh-csrf-token' }),
    }));
    expect(JSON.stringify(queue.getPersistedQueue('alice'))).not.toContain('fresh-csrf-token');
  });

  it('retains the owning partition without consuming retries when replay needs auth', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 401 }));
    const queue = new OfflineQueueManager({
      storageKey: 'expired-queue',
      autoSync: false,
      fetchFn: fetchFn as unknown as typeof fetch,
      csrfTokenProvider: async () => 'fresh-csrf',
      authUserProvider: async () => 'alice',
      replayLock: testReplayLock,
    });

    queue.initialize();
    queue.activateUser('alice');
    queue.enqueue({ method: 'PATCH', url: '/api/blips/a1', body: { content: 'keep me' } });
    expect(await queue.sync()).toEqual({ success: 0, failed: 1 });
    expect(queue.length).toBe(1);
    expect(queue.getQueue()[0]?.retries).toBe(0);
    expect(queue.getPersistedQueue('alice')).toHaveLength(1);
  });

  it('dead-letters a 409 content conflict instead of silently dequeuing it', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 409 }));
    const queue = new OfflineQueueManager({
      storageKey: 'conflict-queue',
      autoSync: false,
      fetchFn: fetchFn as unknown as typeof fetch,
      csrfTokenProvider: async () => 'fresh-csrf',
      authUserProvider: async () => 'alice',
      replayLock: testReplayLock,
    });
    queue.initialize();
    queue.activateUser('alice');
    const id = queue.enqueue({ method: 'PATCH', url: '/api/blips/a1', body: { content: 'local edit' } });

    expect(await queue.sync()).toEqual({ success: 0, failed: 1 });
    expect(queue.length).toBe(1);
    expect(queue.getQueue()[0]).toMatchObject({ status: 'failed', lastStatus: 409 });
    expect(queue.getPersistedQueue('alice')).toHaveLength(1);
    expect(queue.retryFailed(String(id))).toBe(true);
    expect(queue.getQueue()[0]).toMatchObject({ status: 'pending', retries: 0 });
  });

  it.each([
    { label: 'non-auth client error', status: 422, maxRetries: 3 },
    { label: 'retry exhaustion', status: 500, maxRetries: 1 },
  ])('retains $label for explicit recovery or discard', async ({ status, maxRetries }) => {
    const fetchFn = vi.fn(async () => new Response('', { status }));
    const queue = new OfflineQueueManager({
      storageKey: `dead-letter-${status}`,
      autoSync: false,
      maxRetries,
      retryDelay: 1,
      fetchFn: fetchFn as unknown as typeof fetch,
      csrfTokenProvider: async () => 'fresh-csrf',
      authUserProvider: async () => 'alice',
      replayLock: testReplayLock,
    });
    queue.initialize();
    queue.activateUser('alice');
    queue.enqueue({ method: 'PATCH', url: '/api/blips/a1', body: { content: 'keep' } });

    expect(await queue.sync()).toEqual({ success: 0, failed: 1 });
    expect(queue.getQueue()[0]?.status).toBe('failed');
    expect(queue.getPersistedQueue('alice')).toHaveLength(1);
  });

  it('preflights the exact session user before replaying an owned queue', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 200 }));
    const queue = new OfflineQueueManager({
      storageKey: 'owner-preflight',
      autoSync: false,
      fetchFn: fetchFn as unknown as typeof fetch,
      csrfTokenProvider: async () => 'fresh-csrf',
      authUserProvider: async () => 'bob',
      replayLock: testReplayLock,
    });
    queue.initialize();
    queue.activateUser('alice');
    queue.enqueue({ method: 'PATCH', url: '/api/blips/a1', body: { content: 'alice only' } });

    expect(await queue.sync()).toEqual({ success: 0, failed: 1 });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(queue.getQueue()[0]?.status).toBe('pending');
  });

  it('merges per-record cross-tab writes and does not replay them twice', async () => {
    const fetchFn = vi.fn(async () => new Response('', { status: 200 }));
    const options = {
      storageKey: 'cross-tab-records',
      autoSync: false,
      fetchFn: fetchFn as unknown as typeof fetch,
      csrfTokenProvider: async () => 'fresh-csrf',
      authUserProvider: async () => 'alice',
      replayLock: testReplayLock,
    };
    const firstTab = new OfflineQueueManager(options);
    const secondTab = new OfflineQueueManager(options);
    firstTab.initialize();
    secondTab.initialize();
    firstTab.activateUser('alice');
    secondTab.activateUser('alice');
    firstTab.enqueue({ method: 'PATCH', url: '/api/blips/a1', body: { content: 'first' } });
    secondTab.enqueue({ method: 'PATCH', url: '/api/blips/a2', body: { content: 'second' } });

    expect(firstTab.getPersistedQueue('alice')).toHaveLength(2);
    expect(await firstTab.sync()).toEqual({ success: 2, failed: 0 });
    expect(await secondTab.sync()).toEqual({ success: 0, failed: 0 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(firstTab.getPersistedQueue('alice')).toHaveLength(0);
  });

  it('fails enqueue when durable storage rejects the per-record write', () => {
    const queue = new OfflineQueueManager({
      storageKey: 'quota-queue',
      autoSync: false,
      csrfTokenProvider: async () => 'fresh-csrf',
      authUserProvider: async () => 'alice',
      replayLock: testReplayLock,
    });
    queue.initialize();
    queue.activateUser('alice');
    const originalSetItem = Storage.prototype.setItem;
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key.includes(':mutation:')) throw new DOMException('quota', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    });

    expect(queue.enqueue({ method: 'PATCH', url: '/api/blips/a1', body: { content: 'keep' } })).toBeNull();
    expect(queue.length).toBe(0);
    expect(queue.getPersistedQueue('alice')).toHaveLength(0);
    setItemSpy.mockRestore();
  });

  it('quarantines malformed records without overwriting them with an empty queue', () => {
    const queue = new OfflineQueueManager({
      storageKey: 'malformed-queue',
      autoSync: false,
      csrfTokenProvider: async () => 'fresh-csrf',
      authUserProvider: async () => 'alice',
      replayLock: testReplayLock,
    });
    const malformedKey = `${queue.storageKeyForUser('alice')}:mutation:broken`;
    localStorage.setItem(malformedKey, '{not-json');
    queue.initialize();
    queue.activateUser('alice');

    expect(queue.length).toBe(0);
    expect(localStorage.getItem(malformedKey)).toBeNull();
    const quarantined = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .find((key) => key?.startsWith('malformed-queue:quarantine:alice:'));
    expect(quarantined).toBeTruthy();
    expect(localStorage.getItem(String(quarantined))).toBe('{not-json');
  });

  it('aborts logout during retry delay before any cross-session replay', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(async () => new Response('', { status: 500 }));
    const queue = new OfflineQueueManager({
      storageKey: 'logout-retry-queue',
      autoSync: false,
      retryDelay: 60_000,
      maxRetries: 3,
      fetchFn: fetchFn as unknown as typeof fetch,
      csrfTokenProvider: async () => 'fresh-csrf',
      authUserProvider: async () => 'alice',
      replayLock: testReplayLock,
    });

    queue.initialize();
    queue.activateUser('alice');
    queue.enqueue({ method: 'PATCH', url: '/api/blips/a1', body: { content: 'keep' } });
    const syncPromise = queue.sync();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(queue.syncing).toBe(true);

    queue.deactivateUser();
    await syncPromise;
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(queue.userId).toBeNull();
    expect(queue.length).toBe(0);
    expect(queue.getPersistedQueue('alice')).toHaveLength(1);
  });

  it('recognizes cross-realm/jsdom AbortError values without relying on instanceof DOMException', async () => {
    const crossRealmAbort = Object.assign(new Error('aborted in another realm'), { name: 'AbortError' });
    const fetchFn = vi.fn(async () => Promise.reject(crossRealmAbort));
    const queue = new OfflineQueueManager({
      storageKey: 'domexception-queue',
      autoSync: false,
      fetchFn: fetchFn as unknown as typeof fetch,
      csrfTokenProvider: async () => 'fresh-csrf',
      authUserProvider: async () => 'alice',
      replayLock: testReplayLock,
    });

    queue.initialize();
    queue.activateUser('alice');
    queue.enqueue({ method: 'PATCH', url: '/api/blips/a1', body: { content: 'keep' } });
    expect(await queue.sync()).toEqual({ success: 0, failed: 0 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(queue.length).toBe(1);
    expect(queue.getQueue()[0]?.retries).toBe(0);
  });

  it('keeps production API mutations online-only instead of returning fake success', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    offlineQueue.initialize();
    offlineQueue.deactivateUser();

    const response = await api('/api/blips/b1', {
      method: 'PATCH',
      body: JSON.stringify({ content: 'must not queue' }),
    });

    expect(response).toMatchObject({ ok: false, status: 503 });
    expect(response.data).toEqual({ error: 'offline_mutation_not_supported' });
    expect(offlineQueue.length).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never persists invite/recovery secrets and redeems only online with fresh CSRF', async () => {
    const inviteToken = 'invite-secret-must-never-enter-local-storage';
    const ownerRecovery = 'owner-recovery-secret';
    sessionStorage.setItem('test:pending-invite', JSON.stringify({
      inviteToken,
      ownerRecovery,
      expiresAt: Date.now() + 60_000,
    }));
    offlineQueue.initialize();
    offlineQueue.activateUser('alice');
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url === '/api/auth/csrf') {
        document.cookie = 'XSRF-TOKEN=fresh-invite-csrf; path=/';
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      expect(url).toBe('/api/waves/invitations/accept');
      expect(init).toEqual(expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ token: inviteToken, ownerRecovery }),
        headers: expect.objectContaining({ 'x-csrf-token': 'fresh-invite-csrf' }),
      }));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const offlineResponse = await api('/api/waves/invitations/accept', {
      method: 'POST',
      // Defense in depth: even an unsafe caller override cannot bypass the
      // absolute secret-redemption denylist.
      queueable: true,
      body: JSON.stringify({ token: inviteToken, ownerRecovery }),
    });
    expect(offlineResponse).toMatchObject({ ok: false, status: 503 });
    expect(offlineResponse.data).toEqual({ error: 'online_required' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('test:pending-invite')).toContain(inviteToken);
    const durableValues = Array.from({ length: localStorage.length }, (_, index) => (
      localStorage.getItem(localStorage.key(index) || '') || ''
    )).join('\n');
    expect(durableValues).not.toContain(inviteToken);
    expect(durableValues).not.toContain(ownerRecovery);
    expect(offlineQueue.length).toBe(0);

    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    const onlineResponse = await api('/api/waves/invitations/accept', {
      method: 'POST',
      queueable: false,
      body: JSON.stringify({ token: inviteToken, ownerRecovery }),
    });
    expect(onlineResponse).toMatchObject({ ok: true, status: 200 });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    sessionStorage.removeItem('test:pending-invite');
    expect(sessionStorage.getItem('test:pending-invite')).toBeNull();
  });

  it('never queues sharing/access-control PATCH payloads even when requested', async () => {
    const privacySecret = 'private-team-policy-must-not-persist';
    offlineQueue.initialize();
    offlineQueue.activateUser('alice');
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const response = await api('/api/waves/w1/sharing', {
      method: 'PATCH',
      queueable: true,
      body: JSON.stringify({ visibility: 'private', ownerRecovery: privacySecret }),
    });
    expect(response).toMatchObject({ ok: false, status: 503 });
    expect(response.data).toEqual({ error: 'offline_mutation_not_supported' });
    expect(fetchSpy).not.toHaveBeenCalled();
    const durableValues = Array.from({ length: localStorage.length }, (_, index) => (
      localStorage.getItem(localStorage.key(index) || '') || ''
    )).join('\n');
    expect(durableValues).not.toContain(privacySecret);
    expect(offlineQueue.length).toBe(0);
  });
});

describe('client: modern shell auth controls', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    offlineQueue.destroy();
    yjsDocManager.destroy();
    resetPendingCollaborationChanges();
    vi.restoreAllMocks();
    sessionStorage.clear();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    offlineQueue.destroy();
    yjsDocManager.destroy();
    resetPendingCollaborationChanges();
    vi.restoreAllMocks();
  });

  it('transitions guest to signed-in identity and back through server logout', async () => {
    const alice: User = { id: 'alice-id', email: 'alice@example.com', name: 'Alice Example' };
    let sessionGone = false;
    const apiSpy = vi.spyOn(apiModule, 'api').mockImplementation(async (path) => {
      if (path === '/api/auth/oauth-status') {
        return {
          ok: true,
          status: 200,
          data: { google: false, facebook: false, microsoft: false, twitter: false, saml: false },
        };
      }
      if (path === '/api/auth/login' || (path === '/api/auth/me' && !sessionGone)) {
        return { ok: true, status: 200, data: alice };
      }
      if (path === '/api/auth/me') return { ok: false, status: 401, data: { error: 'unauthenticated' } };
      if (path === '/api/auth/logout') {
        sessionGone = true;
        return { ok: true, status: 200, data: { ok: true } };
      }
      return { ok: false, status: 404, data: { error: 'not_found' } };
    });

    function Harness(): JSX.Element {
      const [user, setUser] = useState<User | null>(null);
      return (
        <AuthProvider user={user} loading={false} onUserChange={setUser}>
          <ShellAuthControls />
        </AuthProvider>
      );
    }

    const { container, root } = renderElement(<Harness />);
    const signIn = container.querySelector('.shell-auth-sign-in') as HTMLButtonElement;
    expect(signIn?.textContent).toContain('Sign in');

    await act(async () => signIn.click());
    await flush();
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();

    const email = document.querySelector('input[type="email"]') as HTMLInputElement;
    const password = document.querySelector('input[type="password"]') as HTMLInputElement;
    await act(async () => {
      email.value = 'alice@example.com';
      email.dispatchEvent(new Event('input', { bubbles: true }));
      password.value = 'alice-password';
      password.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      (document.querySelector('.submit-btn') as HTMLButtonElement).click();
    });
    await flush();

    expect(container.textContent).toContain('Alice Example');
    expect(localStorage.getItem(AUTH_CHANGE_STORAGE_KEY)).toBeTruthy();
    // Production replay is kill-switched: authentication must not activate a
    // durable replay partition until endpoints are explicitly approved.
    expect(offlineQueue.userId).toBeNull();
    const logout = container.querySelector('.shell-auth-logout') as HTMLButtonElement;
    await act(async () => logout.click());
    await flush();

    expect(apiSpy).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(container.textContent).toContain('Sign in');
    expect(offlineQueue.userId).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it.each([
    { status: 401, keepsIdentity: false, label: 'already-expired server session' },
    { status: 503, keepsIdentity: true, label: 'retriable server failure' },
  ])('handles logout with an $label', async ({ status, keepsIdentity }) => {
    const alice: User = { id: 'alice-id', email: 'alice@example.com', name: 'Alice Example' };
    let sessionGone = false;
    vi.spyOn(apiModule, 'api').mockImplementation(async (path) => {
      if (path === '/api/auth/logout') {
        sessionGone = status === 401;
        return { ok: false, status, data: { error: status === 401 ? 'unauthenticated' : 'unavailable' } };
      }
      if (path === '/api/auth/me' && sessionGone) {
        return { ok: false, status: 401, data: { error: 'unauthenticated' } };
      }
      return { ok: true, status: 200, data: alice };
    });

    function Harness(): JSX.Element {
      const [user, setUser] = useState<User | null>(alice);
      return (
        <AuthProvider user={user} loading={false} onUserChange={setUser}>
          <ShellAuthControls />
        </AuthProvider>
      );
    }

    const { container, root } = renderElement(<Harness />);
    await act(async () => (container.querySelector('.shell-auth-logout') as HTMLButtonElement).click());
    await flush();
    expect(container.textContent?.includes('Alice Example')).toBe(keepsIdentity);
    expect(Boolean(container.querySelector('.shell-auth-sign-in'))).toBe(!keepsIdentity);
    act(() => root.unmount());
    container.remove();
  });

  it('closes the sign-in dialog with Escape and restores trigger focus', async () => {
    vi.spyOn(apiModule, 'api').mockResolvedValue({
      ok: true,
      status: 200,
      data: { google: false, facebook: false, microsoft: false, twitter: false, saml: false },
    });
    const { container, root } = renderElement(
      <AuthProvider user={null} loading={false}>
        <ShellAuthControls />
      </AuthProvider>,
    );
    const trigger = container.querySelector('.shell-auth-sign-in') as HTMLButtonElement;
    trigger.focus();
    await act(async () => trigger.click());
    await flush();
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    act(() => root.unmount());
    container.remove();
  });

  it('keeps the production replay queue unloaded before and after auth bootstrap', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    localStorage.setItem(
      offlineQueue.storageKeyForUser('alice-id'),
      JSON.stringify([mutation('alice-id')]),
    );
    let resolveMe!: (value: Awaited<ReturnType<typeof apiModule.api>>) => void;
    const pendingMe = new Promise<Awaited<ReturnType<typeof apiModule.api>>>((resolve) => {
      resolveMe = resolve;
    });
    vi.spyOn(apiModule, 'api').mockImplementation(async (path) => {
      if (path === '/api/auth/me') return pendingMe;
      if (path === '/api/topics') return { ok: true, status: 200, data: { topics: [], hasMore: false } };
      return { ok: true, status: 200, data: {} };
    });

    const { container, root } = renderElement(<RizzomaApp />);
    expect(container.textContent).toContain('Loading Rizzoma');
    expect(offlineQueue.userId).toBeNull();
    expect(offlineQueue.length).toBe(0);

    resolveMe({
      ok: true,
      status: 200,
      data: { id: 'alice-id', name: 'Alice Example', email: 'alice@example.com' },
    });
    await flush();
    expect(container.querySelector('.rizzoma-layout')).toBeTruthy();
    expect(offlineQueue.userId).toBeNull();
    expect(offlineQueue.length).toBe(0);

    act(() => root.unmount());
    container.remove();
  });

  it('renders the anonymous shell for PR66 read routes and gates New behind sign-in', async () => {
    vi.spyOn(apiModule, 'api').mockImplementation(async (path) => {
      if (path === '/api/auth/me') return { ok: false, status: 401, data: { error: 'unauthenticated' } };
      if (path === '/api/auth/oauth-status') {
        return {
          ok: true,
          status: 200,
          data: { google: false, facebook: false, microsoft: false, twitter: false, saml: false },
        };
      }
      if (path === '/api/topics') return { ok: true, status: 200, data: { topics: [], hasMore: false } };
      return { ok: true, status: 200, data: {} };
    });

    const { container, root } = renderElement(<RizzomaApp />);
    await flush();
    expect(container.querySelector('.rizzoma-layout')).toBeTruthy();
    expect(container.querySelector('.shell-auth-sign-in')).toBeTruthy();
    expect(container.querySelector('.rizzoma-auth-overlay')).toBeNull();

    await act(async () => {
      (container.querySelector('.new-button') as HTMLButtonElement).click();
    });
    await flush();
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();
    expect(container.querySelector('.create-topic-modal')).toBeNull();
    expect(offlineQueue.userId).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it('makes the authenticated shell read-only while offline', async () => {
    const alice: User = { id: 'alice-id', email: 'alice@example.com', name: 'Alice Example' };
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    vi.spyOn(apiModule, 'api').mockImplementation(async (path) => {
      if (path === '/api/auth/me') return { ok: true, status: 200, data: alice };
      if (path === '/api/topics') return { ok: true, status: 200, data: { topics: [], hasMore: false } };
      return { ok: true, status: 200, data: {} };
    });

    const { container, root } = renderElement(<RizzomaApp />);
    await flush();
    expect(container.querySelector('.offline-readonly-banner')?.textContent).toContain('Offline · read-only');
    expect(container.querySelector('.shell-auth-logout')).toBeTruthy();
    await act(async () => (container.querySelector('.new-button') as HTMLButtonElement).click());
    expect(container.querySelector('.create-topic-modal')).toBeNull();
    act(() => root.unmount());
    container.remove();
  });

  it('guards tab unload only while owner-scoped Yjs updates remain unacknowledged', () => {
    function GuardHarness(): null {
      useCollaborationUnloadGuard();
      return null;
    }
    const { container, root } = renderElement(<GuardHarness />);
    markCollaborationUpdatePending('alice', 'pending-blip');
    const blocked = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);

    acknowledgeCollaborationSnapshot('alice', 'pending-blip');
    const allowed = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(allowed);
    expect(allowed.defaultPrevented).toBe(false);
    act(() => root.unmount());
    container.remove();
  });

  it('rebootstraps a stale tab and quarantines A before rendering cross-tab user B', async () => {
    const alice: User = { id: 'alice', name: 'Alice' };
    const bob: User = { id: 'bob', name: 'Bob' };
    yjsDocManager.getDocument('same-cross-tab-blip', alice.id)
      .getText('default').insert(0, 'A unresolved');
    markCollaborationUpdatePending(alice.id, 'same-cross-tab-blip');
    vi.spyOn(apiModule, 'api').mockImplementation(async (path) => {
      if (path === '/api/auth/me') return { ok: true, status: 200, data: bob };
      return { ok: true, status: 200, data: {} };
    });

    function Harness(): JSX.Element {
      const [user, setUser] = useState<User | null>(alice);
      return (
        <AuthProvider user={user} loading={false} onUserChange={setUser}>
          <span data-testid="current-auth-user">{user?.id || 'guest'}</span>
        </AuthProvider>
      );
    }

    const { container, root } = renderElement(<Harness />);
    window.dispatchEvent(new StorageEvent('storage', {
      key: AUTH_CHANGE_STORAGE_KEY,
      newValue: JSON.stringify({ at: Date.now(), nonce: 'other-tab' }),
    }));
    await flush();

    expect(container.querySelector('[data-testid="current-auth-user"]')?.textContent).toBe('bob');
    expect(yjsDocManager.hasLiveDocument('same-cross-tab-blip', alice.id)).toBe(false);
    expect(yjsDocManager.hasQuarantinedDocument('same-cross-tab-blip', alice.id)).toBe(true);
    expect(yjsDocManager.getDocument('same-cross-tab-blip', bob.id).getText('default').toString()).toBe('');
    act(() => root.unmount());
    container.remove();
  });
});
