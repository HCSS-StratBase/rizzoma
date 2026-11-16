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
}

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicId: string;
  topicTitle: string;
}

type InviteRole = 'viewer' | 'commenter' | 'editor';

export function InviteModal({ isOpen, onClose, topicId, topicTitle: _topicTitle }: InviteModalProps): JSX.Element | null {
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<InviteRole>('editor');
  const [sending, setSending] = useState(false);
  const [sharingLevel, setSharingLevel] = useState<'private' | 'link' | 'public' | 'unknown'>('unknown');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    void api<{ participants: Participant[] }>(`/api/waves/${encodeURIComponent(topicId)}/participants`).then((res) => {
      if (cancelled) return;
      const list = res.ok && res.data ? (res.data as { participants?: Participant[] }).participants : undefined;
      setParticipants(Array.isArray(list) ? list : []);
    }).catch(() => {
      if (!cancelled) setParticipants([]);
    });
    return () => { cancelled = true; };
  }, [isOpen, topicId]);

  if (!isOpen) return null;

  const handleInvite = async (): Promise<void> => {
    const rawEmails = emails.split(/[,;\n]/).map((email) => email.trim().toLowerCase()).filter(Boolean);
    const invalid = rawEmails.filter((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    const emailList = [...new Set(rawEmails)];

    if (emailList.length === 0 || invalid.length > 0) {
      toast('Please enter at least one valid email address', 'error');
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
            <option value="viewer">Viewer</option>
            <option value="commenter">Commenter</option>
            <option value="editor">Editor</option>
          </select>
        </div>

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
                <div className="invite-member-role">{p.role || 'Member'}</div>
              </div>
            );
          })}
        </div>

        <div className="invite-actions-bar">
          <div className="invite-buttons-left">
            <button type="button" className="invite-btn-secondary" disabled={selectedIds.size === 0}>
              Select role ▾
            </button>
            <button type="button" className="invite-btn-secondary" disabled={selectedIds.size === 0}>
              Remove
            </button>
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
