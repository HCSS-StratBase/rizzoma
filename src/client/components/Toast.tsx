import { useEffect, useState } from 'react';

type ToastDetail = string | { message: string; type?: 'info' | 'error' };
declare global {
  interface WindowEventMap {
    toast: CustomEvent<ToastDetail>;
  }
}

export function Toast() {
  const [msg, setMsg] = useState<string | null>(null);
  const [type, setType] = useState<'info' | 'error'>('info');

  useEffect(() => {
    const onToast = (e: CustomEvent<ToastDetail>) => {
      if (typeof e.detail === 'string') {
        setType('info');
        setMsg(e.detail);
      } else if (e.detail !== null && typeof e.detail === 'object') {
        setType(e.detail.type || 'info');
        setMsg(e.detail.message);
      }
      window.setTimeout(() => setMsg(null), 3000);
    };
    window.addEventListener('toast', onToast as EventListener);
    return () => window.removeEventListener('toast', onToast as EventListener);
  }, []);

  if (msg === null) return null;
  const bg = type === 'error' ? '#fce8e6' : '#e6f4ea';
  const color = type === 'error' ? '#d93025' : '#137333';
  return (
    <div style={{ position: 'fixed', bottom: 16, right: 16, background: bg, color, padding: '8px 12px', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
      {msg}
    </div>
  );
}

export function toast(message: string, type: 'info' | 'error' = 'info') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { message, type } }));
}
