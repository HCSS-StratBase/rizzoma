import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { NavigationPanel } from './NavigationPanel';
import { RizzomaTopicsList } from './RizzomaTopicsList';
import { MentionsList } from './MentionsList';
import { TasksList } from './TasksList';
import { PublicTopicsPanel } from './PublicTopicsPanel';
import { StorePanel } from './StorePanel';
import { TeamsPanel } from './TeamsPanel';
import { RizzomaTopicDetail } from './RizzomaTopicDetail';
import { RightToolsPanel } from './RightToolsPanel';
import { CreateTopicModal } from './CreateTopicModal';
import { PWAPrompts } from './PWAPrompts';
import './RizzomaLayout.css';
import { useWaveUnread } from '../hooks/useWaveUnread';
import { ensureWaveUnreadJoin } from '../lib/socket';
import { useMobileContextSafe } from '../contexts/MobileContext';
import { useSwipe } from '../hooks/useSwipe';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

interface RizzomaLayoutProps {
  isAuthed: boolean;
  user?: { id?: string; email?: string; name?: string } | null;
}

type TabType = 'topics' | 'mentions' | 'tasks' | 'publics' | 'store' | 'teams';

const PERF_SKIP_KEY = 'rizzoma:perf:skipSidebarTopics';

const getInitialPerfSkip = (): boolean => {
  const hash = typeof window !== 'undefined' ? window.location.hash || '' : '';
  const perfHash = (() => {
    if (!hash) return false;
    const query = hash.split('?')[1] || '';
    const params = new URLSearchParams(query);
    const perfValue = params.get('perf');
    if (perfValue === null) return false;
    return perfValue !== '0' && perfValue !== 'false';
  })();
  try {
    const stored = typeof localStorage !== 'undefined' && localStorage.getItem(PERF_SKIP_KEY) === '1';
    if (perfHash) {
      try { localStorage.setItem(PERF_SKIP_KEY, '1'); } catch {}
    }
    return perfHash || stored;
  } catch {
    return perfHash;
  }
};

// Mobile view states
type MobileView = 'list' | 'content';

// Persisted layout sizes/collapse state — keyed in localStorage so
// the user's pane layout survives reloads. Widths are clamped to
// sane bounds on read so a corrupted value can't render a 0px pane.
const LEFT_WIDTH_KEY = 'rizzoma:leftPaneWidth';
const RIGHT_WIDTH_KEY = 'rizzoma:rightPaneWidth';
const LEFT_COLLAPSED_KEY = 'rizzoma:leftPaneCollapsed';
const RIGHT_COLLAPSED_KEY = 'rizzoma:rightPaneCollapsed';
const LEFT_DEFAULT = 296;
const RIGHT_DEFAULT = 104;
const LEFT_MIN = 180;
const LEFT_MAX = 600;
const RIGHT_MIN = 80;
const RIGHT_MAX = 420;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const readNumber = (key: string, def: number, lo: number, hi: number): number => {
  if (typeof window === 'undefined') return def;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return def;
    const n = Number(raw);
    return Number.isFinite(n) ? clamp(n, lo, hi) : def;
  } catch { return def; }
};

const readBool = (key: string): boolean => {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(key) === '1'; } catch { return false; }
};

