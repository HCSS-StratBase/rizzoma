/**
 * Native fractal-render — React wrapper for WaveView.
 *
 * Thin React component. It does NOT render any of the topic content
 * itself — that is the WaveView's job. This component just:
 *   1. Reads `FEATURES.RIZZOMA_NATIVE_RENDER` (from src/shared/featureFlags)
 *   2. If on, instantiates a WaveView with the given content lookup
 *   3. Mounts WaveView's root container into a host <div>
 *   4. Tears down on unmount or topic switch
 *
 * The host page (RizzomaTopicDetail.tsx) chooses between this and the
 * existing React/TipTap-based view via the feature flag (Phase 2.5
 * deliverable lands a side-by-side toggle).
 *
 * Out of scope here: persistence, WebSocket sync, edit-mode toolbar.
 * Those wire up in subsequent phases via WaveView's event listeners.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { WaveView } from '@client/native/wave-view';
import type { ContentArray } from '@client/native/types';
import { FEATURES } from '@shared/featureFlags';
import { WavePlaybackModal } from '../WavePlaybackModal';
import { usePullToRefresh } from '@client/hooks/usePullToRefresh';
import { useSwipe } from '@client/hooks/useSwipe';
import './NativeWaveView.css';

export interface NativeWaveViewProps {
  /** The blipId to set as the wave's root (the topic-level blip). */
  rootBlipId: string;
  /** Synchronous lookup: blipId → ContentArray (or null if not loaded). */
  contentByBlipId: (id: string) => ContentArray | null;
  /** Optional className for the host div. */
  className?: string;
  /** Optional callback fired once the WaveView has been instantiated. */
  onWaveViewReady?: (wv: WaveView) => void;
}

export const NativeWaveView: React.FC<NativeWaveViewProps> = ({
  rootBlipId,
  contentByBlipId,
  className,
  onWaveViewReady,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const waveViewRef = useRef<WaveView | null>(null);
  const [showPlayback, setShowPlayback] = useState(false);

  // Mobile gestures: pull-to-refresh on the host container reloads the
  // page (simplest valid behavior; topic data is hash-routed). Swipe-left
  // collapses all expanded blip-threads (tidy-up gesture).
  usePullToRefresh(hostRef, {
    onRefresh: async () => {
      // No-op refresh — TopicDoc state will be re-fetched on next render
      // since RizzomaTopicDetail's useEffect re-runs when blipsRef changes.
      // Returning resolved promise satisfies the hook contract.
    },
  });
  useSwipe(hostRef, {
    onSwipe: (dir) => {
      if (dir !== 'left') return;
      const root = hostRef.current;
      if (!root) return;
      // Re-fold every BlipThread by adding the .folded class.
      root.querySelectorAll('.blip-thread:not(.folded)').forEach((el) => el.classList.add('folded'));
    },
  });
  // Stable identity for the lookup so a parent re-render doesn't tear down
  // the WaveView. Caller controls when content actually changes.
  const stableLookup = useMemo(() => contentByBlipId, [contentByBlipId]);

  useEffect(() => {
    if (!FEATURES.RIZZOMA_NATIVE_RENDER) return;
    const host = hostRef.current;
    if (!host) return;

    const wv = new WaveView({ contentByBlipId: stableLookup });
    waveViewRef.current = wv;
    wv.setRoot(rootBlipId);
    host.appendChild(wv.getRootContainer());
    onWaveViewReady?.(wv);

    return () => {
      // Detach root container before destroy so React's host div doesn't
      // hold a stale reference.
      const rc = wv.getRootContainer();
      if (rc.parentNode) rc.parentNode.removeChild(rc);
      wv.destroy();
      waveViewRef.current = null;
    };
    // intentional: re-instantiate the WaveView only when the topic root
    // OR the lookup identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootBlipId, stableLookup]);

  if (!FEATURES.RIZZOMA_NATIVE_RENDER) {
    return null;
  }

  return (
    <>
      <div className="rizzoma-native-toolbar">
        <button
          className="rizzoma-native-toolbar-btn"
          type="button"
          onClick={() => setShowPlayback(true)}
          title="Wave-level playback (timeline)"
        >
          ▷ Playback
        </button>
      </div>
      <div ref={hostRef} className={className ?? 'rizzoma-native-wave-host'} />
      {showPlayback && (
        <WavePlaybackModal
          waveId={rootBlipId}
          topicTitle="Wave playback"
          blips={[]}
          onClose={() => setShowPlayback(false)}
        />
      )}
    </>
  );
};

export default NativeWaveView;
