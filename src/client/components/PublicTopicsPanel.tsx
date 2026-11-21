import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import './PublicTopicsPanel.css';

interface PublicTopicsPanelProps {
  onSelectTopic: (topicId: string) => void;
}

interface PublicTopic {
  id: string;
  title: string;
  authorName: string;
  updatedAt: number;
  blipCount?: number;
  snippet?: string;
}

const TAG_RE = /#[\p{L}\p{N}_-]+/gu;
const tagsOf = (t: PublicTopic): string[] => [...new Set(`${t.title} ${t.snippet || ''}`.match(TAG_RE) || [])];

export function PublicTopicsPanel({ onSelectTopic }: PublicTopicsPanelProps): JSX.Element {
  const [topics, setTopics] = useState<PublicTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    loadPublicTopics();
  }, []);

  const loadPublicTopics = async (): Promise<void> => {
    setLoading(true);
    try {
      // Try to fetch public topics from API
      const response = await api<{ topics: PublicTopic[] }>('/api/topics?public=true&limit=50');
      if (response.ok && response.data && typeof response.data === 'object') {
        const data = response.data as { topics: PublicTopic[] };
        setTopics(data.topics || []);
      }
    } catch (error) {
      console.error('Failed to load public topics:', error);
    } finally {
      setLoading(false);
    }
  };

  // Tag filter row at the top of the list, as in the original's Publics tab (#Education #Rizzoma ...): the tags used by the public topics,
  // most used first; clicking one narrows the list to the topics carrying it, clicking it again clears the filter.
  const tagCounts = new Map<string, number>();
  topics.forEach((t) => tagsOf(t).forEach((g) => tagCounts.set(g, (tagCounts.get(g) || 0) + 1)));
  const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([g]) => g);
  const filteredTopics = topics.filter(topic =>
    (!activeTag || tagsOf(topic).includes(activeTag)) && (
      topic.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      topic.authorName.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 86400000) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 604800000) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  if (loading) {
    return (
      <div className="public-topics-panel">
        <div className="loading">Loading public topics...</div>
      </div>
    );
  }

  return (
    <div className="public-topics-panel">
      {topTags.length > 0 && (
        <div className="public-tags" data-testid="public-tags">
          {topTags.map((g) => (
            <button key={g} type="button" className={`public-tag${activeTag === g ? ' active' : ''}`} data-testid="public-tag" onClick={() => setActiveTag(activeTag === g ? null : g)}>{g}</button>
          ))}
        </div>
      )}
      <div className="panel-search">
        <input
          type="text"
          placeholder="Search public topics..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="topics-list">
        {filteredTopics.length === 0 ? (
          <div className="empty-state">
            {searchQuery ? 'No matching topics found' : 'No public topics available'}
          </div>
        ) : (
          filteredTopics.map(topic => (
            <div
              key={topic.id}
              className="topic-item"
              onClick={() => onSelectTopic(topic.id)}
            >
              <div className="topic-title">{topic.title}</div>
              <div className="topic-meta">
                <span className="author">{topic.authorName}</span>
                <span className="date">{formatDate(topic.updatedAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
