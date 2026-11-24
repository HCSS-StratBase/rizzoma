import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../lib/api';
import { toast } from '../Toast';
import './BlipSendModal.css';

interface Person { userId: string; name?: string; email?: string }
interface RecipientResult {
  userId?: string; email?: string; name?: string;
  status: 'delivered' | 'no_access' | 'no_account' | 'error';
  inApp: boolean;
  emailStatus: 'not_requested' | 'sent' | 'suppressed' | 'failed' | 'skipped';
  error?: string;
}
interface SendRecord { id: string; createdAt: number; message?: string; sendEmail: boolean; recipients: RecipientResult[] }

export function describeRecipient(r: RecipientResult): string {
  const who = r.name || r.email || r.userId || 'Unknown';
  if (r.status === 'no_access') return `${who}: not sent. They cannot open this topic yet. Invite them to the topic first.`;
  if (r.status === 'no_account') return `${who}: not sent. No Rizzoma account with that address.`;
  if (r.status === 'error') return `${who}: not sent (${r.error === 'cannot_send_to_yourself' ? 'that is you' : 'error'}).`;
  const mail = r.emailStatus === 'sent' ? ' and emailed'
    : r.emailStatus === 'suppressed' ? ' (test address, no email sent)'
    : r.emailStatus === 'failed' ? ' (email FAILED)'
    : r.emailStatus === 'skipped' ? ' (no email address on file)' : '';
  return `${who}: delivered to their Mentions${mail}.`;
}

export function BlipSendModal({ blipId, onClose }: { blipId: string; onClose: () => void }): JSX.Element {
  const waveId = blipId.split(':')[0] || '';
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<RecipientResult[] | null>(null);
  const [history, setHistory] = useState<SendRecord[]>([]);

  const loadHistory = () => {
    void api<{ sends?: SendRecord[] }>(`/api/blips/${encodeURIComponent(blipId)}/sends`).then((r) => {
      setHistory(r.ok && Array.isArray((r.data as any)?.sends) ? (r.data as any).sends : []);
    }).catch(() => setHistory([]));
  };

  useEffect(() => {
    let live = true;
    void (async () => {
      const [me, parts] = await Promise.all([
        api<{ id?: string }>('/api/auth/me').catch(() => null),
        api<{ participants?: Array<{ userId?: string; name?: string; email?: string; status?: string }> }>(`/api/waves/${encodeURIComponent(waveId)}/participants`).catch(() => null),
      ]);
      if (!live) return;
      const myId = (me as any)?.data?.id;
      const list = ((parts as any)?.data?.participants || [])
        .filter((p: any) => p.userId && !String(p.userId).startsWith('invite:') && p.userId !== myId && (p.status === 'accepted' || p.status === undefined))
        .map((p: any) => ({ userId: p.userId, name: p.name || p.email || 'Unnamed person', email: p.name ? p.email : undefined }));
      setPeople(list);
      setLoading(false);
    })();
    loadHistory();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blipId]);

  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const typedEmails = typed.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const canSend = !busy && (picked.size + typedEmails.length) > 0;

  const submit = async () => {
    setBusy(true);
    const to = [
      ...[...picked].map((userId) => ({ userId })),
      ...typedEmails.map((email) => ({ email })),
    ];
    const res = await api<{ results?: RecipientResult[] }>(`/api/blips/${encodeURIComponent(blipId)}/send`, {
      method: 'POST',
      body: JSON.stringify({ to, message: message.trim() || undefined, sendEmail }),
    });
    setBusy(false);
    if (!res.ok) {
      toast('Could not send. Nothing was sent. Please try again.', 'error');
      return;
    }
    const results = (res.data as any)?.results || [];
    setOutcome(results);
    const ok = results.filter((r: RecipientResult) => r.status === 'delivered').length;
    toast(ok > 0 ? `Sent to ${ok} ${ok === 1 ? 'person' : 'people'}` : 'Not sent to anyone, see details', ok > 0 ? 'info' : 'error');
    loadHistory();
  };

  // Rendered into document.body: inside a blip, an ancestor's transform/overflow clipped the dialog to the blip's box.
  return createPortal(
    <div className="blip-send-overlay" role="dialog" aria-modal="true" aria-label="Send this blip" data-testid="blip-send-modal" onClick={onClose}>
      <div className="blip-send-card" onClick={(e) => e.stopPropagation()}>
        <div className="blip-send-head">
          <strong>Send this blip to…</strong>
          <button type="button" className="blip-send-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        {outcome ? (
          <div className="blip-send-outcome" data-testid="blip-send-outcome">
            <p className="blip-send-sub">Result</p>
            <ul>{outcome.map((r, i) => <li key={i} className={`s-${r.status}`}>{describeRecipient(r)}</li>)}</ul>
            <div className="blip-send-actions">
              <button type="button" onClick={() => setOutcome(null)}>Send to someone else</button>
              <button type="button" className="primary" onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <>
            <p className="blip-send-sub">People in this topic</p>
            <div className="blip-send-people" data-testid="blip-send-people">
              {loading && <div className="blip-send-empty">Loading…</div>}
              {!loading && people.length === 0 && <div className="blip-send-empty">No one else in this topic yet.</div>}
              {people.map((p) => (
                <label key={p.userId} className="blip-send-person">
                  <input type="checkbox" checked={picked.has(p.userId)} onChange={() => toggle(p.userId)} />
                  <span>{p.name || p.email || p.userId}{p.name && p.email ? <em> {p.email}</em> : null}</span>
                </label>
              ))}
            </div>
            <label className="blip-send-field">
              <span>Or an email address of someone in this topic</span>
              <input type="text" value={typed} placeholder="name@example.org" onChange={(e) => setTyped(e.target.value)} data-testid="blip-send-email" />
            </label>
            <label className="blip-send-field">
              <span>Message (optional)</span>
              <textarea rows={2} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} />
            </label>
            <label className="blip-send-check">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              <span>Also email them a link to this blip</span>
            </label>
            <p className="blip-send-note">They get it in their Mentions. People who cannot open the topic are not sent anything: invite them first.</p>
            <div className="blip-send-actions">
              <button type="button" onClick={onClose}>Cancel</button>
              <button type="button" className="primary" disabled={!canSend} onClick={() => void submit()} data-testid="blip-send-submit">{busy ? 'Sending…' : 'Send'}</button>
            </div>
          </>
        )}
        {history.length > 0 && (
          <div className="blip-send-history" data-testid="blip-send-history">
            <p className="blip-send-sub">Sent from this blip</p>
            <ul>
              {history.slice(0, 8).map((h) => (
                <li key={h.id}>
                  <span className="when">{new Date(h.createdAt).toLocaleString()}</span>
                  <ul>{h.recipients.map((r, i) => <li key={i} className={`s-${r.status}`}>{describeRecipient(r)}</li>)}</ul>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
