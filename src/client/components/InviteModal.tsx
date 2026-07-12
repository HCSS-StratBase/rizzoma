import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { api, ensureCsrf } from '../lib/api';
import { toast } from './Toast';
import './CreateTopicModal.css'; // Reuse existing modal styles

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicId: string;
  topicTitle: string;
}

export function InviteModal({ isOpen, onClose, topicId, topicTitle }: InviteModalProps): JSX.Element | null {
  const [emails, setEmails] = useState('');
  const [message, setMessage] = useState('');
  const [role, setRole] = useState<'viewer' | 'commenter' | 'editor'>('editor');
  const [sending, setSending] = useState(false);
  const [sharingLevel, setSharingLevel] = useState<'private' | 'link' | 'public' | 'unknown'>('unknown');

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
          message: message.trim() || undefined,
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
      setMessage('');
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

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Invite Participants</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            Invite people to collaborate on "<strong>{topicTitle}</strong>"
          </p>

          <div className="form-group">
            <label htmlFor="invite-emails">
              Email Addresses
              <span className="hint">Enter email addresses separated by commas</span>
            </label>
            <input
              id="invite-emails"
              type="text"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder="email1@example.com, email2@example.com"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="invite-role">Access role</label>
            <select
              id="invite-role"
              value={role}
              onChange={(event) => setRole(event.target.value as 'viewer' | 'commenter' | 'editor')}
            >
              <option value="viewer">Viewer — can read</option>
              <option value="commenter">Commenter — can read and reply</option>
              <option value="editor">Editor — can edit content</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="invite-message">
              Personal Message (optional)
            </label>
            <textarea
              id="invite-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a personal message to your invitation..."
              rows={3}
            />
          </div>

          <div className="form-group share-link-group">
            <label>{sharingLevel === 'private' || sharingLevel === 'unknown'
              ? 'Copy topic address (does not grant access; invitation required)'
              : 'Or share a direct link'}</label>
            <div className="share-link-row">
              <input
                type="text"
                readOnly
                value={`${window.location.origin}/#/topic/${topicId}`}
                className="share-link-input"
              />
              <button type="button" className="btn-copy" onClick={handleCopyLink}>
                Copy
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="btn-primary"
            onClick={() => { void handleInvite(); }}
            disabled={sending || emails.trim().length === 0}
          >
            {sending ? 'Sending...' : 'Send Invitations'}
          </button>
          <button
            className="btn-secondary"
            onClick={onClose}
            disabled={sending}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
