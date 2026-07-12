import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  pendingInvite: null as null | { token: string; waveId: string; createdAt: number },
  api: vi.fn(),
  ensureCsrf: vi.fn(async () => 'csrf'),
  refreshSocketSession: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('../client/lib/api', () => ({
  api: authState.api,
  ensureCsrf: authState.ensureCsrf,
}));
vi.mock('../client/lib/fragmentSecrets', () => ({
  clearOwnerRecoveryToken: vi.fn(),
  readPendingInvite: vi.fn(() => authState.pendingInvite),
  readOwnerRecoveryToken: vi.fn(() => null),
  scrubOwnerRecoveryFragment: vi.fn(() => false),
}));
vi.mock('../client/lib/capacitor-native', () => ({
  isNative: false,
  launchNativeOAuth: vi.fn(),
}));
vi.mock('../client/lib/socket', () => ({
  refreshSocketSession: authState.refreshSocketSession,
}));
vi.mock('../client/components/Toast', () => ({ toast: authState.toast }));

import { AuthPanel } from '../client/components/AuthPanel';

const oauthStatus = {
  google: true,
  facebook: true,
  microsoft: true,
  twitter: true,
  saml: true,
};

describe('client AuthPanel security and recovery behavior', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    authState.pendingInvite = null;
    vi.clearAllMocks();
    authState.api.mockImplementation(async (path: string) => (
      path === '/api/auth/oauth-status'
        ? { ok: true, status: 200, data: oauthStatus }
        : { ok: true, status: 200, data: { id: 'user-1', email: 'user@example.test' } }
    ));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderPanel(onSignedIn = vi.fn()) {
    await act(async () => {
      root.render(<AuthPanel onSignedIn={onSignedIn} />);
      await Promise.resolve();
    });
    return onSignedIn;
  }

  function setInput(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('does not offer Twitter for an email-bound invitation', async () => {
    authState.pendingInvite = { token: 'invite-token', waveId: 'wave-1', createdAt: Date.now() };
    await renderPanel();

    expect(container.querySelector('.twitter-auth-btn')).toBeNull();
    expect(container.textContent).toContain('X/Twitter cannot verify the email address on this invitation');
    expect(container.textContent).toContain('Create Account');
  });

  it('always clears busy state and shows a retryable error after a network rejection', async () => {
    authState.api.mockImplementation(async (path: string) => {
      if (path === '/api/auth/oauth-status') return { ok: true, status: 200, data: oauthStatus };
      throw new Error('network down');
    });
    await renderPanel();
    const inputs = container.querySelectorAll<HTMLInputElement>('input');
    await act(async () => {
      setInput(inputs[0]!, 'user@example.test');
      setInput(inputs[1]!, 'password123');
    });
    const submit = container.querySelector<HTMLButtonElement>('.submit-btn')!;

    await act(async () => {
      submit.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(submit.disabled).toBe(false);
    expect(submit.textContent).toContain('Sign In');
    expect(container.textContent).toContain('temporarily unreachable');
    expect(authState.toast).toHaveBeenCalledWith('Authentication request failed. Please try again.', 'error');
  });

  it('re-handshakes the socket before publishing a successful password login', async () => {
    const onSignedIn = await renderPanel();
    const inputs = container.querySelectorAll<HTMLInputElement>('input');
    await act(async () => {
      setInput(inputs[0]!, 'user@example.test');
      setInput(inputs[1]!, 'password123');
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.submit-btn')!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(authState.refreshSocketSession).toHaveBeenCalledTimes(1);
    expect(onSignedIn).toHaveBeenCalledWith({ id: 'user-1', email: 'user@example.test' });
    expect(authState.refreshSocketSession.mock.invocationCallOrder[0]).toBeLessThan(
      onSignedIn.mock.invocationCallOrder[0]!,
    );
  });
});
