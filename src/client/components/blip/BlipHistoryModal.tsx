import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { BlipHistoryEntry } from '@shared/types/blips';
import { api } from '../../lib/api';
import { computeDiff } from '../../lib/htmlDiff';
import './BlipHistoryModal.css';

type BlipHistoryModalProps = {
  blipId: string;
  onClose: () => void;
};

type PlaybackState = 'stopped' | 'playing' | 'paused';

export function BlipHistoryModal({ blipId, onClose }: BlipHistoryModalProps) {
  const [history, setHistory] = useState<BlipHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('stopped');
  const [playbackSpeed, setPlaybackSpeed] = useState(1000); // ms between frames
  const [showDiff, setShowDiff] = useState(false);
  const playbackRef = useRef<NodeJS.Timeout | null>(null);

  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => (a.snapshotVersion || 0) - (b.snapshotVersion || 0));
  }, [history]);

  const currentEntry = sortedHistory[currentIndex];
  const prevEntry = currentIndex > 0 ? sortedHistory[currentIndex - 1] : null;

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
      const entries = payload && Array.isArray(payload.history) ? payload.history : [];
      setHistory(entries);
      if (entries.length > 0) {
        setCurrentIndex(entries.length - 1); // Start at latest
      }
    } catch (err) {
      console.error('Failed to load blip history', err);
      setError('Failed to load blip history');
    } finally {
      setLoading(false);
    }
  }, [blipId]);

  useEffect(() => {
    void loadHistory();
    return () => {
      if (playbackRef.current) {
        clearInterval(playbackRef.current);
      }
    };
  }, [loadHistory]);

  // Playback logic
  useEffect(() => {
    if (playbackState === 'playing') {
      playbackRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= sortedHistory.length - 1) {
            setPlaybackState('stopped');
            return prev;
          }
          return prev + 1;
        });
      }, playbackSpeed);
    } else {
      if (playbackRef.current) {
        clearInterval(playbackRef.current);
        playbackRef.current = null;
      }
    }
    return () => {
      if (playbackRef.current) {
        clearInterval(playbackRef.current);
      }
    };
  }, [playbackState, playbackSpeed, sortedHistory.length]);

  const handlePlay = () => {
    if (currentIndex >= sortedHistory.length - 1) {
      setCurrentIndex(0); // Restart from beginning
    }
    setPlaybackState('playing');
  };

  const handlePause = () => {
    setPlaybackState('paused');
  };

  const handleStop = () => {
    setPlaybackState('stopped');
    setCurrentIndex(sortedHistory.length - 1);
  };

  const handleStepBack = () => {
    setPlaybackState('paused');
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const handleStepForward = () => {
    setPlaybackState('paused');
    setCurrentIndex((prev) => Math.min(sortedHistory.length - 1, prev + 1));
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlaybackState('paused');
    setCurrentIndex(parseInt(e.target.value, 10));
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPlaybackSpeed(parseInt(e.target.value, 10));
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const displayContent = useMemo(() => {
    if (!currentEntry) return '';
    if (showDiff && prevEntry) {
      return computeDiff(prevEntry.content, currentEntry.content);
    }
    return currentEntry.content;
  }, [currentEntry, prevEntry, showDiff]);

  return (
    <div className="blip-history-backdrop" role="dialog" aria-modal="true">
      <div className="blip-history-modal">
        <div className="blip-history-header">
          <h3>Blip Timeline</h3>
          <button type="button" onClick={onClose} aria-label="Close timeline modal">
            ✕
          </button>
        </div>

        {loading && <div className="blip-history-status">Loading history…</div>}
        {error && !loading && <div className="blip-history-error">{error}</div>}

        {!loading && !error && sortedHistory.length === 0 && (
          <div className="blip-history-status">No history yet</div>
        )}

        {!loading && !error && sortedHistory.length > 0 && (
          <>
            {/* Timeline Slider */}
            <div className="blip-timeline-controls">
              <div className="timeline-slider-container">
                <span className="timeline-label">v1</span>
                <input
                  type="range"
                  min="0"
                  max={sortedHistory.length - 1}
                  value={currentIndex}
                  onChange={handleSliderChange}
                  className="timeline-slider"
                  aria-label="Timeline position"
                />
                <span className="timeline-label">v{sortedHistory.length}</span>
              </div>

              {/* Playback Controls */}
              <div className="playback-controls">
                <button
                  type="button"
                  onClick={handleStepBack}
                  disabled={currentIndex === 0}
                  title="Step back"
                  className="playback-btn"
                >
                  ⏮
                </button>
                {playbackState === 'playing' ? (
                  <button
                    type="button"
                    onClick={handlePause}
                    title="Pause"
                    className="playback-btn primary"
                  >
                    ⏸
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handlePlay}
                    title="Play"
                    className="playback-btn primary"
                  >
                    ▶
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleStop}
                  title="Stop"
                  className="playback-btn"
                >
                  ⏹
                </button>
                <button
                  type="button"
                  onClick={handleStepForward}
                  disabled={currentIndex >= sortedHistory.length - 1}
                  title="Step forward"
                  className="playback-btn"
                >
                  ⏭
                </button>

                <select
                  value={playbackSpeed}
                  onChange={handleSpeedChange}
                  className="speed-select"
                  aria-label="Playback speed"
                >
                  <option value="2000">0.5x</option>
                  <option value="1000">1x</option>
                  <option value="500">2x</option>
                  <option value="250">4x</option>
                </select>

                <label className="diff-toggle">
                  <input
                    type="checkbox"
                    checked={showDiff}
                    onChange={(e) => setShowDiff(e.target.checked)}
                  />
                  Show diff
                </label>
              </div>
            </div>

            {/* Timeline Visual */}
            <div className="timeline-visual">
              {sortedHistory.map((entry, idx) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`timeline-dot ${idx === currentIndex ? 'active' : ''} ${entry.event}`}
                  onClick={() => {
                    setPlaybackState('paused');
                    setCurrentIndex(idx);
                  }}
                  title={`v${entry.snapshotVersion} - ${formatDate(entry.createdAt)}`}
                  aria-label={`Version ${entry.snapshotVersion}`}
                />
              ))}
            </div>

            {/* Current Version Info */}
            <div className="blip-history-current-info">
              <span className="history-version">Version {currentEntry?.snapshotVersion || 1}</span>
              <span className="history-event">
                {currentEntry?.event === 'create' ? '📝 Created' : '✏️ Updated'}
              </span>
              <span className="history-time">{currentEntry ? formatDate(currentEntry.createdAt) : ''}</span>
              {currentEntry?.authorName && (
                <span className="history-author">by {currentEntry.authorName}</span>
              )}
            </div>

            {/* Content Display */}
            <div className="blip-history-content-container">
              <div
                className="blip-history-content"
                dangerouslySetInnerHTML={{ __html: displayContent }}
              />
            </div>

            {/* Version List (collapsible) */}
            <details className="blip-history-versions">
              <summary>All versions ({sortedHistory.length})</summary>
              <div className="blip-history-list">
                {sortedHistory.map((entry, idx) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`blip-history-entry-btn ${idx === currentIndex ? 'active' : ''}`}
                    onClick={() => {
                      setPlaybackState('paused');
                      setCurrentIndex(idx);
                    }}
                  >
                    <span className="history-version">v{entry.snapshotVersion}</span>
                    <span className="history-event">{entry.event === 'create' ? 'Created' : 'Updated'}</span>
                    <span className="history-time">{formatDate(entry.createdAt)}</span>
                    {entry.authorName && <span className="history-author">{entry.authorName}</span>}
                  </button>
                ))}
              </div>
            </details>
          </>
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
