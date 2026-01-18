import { useState, useEffect, useRef, useCallback } from 'react';
import { NavigationPanel } from './NavigationPanel';
import { RizzomaTopicsList } from './RizzomaTopicsList';
import { MentionsList } from './MentionsList';
import { TasksList } from './TasksList';
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
}

type TabType = 'topics' | 'mentions' | 'tasks' | 'publics' | 'store' | 'teams';

const PERF_SKIP_KEY = 'rizzoma:perf:skipSidebarTopics';

const getInitialPerfSkip = (): boolean => {
  const hash = typeof window !== 'undefined' ? window.location.hash || '' : '';
  const perfHash = hash.includes('perf=1');
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

export function RizzomaLayout({ isAuthed }: RizzomaLayoutProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
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
      const mTopic = hash.match(/^#\/topic\/([^?]+)/);
      if (mTopic?.[1]) {
        setSelectedTopicId(mTopic[1]);
      }
      if (hash.includes('perf=1')) {
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
    setSelectedTopicId(topicId);
    setActiveTab('topics');
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
          />
        );
      case 'mentions':
        return <MentionsList isAuthed={isAuthed} onSelectMention={setSelectedTopicId} />;
      case 'tasks':
        return <TasksList isAuthed={isAuthed} onSelectTask={setSelectedTopicId} />;
      case 'publics':
        return (
          <div className="panel-placeholder">
            <h3>Public Topics</h3>
            <p>Browse public topics from the community</p>
          </div>
        );
      case 'store':
        return (
          <div className="panel-placeholder">
            <h3>Store</h3>
            <p>Gadgets and extensions marketplace</p>
          </div>
        );
      case 'teams':
        return (
          <div className="panel-placeholder">
            <h3>Teams</h3>
            <p>Manage your team workspaces</p>
          </div>
        );
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
