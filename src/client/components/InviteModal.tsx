import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { api, ensureCsrf } from '../lib/api';
import { toast } from './Toast';
import './InviteModal.css';

interface Participant {
  id?: string;
  name?: string;
  email?: string;
  avatar?: string;
  role?: string;
  status?: string;
}

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicId: string;
  topicTitle: string;
}

type InviteRole = 'viewer' | 'commenter' | 'editor';
const ROLE_LABELS: Record<InviteRole, string> = { editor: 'Editor', commenter: 'Commenter', viewer: 'Reader' };

export function InviteModal({ isOpen, onClose, topicId, topicTitle: _topicTitle }: InviteModalProps): JSX.Element | null {
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<InviteRole>('editor');
  const [sending, setSending] = useState(false);
  const [sharingLevel, setSharingLevel] = useState<'private' | 'link' | 'public' | 'unknown'>('unknown');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contacts, setContacts] = useState<Array<{ userId: string; name: string; email: string; avatar?: string }>>([]);

  // People the user already works with (original Rizzoma lists contacts in the Invite dialog).
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void api<{ contacts?: Array<{ userId: string; name: string; email: string; avatar?: string }> }>('/api/waves/contacts/suggest').then((res) => {
      if (cancelled) return;
      const list = res.ok && res.data ? (res.data as { contacts?: typeof contacts }).contacts : undefined;
      setContacts(Array.isArray(list) ? list : []);
    }).catch(() => { if (!cancelled) setContacts([]); });
    return () => { cancelled = true; };
  }, [isOpen]);

  // Sharing level decides how the "copy link" action is worded (a private link does not grant access).
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void api(`/api/waves/${encodeURIComponent(topicId)}/sharing`).then((response) => {
      if (cancelled || !response.ok || !response.data || typeof response.data !== 'object') return;
      const level = String((response.data as any).sharing?.shareLevel || 'unknown');
      if (level === 'private' || level === 'link' || level === 'public') setSharingLevel(level);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [isOpen, topicId]);

  // Topic members shown in the legacy "manage members" list. No invented fallback member on failure.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void api<{ participants: Participant[]; canManage?: boolean }>(`/api/waves/${encodeURIComponent(topicId)}/participants`).then((res) => {
      if (cancelled) return;
      const body = res.ok && res.data ? (res.data as { participants?: Participant[]; canManage?: boolean }) : undefined;
      const list = body?.participants;
      // A removed member stays on the server as status "declined": never list it.
      setParticipants(Array.isArray(list) ? list.filter((p) => p.status !== 'declined') : []);
      setCanManage(body?.canManage === true);
    }).catch(() => {
      if (!cancelled) setParticipants([]);
    });
    return () => { cancelled = true; };
  }, [isOpen, topicId, reloadTick]);

  if (!isOpen) return null;

  const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const resolveContact = (token: string): string | null => {
    const t = token.trim().toLowerCase();
    if (!t) return null;
    const exact = contacts.filter((c) => c.name.toLowerCase() === t);
    if (exact.length === 1) return exact[0]!.email;
    const partial = contacts.filter((c) => c.name.toLowerCase().includes(t));
    return partial.length === 1 ? partial[0]!.email : null;
  };
  const currentToken = emails.split(/[,;\n]/).pop()?.trim() || '';
  const taken = new Set(emails.split(/[,;\n]/).map((e) => e.trim().toLowerCase()).filter(Boolean));
  const memberEmails = new Set(participants.map((p) => String(p.email || '').toLowerCase()));
  const suggestions = contacts
    .filter((c) => !taken.has(c.email) && !memberEmails.has(c.email))
    .filter((c) => !currentToken || c.name.toLowerCase().includes(currentToken.toLowerCase()) || c.email.includes(currentToken.toLowerCase()))
    .slice(0, 8);
  const pickContact = (email: string) => {
    const parts = emails.split(/[,;\n]/);
    parts.pop();
    setEmails([...parts.map((p) => p.trim()).filter(Boolean), email].join(', ') + ', ');
  };

  const handleInvite = async (): Promise<void> => {
    const rawEmails = emails.split(/[,;\n]/).map((entry) => entry.trim().toLowerCase()).filter(Boolean)
      .map((entry) => (isEmail(entry) ? entry : (resolveContact(entry) || entry)));
    const invalid = rawEmails.filter((email) => !isEmail(email));
    const emailList = [...new Set(rawEmails)];

    if (emailList.length === 0 || invalid.length > 0) {
      toast(invalid.length > 0
        ? `No contact or email address matches: ${invalid.join(', ')}. Pick a suggestion or type an email address.`
        : 'Please enter at least one valid email address', 'error');
      return;
    }
    if (emailList.length > 20) {
      toast('You can invite at most 20 participants at a time', 'error');
      return;
    }

    setSending(true);
    try {
      await ensureCsrf();
      const response = await api(`/api/waves/${encodeURIComponent(topicId)}/participants`, {
        method: 'POST',
        body: JSON.stringify({
          emails: emailList,
          role,
        }),
      });

      if (!response.ok) {
        toast('Failed to send invitations', 'error');
        return;
      }
      const results = typeof response.data === 'object' && response.data
        ? ((response.data as any).invited as Array<{ email?: string; ok?: boolean; status?: string }> | undefined) || []
        : [];
      const successful = results.filter((result) => result.ok === true);
      const failed = results.filter((result) => result.ok !== true);
      if (results.length === 0) {
        toast('The server did not return invitation delivery status. Please retry.', 'error');
        return;
      }
      if (failed.length > 0) {
        setEmails(failed.map((result) => result.email).filter(Boolean).join(', '));
        toast(`${successful.length} invitation(s) succeeded; ${failed.length} failed. Failed addresses remain for retry.`, 'error');
        return;
      }
      toast(`${successful.length} invitation(s) sent or already accepted`);
      setEmails('');
      onClose();
    } catch {
      toast('Invitation delivery could not reach the server. Please try again.', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/#/topic/${topicId}`;
    navigator.clipboard.writeText(url).then(() => {
      toast(sharingLevel === 'private' || sharingLevel === 'unknown'
        ? 'Private topic link copied. Recipients still need an invitation.'
        : 'Topic link copied to clipboard');
    }).catch(() => {
      toast('Failed to copy link', 'error');
    });
  };

  const linkHint = sharingLevel === 'private' || sharingLevel === 'unknown'
    ? 'Copy link copies the topic address (does not grant access; invitation required).'
    : 'Copy link shares a direct link to this topic.';

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Select role / Remove act on the ticked members, owner only. The owner row is never
  // changed or removed (the server refuses it as well).
  const selectedMembers = participants.filter((p, idx) => selectedIds.has(p.id || String(idx)));
  const actionable = selectedMembers.filter((p) => p.role !== 'owner' && p.id);
  const applyRole = async (newRole: InviteRole): Promise<void> => {
    setRoleMenuOpen(false);
    if (actionable.length === 0) {
      toast('The owner\'s role cannot be changed', 'error');
      return;
    }
    setBusy(true);
    try {
      await ensureCsrf();
      const results = await Promise.all(actionable.map((p) => api(
        `/api/waves/${encodeURIComponent(topicId)}/participants/${encodeURIComponent(String(p.id))}`,
        { method: 'PATCH', queueable: false, body: JSON.stringify({ role: newRole }) },
      )));
      const failed = results.filter((r) => !r.ok).length;
      toast(failed ? `${failed} role change(s) failed` : `Role set to ${ROLE_LABELS[newRole]} for ${actionable.length} member(s)`, failed ? 'error' : undefined);
      setSelectedIds(new Set());
      setReloadTick((n) => n + 1);
    } catch {
      toast('Could not change the role. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };
  const removeSelected = async (): Promise<void> => {
    setRoleMenuOpen(false);
    if (actionable.length === 0) {
      toast('The owner cannot be removed', 'error');
      return;
    }
    const names = actionable.map((p) => p.name || p.email || 'member').join(', ');
    if (!window.confirm(`Remove ${actionable.length === 1 ? names : `${actionable.length} members (${names})`} from this topic?`)) return;
    setBusy(true);
    try {
      await ensureCsrf();
      const results = await Promise.all(actionable.map((p) => api(
        `/api/waves/${encodeURIComponent(topicId)}/participants/${encodeURIComponent(String(p.id))}`,
        { method: 'DELETE', queueable: false },
      )));
      const failed = results.filter((r) => !r.ok).length;
      toast(failed ? `${failed} removal(s) failed` : `Removed ${actionable.length} member(s)`, failed ? 'error' : undefined);
      setSelectedIds(new Set());
      setReloadTick((n) => n + 1);
    } catch {
      toast('Could not remove the members. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === participants.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(participants.map((p, idx) => p.id || String(idx))));
    }
  };

  return (
    <div className="invite-modal-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="invite-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="invite-input-row">
          <input
            id="invite-emails"
            type="text"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="Add by email or name..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void handleInvite();
              }
            }}
            autoFocus
          />
          <select
            className="invite-role-select"
            aria-label="Access role for new invitations"
            value={role}
            onChange={(event) => setRole(event.target.value as InviteRole)}
          >
            <option value="viewer">Reader</option>
            <option value="commenter">Commenter</option>
            <option value="editor">Editor</option>
          </select>
        </div>

        {suggestions.length > 0 && (
          <ul className="invite-suggestions" role="listbox" aria-label="Contacts" data-testid="invite-suggestions">
            {suggestions.map((c) => (
              <li key={c.userId} role="option" aria-selected={false}>
                <button type="button" className="invite-suggestion" onClick={() => pickContact(c.email)}>
                  <span className="invite-member-avatar"><span>{(c.name || c.email)[0]!.toUpperCase()}</span></span>
                  <span className="invite-member-name">{c.name || c.email}</span>
                  <span className="invite-member-email">&lt;{c.email}&gt;</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="invite-selection-bar">
          <input
            type="checkbox"
            checked={participants.length > 0 && selectedIds.size === participants.length}
            onChange={toggleSelectAll}
          />
          <span>{selectedIds.size} topic members selected</span>
        </div>

        <div className="invite-members-list">
          {participants.map((p, idx) => {
            const id = p.id || String(idx);
            return (
              <div key={id} className="invite-member-row">
                <input
                  type="checkbox"
                  checked={selectedIds.has(id)}
                  onChange={() => toggleSelect(id)}
                />
                <div className="invite-member-avatar">
                  {p.avatar ? (
                    <img src={p.avatar} alt={p.name || ''} />
                  ) : (
                    <span>{(p.name || p.email || 'U')[0].toUpperCase()}</span>
                  )}
                </div>
                <div className="invite-member-details">
                  <span className="invite-member-name">{p.name || 'Participant'}</span>
                  {p.email && <span className="invite-member-email">&lt;{p.email}&gt;</span>}
                </div>
                <div className="invite-member-role">{ROLE_LABELS[p.role as InviteRole] || (p.role ? p.role.charAt(0).toUpperCase() + p.role.slice(1) : 'Member')}</div>
              </div>
            );
          })}
        </div>

        <div className="invite-actions-bar">
          <div className="invite-buttons-left">
            {canManage && (
              <span className="invite-role-menu-wrap">
                <button
                  type="button"
                  className="invite-btn-secondary"
                  data-testid="invite-select-role"
                  aria-haspopup="menu"
                  aria-expanded={roleMenuOpen}
                  disabled={selectedIds.size === 0 || busy}
                  onClick={() => setRoleMenuOpen((open) => !open)}
                >
                  Select role ▾
                </button>
                {roleMenuOpen && (
                  <ul className="invite-role-menu" role="menu" data-testid="invite-role-menu">
                    {(['editor', 'commenter', 'viewer'] as InviteRole[]).map((r) => (
                      <li key={r} role="none">
                        <button type="button" role="menuitem" data-role={r} onClick={() => void applyRole(r)}>{ROLE_LABELS[r]}</button>
                      </li>
                    ))}
                  </ul>
                )}
              </span>
            )}
            {canManage && (
              <button
                type="button"
                className="invite-btn-secondary"
                data-testid="invite-remove"
                disabled={selectedIds.size === 0 || busy}
                onClick={() => void removeSelected()}
              >
                Remove
              </button>
            )}
            <button type="button" className="invite-btn-secondary" onClick={handleCopyLink}>
              Copy link
            </button>
          </div>
          <button
            type="button"
            className="invite-btn-primary"
            onClick={() => {
              if (emails.trim()) {
                void handleInvite();
              } else {
                onClose();
              }
            }}
            disabled={sending}
          >
            {sending ? 'Sending...' : emails.trim() ? 'Invite' : 'Done'}
          </button>
        </div>
        <div className="invite-link-hint">{linkHint}</div>
      </div>
    </div>
  );
}
