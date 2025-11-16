import { FEATURES } from '@shared/featureFlags';
import './NavigationPanel.css';

interface NavigationPanelProps {
  activeTab: string;
  onTabChange: (tab: any) => void;
  isAuthed: boolean;
}

export function NavigationPanel({ activeTab, onTabChange, isAuthed }: NavigationPanelProps) {
  return (
    <div className="navigation-panel">
      <div className="nav-header">
        <button 
          className="nav-button new-button"
          onClick={() => window.location.hash = '#/new'}
        >
          <span className="icon">+</span>
          <span className="label">New</span>
        </button>
      </div>
      
      <div className="nav-tabs">
        <button 
          className={`nav-tab ${activeTab === 'topics' ? 'active' : ''}`}
          onClick={() => onTabChange('topics')}
        >
          <span className="icon">📄</span>
          <span className="label">Topics</span>
        </button>
        
        {isAuthed && (
          <>
            <button 
              className={`nav-tab ${activeTab === 'mentions' ? 'active' : ''}`}
              onClick={() => onTabChange('mentions')}
            >
              <span className="icon">@</span>
              <span className="label">Mentions</span>
              <span className="badge">11</span>
            </button>
            
            <button 
              className={`nav-tab ${activeTab === 'tasks' ? 'active' : ''} ${!FEATURES.TASKS ? 'locked' : ''}`}
              onClick={() => FEATURES.TASKS && onTabChange('tasks')}
              title={!FEATURES.TASKS ? 'Tasks available for business accounts' : ''}
            >
              <span className="icon">✓</span>
              <span className="label">Tasks</span>
              {!FEATURES.TASKS && <span className="lock">🔒</span>}
            </button>
          </>
        )}
        
        <button 
          className={`nav-tab ${activeTab === 'publics' ? 'active' : ''}`}
          onClick={() => onTabChange('publics')}
        >
          <span className="icon">🌐</span>
          <span className="label">Publics</span>
        </button>
        
        <button 
          className={`nav-tab ${activeTab === 'store' ? 'active' : ''}`}
          onClick={() => onTabChange('store')}
        >
          <span className="icon">🛒</span>
          <span className="label">Store</span>
        </button>
        
        <button 
          className={`nav-tab ${activeTab === 'teams' ? 'active' : ''}`}
          onClick={() => onTabChange('teams')}
        >
          <span className="icon">👥</span>
          <span className="label">Teams</span>
        </button>
      </div>
      
      <div className="nav-footer">
        <button className="nav-help">
          <span className="icon">?</span>
          <span className="label">Help</span>
        </button>
      </div>
    </div>
  );
}