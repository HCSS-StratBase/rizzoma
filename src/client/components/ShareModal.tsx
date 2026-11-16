import { useEffect, useState } from 'react';
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
  const [loading, setLoading] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setCanManage(false);
    setLoadError(null);
    void api<{
      sharing: { shareLevel: ShareLevel; allowComments: boolean; allowEdits: boolean };
      canManage: boolean;
    }>(`/api/waves/${encodeURIComponent(topicId)}/sharing`).then((response) => {
      if (cancelled) return;
      if (!response.ok || !response.data) {
        setLoadError('Sharing settings could not be loaded. Nothing can be changed until they are available.');
        return;
      }
      const data = response.data as {
        sharing: { shareLevel: ShareLevel; allowComments: boolean; allowEdits: boolean };
        canManage: boolean;
      };
      setShareLevel(data.sharing.shareLevel);
      setAllowComments(data.sharing.allowComments);
      setAllowEdits(data.sharing.allowEdits);
      setCanManage(Boolean(data.canManage));
    }).catch(() => {
      if (!cancelled) {
        setLoadError('Sharing settings could not be loaded. Nothing can be changed until they are available.');
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, topicId]);

  // Escape must close the popover wherever focus is (the overlay div is not focusable on open).
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e: { key: string }): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = async (): Promise<void> => {
    if (!canManage) {
      toast('Only the topic owner can change sharing settings', 'error');
      return;
    }
    setSaving(true);
    try {
      await ensureCsrf();
      const response = await api(`/api/waves/${encodeURIComponent(topicId)}/sharing`, {
        method: 'PATCH',
        body: JSON.stringify({
          shareLevel,
          allowComments,
          allowEdits
        })
      });
      if (response.ok) {
        toast('Sharing settings updated');
        onClose();
        return;
      }
      toast('Failed to update sharing settings', 'error');
    } catch {
      toast('Failed to update sharing settings', 'error');
    } finally {
      setSaving(false);
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

  const controlsDisabled = loading || !canManage;

  return (
    <div className="share-modal-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="share-modal-card" onClick={(e) => e.stopPropagation()} aria-busy={loading}>
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

        {loadError && <p className="share-load-error" role="alert">{loadError}</p>}

        <div className="share-privacy-box">
          <label className="share-privacy-option">
            <input
              type="radio"
              name="shareLevel"
              value="private"
              checked={shareLevel === 'private'}
              onChange={() => {
                setShareLevel('private');
                setAllowComments(false);
                setAllowEdits(false);
              }}
              disabled={controlsDisabled}
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
              disabled={controlsDisabled}
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
              disabled={controlsDisabled}
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
                disabled={controlsDisabled || allowEdits}
              />
              Allow comments
            </label>
            <label>
              <input
                type="checkbox"
                checked={allowEdits}
                onChange={(e) => {
                  setAllowEdits(e.target.checked);
                  if (e.target.checked) setAllowComments(true);
                }}
                disabled={controlsDisabled}
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
            disabled={saving || controlsDisabled}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
