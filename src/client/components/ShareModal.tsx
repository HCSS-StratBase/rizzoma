import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { api, ensureCsrf } from '../lib/api';
import { toast } from './Toast';
import './ShareModal.css';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicId: string;
  topicTitle: string;
}

type ShareLevel = 'private' | 'link' | 'public';

export function ShareModal({ isOpen, onClose, topicId, topicTitle: _topicTitle }: ShareModalProps): JSX.Element | null {
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
    <div className="share-modal-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="share-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="share-url-row">
          <input
            type="text"
            readOnly
            value={`${window.location.origin}/#/topic/${topicId}`}
            className="share-url-input"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button type="button" className="share-copy-btn" onClick={handleCopyLink}>
            Copy link
          </button>
        </div>

        <div className="share-privacy-box">
          <label className="share-privacy-option">
            <input
              type="radio"
              name="shareLevel"
              value="private"
              checked={shareLevel === 'private'}
              onChange={() => setShareLevel('private')}
            />
            <div className="share-privacy-icon">🔒</div>
            <div className="share-privacy-text">
              <strong>Private.</strong>
              <span className="share-details">Only listed participants can access. Sign-in required.</span>
            </div>
          </label>

          <label className="share-privacy-option">
            <input
              type="radio"
              name="shareLevel"
              value="link"
              checked={shareLevel === 'link'}
              onChange={() => setShareLevel('link')}
            />
            <div className="share-privacy-icon">🔗</div>
            <div className="share-privacy-text">
              <strong>Anyone with the link.</strong>
              <span className="share-details">Anyone who has the link can view {allowEdits ? 'and edit' : ''}.</span>
            </div>
          </label>

          <label className="share-privacy-option">
            <input
              type="radio"
              name="shareLevel"
              value="public"
              checked={shareLevel === 'public'}
              onChange={() => setShareLevel('public')}
            />
            <div className="share-privacy-icon">🌐</div>
            <div className="share-privacy-text">
              <strong>Public on the web.</strong>
              <span className="share-details">Anyone can find and comment.</span>
            </div>
          </label>
        </div>

        {shareLevel !== 'private' && (
          <div className="share-permissions-box">
            <label>
              <input
                type="checkbox"
                checked={allowComments}
                onChange={(e) => setAllowComments(e.target.checked)}
              />
              Allow comments
            </label>
            <label>
              <input
                type="checkbox"
                checked={allowEdits}
                onChange={(e) => setAllowEdits(e.target.checked)}
              />
              Allow editing
            </label>
          </div>
        )}

        <div className="share-actions">
          <button
            type="button"
            className="share-btn-cancel"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="share-btn-save"
            onClick={() => { void handleSave(); }}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
