import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { LogIn, LogOut, UserRound, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { AuthPanel } from './AuthPanel';
import { toast } from './Toast';
import { useOnlineState } from '../hooks/useOnlineState';
import './ShellAuthControls.css';

interface ShellAuthControlsProps {
  compact?: boolean;
  showIdentity?: boolean;
}

function initials(value: string): string {
  const parts = value.trim().split(/[\s@._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

export function ShellAuthControls({
  compact = false,
  showIdentity = true,
}: ShellAuthControlsProps): JSX.Element {
  const { user, loading, logout, refresh } = useAuth();
  const isOnline = useOnlineState();
  const [showSignIn, setShowSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  const identity = user?.name || user?.email || user?.id || '';

  const requestSignIn = useCallback(() => {
    if (!isOnline) {
      toast('Reconnect to sign in.', 'info');
      return;
    }
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : triggerRef.current;
    setShowSignIn(true);
  }, [isOnline]);

  const closeSignIn = useCallback(() => {
    setShowSignIn(false);
    window.requestAnimationFrame(() => restoreFocusRef.current?.focus());
  }, []);

  useEffect(() => {
    const handleRequestSignIn = () => {
      if (!user) requestSignIn();
    };
    window.addEventListener('rizzoma:request-sign-in', handleRequestSignIn);
    return () => window.removeEventListener('rizzoma:request-sign-in', handleRequestSignIn);
  }, [requestSignIn, user]);

  useEffect(() => {
    if (!showSignIn) return;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ) ?? []).filter((element) => element.offsetParent !== null);
    const initial = dialog?.querySelector<HTMLElement>('input[type="email"], input:not([disabled])')
      ?? focusable()[0];
    window.requestAnimationFrame(() => initial?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSignIn();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeSignIn, showSignIn]);

  useEffect(() => {
    if (!isOnline && showSignIn) closeSignIn();
  }, [closeSignIn, isOnline, showSignIn]);

  const handleLogout = async () => {
    setBusy(true);
    try {
      await logout();
      closeSignIn();
      toast('Logged out', 'info');
    } catch {
      toast('Logout failed. Your session is still active.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`shell-auth${compact ? ' shell-auth--compact' : ''}${showIdentity ? '' : ' shell-auth--action-only'}`}>
      {user ? (
        <div className="shell-auth-signed-in" title={`Signed in as ${identity}`}>
          {showIdentity && (
            <>
              <span className="shell-auth-avatar" aria-hidden="true">
                {initials(identity)}
              </span>
              <span className="shell-auth-identity-text">{identity}</span>
            </>
          )}
          <button
            type="button"
            className="shell-auth-action shell-auth-logout"
            onClick={() => { void handleLogout(); }}
            disabled={busy || loading}
            aria-label={`Log out ${identity}`}
            title="Log out"
          >
            <LogOut size={16} aria-hidden="true" />
            <span>{busy ? 'Leaving…' : 'Logout'}</span>
          </button>
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className="shell-auth-action shell-auth-sign-in"
          onClick={requestSignIn}
          disabled={loading || !isOnline}
          title={isOnline ? 'Sign in' : 'Reconnect to sign in'}
        >
          <LogIn size={17} aria-hidden="true" />
          <span>Sign in</span>
        </button>
      )}

      {showSignIn && !user && (
        <div
          className="shell-auth-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSignIn();
          }}
        >
          <section
            ref={dialogRef}
            className="shell-auth-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <header className="shell-auth-modal-header">
              <span className="shell-auth-modal-icon" aria-hidden="true"><UserRound size={20} /></span>
              <h2 id={titleId}>Sign in to Rizzoma</h2>
              <button
                type="button"
                className="shell-auth-modal-close"
                onClick={closeSignIn}
                aria-label="Close sign-in dialog"
              >
                <X size={19} aria-hidden="true" />
              </button>
            </header>
            <AuthPanel
              onSignedIn={() => {
                void refresh().then(closeSignIn);
              }}
            />
          </section>
        </div>
      )}
    </div>
  );
}
