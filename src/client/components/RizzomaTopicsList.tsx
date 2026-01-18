import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatTimestamp } from '../lib/format';
import './RizzomaTopicsList.css';

interface Topic {
  id: string;
  title: string;
  authorId: string;
  createdAt: number;
  updatedAt: number;
  unreadCount?: number;
}

interface RizzomaTopicsListProps {
  onTopicSelect: (topicId: string) => void;
  selectedTopicId: string | null;
}

export function RizzomaTopicsList({ onTopicSelect, selectedTopicId }: RizzomaTopicsListProps) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadTopics = async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.set('q', searchTerm);

      const response = await api(`/api/topics?${params.toString()}`);
      if (response.ok && response.data) {
        setTopics((response.data as any).topics || []);
      }
    } catch (error) {
      console.error('Failed to load topics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTopics();
    const interval = setInterval(loadTopics, 10000);
    return () => clearInterval(interval);
  }, [searchTerm]);

  // Generate avatar URL from author ID
  const getAvatarUrl = (authorId: string) => {
    return `https://ui-avatars.com/api/?name=${authorId}&size=32&background=random`;
  };

  return (
    <div className="rizzoma-topics-list">
      <div className="topics-header">
        <input
          type="text"
          placeholder="Search topics..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>
      
      <div className="topics-container">
        {loading ? (
          <div className="loading">Loading...</div>
        ) : topics.length === 0 ? (
          <div className="no-topics">No topics yet</div>
        ) : (
          topics.map((topic) => (
            <div
              key={topic.id}
              className={`topic-item ${selectedTopicId === topic.id ? 'selected' : ''}`}
              onClick={() => onTopicSelect(topic.id)}
            >
              <div className={`topic-unread-bar ${topic.unreadCount && topic.unreadCount > 0 ? 'has-unread' : ''}`}>
                <div className="topic-unread-fill" />
              </div>
              <img 
                src={getAvatarUrl(topic.authorId || 'Unknown')} 
                alt="Avatar" 
                className="topic-avatar"
              />
              <div className="topic-content">
                <div className="topic-title">{topic.title}</div>
                <div className="topic-time">
                  {formatTimestamp(topic.createdAt)}
                </div>
              </div>
              {topic.unreadCount && topic.unreadCount > 0 && (
                <span className="unread-badge">{topic.unreadCount}</span>
              )}
            </div>
          ))
        )}
      </div>

      <div className="topics-footer">
        <button className="unfollow-btn">Unfollow</button>
      </div>
    </div>
  );
}
