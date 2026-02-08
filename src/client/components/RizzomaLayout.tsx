import { useState, useEffect, useRef, useCallback } from 'react';
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

export function RizzomaLayout({ isAuthed, user }: RizzomaLayoutProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [currentBlipPath, setCurrentBlipPath] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('topics');
  const [searchPaneCollapsed, setSearchPaneCollapsed] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [perfSkipTopics, setPerfSkipTopics] = useState(getInitialPerfSkip);
  const unreadState = useWaveUnread(selectedTopicId);

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

  // Pull to refresh for topic list
  const handleRefresh = useCallback(async () => {
    // Trigger a refresh by invalidating data
    // This is a placeholder - actual implementation depends on data fetching strategy
    window.dispatchEvent(new CustomEvent('rizzoma:refresh-topics'));
    await new Promise((resolve) => setTimeout(resolve, 500));
  }, []);

  usePullToRefresh(listContainerRef, {
    onRefresh: handleRefresh,
    enabled: isMobile && mobileView === 'list',
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
    switch (activeTab) {
      case 'topics':
        return (
          <RizzomaTopicsList
            onTopicSelect={setSelectedTopicId}
            selectedTopicId={selectedTopicId}
            isAuthed={isAuthed}
          />
        );
      case 'mentions':
        return <MentionsList isAuthed={isAuthed} onSelectMention={setSelectedTopicId} />;
      case 'tasks':
        return <TasksList isAuthed={isAuthed} onSelectTask={setSelectedTopicId} />;
      case 'publics':
        return <PublicTopicsPanel onSelectTopic={setSelectedTopicId} />;
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
          unreadCount={unreadState?.unreadIds?.length}
        />
      </div>

      {/* Search/List Panel - Left Center */}
      <div
        ref={listContainerRef}
        className={`tabs-container ${searchPaneCollapsed ? 'collapsed' : ''} ${isMobile && mobileView !== 'list' ? 'mobile-hidden' : ''}`}
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
      </div>

      {/* Wave/Content Panel - Center Right */}
      <div
        ref={waveContainerRef}
        className={`wave-container ${isMobile && mobileView !== 'content' ? 'mobile-hidden' : ''}`}
      >
        <div className="inner-wave-container">
          {selectedTopicId ? (
            <>
              <RizzomaTopicDetail
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
        <RightToolsPanel
          isAuthed={isAuthed}
          user={user}
          unreadState={selectedTopicId ? unreadState : null}
        />
      
      {/* Create Topic Modal */}
      <CreateTopicModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onTopicCreated={handleTopicCreated}
      />
    </div>
  );
}
