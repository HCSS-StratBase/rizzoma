import { FEATURES } from '@shared/featureFlags';
import './NavigationPanel.css';

interface NavigationPanelProps {
  activeTab: string;
  onTabChange: (tab: any) => void;
  isAuthed: boolean;
  onNewClick: () => void;
  unreadCount?: number;
}

export function NavigationPanel({ activeTab, onTabChange, isAuthed, onNewClick, unreadCount }: NavigationPanelProps) {
  return (
    <div className="navigation-panel">
      <div className="new-topic-buttons">
        <button
          className="create-wave button new-button"
          onClick={onNewClick}
          title="Create new topic"
        >
          + New
        </button>
      </div>

      <div className="nav-tabs">
        <div
          className={`tab topics ${activeTab === 'topics' ? 'active' : ''}`}
          onClick={() => onTabChange('topics')}
          title="Topics"
        >
          <span className="pict topics-pict" />
          <span className="tab-title">Topics</span>
        </div>

        {isAuthed && (
          <>
            <div
              className={`tab mentions ${activeTab === 'mentions' ? 'active' : ''}`}
              onClick={() => onTabChange('mentions')}
              title="Mentions"
            >
              <span className="pict mentions-pict" />
              <span className="tab-title">Mentions</span>
              {(unreadCount ?? 0) > 0 && <span className="unread-mentions-count">{unreadCount}</span>}
            </div>

            <div
              className={`tab tasks ${activeTab === 'tasks' ? 'active' : ''} ${!FEATURES.TASKS ? 'locked' : ''}`}
              onClick={() => FEATURES.TASKS && onTabChange('tasks')}
              title={!FEATURES.TASKS ? 'Tasks available for business accounts' : 'Tasks'}
            >
              <span className="pict tasks-pict" />
              <span className="tab-title">Tasks</span>
            </div>
          </>
        )}

        <div
          className={`tab publics ${activeTab === 'publics' ? 'active' : ''}`}
          onClick={() => onTabChange('publics')}
          title="Publics"
        >
          <span className="pict publics-pict" />
          <span className="tab-title">Publics</span>
        </div>

        <div
          className={`tab store ${activeTab === 'store' ? 'active' : ''}`}
          onClick={() => onTabChange('store')}
          title="Store"
        >
          <span className="pict market-pict" />
          <span className="tab-title">Store</span>
        </div>

        <div
          className={`tab teams ${activeTab === 'teams' ? 'active' : ''}`}
          onClick={() => onTabChange('teams')}
          title="Teams"
        >
          <span className="pict teams-pict" />
          <span className="tab-title">Teams</span>
        </div>
      </div>

      <div className="help-tab">
        <div className="tab help" title="Help">
          <span className="pict help-pict" />
          <span className="tab-title">Help</span>
        </div>
      </div>
    </div>
  );
}
