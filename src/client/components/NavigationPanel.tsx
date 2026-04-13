import { 
  FileText, 
  AtSign, 
  CheckSquare, 
  Globe, 
  ShoppingBag, 
  Users, 
  Plus, 
  HelpCircle 
} from 'lucide-react';
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
      <div className="nav-header">
        <button 
          className="nav-button new-button"
          onClick={onNewClick}
        >
          <span className="icon"><Plus size={20} /></span>
          <span className="label">New</span>
        </button>
      </div>
      
      <div className="nav-tabs">
        <button 
          className={`nav-tab ${activeTab === 'topics' ? 'active' : ''}`}
          onClick={() => onTabChange('topics')}
        >
          <span className="icon" style={{ color: '#64748b' }}><FileText size={20} /></span>
          <span className="label">Topics</span>
        </button>
        
        {isAuthed && (
          <>
            <button 
              className={`nav-tab ${activeTab === 'mentions' ? 'active' : ''}`}
              onClick={() => onTabChange('mentions')}
            >
              <span className="icon" style={{ color: '#0d9488' }}><AtSign size={20} /></span>
              <span className="label">Mentions</span>
              {(unreadCount ?? 0) > 0 && <span className="badge">{unreadCount}</span>}
            </button>
            
            <button 
              className={`nav-tab ${activeTab === 'tasks' ? 'active' : ''} ${!FEATURES.TASKS ? 'locked' : ''}`}
              onClick={() => FEATURES.TASKS && onTabChange('tasks')}
              title={!FEATURES.TASKS ? 'Tasks available for business accounts' : ''}
            >
              <span className="icon" style={{ color: '#4f46e5' }}><CheckSquare size={20} /></span>
              <span className="label">Tasks</span>
              {!FEATURES.TASKS && <span className="lock">🔒</span>}
            </button>
          </>
        )}
        
        <button 
          className={`nav-tab ${activeTab === 'publics' ? 'active' : ''}`}
          onClick={() => onTabChange('publics')}
        >
          <span className="icon" style={{ color: '#2563eb' }}><Globe size={20} /></span>
          <span className="label">Publics</span>
        </button>
        
        <button 
          className={`nav-tab ${activeTab === 'store' ? 'active' : ''}`}
          onClick={() => onTabChange('store')}
        >
          <span className="icon" style={{ color: '#d97706' }}><ShoppingBag size={20} /></span>
          <span className="label">Store</span>
        </button>
        
        <button 
          className={`nav-tab ${activeTab === 'teams' ? 'active' : ''}`}
          onClick={() => onTabChange('teams')}
        >
          <span className="icon" style={{ color: '#7c3aed' }}><Users size={20} /></span>
          <span className="label">Teams</span>
        </button>
      </div>
      
      {/* Parity fix (2026-04-13): legacy Rizzoma has a Rizzoma logo + wordmark
          bottom-left of the nav column, above the Help button. See
          screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-main.png.
          Rendering a compact branding row here matches the legacy surface
          without pulling in the full legacy footer (Follow button, shortcut
          legend, subscription badge) which are separate features. */}
      <div className="nav-brand" aria-label="Rizzoma">
        <span className="nav-brand-mark" aria-hidden="true">R</span>
        <span className="nav-brand-text">Rizzoma</span>
      </div>
      <div className="nav-footer">
        <button className="nav-help">
          <span className="icon"><HelpCircle size={20} /></span>
          <span className="label">Help</span>
        </button>
      </div>
    </div>
  );
}