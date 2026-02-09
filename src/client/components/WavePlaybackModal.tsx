import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import type { BlipHistoryEntry, WaveHistoryResponse } from '@shared/types/blips';
import { api } from '../lib/api';
import { computeDiff } from '../lib/htmlDiff';
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

function toDatetimeLocalValue(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function stripHtmlToText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').slice(0, 120);
}

export function WavePlaybackModal({ waveId, topicTitle, blips, onClose }: WavePlaybackModalProps) {
  const [timeline, setTimeline] = useState<BlipHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('stopped');
  const [playbackSpeed, setPlaybackSpeed] = useState(1000);
  const [showDiff, setShowDiff] = useState(false);
  const [jumpToDate, setJumpToDate] = useState('');
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
        setJumpToDate(toDatetimeLocalValue(entries[entries.length - 1].createdAt));
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

  const handleStop = () => {
    setPlaybackState('stopped');
    setCurrentIndex(timeline.length - 1);
  };

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
    // Jump to previous cluster boundary
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
    // Jump to next cluster boundary
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

  const handleDateJump = () => {
    if (!jumpToDate) return;
    const targetTs = new Date(jumpToDate).getTime();
    if (isNaN(targetTs)) return;
    // Find closest entry at or after the target timestamp
    let closest = 0;
    let minDiff = Infinity;
    for (let i = 0; i < timeline.length; i++) {
      const diff = Math.abs(timeline[i].createdAt - targetTs);
      if (diff < minDiff) {
        minDiff = diff;
        closest = i;
      }
    }
    setPlaybackState('paused');
    setCurrentIndex(closest);
  };

  const getBlipLabel = (blipId: string): string => {
    const label = blipLabelMap.get(blipId);
    if (label) return label;
    // Fallback: extract from blipId
    const suffix = blipId.includes(':') ? blipId.split(':').pop() : blipId;
    return suffix ? `Blip ${suffix.slice(0, 8)}` : blipId.slice(0, 12);
  };

  // Ordered unique blip IDs (by first appearance in timeline)
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
    <div className="wave-playback-backdrop" role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wave-playback-modal">
        {/* Header */}
        <div className="wave-playback-header">
          <h3>Wave Timeline: {topicTitle}</h3>
          <button type="button" onClick={onClose} aria-label="Close wave playback">✕</button>
        </div>

        {loading && <div className="wave-playback-status">Loading wave history...</div>}
        {error && !loading && <div className="wave-playback-error">{error}</div>}

        {!loading && !error && timeline.length === 0 && (
          <div className="wave-playback-status">No history entries found. Edit some blips to create history.</div>
        )}

        {!loading && !error && timeline.length > 0 && (
          <>
            {/* Date Jump */}
            <div className="wave-playback-date-jump">
              <label>Jump to:</label>
              <input
                type="datetime-local"
                value={jumpToDate}
                onChange={e => setJumpToDate(e.target.value)}
              />
              <button type="button" onClick={handleDateJump}>Jump</button>
            </div>

            {/* Timeline Slider */}
            <div className="wave-playback-controls">
              <div className="wave-timeline-slider-container">
                <span className="wave-timeline-label">1</span>
                <input
                  type="range"
                  min="0"
                  max={timeline.length - 1}
                  value={currentIndex}
                  onChange={handleSliderChange}
                  className="wave-timeline-slider"
                  aria-label="Wave timeline position"
                />
                <span className="wave-timeline-label">{timeline.length}</span>
              </div>

              {/* Playback Controls */}
              <div className="wave-playback-btns">
                <button type="button" onClick={handleFastBack} disabled={currentIndex === 0} title="Previous cluster" className="playback-btn">⏮</button>
                <button type="button" onClick={handleStepBack} disabled={currentIndex === 0} title="Step back" className="playback-btn">⏪</button>
                {playbackState === 'playing' ? (
                  <button type="button" onClick={handlePause} title="Pause" className="playback-btn primary">⏸</button>
                ) : (
                  <button type="button" onClick={handlePlay} title="Play" className="playback-btn primary">▶</button>
                )}
                <button type="button" onClick={handleStop} title="Stop" className="playback-btn">⏹</button>
                <button type="button" onClick={handleStepForward} disabled={currentIndex >= timeline.length - 1} title="Step forward" className="playback-btn">⏩</button>
                <button type="button" onClick={handleFastForward} disabled={currentIndex >= timeline.length - 1} title="Next cluster" className="playback-btn">⏭</button>

                <select value={playbackSpeed} onChange={e => setPlaybackSpeed(parseInt(e.target.value, 10))} className="speed-select" aria-label="Playback speed">
                  <option value="2000">0.5x</option>
                  <option value="1000">1x</option>
                  <option value="500">2x</option>
                  <option value="250">4x</option>
                  <option value="100">10x</option>
                </select>

                <label className="diff-toggle">
                  <input type="checkbox" checked={showDiff} onChange={e => setShowDiff(e.target.checked)} />
                  Show diff
                </label>
              </div>
            </div>

            {/* Color-coded Timeline Dots */}
            {timeline.length <= 500 && (
              <div className="wave-timeline-dots">
                {timeline.map((entry, idx) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`wave-timeline-dot ${idx === currentIndex ? 'active' : ''}`}
                    style={{ background: blipColorMap.get(entry.blipId) || '#ccc' }}
                    onClick={() => { setPlaybackState('paused'); setCurrentIndex(idx); }}
                    title={`${getBlipLabel(entry.blipId)} — ${formatDateTime(entry.createdAt)}`}
                    aria-label={`Step ${idx + 1}`}
                  />
                ))}
              </div>
            )}

            {/* Current Change Info */}
            <div className="wave-playback-info">
              <span className="wp-step">Step {currentIndex + 1}/{timeline.length}</span>
              {current && (
                <>
                  <span className="wp-blip-label" style={{ color: blipColorMap.get(current.blipId) }}>
                    {getBlipLabel(current.blipId)} {current.event === 'create' ? 'created' : 'updated'}
                  </span>
                  {current.authorName && <span className="wp-author">by {current.authorName}</span>}
                  <span className="wp-time">{formatDateTime(current.createdAt)}</span>
                </>
              )}
            </div>

            {/* Split Pane */}
            <div className="wave-playback-split-pane">
              {/* Left: Changed Blip Content */}
              <div className="wave-playback-content-pane">
                <h4>{showDiff ? 'Diff View' : 'Current Content'}</h4>
                <div
                  className="wave-playback-content"
                  dangerouslySetInnerHTML={{ __html: displayContent }}
                />
              </div>

              {/* Right: Mini Wave Overview */}
              <div className="wave-playback-overview-pane">
                <h4>Wave State ({waveStateAtIndex.size} blips)</h4>
                {orderedBlipIds.map(blipId => {
                  const state = waveStateAtIndex.get(blipId);
                  if (!state) return null;
                  const isHighlighted = current?.blipId === blipId;
                  const color = blipColorMap.get(blipId) || '#ccc';
                  return (
                    <div
                      key={blipId}
                      className={`wave-overview-blip ${isHighlighted ? 'highlighted' : ''}`}
                      style={{ borderLeftColor: color }}
                    >
                      <div className="wave-overview-blip-label">
                        <span className="blip-color-dot" style={{ background: color }} />
                        {getBlipLabel(blipId)}
                      </div>
                      <div className="wave-overview-blip-content">
                        {stripHtmlToText(state.content)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="wave-playback-footer">
          <button type="button" onClick={loadHistory} disabled={loading}>Refresh</button>
          <button type="button" className="primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
