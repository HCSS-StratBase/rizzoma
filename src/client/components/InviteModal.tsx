import { useState } from 'react';
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
  const [sending, setSending] = useState(false);

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
        emails: emailList,
        message: message.trim() || undefined
      })
    });

    setSending(false);

    if (response.ok) {
      toast(`Invitation sent to ${emailList.length} participant(s)`);
      setEmails('');
      setMessage('');
      onClose();
    } else {
      toast('Failed to send invitations', 'error');
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
      toast('Topic link copied to clipboard');
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
            <label>Or share a direct link</label>
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
