import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { api, ensureCsrf } from '../lib/api';
import { toast } from './Toast';
import './CreateTopicModal.css';

interface CreateTopicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTopicCreated: (topicId: string) => void;
}

export function CreateTopicModal({ isOpen, onClose, onTopicCreated }: CreateTopicModalProps): JSX.Element | null {
  const [title, setTitle] = useState('');
  const [participants, setParticipants] = useState('');
  const [creating, setCreating] = useState(false);
  const trimmedTitle = title.trim();

  if (!isOpen) return null;

  const handleCreate = async (): Promise<void> => {
    if (trimmedTitle.length === 0) {
      toast('Please enter a topic title', 'error');
      return;
    }

    const rawEmails = participants.split(/[,;\n]/).map((email) => email.trim().toLowerCase()).filter(Boolean);
    const invalidEmails = rawEmails.filter((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    const emails = [...new Set(rawEmails)];
    if (invalidEmails.length > 0 || emails.length > 20) {
      toast(invalidEmails.length > 0 ? 'Fix invalid participant email addresses' : 'A topic can invite at most 20 participants', 'error');
      return;
    }

    setCreating(true);
    try {
      await ensureCsrf();
      const escapedTitle = trimmedTitle.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      })[character]!);
      const response = await api('/api/topics', {
        method: 'POST',
        body: JSON.stringify({
          title: trimmedTitle,
          content: `<h1>${escapedTitle}</h1>`,
          participants: emails,
        }),
      });

      if (response.ok && response.data) {
        const topic = response.data as {
          id: string;
          invitations?: Array<{ email: string; ok: boolean; status: string }>;
        };
        const inviteResults = topic.invitations || [];
        const delivered = inviteResults.filter((result) => result.ok).length;
        const failed = inviteResults.length - delivered;
        if (failed > 0) {
          toast(`Topic created; ${delivered} invitation(s) delivered and ${failed} failed. Retry failed addresses from the topic invite panel.`, 'error');
        } else {
          toast(inviteResults.length > 0
            ? `Topic created and ${delivered} invitation(s) delivered`
            : 'Topic created successfully');
        }
        setTitle('');
        setParticipants('');
        onClose();
        onTopicCreated(topic.id);
      } else {
        toast('Failed to create topic', 'error');
      }
    } catch {
      toast('Topic creation could not reach the server. Please try again.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Topic</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="topic-title">Topic Title</label>
            <input
              id="topic-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What would you like to discuss?"
              autoFocus
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="participants">
              Invite Participants (optional)
              <span className="hint">Enter email addresses separated by commas</span>
            </label>
            <input
              id="participants"
              type="text"
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              placeholder="email1@example.com, email2@example.com"
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            className="btn-primary"
            onClick={() => { void handleCreate(); }}
            disabled={creating || trimmedTitle.length === 0}
          >
            {creating ? 'Creating...' : 'Create Topic'}
          </button>
          <button 
            className="btn-secondary"
            onClick={onClose}
            disabled={creating}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
