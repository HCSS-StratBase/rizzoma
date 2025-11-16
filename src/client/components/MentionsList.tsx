import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './MentionsList.css';

interface MentionsListProps {
  isAuthed: boolean;
  onSelectMention: (topicId: string) => void;
}

interface Mention {
  id: string;
  topicId: string;
  topicTitle: string;
  mentionText: string;
  authorName: string;
  authorId: string;
  timestamp: string;
  isRead: boolean;
}

export function MentionsList({ isAuthed, onSelectMention }: MentionsListProps) {
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false);
      return;
    }
    
    loadMentions();
  }, [isAuthed]);

  const loadMentions = async () => {
    try {
      setLoading(true);
      // For now, create mock data since the API doesn't have mentions endpoint yet
      const mockMentions: Mention[] = [
        {
          id: '1',
          topicId: '43dc6fb93c4b7c1abc80aa4df6001060',
          topicTitle: 'Welcome to Rizzoma',
          mentionText: '@you Great work on the new features!',
          authorName: 'Alice Johnson',
          authorId: 'alice',
          timestamp: new Date().toISOString(),
          isRead: false,
        },
        {
          id: '2',
          topicId: '43dc6fb93c4b7c1abc80aa4df6001060',
          topicTitle: 'Project Planning',
          mentionText: '@you Can you review this document?',
          authorName: 'Bob Smith',
          authorId: 'bob',
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          isRead: true,
        }
      ];
      setMentions(mockMentions);
    } catch (error) {
      console.error('Failed to load mentions:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredMentions = filter === 'unread' 
    ? mentions.filter(m => !m.isRead)
    : mentions;

  const unreadCount = mentions.filter(m => !m.isRead).length;

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 86400000) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  if (!isAuthed) {
    return (
      <div className="mentions-list">
        <div className="login-prompt">
          <p>Sign in to view your mentions</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mentions-list">
        <div className="loading">Loading mentions...</div>
      </div>
    );
  }

  return (
    <div className="mentions-list">
      <div className="mentions-filter">
        <button 
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All ({mentions.length})
        </button>
        <button 
          className={filter === 'unread' ? 'active' : ''}
          onClick={() => setFilter('unread')}
        >
          Unread ({unreadCount})
        </button>
      </div>
      
      <div className="mentions-items">
        {filteredMentions.length === 0 ? (
          <div className="no-mentions">
            {filter === 'unread' ? 'No unread mentions' : 'No mentions yet'}
          </div>
        ) : (
          filteredMentions.map(mention => (
            <div 
              key={mention.id}
              className={`mention-item ${!mention.isRead ? 'unread' : ''}`}
              onClick={() => onSelectMention(mention.topicId)}
            >
              <div className="mention-header">
                <span className="topic-title">{mention.topicTitle}</span>
                <span className="timestamp">{formatTimestamp(mention.timestamp)}</span>
              </div>
              <div className="mention-content">
                <span className="author-name">{mention.authorName}</span>
                <span className="mention-text">{mention.mentionText}</span>
              </div>
              {!mention.isRead && <span className="unread-indicator">•</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}