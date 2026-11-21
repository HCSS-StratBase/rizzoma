import { useEffect, useRef, useState } from 'react';

type ToastDetail = string | { message: string; type?: 'info' | 'error' };
declare global {
  interface WindowEventMap {
    toast: CustomEvent<ToastDetail>;
  }
}

export function Toast() {
  const [msg, setMsg] = useState<string | null>(null);
  const [type, setType] = useState<'info' | 'error'>('info');
  const timer = useRef<number | undefined>(undefined);
  // An error that is on screen is not replaced by a friendly message that arrives within its 3 seconds ("Welcome back!" hid
  // "This invitation is invalid" right after sign-in).
  const shownError = useRef(false);

  useEffect(() => {
    const onToast = (e: CustomEvent<ToastDetail>) => {
      // Once the session has expired, only that message stays: a follow-up "Failed to ..." toast must not replace it.
      const text = typeof e.detail === 'string' ? e.detail : e.detail?.message;
      if ((window as unknown as { __rizzomaSessionExpired?: boolean }).__rizzomaSessionExpired && !/session has expired/i.test(text || '')) return;
      const incomingType = typeof e.detail === 'string' ? 'info' : (e.detail?.type || 'info');
      if (shownError.current && incomingType !== 'error') return;
      shownError.current = incomingType === 'error';
      if (typeof e.detail === 'string') {
        setType('info');
        setMsg(e.detail);
      } else if (e.detail !== null && typeof e.detail === 'object') {
        setType(e.detail.type || 'info');
        setMsg(e.detail.message);
      }
      // One timer: an earlier toast's timeout must not clear a newer message.
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { shownError.current = false; setMsg(null); }, 3000);
    };
    window.addEventListener('toast', onToast as EventListener);
    return () => window.removeEventListener('toast', onToast as EventListener);
  }, []);

  if (msg === null) return null;
  const bg = type === 'error' ? '#fce8e6' : '#e6f4ea';
  const color = type === 'error' ? '#d93025' : '#137333';
  return (
    <div
      data-testid="toast"
      className={`toast toast-${type}`}
      style={{ position: 'fixed', zIndex: 100000, bottom: 16, right: 90, background: bg, color, padding: '8px 12px', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
    >
      {msg}
    </div>
  );
}

export function toast(message: string, type: 'info' | 'error' = 'info') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { message, type } }));
}
