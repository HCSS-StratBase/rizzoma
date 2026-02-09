import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import './RizzomaTopicsList.css';

interface Topic {
  id: string;
  title: string;
  authorId: string;
  authorName?: string;
  authorAvatar?: string;
  createdAt: number;
  updatedAt: number;
  snippet?: string;
  unreadCount?: number;
  totalCount?: number;
  isFollowed?: boolean;
}

interface RizzomaTopicsListProps {
  onTopicSelect: (topicId: string) => void;
  selectedTopicId: string | null;
  isAuthed?: boolean;
}

// Calculate unread bar height using logarithmic scale (like original Rizzoma)
function getUnreadBarHeight(unreadCount: number, totalCount: number): number {
  if (unreadCount === 0) return 0;
  if (totalCount <= 1) return 100;
  // log(unreadCount+1) * 100 / log(totalCount+1)
  return Math.log(unreadCount + 1) * 100 / Math.log(totalCount + 1);
}

// Format date: show time if today, otherwise show date
function formatSmartDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    // Show time like "5:22 PM"
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } else {
    // Show date like "17 Jan"
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short'
    });
  }
}

// Get user initials from name or email
function getInitials(name?: string, email?: string): string {
  const source = name || email || 'U';
  const parts = source.split(/[\s@]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

const SHOW_FOLLOW_BUTTON_DELAY = 500; // ms, same as original

export function RizzomaTopicsList({ onTopicSelect, selectedTopicId, isAuthed }: RizzomaTopicsListProps) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredTopicId, setHoveredTopicId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);

  const loadTopics = async () => {
    try {
      const params = new URLSearchParams();
      params.set('limit', '20');
      params.set('offset', '0');
      if (searchTerm) params.set('q', searchTerm);

      const response = await api(`/api/topics?${params.toString()}`);
      if (response.ok && response.data) {
        const topicsList = (response.data as any).topics || [];
        setTopics(topicsList);
        // Dispatch event so RizzomaLayout can track which topics have unread blips
        window.dispatchEvent(new CustomEvent('rizzoma:topics-loaded', {
          detail: { topics: topicsList.map((t: Topic) => ({ id: t.id, unreadCount: t.unreadCount || 0 })) }
        }));
      }
    } catch (error) {
      console.error('Failed to load topics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadTopics();
    // Polling every 60s instead of 10s to reduce server load from unread count computation
    const interval = setInterval(loadTopics, 60000);
    const handleRefresh = () => { loadTopics(); };
    window.addEventListener('rizzoma:refresh-topics', handleRefresh);
    return () => { clearInterval(interval); window.removeEventListener('rizzoma:refresh-topics', handleRefresh); };
  }, [searchTerm, isAuthed]);

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Handle mouse enter on topic content (title/snippet area)
  const handleMouseEnterContent = useCallback((topicId: string) => {
    // Don't show hover state on already selected item
    if (topicId === selectedTopicId) return;

    // Clear any existing timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    // Set timeout to show follow button after delay
    hoverTimeoutRef.current = window.setTimeout(() => {
      setHoveredTopicId(topicId);
    }, SHOW_FOLLOW_BUTTON_DELAY);
  }, [selectedTopicId]);

  // Handle mouse leave on topic item
  const handleMouseLeaveItem = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredTopicId(null);
  }, []);

  // Handle follow/unfollow button click
  const handleFollowClick = useCallback(async (e: React.MouseEvent, topic: Topic) => {
    e.stopPropagation();
    e.preventDefault();

    const action = topic.isFollowed ? 'unfollow' : 'follow';
    try {
      const response = await api(`/api/topics/${topic.id}/${action}`, { method: 'POST' });
      if (response.ok) {
        // Update the topic in the list
        setTopics(prev => prev.map(t =>
          t.id === topic.id ? { ...t, isFollowed: !t.isFollowed } : t
        ));
      }
    } catch (error) {
      console.error(`Failed to ${action} topic:`, error);
    }
  }, []);

  // Generate avatar URL
  const getAvatarUrl = (authorId: string, authorAvatar?: string) => {
    if (authorAvatar) return authorAvatar;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(authorId)}&size=30&background=random&format=svg`;
  };

  return (
    <div className="rizzoma-topics-list">
      <div className="topics-header">
        <div className="search-query-container">
          <input
            type="text"
            placeholder="Search topics..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-query"
          />
          <div className="search-icon" />
        </div>
      </div>

      <div className="topics-container">
        {loading ? (
          <div className="loading">Loading...</div>
        ) : topics.length === 0 ? (
          <div className="no-topics">No topics yet</div>
        ) : (
          topics.map((topic) => {
            const isSelected = selectedTopicId === topic.id;
            const isHovered = hoveredTopicId === topic.id;
            const showFollowButton = isSelected || isHovered;
            const unreadCount = topic.unreadCount || 0;
            const totalCount = topic.totalCount || 1;
            const unreadBarHeight = getUnreadBarHeight(unreadCount, totalCount);

            return (
              <div
                key={topic.id}
                className={`search-result-item ${isSelected ? 'active' : ''} ${unreadCount > 0 ? 'unread' : ''} ${showFollowButton ? 'show-follow-button' : ''}`}
                onClick={() => onTopicSelect(topic.id)}
                onMouseLeave={handleMouseLeaveItem}
              >
                {/* Unread indicator bar on left */}
                <div className="unread-blips-indicator">
                  <div style={{ height: `${unreadBarHeight}%` }} />
                </div>

                {/* Text content - title and snippet */}
                <div
                  className="text-content"
                  onMouseEnter={() => handleMouseEnterContent(topic.id)}
                >
                  <div className="wave-title">
                    <span>{topic.title || 'Untitled'}</span>
                    {topic.snippet && (
                      <>
                        <br />
                        <span className="item-snippet">{topic.snippet}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Wave info area - avatar/date OR follow button */}
                <div className="wave-info">
                  {/* Follow/Unfollow button - shown on hover or select */}
                  <button
                    className="follow button"
                    onClick={(e) => handleFollowClick(e, topic)}
                  >
                    {topic.isFollowed !== false ? 'Unfollow' : 'Follow'}
                  </button>

                  {/* Info section - avatar and date */}
                  <div className="info">
                    <div
                      className="last-editing avatar"
                      style={{ backgroundImage: `url(${getAvatarUrl(topic.authorId, topic.authorAvatar)})` }}
                      title={topic.authorName || topic.authorId}
                    >
                      {getInitials(topic.authorName, topic.authorId)}
                    </div>
                    <div className="last-changed" title={new Date(topic.updatedAt).toLocaleString()}>
                      {formatSmartDate(topic.updatedAt)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
