import { useState, useEffect, useCallback } from 'react';
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

interface MentionsResponse {
  mentions: Mention[];
  total: number;
  unreadCount: number;
}

export function MentionsList({ isAuthed, onSelectMention }: MentionsListProps): JSX.Element {
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [unreadCount, setUnreadCount] = useState(0);

  const loadMentions = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await api<MentionsResponse>(`/api/mentions?filter=${filter}`);
      if (response.ok && response.data && typeof response.data === 'object') {
        const data = response.data as MentionsResponse;
        setMentions(data.mentions);
        setUnreadCount(data.unreadCount);
      }
    } catch (error) {
      console.error('Failed to load mentions:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false);
      return;
    }

    loadMentions();
  }, [isAuthed, loadMentions]);

  const markAsRead = async (mentionId: string): Promise<void> => {
    try {
      await api(`/api/mentions/${mentionId}/read`, { method: 'POST' });
      setMentions(prev => prev.map(m =>
        m.id === mentionId ? { ...m, isRead: true } : m
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark mention as read:', error);
    }
  };

  const filteredMentions = filter === 'unread'
    ? mentions.filter(m => !m.isRead)
    : mentions;

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
              onClick={() => {
                if (!mention.isRead) {
                  markAsRead(mention.id);
                }
                onSelectMention(mention.topicId);
              }}
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
