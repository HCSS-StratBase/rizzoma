import { useEffect, useState } from 'react';

export function Toast() {
  const [msg, setMsg] = useState<string | null>(null);
  const [type, setType] = useState<'info' | 'error'>('info');

  useEffect(() => {
    const onToast = (e: Event) => {
      const ce = e as CustomEvent<string | { message: string; type?: 'info' | 'error' }>;
      if (typeof ce.detail === 'string') {
        setType('info');
        setMsg(ce.detail);
      } else if (ce.detail && typeof ce.detail === 'object') {
        setType(ce.detail.type || 'info');
        setMsg(ce.detail.message);
      }
      setTimeout(() => setMsg(null), 3000);
    };
    window.addEventListener('toast', onToast as any);
    return () => window.removeEventListener('toast', onToast as any);
  }, []);

  if (!msg) return null;
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

