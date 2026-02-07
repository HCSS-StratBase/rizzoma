import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { api, ensureCsrf } from '../lib/api';
import { toast } from './Toast';
import './CreateTopicModal.css'; // Reuse existing modal styles

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicId: string;
  topicTitle: string;
}

type ShareLevel = 'private' | 'link' | 'public';

export function ShareModal({ isOpen, onClose, topicId, topicTitle }: ShareModalProps): JSX.Element | null {
  const [shareLevel, setShareLevel] = useState<ShareLevel>('private');
  const [allowComments, setAllowComments] = useState(true);
  const [allowEdits, setAllowEdits] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    await ensureCsrf();

    const response = await api(`/api/waves/${encodeURIComponent(topicId)}/sharing`, {
      method: 'PATCH',
      body: JSON.stringify({
        shareLevel,
        allowComments,
        allowEdits
      })
    });

    setSaving(false);

    if (response.ok) {
      toast('Sharing settings updated');
      onClose();
    } else {
      toast('Failed to update sharing settings', 'error');
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
          <h2>Share Settings</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            Configure sharing for "<strong>{topicTitle}</strong>"
          </p>

          <div className="form-group">
            <label>Who can access this topic?</label>
            <div className="radio-group">
              <label className="radio-option">
                <input
                  type="radio"
                  name="shareLevel"
                  value="private"
                  checked={shareLevel === 'private'}
                  onChange={() => setShareLevel('private')}
                />
                <span className="radio-label">
                  <strong>🔒 Private</strong>
                  <span className="radio-hint">Only invited participants can access</span>
                </span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="shareLevel"
                  value="link"
                  checked={shareLevel === 'link'}
                  onChange={() => setShareLevel('link')}
                />
                <span className="radio-label">
                  <strong>🔗 Anyone with link</strong>
                  <span className="radio-hint">Anyone with the link can view</span>
                </span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  name="shareLevel"
                  value="public"
                  checked={shareLevel === 'public'}
                  onChange={() => setShareLevel('public')}
                />
                <span className="radio-label">
                  <strong>🌐 Public</strong>
                  <span className="radio-hint">Listed publicly, anyone can find and view</span>
                </span>
              </label>
            </div>
          </div>

          {shareLevel !== 'private' && (
            <div className="form-group">
              <label>Permissions for viewers</label>
              <div className="checkbox-group">
                <label className="checkbox-option">
                  <input
                    type="checkbox"
                    checked={allowComments}
                    onChange={(e) => setAllowComments(e.target.checked)}
                  />
                  <span>Allow comments</span>
                </label>
                <label className="checkbox-option">
                  <input
                    type="checkbox"
                    checked={allowEdits}
                    onChange={(e) => setAllowEdits(e.target.checked)}
                  />
                  <span>Allow editing</span>
                </label>
              </div>
            </div>
          )}

          <div className="form-group share-link-group">
            <label>Share link</label>
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
            onClick={() => { void handleSave(); }}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          <button
            className="btn-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
