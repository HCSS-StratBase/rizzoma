import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import type { BlipHistoryEntry, WaveHistoryResponse } from '@shared/types/blips';
import { api, ensureCsrf } from '../lib/api';
import { computeDiff } from '../lib/htmlDiff';
import { toast } from './Toast';
import './WavePlaybackModal.css';

type BlipInfo = { id: string; label: string };

type WavePlaybackModalProps = {
  waveId: string;
  topicTitle: string;
  blips: BlipInfo[];
  onClose: () => void;
};

type PlaybackState = 'stopped' | 'playing' | 'paused';

// Consistent color palette for blip color-coding
const BLIP_COLORS = [
  '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#34495e', '#d35400', '#27ae60',
  '#8e44ad', '#2980b9', '#c0392b', '#16a085', '#f1c40f',
];

const CLUSTER_GAP_MS = 3000; // 3 seconds between edits = new cluster

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function formatDateButton(ts?: number): string {
  if (!ts) return 'Timeline';
  return new Date(ts).toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function stripHtmlToText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').slice(0, 120);
}

export function WavePlaybackModal({ waveId, topicTitle: _topicTitle, blips, onClose }: WavePlaybackModalProps) {
  const [timeline, setTimeline] = useState<BlipHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('stopped');
  const [playbackSpeed, setPlaybackSpeed] = useState(1000);
  const [showDiff, setShowDiff] = useState(false);
  const playbackRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build blip color map
  const blipColorMap = useMemo(() => {
    const uniqueIds = [...new Set(timeline.map(e => e.blipId))];
    const map = new Map<string, string>();
    uniqueIds.forEach((id, i) => map.set(id, BLIP_COLORS[i % BLIP_COLORS.length]));
    return map;
  }, [timeline]);

  // Build blip label map from props
  const blipLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    blips.forEach(b => map.set(b.id, b.label));
    return map;
  }, [blips]);

  const current = timeline[currentIndex];

  // Reconstruct wave state at a given index: last version of each blip up to that point
  const waveStateAtIndex = useMemo(() => {
    const stateMap = new Map<string, { content: string; authorName?: string }>();
    for (let i = 0; i <= currentIndex && i < timeline.length; i++) {
      stateMap.set(timeline[i].blipId, {
        content: timeline[i].content,
        authorName: timeline[i].authorName,
      });
    }
    return stateMap;
  }, [timeline, currentIndex]);

  // Find previous version of the SAME blip for diff
  const getPrevSameBlip = useCallback((idx: number): BlipHistoryEntry | null => {
    if (idx < 0 || idx >= timeline.length) return null;
    const blipId = timeline[idx].blipId;
    for (let i = idx - 1; i >= 0; i--) {
      if (timeline[i].blipId === blipId) return timeline[i];
    }
    return null;
  }, [timeline]);

  // Display content (with optional diff)
  const displayContent = useMemo(() => {
    if (!current) return '';
    if (showDiff) {
      const prev = getPrevSameBlip(currentIndex);
      if (prev) return computeDiff(prev.content, current.content);
    }
    return current.content;
  }, [current, currentIndex, showDiff, getPrevSameBlip]);

  // Cluster boundaries for fast-forward/back
  const clusterBoundaries = useMemo(() => {
    if (timeline.length === 0) return [];
    const boundaries = [0];
    for (let i = 1; i < timeline.length; i++) {
      if (timeline[i].createdAt - timeline[i - 1].createdAt > CLUSTER_GAP_MS) {
        boundaries.push(i);
      }
    }
    return boundaries;
  }, [timeline]);

  // Load history
  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<WaveHistoryResponse>(
        `/api/waves/${encodeURIComponent(waveId)}/history?limit=2000`
      );
      if (!response.ok) {
        throw new Error(typeof response.data === 'string' ? response.data : 'Failed to load wave history');
      }
      const payload = response.data && typeof response.data === 'object' ? response.data : null;
      const entries = payload && Array.isArray(payload.history) ? payload.history : [];
      setTimeline(entries);
      if (entries.length > 0) {
        setCurrentIndex(entries.length - 1);
      }
    } catch (err) {
      console.error('Failed to load wave history', err);
      setError('Failed to load wave history');
    } finally {
      setLoading(false);
    }
  }, [waveId]);

  useEffect(() => {
    void loadHistory();
    return () => {
      if (playbackRef.current) clearInterval(playbackRef.current);
    };
  }, [loadHistory]);

  // Playback timer
  useEffect(() => {
    if (playbackState === 'playing') {
      playbackRef.current = setInterval(() => {
        setCurrentIndex(prev => {
          if (prev >= timeline.length - 1) {
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
      if (playbackRef.current) clearInterval(playbackRef.current);
    };
  }, [playbackState, playbackSpeed, timeline.length]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === ' ') {
        e.preventDefault();
        if (playbackState === 'playing') setPlaybackState('paused');
        else handlePlay();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setPlaybackState('paused');
        setCurrentIndex(prev => Math.max(0, prev - 1));
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setPlaybackState('paused');
        setCurrentIndex(prev => Math.min(timeline.length - 1, prev + 1));
        return;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, playbackState, timeline.length]);

  const handlePlay = () => {
    if (currentIndex >= timeline.length - 1) setCurrentIndex(0);
    setPlaybackState('playing');
  };

  const handlePause = () => setPlaybackState('paused');

  const handleStepBack = () => {
    setPlaybackState('paused');
    setCurrentIndex(prev => Math.max(0, prev - 1));
  };

  const handleStepForward = () => {
    setPlaybackState('paused');
    setCurrentIndex(prev => Math.min(timeline.length - 1, prev + 1));
  };

  const handleFastBack = () => {
    setPlaybackState('paused');
    for (let i = clusterBoundaries.length - 1; i >= 0; i--) {
      if (clusterBoundaries[i] < currentIndex) {
        setCurrentIndex(clusterBoundaries[i]);
        return;
      }
    }
    setCurrentIndex(0);
  };

  const handleFastForward = () => {
    setPlaybackState('paused');
    for (const boundary of clusterBoundaries) {
      if (boundary > currentIndex) {
        setCurrentIndex(boundary);
        return;
      }
    }
    setCurrentIndex(timeline.length - 1);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlaybackState('paused');
    setCurrentIndex(parseInt(e.target.value, 10));
  };

  const handleCopy = () => {
    if (!current) return;
    const text = stripHtmlToText(current.content);
    navigator.clipboard.writeText(text).then(() => {
      toast('Historical content copied to clipboard');
    }).catch(() => {
      toast('Failed to copy', 'error');
    });
  };

  const handlePasteAsReply = async () => {
    if (!current) return;
    try {
      await ensureCsrf();
      const res = await api(`/api/waves/${encodeURIComponent(waveId)}/blips`, {
        method: 'POST',
        body: JSON.stringify({
          content: `<p><em>[Restored from ${formatDateTime(current.createdAt)}]:</em></p>${current.content}`
        })
      });
      if (res.ok) {
        toast('Historical revision posted as reply blip');
        onClose();
      } else {
        toast('Failed to post reply', 'error');
      }
    } catch {
      toast('Failed to post reply', 'error');
    }
  };

  const getBlipLabel = (blipId: string): string => {
    const label = blipLabelMap.get(blipId);
    if (label) return label;
    const suffix = blipId.includes(':') ? blipId.split(':').pop() : blipId;
    return suffix ? `Blip ${suffix.slice(0, 8)}` : blipId.slice(0, 12);
  };

  // Ordered unique blip IDs
  const orderedBlipIds = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const entry of timeline) {
      if (!seen.has(entry.blipId)) {
        seen.add(entry.blipId);
        order.push(entry.blipId);
      }
    }
    return order;
  }, [timeline]);

  return (
    <div className="wave-playback-in-place" role="region" aria-label="Wave Playback History">
      {/* 1. Top Playback Toolbar matching 069-playback-ui.png */}
      <div className="playback-top-toolbar">
        <div className="playback-button-group">
          <div className="calendar-button" title="Historical Timestamp">
            {formatDateButton(current?.createdAt)}
          </div>
          <button
            type="button"
            className="playback-nav-btn"
            onClick={handleFastBack}
            disabled={currentIndex === 0}
            title="First revision (|◀)"
          >
            |◀
          </button>
          <button
            type="button"
            className="playback-nav-btn"
            onClick={handleStepBack}
            disabled={currentIndex === 0}
            title="Step back (◀)"
          >
            ◀
          </button>
          {playbackState === 'playing' ? (
            <button
              type="button"
              className="playback-nav-btn play-btn"
              onClick={handlePause}
              title="Pause (⏸)"
            >
              ⏸
            </button>
          ) : (
            <button
              type="button"
              className="playback-nav-btn play-btn"
              onClick={handlePlay}
              title="Play (▶)"
            >
              ▶
            </button>
          )}
          <button
            type="button"
            className="playback-nav-btn"
            onClick={handleStepForward}
            disabled={currentIndex >= timeline.length - 1}
            title="Step forward (▶)"
          >
            ▶
          </button>
          <button
            type="button"
            className="playback-nav-btn"
            onClick={handleFastForward}
            disabled={currentIndex >= timeline.length - 1}
            title="Latest revision (▶|)"
          >
            ▶|
          </button>
          <button
            type="button"
            className="playback-action-btn"
            onClick={handleCopy}
            title="Copy historical content"
          >
            Copy
          </button>
          <button
            type="button"
            className="playback-action-btn last"
            onClick={() => { void handlePasteAsReply(); }}
            title="Paste historical content as new reply blip"
          >
            Paste as reply
          </button>
        </div>

        <div className="playback-options-group">
          <select
            value={playbackSpeed}
            onChange={e => setPlaybackSpeed(parseInt(e.target.value, 10))}
            className="playback-speed-select"
            aria-label="Playback speed"
          >
            <option value="2000">0.5x</option>
            <option value="1000">1x</option>
            <option value="500">2x</option>
            <option value="250">4x</option>
          </select>

          <label className="playback-diff-label">
            <input
              type="checkbox"
              checked={showDiff}
              onChange={e => setShowDiff(e.target.checked)}
            />
            Diff
          </label>

          <span className="playback-step-badge">
            {timeline.length > 0 ? `${currentIndex + 1} / ${timeline.length}` : '0 / 0'}
          </span>
        </div>

        <button
          type="button"
          className="playback-close-btn"
          onClick={onClose}
          title="Exit playback view"
        >
          Close Playback ✕
        </button>
      </div>

      {/* 2. Timeline Scrubber Bar */}
      <div className="playback-scrubber-bar">
        <div className="playback-slider-row">
          <span className="playback-slider-label">1</span>
          <input
            type="range"
            min="0"
            max={Math.max(0, timeline.length - 1)}
            value={currentIndex}
            onChange={handleSliderChange}
            className="playback-range-slider"
            aria-label="Wave timeline scrubber"
          />
          <span className="playback-slider-label">{timeline.length}</span>
        </div>

        {timeline.length > 0 && timeline.length <= 500 && (
          <div className="playback-timeline-dots">
            {timeline.map((entry, idx) => (
              <button
                key={entry.id}
                type="button"
                className={`playback-dot ${idx === currentIndex ? 'active' : ''}`}
                style={{ background: blipColorMap.get(entry.blipId) || '#999' }}
                onClick={() => { setPlaybackState('paused'); setCurrentIndex(idx); }}
                title={`${getBlipLabel(entry.blipId)} — ${formatDateTime(entry.createdAt)}`}
                aria-label={`Step ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* 3. Main Split Body */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>Loading wave history...</div>
      ) : error ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#c0392b' }}>{error}</div>
      ) : timeline.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#666' }}>No history entries found.</div>
      ) : (
        <div className="playback-split-body">
          {/* Left Pane: Historical Blip Content */}
          <div className="playback-content-pane">
            <div className="playback-pane-header">
              <span>{showDiff ? 'Historical Diff View' : 'Historical Content'}</span>
              {current && (
                <span className="playback-edit-details">
                  {getBlipLabel(current.blipId)} {current.event === 'create' ? 'created' : 'edited'} {current.authorName ? `by ${current.authorName}` : ''} at {formatDateTime(current.createdAt)}
                </span>
              )}
            </div>
            <div
              className="playback-blip-content"
              dangerouslySetInnerHTML={{ __html: displayContent }}
            />
          </div>

          {/* Right Pane: Wave State Overview */}
          <div className="playback-overview-pane">
            <div className="playback-overview-title">Wave State ({waveStateAtIndex.size} blips)</div>
            <div className="playback-overview-list">
              {orderedBlipIds.map(blipId => {
                const state = waveStateAtIndex.get(blipId);
                if (!state) return null;
                const isHighlighted = current?.blipId === blipId;
                const color = blipColorMap.get(blipId) || '#ccc';
                return (
                  <div
                    key={blipId}
                    className={`playback-overview-item ${isHighlighted ? 'highlighted' : ''}`}
                    style={{ borderLeftColor: color }}
                  >
                    <div className="playback-item-label">
                      {getBlipLabel(blipId)}
                    </div>
                    <div className="playback-item-preview">
                      {stripHtmlToText(state.content)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
