import { useEffect, useState } from 'react';
import { api, ensureCsrf } from '../lib/api';
import { isNative, launchNativeOAuth } from '../lib/capacitor-native';
import {
  clearPasswordResetToken,
  clearOwnerRecoveryToken,
  readPendingInvite,
  readPasswordResetToken,
  readOwnerRecoveryToken,
  scrubPasswordResetFragment,
  scrubOwnerRecoveryFragment,
} from '../lib/fragmentSecrets';
import { toast } from './Toast';
import { announceAuthChange } from '../lib/authSessionSignal';
import { refreshSocketSession } from '../lib/socket';
import './AuthPanel.css';

export type AuthUser = { id?: string; email?: string };
type OAuthStatus = { google: boolean; facebook: boolean; microsoft: boolean; twitter: boolean; saml: boolean };
type AuthMode = 'login' | 'register' | 'request-reset' | 'complete-reset';

export function AuthPanel({
  onSignedIn,
  onPasswordResetExit,
}: {
  onSignedIn: (u: AuthUser) => void;
  onPasswordResetExit?: () => void;
}): JSX.Element {
  const [passwordResetMode, setPasswordResetMode] = useState(() => Boolean(scrubPasswordResetFragment()));
  const [recoveryMode, setRecoveryMode] = useState(() => Boolean(readOwnerRecoveryToken()));
  const [inviteRegistration] = useState(() => Boolean(readPendingInvite()));
  const [mode, setMode] = useState<AuthMode>(() => (
    readPasswordResetToken()
      ? 'complete-reset'
      : (readOwnerRecoveryToken() || readPendingInvite()) ? 'register' : 'login'
  ));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus>({ google: false, facebook: false, microsoft: false, twitter: false, saml: false });
  const canRegister = recoveryMode || inviteRegistration;

  // Check OAuth availability
  useEffect(() => {
    if (scrubPasswordResetFragment()) {
      setPasswordResetMode(true);
      setMode('complete-reset');
      return;
    }
    if (scrubOwnerRecoveryFragment()) {
      setRecoveryMode(true);
      setMode('register');
    }
  }, []);

  useEffect(() => {
    api<OAuthStatus>('/api/auth/oauth-status').then(res => {
      if (res.ok && res.data && typeof res.data === 'object') {
        setOauthStatus(res.data as OAuthStatus);
      }
    }).catch(() => {
      // OAuth status check failed, keep defaults (disabled)
    });
  }, []);

  // Pre-fill dev credentials to avoid blank landing with 401s during
  // automated smoke tests. Only triggers on true localhost hostnames
  // (localhost or 127.0.0.1, with or without port) — NOT on any host
  // that merely contains the substring "localhost", which previously
  // matched e.g. `capacitor://localhost` inside the native WebView and
  // caused the dev credentials to leak into the real Rizzoma sign-in
  // flow on mobile. 2026-04-14.
  useEffect(() => {
    if (initialized) return;
    const host = window?.location?.host || '';
    const hostname = window?.location?.hostname || '';
    const isLocalhost = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1';
    if (isLocalhost && (mode === 'login' || mode === 'register')) {
      setEmail('dev@example.com');
      setPassword('devpass123');
    }
    setInitialized(true);
  }, [initialized, mode]);

  // Inside the Capacitor native shell we cannot use window.location.href
  // for OAuth — Android WebView drops our overrideUserAgent on main-frame
  // navigations (Chromium bug 40450316), so Google rejects the request
  // as `disallowed_useragent`. Route through @capacitor/browser, which
  // launches Chrome Custom Tabs; the backend completes OAuth there and
  // hands back a one-time ticket via rizzoma://auth-callback that the
  // WebView redeems for a session cookie. See capacitor-native.ts.
  const handleGoogleSignIn = () => {
    if (isNative) { void launchNativeOAuth('google'); return; }
    window.location.href = '/api/auth/google';
  };

  const handleFacebookSignIn = () => {
    if (isNative) { void launchNativeOAuth('facebook'); return; }
    window.location.href = '/api/auth/facebook';
  };

  const handleMicrosoftSignIn = () => {
    if (isNative) { void launchNativeOAuth('microsoft'); return; }
    window.location.href = '/api/auth/microsoft';
  };

  const handleTwitterSignIn = () => {
    window.location.href = '/api/auth/twitter';
  };

  const handleSamlSignIn = () => {
    window.location.href = '/api/auth/saml';
  };

  const act = async (kind: 'login' | 'register'): Promise<void> => {
    setError(null);
    setNotice(null);
    const minimumPasswordLength = kind === 'register' ? 12 : 6;
    if (!email.includes('@') || password.length < minimumPasswordLength) {
      setError(`Enter a valid email and ${minimumPasswordLength}+ char password`);
      return;
    }
    setBusy(true);
    const ownerRecoveryToken = readOwnerRecoveryToken();
    try {
      await ensureCsrf();
      const inviteToken = readPendingInvite()?.token;
      const r = await api(`/api/auth/${kind}`, {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          ...(kind === 'register' && ownerRecoveryToken ? { ownerRecoveryToken } : {}),
          ...(kind === 'register' && inviteToken ? { inviteToken } : {}),
        }),
      });
      if (!r.ok) {
        const serverMsg = typeof r.data === 'object' && r.data && 'error' in r.data ? String((r.data as any).error) : '';
        const detail = serverMsg ? ` [${serverMsg}]` : ` [HTTP ${r.status}]`;
        setError(kind === 'login' ? `Invalid email or password${detail}` : `Registration failed${detail}`);
        const reqId = (r as unknown as { requestId?: string | undefined }).requestId;
        const idTag = (reqId !== undefined && reqId !== '') ? ` (${reqId})` : '';
        toast(`${kind === 'login' ? 'Login' : 'Register'} failed${detail}${idTag}`, 'error');
        if (kind === 'register' && ownerRecoveryToken && [400, 403, 404, 409, 410].includes(r.status)) {
          clearOwnerRecoveryToken();
          setRecoveryMode(false);
        }
      } else {
        if (kind === 'register' && ownerRecoveryToken) {
          clearOwnerRecoveryToken();
          setRecoveryMode(false);
        }
        // Socket.IO authorizes identity at connection time. Reconnect after an
        // in-place password login so an anonymous topic socket cannot retain
        // its old authorization for the new account.
        announceAuthChange();
        refreshSocketSession();
        onSignedIn(r.data as AuthUser);
        toast(kind === 'login' ? 'Welcome back!' : 'Account created!', 'info');
      }
    } catch {
      setError('Authentication service is temporarily unreachable. Please try again.');
      toast('Authentication request failed. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const requestPasswordReset = async (): Promise<void> => {
    setError(null);
    setNotice(null);
    if (!email.includes('@')) {
      setError('Enter a valid email address');
      return;
    }
    setBusy(true);
    try {
      await ensureCsrf();
      const response = await api('/api/auth/password-reset/request', {
        method: 'POST',
        queueable: false,
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        setError('Password recovery is temporarily unavailable. Please try again.');
        return;
      }
      setNotice('If that address has a password account, a reset link will be sent.');
    } catch {
      setError('Password recovery is temporarily unavailable. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const completePasswordReset = async (): Promise<void> => {
    setError(null);
    setNotice(null);
    const token = readPasswordResetToken();
    if (!token) {
      setError('This reset link is invalid or has expired. Request a new one.');
      return;
    }
    if (password.length < 12) {
      setError('Choose a password with at least 12 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await ensureCsrf();
      const response = await api('/api/auth/password-reset/complete', {
        method: 'POST',
        queueable: false,
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        const serverError = typeof response.data === 'object' && response.data && 'error' in response.data
          ? String((response.data as any).error)
          : '';
        if (serverError === 'invalid_or_expired_reset') {
          clearPasswordResetToken();
          setPasswordResetMode(false);
          setPassword('');
          setConfirmPassword('');
          setMode('request-reset');
          setError('This reset link is invalid or has expired. Request a new one.');
        } else {
          setError('Password reset could not be completed. Please try again.');
        }
        return;
      }
      clearPasswordResetToken();
      setPasswordResetMode(false);
      setPassword('');
      setConfirmPassword('');
      setMode('login');
      setNotice('Password changed. Sign in with your new password.');
      toast('Password changed. Sign in with your new password.', 'info');
      onPasswordResetExit?.();
    } catch {
      setError('Password reset could not be completed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !busy) {
      if (mode === 'request-reset') void requestPasswordReset();
      else if (mode === 'complete-reset') void completePasswordReset();
      else void act(mode);
    }
  };

  return (
    <div className="auth-panel">
      <h3 className="auth-title">{
        mode === 'request-reset'
          ? 'Reset your password'
          : mode === 'complete-reset'
            ? 'Choose a new password'
            : recoveryMode
              ? 'Recover your owner account'
              : mode === 'login' ? 'Sign in to continue' : 'Create an account'
      }</h3>

      {/* OAuth buttons */}
      {!recoveryMode && !passwordResetMode && mode !== 'request-reset' && <>
      <button
        className="oauth-btn google-btn"
        disabled={!oauthStatus.google}
        title={oauthStatus.google ? 'Sign in with Google' : 'Google sign-in not configured'}
        onClick={handleGoogleSignIn}
      >
        <span className="oauth-icon">G</span>
        Sign in with Google
      </button>
      <button
        className="oauth-btn facebook-btn"
        disabled={!oauthStatus.facebook}
        title={oauthStatus.facebook ? 'Sign in with Facebook' : 'Facebook sign-in not configured'}
        onClick={handleFacebookSignIn}
      >
        <span className="oauth-icon">f</span>
        Sign in with Facebook
      </button>
      <button
        className="oauth-btn microsoft-btn"
        disabled={!oauthStatus.microsoft}
        title={oauthStatus.microsoft ? 'Sign in with Microsoft' : 'Microsoft sign-in not configured'}
        onClick={handleMicrosoftSignIn}
      >
        <span className="oauth-icon">M</span>
        Sign in with Microsoft
      </button>
      {!isNative && !inviteRegistration && <button
        className="oauth-btn twitter-auth-btn"
        disabled={!oauthStatus.twitter}
        title={oauthStatus.twitter ? 'Sign in with X/Twitter' : 'X/Twitter sign-in not configured'}
        onClick={handleTwitterSignIn}
      >
        <span className="oauth-icon">X</span>
        Sign in with X/Twitter
      </button>}
      {!isNative && oauthStatus.saml && (
        <button
          className="oauth-btn saml-btn"
          onClick={handleSamlSignIn}
          title="Sign in with SSO"
        >
          <span className="oauth-icon">SSO</span>
          Sign in with SSO
        </button>
      )}
      {isNative && (oauthStatus.twitter || oauthStatus.saml) && (
        <p className="auth-provider-note">X/Twitter and organization SSO are currently available in the web app only.</p>
      )}
      {inviteRegistration && oauthStatus.twitter && (
        <p className="auth-provider-note">X/Twitter cannot verify the email address on this invitation. Use the invited email and password, or an email-bearing provider.</p>
      )}

      </>}

      {!recoveryMode && !passwordResetMode && mode !== 'request-reset' && (
        <div className="or-divider">{mode === 'login' ? 'or sign in with email' : 'or sign up with email'}</div>
      )}
      {recoveryMode && <p className="auth-recovery-note">Use the exact owner email address and choose a new password. This one-time recovery link cannot be used with social sign-in.</p>}
      {mode === 'request-reset' && (
        <p className="auth-recovery-note">Enter your account email. For privacy, the confirmation is the same whether or not an account exists.</p>
      )}
      {mode === 'complete-reset' && (
        <p className="auth-recovery-note">Use at least 12 characters. Completing this reset signs out every existing session.</p>
      )}

      <div className="login-form">
        {mode !== 'complete-reset' && (
          <input
            type="email"
            className="login-input"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={busy}
            autoComplete="email"
          />
        )}
        {mode !== 'request-reset' && (
          <input
            type="password"
            className="login-input"
            placeholder={mode === 'complete-reset' ? 'New password' : 'Password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={busy}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete={mode === 'complete-reset' ? 'new-password' : 'current-password'}
          />
        )}
        {mode === 'complete-reset' && (
          <input
            type="password"
            className="login-input"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={busy}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="new-password"
          />
        )}

        {error && <div className="auth-error">{error}</div>}
        {notice && <div className="auth-notice" role="status">{notice}</div>}

        <button
          className="submit-btn"
          onClick={() => {
            if (mode === 'request-reset') void requestPasswordReset();
            else if (mode === 'complete-reset') void completePasswordReset();
            else void act(mode);
          }}
          disabled={busy}
        >
          {mode === 'request-reset'
            ? (busy ? 'Sending...' : 'Send reset link')
            : mode === 'complete-reset'
              ? (busy ? 'Changing password...' : 'Change password')
              : busy
                ? (mode === 'login' ? 'Signing in...' : 'Creating account...')
                : (mode === 'login' ? 'Sign In' : 'Create Account')}
        </button>
      </div>

      {!recoveryMode && mode === 'request-reset' && <div className="login-footer">
        <a
          href="#"
          className="signup-link"
          onClick={(event) => {
            event.preventDefault();
            setError(null);
            setNotice(null);
            setMode('login');
            onPasswordResetExit?.();
          }}
        >
          Back to sign in
        </a>
      </div>}

      {!recoveryMode && mode !== 'request-reset' && mode !== 'complete-reset' && <div className="login-footer">
        {mode === 'login' ? (
          <>
            <a
              href="#"
              className="signup-link"
              onClick={(event) => {
                event.preventDefault();
                setError(null);
                setNotice(null);
                setPassword('');
                setMode('request-reset');
              }}
            >
              Forgot password?
            </a>
            <div className="auth-footer-secondary">
            {canRegister ? <>
              <span>Don't have an account? </span>
              <a
                href="#"
                className="signup-link"
                onClick={(e) => {
                  e.preventDefault();
                  setError(null);
                  setNotice(null);
                  setMode('register');
                }}
              >
                Sign up
              </a>
            </> : <span>New email/password accounts require an invitation. Sign in with an existing password or an available provider.</span>}
            </div>
          </>
        ) : (
          <>
            <span>Already have an account? </span>
            <a
              href="#"
              className="signup-link"
              onClick={(e) => {
                e.preventDefault();
                setError(null);
                setNotice(null);
                setMode('login');
              }}
            >
              Sign in
            </a>
          </>
        )}
      </div>}
    </div>
  );
}