export function RizzomaLayout({ isAuthed, user }: RizzomaLayoutProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [currentBlipPath, setCurrentBlipPath] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('topics');
  const [searchPaneCollapsed, setSearchPaneCollapsed] = useState(() => readBool(LEFT_COLLAPSED_KEY));
  const [rightPaneCollapsed, setRightPaneCollapsed] = useState(() => readBool(RIGHT_COLLAPSED_KEY));
  const [leftPaneWidth, setLeftPaneWidth] = useState(() => readNumber(LEFT_WIDTH_KEY, LEFT_DEFAULT, LEFT_MIN, LEFT_MAX));
  const [rightPaneWidth, setRightPaneWidth] = useState(() => readNumber(RIGHT_WIDTH_KEY, RIGHT_DEFAULT, RIGHT_MIN, RIGHT_MAX));
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [perfSkipTopics, setPerfSkipTopics] = useState(getInitialPerfSkip);
  const unreadState = useWaveUnread(selectedTopicId);

  // Persist collapse + width state whenever it changes.
  useEffect(() => {
    try { localStorage.setItem(LEFT_COLLAPSED_KEY, searchPaneCollapsed ? '1' : '0'); } catch {}
  }, [searchPaneCollapsed]);
  useEffect(() => {
    try { localStorage.setItem(RIGHT_COLLAPSED_KEY, rightPaneCollapsed ? '1' : '0'); } catch {}
  }, [rightPaneCollapsed]);
  useEffect(() => {
    try { localStorage.setItem(LEFT_WIDTH_KEY, String(leftPaneWidth)); } catch {}
  }, [leftPaneWidth]);
  useEffect(() => {
    try { localStorage.setItem(RIGHT_WIDTH_KEY, String(rightPaneWidth)); } catch {}
  }, [rightPaneWidth]);

  // Drag-to-resize for both side panels. `startResize` is wired to
  // the resizer handles on the inside edges; it listens for
  // pointermove until pointerup and updates the width state so both
  // the CSS variable and the persisted value track the drag.
  const startResize = useCallback((side: 'left' | 'right') => (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startLeftW = leftPaneWidth;
    const startRightW = rightPaneWidth;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (side === 'left') {
        setLeftPaneWidth(clamp(startLeftW + dx, LEFT_MIN, LEFT_MAX));
      } else {
        setRightPaneWidth(clamp(startRightW - dx, RIGHT_MIN, RIGHT_MAX));
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [leftPaneWidth, rightPaneWidth]);

  // Track which topics have unread blips (for "Next Topic" button)
  const [topicsWithUnread, setTopicsWithUnread] = useState<Array<{ id: string; unreadCount: number }>>([]);

  useEffect(() => {
    const handle = (e: Event) => {
      const { topics } = (e as CustomEvent).detail || {};
      if (Array.isArray(topics)) setTopicsWithUnread(topics);
    };
    window.addEventListener('rizzoma:topics-loaded', handle);
    return () => window.removeEventListener('rizzoma:topics-loaded', handle);
  }, []);

  const nextUnreadTopic = useMemo(() =>
    topicsWithUnread.find(t => t.id !== selectedTopicId && t.unreadCount > 0),
    [topicsWithUnread, selectedTopicId]
  );

  const handleNextTopic = useCallback(() => {
    if (nextUnreadTopic) window.location.hash = `#/topic/${nextUnreadTopic.id}`;
  }, [nextUnreadTopic]);

  // Mobile state
  const mobileContext = useMobileContextSafe();
  const isMobile = mobileContext?.shouldUseMobileUI ?? false;
  const [mobileView, setMobileView] = useState<MobileView>('list');
  const waveContainerRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  // Switch to content view when topic is selected on mobile
  useEffect(() => {
    if (isMobile && selectedTopicId) {
      setMobileView('content');
    }
  }, [isMobile, selectedTopicId]);

  // Handle swipe navigation on mobile
  const handleSwipeBack = useCallback(() => {
    if (isMobile && mobileView === 'content') {
      setMobileView('list');
    }
  }, [isMobile, mobileView]);

  // Swipe right on content to go back to list
  useSwipe(waveContainerRef, {
    directions: ['right'],
    threshold: 75,
    enabled: isMobile && mobileView === 'content',
    onSwipe: (direction) => {
      if (direction === 'right') {
        handleSwipeBack();
      }
    },
  });

  // Pull to refresh for topic list — dispatches refresh and waits for topics-loaded response
  const handleRefresh = useCallback(async () => {
    window.dispatchEvent(new CustomEvent('rizzoma:refresh-topics'));
    await new Promise<void>((resolve) => {
      const done = () => { window.removeEventListener('rizzoma:topics-loaded', done); resolve(); };
      window.addEventListener('rizzoma:topics-loaded', done, { once: true });
      setTimeout(done, 5000); // fallback timeout
    });
  }, []);

  // DISABLED on mobile (2026-04-14, user smoke test): this hook was
  // attached to `listContainerRef` which points at `.tabs-container`
  // — the OUTER wrapper whose `scrollTop` is always 0, because the
  // actually-scrollable child is `.topics-container`. Result:
  // `isAtTop()` returned true for every touch, so every downward
  // gesture entered the pull-to-refresh path and its touchmove
  // handler called `event.preventDefault()`, stealing the native
  // scroll. User could barely scroll down and not scroll back up.
  // Re-enable once the hook takes a scroll-container ref distinct
  // from the wrapper, or is rewired against `.topics-container`
  // directly via a querySelector. The 60-second polling + the
  // `rizzoma:refresh-topics` event on mark-read already refresh the
  // list automatically, so losing the pull-gesture is mostly
  // cosmetic.
  usePullToRefresh(listContainerRef, {
    onRefresh: handleRefresh,
    enabled: false,
  });

  // Mobile back button handler
  const handleMobileBack = useCallback(() => {
    setMobileView('list');
  }, []);

  // sync hash-based deep-links into the layout selection
  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash || '';
      // Match topic with optional blipPath: #/topic/{topicId}/{blipPath}/
      const mTopicWithBlip = hash.match(/^#\/topic\/([^/?]+)\/(.+?)(?:\?.*)?$/);
      const mTopic = hash.match(/^#\/topic\/([^/?]+)\/?(?:\?.*)?$/);

      if (mTopicWithBlip) {
        setSelectedTopicId(mTopicWithBlip[1]);
        setCurrentBlipPath(mTopicWithBlip[2]);
      } else if (mTopic?.[1]) {
        setSelectedTopicId(mTopic[1]);
        setCurrentBlipPath(null);
      }
      if (hash.includes('perf=')) {
        setPerfSkipTopics(true);
        try {
          localStorage.setItem(PERF_SKIP_KEY, '1');
        } catch {}
      }
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  useEffect(() => {
    try {
      const skip = localStorage.getItem(PERF_SKIP_KEY) === '1';
      setPerfSkipTopics(skip);
    } catch {}
  }, []);

  // Join unread sockets early for current topic
  useEffect(() => {
    if (selectedTopicId) {
      ensureWaveUnreadJoin(selectedTopicId);
    }
  }, [selectedTopicId]);

  const handleNewClick = () => {
    setShowCreateModal(true);
  };

  const handleTopicCreated = (topicId: string) => {
    setActiveTab('topics');
    window.location.hash = `#/topic/${topicId}`;
    window.dispatchEvent(new CustomEvent('rizzoma:refresh-topics'));
  };

  const renderSearchPanel = () => {
    if (perfSkipTopics) {
      return null;
    }
    // Route all sidebar topic-selection callbacks through the URL
    // hash so bookmarks/refresh/history stay in sync with the
    // visible topic. The `hashchange` listener above then updates
    // selectedTopicId. Previously callbacks only called
    // setSelectedTopicId directly, leaving the URL pointing at the
    // old topic — the 2026-04-14 user bug where clicking a sidebar
    // topic updated state but not the URL.
    const selectTopicFromSidebar = (topicId: string) => {
      window.location.hash = `#/topic/${topicId}`;
    };
    switch (activeTab) {
      case 'topics':
        return (
          <RizzomaTopicsList
            onTopicSelect={selectTopicFromSidebar}
            selectedTopicId={selectedTopicId}
            isAuthed={isAuthed}
          />
        );
      case 'mentions':
        return <MentionsList isAuthed={isAuthed} onSelectMention={selectTopicFromSidebar} />;
      case 'tasks':
        return <TasksList isAuthed={isAuthed} onSelectTask={selectTopicFromSidebar} />;
      case 'publics':
        return <PublicTopicsPanel onSelectTopic={selectTopicFromSidebar} />;
      case 'store':
        return <StorePanel />;
      case 'teams':
        return <TeamsPanel isAuthed={isAuthed} />;
      default:
        return null;
    }
  };

  // Mobile layout classes
  const mobileLayoutClass = isMobile ? `mobile-layout mobile-view-${mobileView}` : '';

  return (
    <div className={`rizzoma-layout ${mobileLayoutClass}`}>
      {/* Mobile header - shown when viewing content on mobile */}
      {isMobile && mobileView === 'content' && (
        <div className="mobile-header">
          <button className="back-btn" onClick={handleMobileBack} aria-label="Back to list">
            ←
          </button>
          <span className="title">
            {selectedTopicId ? 'Topic' : 'Rizzoma'}
          </span>
          <button className="menu-btn" onClick={handleNewClick} aria-label="New topic">
            +
          </button>
        </div>
      )}

      {/* Navigation Panel - Far Left (hidden on mobile) */}
      <div className="navigation-container">
        <NavigationPanel
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isAuthed={isAuthed}
          onNewClick={handleNewClick}
          unreadTopicCount={unreadState?.unreadIds?.length}
        />
      </div>

      {/* Search/List Panel - Left Center */}
      <div
        ref={listContainerRef}
        className={`tabs-container ${searchPaneCollapsed ? 'collapsed' : ''} ${isMobile && mobileView !== 'list' ? 'mobile-hidden' : ''}`}
        style={!isMobile && !searchPaneCollapsed ? { width: leftPaneWidth, minWidth: leftPaneWidth } : undefined}
      >
        <div className="tabs-header">
          <h3>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3>
          <button
            className="collapse-btn"
            onClick={() => setSearchPaneCollapsed(!searchPaneCollapsed)}
            title={searchPaneCollapsed ? "Expand" : "Collapse"}
          >
            {searchPaneCollapsed ? '▶' : '◀'}
          </button>
        </div>
        {!searchPaneCollapsed && (
          <div className="tabs-content">
            {renderSearchPanel()}
          </div>
        )}
        {/* Right-edge drag handle to resize the left pane. Only
            rendered when the pane is expanded and we're not on
            mobile. Clamps to [LEFT_MIN, LEFT_MAX] during drag. */}
        {!isMobile && !searchPaneCollapsed && (
          <div
            className="pane-resizer pane-resizer-left"
            onPointerDown={startResize('left')}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize topics pane"
            title="Drag to resize"
          />
        )}
      </div>

      {/* Wave/Content Panel - Center Right */}
      <div
        ref={waveContainerRef}
        className={`wave-container ${isMobile && mobileView !== 'content' ? 'mobile-hidden' : ''}`}
      >
        <div className="inner-wave-container">
          {selectedTopicId ? (
            <>
              {/* `key={selectedTopicId}` forces React to unmount the
                  old topic detail and mount a fresh instance when the
                  user picks another topic. Without this, the
                  component reuses all its useState (blips, topic,
                  allBlipsMap, TipTap editor…) across topic switches,
                  producing visible state leaks — e.g. clicking
                  "Perf sweep #16 — 150 blips" left the old topic's
                  title in place while rendering 150 blips from the
                  new wave, the 2026-04-14 user smoke test bug. */}
              <RizzomaTopicDetail
                key={selectedTopicId}
                id={selectedTopicId}
                blipPath={currentBlipPath}
                isAuthed={isAuthed}
                unreadState={unreadState}
              />
            </>
          ) : (
            <div className="no-topic-selected">
              <h2>Welcome to Rizzoma</h2>
              <p>Select a topic from the left panel or create a new one</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Tools Panel - Far Right */}
      <div
        className={`right-tools-container ${rightPaneCollapsed ? 'collapsed' : ''}`}
        style={!isMobile && !rightPaneCollapsed ? { width: rightPaneWidth, minWidth: rightPaneWidth } : undefined}
      >
        {/* Left-edge drag handle for the right pane (inside-facing
            edge). Mirrors the left pane's right-edge handle so the
            user can widen/narrow the right gutter symmetrically. */}
        {!isMobile && !rightPaneCollapsed && (
          <div
            className="pane-resizer pane-resizer-right"
            onPointerDown={startResize('right')}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize tools pane"
            title="Drag to resize"
          />
        )}
        {/* Collapse ▶/◀ button mirroring the left pane's collapse
            button. When collapsed, the panel shrinks to a 40px rail
            showing only the expand arrow. */}
        <button
          className="right-tools-collapse-btn"
          onClick={() => setRightPaneCollapsed(!rightPaneCollapsed)}
          title={rightPaneCollapsed ? 'Expand tools' : 'Collapse tools'}
          aria-label={rightPaneCollapsed ? 'Expand tools' : 'Collapse tools'}
        >
          {rightPaneCollapsed ? '◀' : '▶'}
        </button>
        {!rightPaneCollapsed && (
          <RightToolsPanel
            isAuthed={isAuthed}
            user={user}
            unreadState={selectedTopicId ? unreadState : null}
            onNextTopic={handleNextTopic}
            nextTopicAvailable={!!nextUnreadTopic}
          />
        )}
      </div>
      
      {/* Create Topic Modal */}
      <CreateTopicModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onTopicCreated={handleTopicCreated}
      />

      {/* PWA install prompt + notification opt-in + offline indicator */}
      <PWAPrompts />
    </div>
  );
}
