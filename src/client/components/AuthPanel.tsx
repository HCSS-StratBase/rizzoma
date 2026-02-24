import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { toast } from './Toast';
import './AuthPanel.css';

type AuthUser = { id?: string; email?: string };
type OAuthStatus = { google: boolean; facebook: boolean; microsoft: boolean; saml: boolean };

export function AuthPanel({ onSignedIn }: { onSignedIn: (u: AuthUser) => void }): JSX.Element {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus>({ google: false, facebook: false, microsoft: false, saml: false });

  // Check OAuth availability
  useEffect(() => {
    api<OAuthStatus>('/api/auth/oauth-status').then(res => {
      if (res.ok && res.data && typeof res.data === 'object') {
        setOauthStatus(res.data as OAuthStatus);
      }
    }).catch(() => {
      // OAuth status check failed, keep defaults (disabled)
    });
  }, []);

  // Pre-fill dev credentials to avoid blank landing with 401s during smoke
  useEffect(() => {
    if (initialized) return;
    const host = window?.location?.host || '';
    if (host.includes('localhost')) {
      setEmail('dev@example.com');
      setPassword('devpass123');
    }
    setInitialized(true);
  }, [initialized]);

  const handleGoogleSignIn = () => {
    window.location.href = '/api/auth/google';
  };

  const handleFacebookSignIn = () => {
    window.location.href = '/api/auth/facebook';
  };

  const handleMicrosoftSignIn = () => {
    window.location.href = '/api/auth/microsoft';
  };

  const handleSamlSignIn = () => {
    window.location.href = '/api/auth/saml';
  };

  const act = async (kind: 'login' | 'register'): Promise<void> => {
    setError(null);
    if (!email.includes('@') || password.length < 6) {
      setError('Enter a valid email and 6+ char password');
      return;
    }
    setBusy(true);
    const r = await api(`/api/auth/${kind}`, { method: 'POST', body: JSON.stringify({ email, password }) });
    setBusy(false);
    if (!r.ok) {
      const serverMsg = typeof r.data === 'object' && r.data && 'error' in r.data ? String((r.data as any).error) : '';
      const detail = serverMsg ? ` [${serverMsg}]` : ` [HTTP ${r.status}]`;
      setError(kind === 'login' ? `Invalid email or password${detail}` : `Registration failed${detail}`);
      const reqId = (r as unknown as { requestId?: string | undefined }).requestId;
      const idTag = (reqId !== undefined && reqId !== '') ? ` (${reqId})` : '';
      toast(`${kind === 'login' ? 'Login' : 'Register'} failed${detail}${idTag}`, 'error');
    } else {
      onSignedIn(r.data as AuthUser);
      toast(kind === 'login' ? 'Welcome back!' : 'Account created!', 'info');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !busy) {
      void act(mode);
    }
  };

  return (
    <div className="auth-panel">
      <h3 className="auth-title">{mode === 'login' ? 'Sign in to continue' : 'Create an account'}</h3>

      {/* OAuth buttons */}
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
      {oauthStatus.saml && (
        <button
          className="oauth-btn saml-btn"
          onClick={handleSamlSignIn}
          title="Sign in with SSO"
        >
          <span className="oauth-icon">SSO</span>
          Sign in with SSO
        </button>
      )}

      <div className="or-divider">{mode === 'login' ? 'or sign in with email' : 'or sign up with email'}</div>

      <div className="login-form">
        <input
          type="email"
          className="login-input"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={busy}
        />
        <input
          type="password"
          className="login-input"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={busy}
          autoCapitalize="off"
          autoCorrect="off"
        />

        {error && <div className="auth-error">{error}</div>}

        <button
          className="submit-btn"
          onClick={() => { void act(mode); }}
          disabled={busy}
        >
          {busy ? (mode === 'login' ? 'Signing in...' : 'Creating account...') : (mode === 'login' ? 'Sign In' : 'Create Account')}
        </button>
      </div>

      <div className="login-footer">
        {mode === 'login' ? (
          <>
            <span>Don't have an account? </span>
            <a
              href="#"
              className="signup-link"
              onClick={(e) => {
                e.preventDefault();
                setError(null);
                setMode('register');
              }}
            >
              Sign up
            </a>
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
                setMode('login');
              }}
            >
              Sign in
            </a>
          </>
        )}
      </div>
    </div>
  );
}
