import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  pendingInvite: null as null | { token: string; waveId: string; createdAt: number },
  passwordResetToken: null as string | null,
  api: vi.fn(),
  ensureCsrf: vi.fn(async () => 'csrf'),
  refreshSocketSession: vi.fn(),
  resetSocketForAuthTransition: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('../client/lib/api', () => ({
  api: authState.api,
  ensureCsrf: authState.ensureCsrf,
}));
vi.mock('../client/lib/fragmentSecrets', () => ({
  clearPasswordResetToken: vi.fn(() => { authState.passwordResetToken = null; }),
  clearOwnerRecoveryToken: vi.fn(),
  readPendingInvite: vi.fn(() => authState.pendingInvite),
  readPasswordResetToken: vi.fn(() => authState.passwordResetToken),
  readOwnerRecoveryToken: vi.fn(() => null),
  scrubPasswordResetFragment: vi.fn(() => authState.passwordResetToken),
  scrubOwnerRecoveryFragment: vi.fn(() => false),
}));
vi.mock('../client/lib/capacitor-native', () => ({
  isNative: false,
  launchNativeOAuth: vi.fn(),
}));
vi.mock('../client/lib/socket', () => ({
  refreshSocketSession: authState.refreshSocketSession,
  resetSocketForAuthTransition: authState.resetSocketForAuthTransition,
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
    authState.passwordResetToken = null;
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

  async function renderPanel(onSignedIn = vi.fn(), onPasswordResetExit = vi.fn()) {
    await act(async () => {
      root.render(<AuthPanel onSignedIn={onSignedIn} onPasswordResetExit={onPasswordResetExit} />);
      await Promise.resolve();
    });
    return { onSignedIn, onPasswordResetExit };
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
    const { onSignedIn } = await renderPanel();
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

    expect(authState.api).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
    await vi.waitFor(() => expect(authState.refreshSocketSession).toHaveBeenCalledTimes(1));
    expect(onSignedIn).toHaveBeenCalledWith({ id: 'user-1', email: 'user@example.test' });
    expect(authState.refreshSocketSession.mock.invocationCallOrder[0]).toBeLessThan(
      onSignedIn.mock.invocationCallOrder[0]!,
    );
  });

  it('requests recovery with the generic response and always releases busy state', async () => {
    await renderPanel();
    await act(async () => {
      container.querySelector<HTMLAnchorElement>('.login-footer .signup-link')!.click();
    });
    const emailInput = container.querySelector<HTMLInputElement>('input[type="email"]')!;
    await act(async () => setInput(emailInput, 'known@example.test'));
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.submit-btn')!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(authState.api).toHaveBeenCalledWith('/api/auth/password-reset/request', expect.objectContaining({
      method: 'POST',
      queueable: false,
      body: JSON.stringify({ email: 'known@example.test' }),
    }));
    expect(container.textContent).toContain('If that address has a password account');
    expect(container.querySelector<HTMLButtonElement>('.submit-btn')!.disabled).toBe(false);
  });

  it('completes a fragment-backed reset, clears the bearer, and exits the forced reset surface', async () => {
    authState.passwordResetToken = 'a'.repeat(43);
    const { onPasswordResetExit } = await renderPanel();
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="password"]');
    await act(async () => {
      setInput(inputs[0]!, 'new-secure-password');
      setInput(inputs[1]!, 'new-secure-password');
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.submit-btn')!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(authState.api).toHaveBeenCalledWith('/api/auth/password-reset/complete', expect.objectContaining({
      method: 'POST',
      queueable: false,
      body: JSON.stringify({ token: 'a'.repeat(43), password: 'new-secure-password' }),
    }));
    expect(authState.passwordResetToken).toBeNull();
    expect(onPasswordResetExit).toHaveBeenCalledTimes(1);
    expect(authState.toast).toHaveBeenCalledWith('Password changed. Sign in with your new password.', 'info');
  });

  it('does not submit mismatched reset passwords', async () => {
    authState.passwordResetToken = 'b'.repeat(43);
    await renderPanel();
    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="password"]');
    await act(async () => {
      setInput(inputs[0]!, 'new-secure-password');
      setInput(inputs[1]!, 'different-password');
      container.querySelector<HTMLButtonElement>('.submit-btn')!.click();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Passwords do not match');
    expect(authState.api).not.toHaveBeenCalledWith('/api/auth/password-reset/complete', expect.anything());
    expect(container.querySelector<HTMLButtonElement>('.submit-btn')!.disabled).toBe(false);
  });
});
