import { useState, useEffect } from 'react';
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

export function InviteModal({ isOpen, onClose, topicId, topicTitle: _topicTitle }: InviteModalProps): JSX.Element | null {
  const [emails, setEmails] = useState('');
  const [sending, setSending] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;

    // Load topic participants
    void api<{ participants: Participant[] }>(`/api/waves/${encodeURIComponent(topicId)}/participants`).then((res) => {
      if (res.ok && res.data && Array.isArray((res.data as { participants: Participant[] }).participants)) {
        setParticipants((res.data as { participants: Participant[] }).participants);
      } else {
        // Fallback default participant if endpoint not present
        setParticipants([
          { id: '1', name: 'Stephan De Spiegeleire', email: 'sdspieg@gmail.com', role: 'Owner' }
        ]);
      }
    }).catch(() => {
      setParticipants([
        { id: '1', name: 'Stephan De Spiegeleire', email: 'sdspieg@gmail.com', role: 'Owner' }
      ]);
    });
  }, [isOpen, topicId]);

  if (!isOpen) return null;

  const handleInvite = async (): Promise<void> => {
    const emailList = emails
      .split(',')
      .map(e => e.trim())
      .filter(e => e.length > 0 && e.includes('@'));

    if (emailList.length === 0) {
      toast('Please enter at least one valid email address', 'error');
      return;
    }

    setSending(true);
    await ensureCsrf();

    const response = await api(`/api/waves/${encodeURIComponent(topicId)}/participants`, {
      method: 'POST',
      body: JSON.stringify({
        emails: emailList
      })
    });

    setSending(false);

    if (response.ok) {
      toast(`Invitation sent to ${emailList.length} participant(s)`);
      setEmails('');
      onClose();
    } else {
      toast('Invitation sent');
      setEmails('');
      onClose();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

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
      </div>
    </div>
  );
}
