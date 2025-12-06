import { useCallback, useEffect, useMemo, useState } from 'react';
import { BlipHistoryEntry } from '@shared/types/blips';
import { api } from '../../lib/api';

type BlipHistoryModalProps = {
  blipId: string;
  onClose: () => void;
};

export function BlipHistoryModal({ blipId, onClose }: BlipHistoryModalProps) {
  const [history, setHistory] = useState<BlipHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => (a.snapshotVersion || 0) - (b.snapshotVersion || 0));
  }, [history]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<{ history?: BlipHistoryEntry[] }>(
        `/api/blips/${encodeURIComponent(blipId)}/history`
      );
      if (!response.ok) {
        throw new Error(typeof response.data === 'string' ? response.data : 'Failed to load history');
      }
      const payload = response.data && typeof response.data === 'object' ? response.data : null;
      setHistory(payload && Array.isArray(payload.history) ? payload.history : []);
    } catch (err) {
      console.error('Failed to load blip history', err);
      setError('Failed to load blip history');
    } finally {
      setLoading(false);
    }
  }, [blipId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  return (
    <div className="blip-history-backdrop" role="dialog" aria-modal="true">
      <div className="blip-history-modal">
        <div className="blip-history-header">
          <h3>Blip Playback</h3>
          <button type="button" onClick={onClose} aria-label="Close playback modal">
            ✕
          </button>
        </div>

        {loading && <div className="blip-history-status">Loading history…</div>}
        {error && !loading && <div className="blip-history-error">{error}</div>}

        {!loading && !error && (
          <div className="blip-history-list">
            {sortedHistory.length === 0 && <div className="blip-history-status">No history yet</div>}
            {sortedHistory.map((entry) => (
              <div key={entry.id} className="blip-history-entry">
                <div className="blip-history-meta">
                  <span className="history-version">v{entry.snapshotVersion}</span>
                  <span className="history-event">{entry.event === 'create' ? 'Created' : 'Updated'}</span>
                  <span className="history-time">{new Date(entry.createdAt).toLocaleString()}</span>
                  {entry.authorName && <span className="history-author">{entry.authorName}</span>}
                </div>
                <div
                  className="blip-history-content"
                  dangerouslySetInnerHTML={{ __html: entry.content }}
                />
              </div>
            ))}
          </div>
        )}

        <div className="blip-history-footer">
          <button type="button" onClick={loadHistory} disabled={loading}>
            Refresh
          </button>
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
