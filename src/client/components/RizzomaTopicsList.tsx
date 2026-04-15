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

const PAGE_SIZE = 20;

export function RizzomaTopicsList({ onTopicSelect, selectedTopicId, isAuthed }: RizzomaTopicsListProps) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [hoveredTopicId, setHoveredTopicId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  // Infinite-scroll state. Before this, the list hard-coded limit=20
  // and rendered nothing beyond the 20th topic, so mobile users hit a
  // ceiling partway through the alphabet and thought the sidebar was
  // broken (task #40, 2026-04-14).
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const loadTopics = async (append: boolean = false): Promise<void> => {
    if (append && loadingMoreRef.current) return;
    if (append) {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    }
    try {
      const params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', append ? String(topics.length) : '0');
      if (searchTerm) params.set('q', searchTerm);

      const response = await api(`/api/topics?${params.toString()}`);
      if (response.ok && response.data) {
        const topicsList = ((response.data as any).topics || []) as Topic[];
        const more = Boolean((response.data as any).hasMore);
        setTopics((prev) => {
          if (!append) return topicsList;
          // Guard against duplicates when pagination overlaps (e.g.
          // a new topic bumped into the current window between pages).
          const seen = new Set(prev.map((t) => t.id));
          const added = topicsList.filter((t) => !seen.has(t.id));
          return prev.concat(added);
        });
        setHasMore(more);
        // Dispatch event so RizzomaLayout can track which topics have unread blips
        const eventTopics = append
          ? [...topics, ...topicsList].map((t) => ({ id: t.id, unreadCount: t.unreadCount || 0 }))
          : topicsList.map((t) => ({ id: t.id, unreadCount: t.unreadCount || 0 }));
        window.dispatchEvent(new CustomEvent('rizzoma:topics-loaded', {
          detail: { topics: eventTopics }
        }));
      }
    } catch (error) {
      console.error('Failed to load topics:', error);
    } finally {
      if (append) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    setLoading(true);
    void loadTopics(false);
    // Polling every 60s instead of 10s to reduce server load from unread count computation
    const interval = setInterval(() => { void loadTopics(false); }, 60000);
    // Debounce the refresh-topics event so a rapid sequence of
    // mark-read calls (e.g. FtG Next clicked 5× in a row) collapses
    // into a single /api/topics fetch instead of 5.
    let refreshTimer: number | null = null;
    const handleRefresh = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        void loadTopics(false);
      }, 250);
    };
    window.addEventListener('rizzoma:refresh-topics', handleRefresh);
    return () => {
      clearInterval(interval);
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      window.removeEventListener('rizzoma:refresh-topics', handleRefresh);
    };
  }, [searchTerm, isAuthed]);

  // Cleanup hover timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Infinite scroll: observe a sentinel div below the last topic; when
  // it enters the viewport (inside the scroll container, not the page
  // viewport, so we set root = the container), fetch the next page.
  // rootMargin of 200px triggers fetch slightly before the sentinel is
  // fully visible so the user never sees an empty gap while the next
  // page loads.
  useEffect(() => {
    if (!hasMore) return;
    const sentinel = sentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !loadingMoreRef.current) {
          void loadTopics(true);
          break;
        }
      }
    }, { root, rootMargin: '200px', threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
    // topics.length is in deps so the observer re-runs when new items
    // arrive — without it, the first page's sentinel observer would
    // still be active against a stale offset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, topics.length]);

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

      {/* Parity fix (2026-04-13): legacy Rizzoma shows a Rizzoma logo +
          Follow button + keyboard shortcut legend at the BOTTOM of the
          topics column (not the narrow nav-icon column). Rendering it
          here keeps the column-bottom branding row that the legacy
          reference shows in screenshots/rizzoma-live/feature/
          rizzoma-core-features/rizzoma-blips-nested.png. */}
      <div className="topics-container" ref={scrollContainerRef}>
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
        {!loading && topics.length > 0 && hasMore && (
          <div ref={sentinelRef} className="topics-list-sentinel" aria-hidden="true">
            {loadingMore ? 'Loading more…' : ''}
          </div>
        )}
      </div>
      <div className="topics-list-footer" aria-label="Rizzoma branding">
        <div className="topics-list-brand">
          <span className="topics-list-brand-mark" aria-hidden="true">R</span>
          <span className="topics-list-brand-text">Rizzoma</span>
          <button className="topics-list-follow" type="button">Follow</button>
        </div>
        <div className="topics-list-shortcuts" aria-label="Keyboard shortcuts">
          {/* Only the shortcuts with actual keydown handlers are
              advertised. Ctrl+Enter is wired in
              src/client/components/editor/extensions/BlipKeyboardShortcuts.ts
              (Mod-Enter → create inline child blip). Ctrl+Space is
              wired in RizzomaLayout.tsx (task #67, 2026-04-15 — clicks
              the context-dependent Next/Next-Topic button). Ctrl+F
              for Find and Ctrl+1/2/3 for Fold were shown in the
              parity legend before they were implemented; both are
              removed until wired so the legend reflects reality. */}
          <div className="topics-list-shortcut"><kbd>Ctrl</kbd>+<kbd>Enter</kbd><span>New</span></div>
          <div className="topics-list-shortcut"><kbd>Ctrl</kbd>+<kbd>Space</kbd><span>Next</span></div>
        </div>
      </div>
    </div>
  );
}
