import { useState } from 'react';
import { NavigationPanel } from './NavigationPanel';
import { RizzomaTopicsList } from './RizzomaTopicsList';
import { MentionsList } from './MentionsList';
import { TasksList } from './TasksList';
import { RizzomaTopicDetail } from './RizzomaTopicDetail';
import { RightToolsPanel } from './RightToolsPanel';
import { CreateTopicModal } from './CreateTopicModal';
import './RizzomaLayout.css';

interface RizzomaLayoutProps {
  isAuthed: boolean;
}

type TabType = 'topics' | 'mentions' | 'tasks' | 'publics' | 'store' | 'teams';

export function RizzomaLayout({ isAuthed }: RizzomaLayoutProps) {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('topics');
  const [searchPaneCollapsed, setSearchPaneCollapsed] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  console.log('RizzomaLayout render - selectedTopicId:', selectedTopicId);

  const handleNewClick = () => {
    setShowCreateModal(true);
  };

  const handleTopicCreated = (topicId: string) => {
    setSelectedTopicId(topicId);
    setActiveTab('topics');
  };

  const renderSearchPanel = () => {
    switch (activeTab) {
      case 'topics':
        return (
          <RizzomaTopicsList 
            isAuthed={isAuthed}
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
        selectedTopicId={selectedTopicId}
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