import { useState } from 'react';
import { api } from '../lib/api';
import { toast } from './Toast';

type AuthUser = { id?: string; email?: string };

export function AuthPanel({ onSignedIn }: { onSignedIn: (u: AuthUser) => void }): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (kind: 'login' | 'register'): Promise<void> => {
    setError(null);
    if (!email.includes('@') || password.length < 6) { setError('Enter a valid email and 6+ char password'); return; }
    setBusy(true);
    const r = await api(`/api/auth/${kind}`, { method: 'POST', body: JSON.stringify({ email, password }) });
    setBusy(false);
    if (!r.ok) {
      setError(kind === 'login' ? 'Login failed' : 'Register failed');
      const reqId = (r as unknown as { requestId?: string | undefined }).requestId;
      const idTag = (reqId !== undefined && reqId !== '') ? ` (${reqId})` : '';
      toast(`${kind==='login'?'Login':'Register'} failed${idTag}`,'error');
    } else {
      onSignedIn(r.data as AuthUser);
      toast(kind==='login'?'Logged in':'Registered','info');
    }
  };

  return (
    <div>
      <h2>Auth</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button onClick={() => { void act('login'); }} disabled={busy}>Login</button>
        <button onClick={() => { void act('register'); }} disabled={busy}>Register</button>
      </div>
      {error !== null ? <div style={{ color: 'red', marginTop: 8 }}>{error}</div> : null}
    </div>
  );
}
