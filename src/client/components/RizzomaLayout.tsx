import { useState, useEffect } from 'react';
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

export function RizzomaLayout({ isAuthed }: RizzomaLayoutProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('topics');
  const [searchPaneCollapsed, setSearchPaneCollapsed] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [perfSkipTopics, setPerfSkipTopics] = useState(getInitialPerfSkip);
  const unreadState = useWaveUnread(selectedTopicId);

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

  return (
    <div className="rizzoma-layout">
      {/* Navigation Panel - Far Left */}
      <div className="navigation-container">
        <NavigationPanel 
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isAuthed={isAuthed}
          onNewClick={handleNewClick}
        />
      </div>
      
      {/* Search/List Panel - Left Center */}
      <div className={`tabs-container ${searchPaneCollapsed ? 'collapsed' : ''}`}>
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
      <div className="wave-container">
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
