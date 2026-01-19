import { useEffect, useState, useCallback, useRef } from 'react';
import { api, ensureCsrf } from '../lib/api';
import { subscribeTopicDetail } from '../lib/socket';
import { toast } from './Toast';
import './RizzomaTopicDetail.css';
import type { WaveUnreadState } from '../hooks/useWaveUnread';
import { getCollapsePreference, setCollapsePreference } from './blip/collapsePreferences';

type TopicFull = {
  id: string;
  title: string;
  content?: string;
  createdAt: number;
  updatedAt: number;
  authorId: string;
  authorName: string;
};

interface BlipData {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  updatedAt: number;
  isRead: boolean;
  childBlips?: BlipData[];
  parentBlipId?: string;
}

function extractTags(html: string): string[] {
  const plainText = html.replace(/<[^>]+>/g, ' ');
  const matches = plainText.match(/#[\w-]+/g) || [];
  return Array.from(new Set(matches));
}

function htmlToPlainText(html: string): string {
  if (typeof window === 'undefined') {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  const div = window.document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').trim();
}

function extractLabel(html: string): string {
  const text = htmlToPlainText(html);
  const firstLine = text.split('\n')[0].trim();
  if (firstLine.length > 120) {
    return firstLine.substring(0, 117) + '...';
  }
  return firstLine || '(empty)';
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function RizzomaTopicDetail({ id, isAuthed = false, unreadState }: { id: string; isAuthed?: boolean; unreadState?: WaveUnreadState | null }) {
  const [topic, setTopic] = useState<TopicFull | null>(null);
  const [blips, setBlips] = useState<BlipData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [expandedBlips, setExpandedBlips] = useState<Set<string>>(new Set());
  const [foldedBlips, setFoldedBlips] = useState<Set<string>>(new Set());
  const [editingBlipId, setEditingBlipId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [replyingToBlipId, setReplyingToBlipId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [newBlipContent, setNewBlipContent] = useState('');

  const replyInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const r = await api(`/api/topics/${encodeURIComponent(id)}`);
      if (r.ok) {
        setTopic(r.data as TopicFull);
        const blipsResponse = await api(`/api/blips?waveId=${encodeURIComponent(id)}&limit=500`);
        if (blipsResponse.ok && blipsResponse.data?.blips) {
          const rawBlips = blipsResponse.data.blips as Array<any>;
          const blipMap = new Map<string, BlipData>();
          rawBlips.forEach(raw => {
            blipMap.set(raw._id || raw.id, {
              id: raw._id || raw.id,
              content: raw.content || '',
              authorId: raw.authorId || '',
              authorName: raw.authorName || 'Unknown',
              createdAt: raw.createdAt || Date.now(),
              updatedAt: raw.updatedAt || raw.createdAt || Date.now(),
              isRead: true,
              parentBlipId: raw.parentId || null,
              childBlips: [],
            });
          });
          const rootBlips: BlipData[] = [];
          blipMap.forEach((blip) => {
            if (blip.parentBlipId) {
              const parent = blipMap.get(blip.parentBlipId);
              if (parent) {
                parent.childBlips = parent.childBlips || [];
                parent.childBlips.push(blip);
              } else {
                rootBlips.push(blip);
              }
            } else {
              rootBlips.push(blip);
            }
          });
          const sortBlips = (items: BlipData[]) => {
            items.sort((a, b) => a.createdAt - b.createdAt);
            items.forEach(blip => { if (blip.childBlips?.length) sortBlips(blip.childBlips); });
          };
          sortBlips(rootBlips);
          setBlips(rootBlips);
        }
        if (unreadState?.refresh) { try { await unreadState.refresh(); } catch {} }
        setError(null);
      } else {
        setError('Failed to load topic');
      }
    } catch {
      setError('Failed to load topic');
    }
  }, [id, unreadState]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!id) return;
    const unsub = subscribeTopicDetail(id, () => load());
    return () => unsub();
  }, [id, load]);

  const toggleExpand = useCallback((blipId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedBlips(prev => {
      const next = new Set(prev);
      if (next.has(blipId)) {
        next.delete(blipId);
        // Clear editing/replying state when collapsing
        if (editingBlipId === blipId) {
          setEditingBlipId(null);
          setEditingContent('');
        }
        if (replyingToBlipId === blipId) {
          setReplyingToBlipId(null);
          setReplyContent('');
        }
      } else {
        next.add(blipId);
      }
      return next;
    });
  }, [editingBlipId, replyingToBlipId]);

  const createRootBlip = useCallback(async () => {
    if (!newBlipContent.trim() || busy) return;
    if (!isAuthed) { toast('Sign in to create blips', 'error'); return; }
    await ensureCsrf();
    setBusy(true);
    try {
      const r = await api('/api/blips', {
        method: 'POST',
        body: JSON.stringify({ waveId: id, content: newBlipContent.trim() })
      });
      if (r.ok) { toast('Blip created'); setNewBlipContent(''); load(); }
      else { toast('Failed to create blip', 'error'); }
    } catch { toast('Failed to create blip', 'error'); }
    setBusy(false);
  }, [newBlipContent, busy, isAuthed, id, load]);

  const startReply = useCallback((blipId: string) => {
    if (!isAuthed) { toast('Sign in to reply', 'error'); return; }
    setReplyingToBlipId(blipId);
    setReplyContent('');
  }, [isAuthed]);

  const startEdit = useCallback((blip: BlipData) => {
    if (!isAuthed) { toast('Sign in to edit', 'error'); return; }
    setEditingBlipId(blip.id);
    setEditingContent(htmlToPlainText(blip.content));
  }, [isAuthed]);

  const finishEdit = useCallback(async () => {
    if (!editingBlipId || busy) return;
    await ensureCsrf();
    setBusy(true);
    try {
      const r = await api(`/api/blips/${encodeURIComponent(editingBlipId)}`, {
        method: 'PATCH', body: JSON.stringify({ content: editingContent })
      });
      if (r.ok) { toast('Saved'); setEditingBlipId(null); setEditingContent(''); load(); }
      else { toast('Save failed', 'error'); }
    } catch { toast('Save failed', 'error'); }
    setBusy(false);
  }, [editingBlipId, editingContent, busy, load]);

  const cancelEdit = useCallback(() => { setEditingBlipId(null); setEditingContent(''); }, []);

  const deleteBlip = useCallback(async (blipId: string) => {
    if (!window.confirm('Delete this blip?')) return;
    await ensureCsrf();
    setBusy(true);
    try {
      const r = await api(`/api/blips/${encodeURIComponent(blipId)}`, { method: 'DELETE' });
      if (r.ok) { toast('Deleted'); setSelectedBlipId(null); load(); }
      else { toast('Delete failed', 'error'); }
    } catch { toast('Delete failed', 'error'); }
    setBusy(false);
  }, [load]);

  const copyLink = useCallback((blipId: string) => {
    const url = `${window.location.origin}${window.location.pathname}#/topic/${id}?blip=${blipId}`;
    navigator.clipboard.writeText(url).then(() => toast('Link copied')).catch(() => toast('Failed', 'error'));
  }, [id]);

  const submitReply = useCallback(async (parentId: string) => {
    if (!replyContent.trim() || busy) return;
    await ensureCsrf();
    setBusy(true);
    try {
      const r = await api('/api/blips', {
        method: 'POST',
        body: JSON.stringify({ waveId: id, parentId, content: replyContent.trim() })
      });
      if (r.ok) {
        toast('Reply added');
        setReplyContent('');
        setReplyingToBlipId(null);
        load();
      }
      else { toast('Reply failed', 'error'); }
    } catch { toast('Reply failed', 'error'); }
    setBusy(false);
  }, [replyContent, busy, id, load]);

  const cancelReply = useCallback(() => {
    setReplyingToBlipId(null);
    setReplyContent('');
  }, []);

  const toggleFold = useCallback(async (blipId: string) => {
    const currentlyFolded = foldedBlips.has(blipId) || getCollapsePreference(blipId);
    const newFoldState = !currentlyFolded;

    // Update local state
    setFoldedBlips(prev => {
      const next = new Set(prev);
      if (newFoldState) {
        next.add(blipId);
        // Collapse the blip when folding
        setExpandedBlips(expanded => {
          const newExpanded = new Set(expanded);
          newExpanded.delete(blipId);
          return newExpanded;
        });
      } else {
        next.delete(blipId);
      }
      return next;
    });

    // Persist to localStorage
    setCollapsePreference(blipId, newFoldState);

    // Persist to server
    try {
      await ensureCsrf();
      await api(`/api/blips/${encodeURIComponent(blipId)}/collapse-default`, {
        method: 'PATCH',
        body: JSON.stringify({ collapseByDefault: newFoldState })
      });
      toast(newFoldState ? 'Blip will be folded by default' : 'Blip will be expanded by default');
    } catch {
      toast('Failed to save fold preference', 'error');
    }
  }, [foldedBlips]);

  const isBlipFolded = useCallback((blipId: string): boolean => {
    return foldedBlips.has(blipId) || getCollapsePreference(blipId);
  }, [foldedBlips]);

  const isBlipUnread = (blipId: string) => unreadState?.unreadSet?.has(blipId) ?? false;

  const hasUnreadInTree = useCallback((blip: BlipData): boolean => {
    if (isBlipUnread(blip.id)) return true;
    return blip.childBlips?.some(child => hasUnreadInTree(child)) ?? false;
  }, [unreadState]);

  const renderBlip = (blip: BlipData, depth: number = 0): JSX.Element => {
    const label = extractLabel(blip.content);
    const fullText = htmlToPlainText(blip.content);
    const isExpanded = expandedBlips.has(blip.id);
    const isEditing = editingBlipId === blip.id;
    const isReplying = replyingToBlipId === blip.id;
    const hasChildren = (blip.childBlips?.length ?? 0) > 0;
    const hasMoreContent = fullText.length > label.length || hasChildren;
    const isUnread = isBlipUnread(blip.id);
    const hasUnreadChildren = hasUnreadInTree(blip) && !isUnread;

    return (
      <li key={blip.id} className={`blip-item ${isUnread ? 'unread' : ''}`} data-blip-id={blip.id}>
        {/* Collapsed view: bullet + label + [+] */}
        <div className="blip-line" onClick={() => toggleExpand(blip.id)}>
          <span className={`blip-label ${isUnread ? 'unread' : ''}`}>{label}</span>
          {hasMoreContent && (
            <button
              className={`blip-expand-btn ${isExpanded ? 'expanded' : ''} ${hasUnreadChildren ? 'has-unread' : ''}`}
              onClick={(e) => toggleExpand(blip.id, e)}
            >
              {isExpanded ? '−' : '□'}
            </button>
          )}
        </div>

        {/* Expanded view: gray box with toolbar at top, content, children, reply */}
        {isExpanded && (
          <div className="blip-expanded-box">
            {/* Toolbar - always visible when expanded */}
            <div className={`blip-toolbar ${isEditing ? 'editing' : ''}`}>
              {isEditing ? (
                /* Edit mode: full formatting toolbar */
                <>
                  <button className="tb-btn primary" onClick={finishEdit} disabled={busy}>Done</button>
                  <button className="tb-btn cancel-btn" onClick={cancelEdit}>Cancel</button>
                  <span className="toolbar-divider" />
                  <button className="tb-btn" disabled>↶</button>
                  <button className="tb-btn" disabled>↷</button>
                  <span className="toolbar-divider" />
                  <button className="tb-btn bold-btn"><b>B</b></button>
                  <button className="tb-btn italic-btn"><i>I</i></button>
                  <button className="tb-btn underline-btn"><u>U</u></button>
                  <button className="tb-btn strike-btn"><s>S</s></button>
                  <span className="toolbar-divider" />
                  <button className="tb-btn">T</button>
                  <button className="tb-btn">Tx</button>
                  <span className="toolbar-divider" />
                  <button className="tb-btn">≡</button>
                  <button className="tb-btn">☰</button>
                  <span className="toolbar-divider" />
                  <button className="tb-btn">😊</button>
                  <button className="tb-btn link-btn">🔗</button>
                  <button className="tb-btn">📷</button>
                  <span className="toolbar-divider" />
                  <button
                    className={`tb-btn fold-btn ${isBlipFolded(blip.id) ? 'active' : ''}`}
                    onClick={() => toggleFold(blip.id)}
                    title={isBlipFolded(blip.id) ? 'Unfold this blip' : 'Fold this blip (collapse by default)'}
                  >
                    {isBlipFolded(blip.id) ? '☑ Fold' : '☐ Fold'}
                  </button>
                  <button className="tb-btn delete-btn" onClick={() => deleteBlip(blip.id)}>🗑</button>
                </>
              ) : (
                /* View mode: simple toolbar with Edit, Reply, Link, Fold */
                <>
                  {isAuthed && <button className="tb-btn edit-btn" onClick={() => startEdit(blip)}>✏️ Edit</button>}
                  {isAuthed && <button className="tb-btn reply-btn" onClick={() => startReply(blip.id)}>💬 Reply</button>}
                  <button className="tb-btn link-btn" onClick={() => copyLink(blip.id)}>🔗 Link</button>
                  {isAuthed && (
                    <button
                      className={`tb-btn fold-btn ${isBlipFolded(blip.id) ? 'active' : ''}`}
                      onClick={() => toggleFold(blip.id)}
                      title={isBlipFolded(blip.id) ? 'Unfold this blip' : 'Fold this blip (collapse by default)'}
                    >
                      Fold
                    </button>
                  )}
                  <span className="toolbar-spacer" />
                  {isAuthed && <button className="tb-btn delete-btn" onClick={() => deleteBlip(blip.id)}>🗑</button>}
                  <button className="tb-btn settings-btn">⚙</button>
                </>
              )}
            </div>

            {/* Content + avatar/date */}
            <div className="blip-content-row">
              <div className="blip-content">
                {isEditing ? (
                  <textarea
                    className="blip-edit-area"
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    rows={4}
                    autoFocus
                  />
                ) : (
                  <div className="blip-full-text">{fullText}</div>
                )}
              </div>
              <div className="blip-box-meta">
                <img className="blip-avatar-img" src={`https://ui-avatars.com/api/?name=${encodeURIComponent(blip.authorName)}&size=32&background=random`} alt="" />
                <span className="blip-box-date">{formatDate(blip.updatedAt)}</span>
              </div>
            </div>

            {/* Children */}
            {hasChildren && (
              <ul className="blip-children">
                {blip.childBlips!.map(child => renderBlip(child, depth + 1))}
              </ul>
            )}

            {/* Reply input - only when replying to this blip */}
            {isReplying && (
              <div className="blip-reply-row">
                <button className="tb-btn primary" onClick={() => submitReply(blip.id)} disabled={busy || !replyContent.trim()}>Add Reply</button>
                <button className="tb-btn cancel-btn" onClick={cancelReply}>Cancel</button>
                <input
                  ref={replyInputRef}
                  type="text"
                  className="reply-input"
                  placeholder="Write a reply..."
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitReply(blip.id); } }}
                  autoFocus
                />
              </div>
            )}
          </div>
        )}
      </li>
    );
  };

  if (error) {
    return (
      <div className="rizzoma-topic-detail">
        <div className="error-message">{error}<button onClick={load}>Retry</button></div>
      </div>
    );
  }

  if (!topic) {
    return <div className="rizzoma-topic-detail loading">Loading...</div>;
  }

  const tags = extractTags(topic.content || '');

  return (
    <div className="rizzoma-topic-detail">
      {/* Header: Title + avatar/date on right */}
      <div className="topic-header">
        <div className="topic-header-left">
          <h1 className="topic-title">{topic.title || 'Untitled'}</h1>
          {tags.length > 0 && (
            <div className="topic-tags">
              {tags.map((tag, i) => <span key={i} className="topic-tag">{tag}</span>)}
            </div>
          )}
        </div>
        <div className="topic-header-right">
          <img className="topic-avatar" src={`https://ui-avatars.com/api/?name=${encodeURIComponent(topic.authorName || 'U')}&size=40&background=random`} alt="" />
          <span className="topic-date">{formatDate(topic.updatedAt)}</span>
        </div>
      </div>

      {/* Topic-level toolbar */}
      <div className="topic-toolbar">
        {isAuthed ? (
          <>
            <button className="tb-btn primary add-blip-btn" onClick={() => document.querySelector<HTMLInputElement>('.new-blip-input')?.focus()}>
              ➕ Add Blip
            </button>
            <button className="tb-btn edit-btn">✏️ Edit Topic</button>
            <button className="tb-btn">📎 Attach</button>
            <button className="tb-btn link-btn">🔗 Share</button>
            <span className="toolbar-spacer" />
            <button className="tb-btn">👥 Participants</button>
            <button className="tb-btn settings-btn">⚙️ Settings</button>
          </>
        ) : (
          <>
            <button className="tb-btn link-btn">🔗 Share</button>
            <span className="toolbar-spacer" />
            <span className="toolbar-hint">Sign in to edit</span>
          </>
        )}
      </div>

      {/* Blips list - full width */}
      <div className="topic-body">
        {blips.length > 0 ? (
          <ul className="blips-list">
            {blips.map(blip => renderBlip(blip))}
          </ul>
        ) : (
          <div className="empty-state">No blips yet. Add one below!</div>
        )}

        {/* New root blip input */}
        {isAuthed && (
          <div className="new-blip-section">
            <div className="new-blip-input-row">
              <input
                type="text"
                className="new-blip-input"
                placeholder="Add a new blip..."
                value={newBlipContent}
                onChange={(e) => setNewBlipContent(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createRootBlip(); } }}
              />
              <button
                className="tb-btn primary new-blip-btn"
                onClick={createRootBlip}
                disabled={busy || !newBlipContent.trim()}
              >
                + Add Blip
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
