import { useEffect, useState, useCallback, useRef } from 'react';
import { api, ensureCsrf } from '../lib/api';
// DISABLED: Socket subscription was causing infinite loop
// import { subscribeTopicDetail } from '../lib/socket';
import { toast } from './Toast';
import { InviteModal } from './InviteModal';
import { ShareModal } from './ShareModal';
import ExportModal from './ExportModal';
import './RizzomaTopicDetail.css';
import type { WaveUnreadState } from '../hooks/useWaveUnread';
import { RizzomaBlip, type BlipData, type BlipContributor } from './blip/RizzomaBlip';
import { injectInlineMarkers } from './blip/inlineMarkers';
import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { getEditorExtensions, defaultEditorProps } from './editor/EditorConfig';

// Global state to track loading per topic to prevent infinite loops
// Uses window property to persist across Vite HMR reloads
const LOAD_THROTTLE_MS = 5000; // Minimum time between loads
const SOCKET_COOLDOWN_MS = 10000; // Cooldown period after load to ignore socket events

type LoadingState = { isLoading: boolean; lastLoadTime: number; lastCompleteTime: number };
declare global {
  interface Window {
    __rizzomaLoadingState?: Map<string, LoadingState>;
  }
}

function getLoadingState(): Map<string, LoadingState> {
  if (typeof window !== 'undefined') {
    if (!window.__rizzomaLoadingState) {
      window.__rizzomaLoadingState = new Map();
    }
    return window.__rizzomaLoadingState;
  }
  // Fallback for SSR (shouldn't happen)
  return new Map();
}

function getPerfBlipLimit(): number {
  if (typeof window === 'undefined') return 500;
  const hash = window.location.hash || '';
  const query = hash.split('?')[1] || '';
  const params = new URLSearchParams(query);
  if (!params.has('perf')) return 500;
  const rawLimit = Number(params.get('perfLimit') || '');
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 2000;
  return Math.max(500, Math.min(limit, 5000));
}

function getPerfRenderMode(): 'lite' | 'full' | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  const query = hash.split('?')[1] || '';
  const params = new URLSearchParams(query);
  if (!params.has('perf')) return null;
  const mode = params.get('perfRender');
  return mode === 'lite' ? 'lite' : 'full';
}

type TopicFull = {
  id: string;
  title: string;
  content?: string;
  createdAt: number;
  updatedAt: number;
  authorId: string;
  authorName: string;
};

type Participant = {
  id: string;
  userId: string;
  email: string;
  role: 'owner' | 'editor' | 'viewer';
  status: 'pending' | 'accepted' | 'declined';
  invitedAt: number;
  acceptedAt?: number;
};

function extractTags(html: string): string[] {
  const plainText = html.replace(/<[^>]+>/g, ' ');
  const matches = plainText.match(/#[\w-]+/g) || [];
  return Array.from(new Set(matches));
}

/**
 * Extract title from HTML content (BLB: title is first line with H1/bold styling)
 * Priority: H1 content > first paragraph > first text content
 */
function extractTitleFromContent(html: string): string {
  if (!html || typeof window === 'undefined') {
    // SSR fallback
    const h1Match = html?.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (h1Match) return h1Match[1].replace(/<[^>]+>/g, '').trim();
    const pMatch = html?.match(/<p[^>]*>(.*?)<\/p>/i);
    if (pMatch) return pMatch[1].replace(/<[^>]+>/g, '').trim();
    return html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split('\n')[0] || '';
  }
  const div = document.createElement('div');
  div.innerHTML = html;

  // Try H1 first
  const h1 = div.querySelector('h1');
  if (h1?.textContent?.trim()) {
    return h1.textContent.trim();
  }

  // Try first paragraph
  const p = div.querySelector('p');
  if (p?.textContent?.trim()) {
    return p.textContent.trim();
  }

  // Fallback to first line of text content
  const text = div.textContent || '';
  return text.trim().split('\n')[0] || '';
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

export function RizzomaTopicDetail({ id, blipPath = null, isAuthed = false, unreadState }: { id: string; blipPath?: string | null; isAuthed?: boolean; unreadState?: WaveUnreadState | null }) {
  const perfRenderMode = getPerfRenderMode();
  const isPerfLite = perfRenderMode === 'lite';
  const [topic, setTopic] = useState<TopicFull | null>(null);
  const [blips, setBlips] = useState<BlipData[]>([]);
  const [allBlipsMap, setAllBlipsMap] = useState<Map<string, BlipData>>(new Map());
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [error, setError] = useState<string | null>(null);

  // BLB: Ref to store newly created blips for immediate access (avoids race condition with state updates)
  const pendingBlipsRef = useRef<Map<string, BlipData>>(new Map());

  // Subblip navigation state (BLB: when viewing a subblip as root)
  const [currentSubblip, setCurrentSubblip] = useState<BlipData | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedBlips, setExpandedBlips] = useState<Set<string>>(new Set());
  const [newBlipContent, setNewBlipContent] = useState('');
  // Topic gear menu state (collab toolbar)
  const [showGearMenu, setShowGearMenu] = useState(false);
  // Topic gear menu state (edit toolbar)
  const [showEditGearMenu, setShowEditGearMenu] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const gearMenuRef = useRef<HTMLDivElement>(null);
  const editGearMenuRef = useRef<HTMLDivElement>(null);

  // Modal states
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showCommentsPanel, setShowCommentsPanel] = useState(true);

  // Topic content editing state (BLB: topic is meta-blip, title is first line)
  const [isEditingTopic, setIsEditingTopic] = useState(false);
  const [topicContent, setTopicContent] = useState('');
  const topicSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContentRef = useRef<string>('');

  // Ref-based callback for creating inline child blips
  // Using a ref so the TipTap extension always gets the latest version
  const createInlineChildBlipRef = useRef<((anchorPosition: number) => Promise<void>) | null>(null);
  // Ref to hold the editor instance (avoids stale closures in callbacks)
  const topicEditorRef = useRef<Editor | null>(null);

  // Stable callback wrapper that delegates to the ref
  const stableCreateInlineChildBlip = useCallback((anchorPosition: number) => {
    if (createInlineChildBlipRef.current) {
      createInlineChildBlipRef.current(anchorPosition);
    }
  }, []);

  // TipTap editor for topic content (meta-blip editing)
  const topicEditor = useEditor({
    extensions: getEditorExtensions(undefined, undefined, {
      waveId: id,
      onCreateInlineChildBlip: stableCreateInlineChildBlip,
    }),
    content: '',
    editable: false,
    editorProps: defaultEditorProps,
    onUpdate: ({ editor }: { editor: Editor }) => {
      const html = editor.getHTML();
      setTopicContent(html);

      // Debounced auto-save (300ms delay)
      if (topicSaveTimeoutRef.current) {
        clearTimeout(topicSaveTimeoutRef.current);
      }
      topicSaveTimeoutRef.current = setTimeout(() => {
        autoSaveTopicContent(html);
      }, 300);
    },
  });

  // Keep editor ref updated for use in callbacks
  topicEditorRef.current = topicEditor;

  // Track if we've set initial content for current edit session
  const hasSetInitialContentRef = useRef(false);

  // Reset the ref when exiting edit mode
  useEffect(() => {
    if (!isEditingTopic) {
      hasSetInitialContentRef.current = false;
    }
  }, [isEditingTopic]);

  // Sync editor content and editable state when entering edit mode
  // Only set content ONCE when entering edit mode (not on every topicContent change)
  useEffect(() => {
    if (topicEditor && isEditingTopic && topicContent && !hasSetInitialContentRef.current) {
      hasSetInitialContentRef.current = true;
      topicEditor.commands.setContent(topicContent);
      topicEditor.setEditable(true);
      // Focus after content is set
      setTimeout(() => {
        topicEditor.commands['focus']('end');
      }, 50);
    } else if (topicEditor && !isEditingTopic) {
      topicEditor.setEditable(false);
    }
  }, [topicEditor, isEditingTopic, topicContent]);

  // Use refs to avoid dependency issues in callbacks
  const unreadStateRef = useRef(unreadState);
  const isAuthedRef = useRef(isAuthed);
  useEffect(() => { unreadStateRef.current = unreadState; }, [unreadState]);
  useEffect(() => { isAuthedRef.current = isAuthed; }, [isAuthed]);

  // BLB: Sync unread state into blip tree when unread set changes
  useEffect(() => {
    if (!unreadState?.unreadSet || blips.length === 0) return;
    const unreadSet = unreadState.unreadSet;
    let changed = false;

    const updateBlip = (blip: BlipData): BlipData => {
      const nextRead = !unreadSet.has(blip.id);
      const nextChildren = blip.childBlips?.map(updateBlip) ?? [];
      const childChanged = nextChildren.some((child, idx) => child !== blip.childBlips?.[idx]);
      if (blip.isRead !== nextRead || childChanged) {
        changed = true;
        return { ...blip, isRead: nextRead, childBlips: nextChildren };
      }
      return blip;
    };

    const nextBlips = blips.map(updateBlip);
    if (!changed) return;

    const nextMap = new Map(allBlipsMap);
    nextBlips.forEach((root) => {
      const walk = (node: BlipData) => {
        nextMap.set(node.id, node);
        node.childBlips?.forEach(walk);
      };
      walk(root);
    });
    setBlips(nextBlips);
    setAllBlipsMap(nextMap);
  }, [unreadState?.version, blips, allBlipsMap]);

  // Initialize global loading state for this topic
  useEffect(() => {
    const loadingState = getLoadingState();
    if (!loadingState.has(id)) {
      loadingState.set(id, { isLoading: false, lastLoadTime: 0, lastCompleteTime: 0 });
    }
  }, [id]);

  const load = useCallback(async (force = false, fromSocket = false): Promise<void> => {
    // Get or create global state for this topic
    const loadingState = getLoadingState();
    let state = loadingState.get(id);
    if (!state) {
      state = { isLoading: false, lastLoadTime: 0, lastCompleteTime: 0 };
      loadingState.set(id, state);
    }

    // Prevent concurrent loads
    if (state.isLoading) {
      return;
    }

    const now = Date.now();

    // Socket-triggered loads have a longer cooldown after the last completed load
    // This breaks the feedback loop where load -> socket event -> load
    if (fromSocket && state.lastCompleteTime > 0 && (now - state.lastCompleteTime) < SOCKET_COOLDOWN_MS) {
      return;
    }

    // Time-based throttling for all loads
    if (!force && state.lastLoadTime > 0 && (now - state.lastLoadTime) < LOAD_THROTTLE_MS) {
      return;
    }

    state.isLoading = true;
    state.lastLoadTime = now;

    try {
      const r = await api(`/api/topics/${encodeURIComponent(id)}`);
      if (r.ok) {
        setTopic(r.data as TopicFull);

        // Fetch participants first so we can attach them to blips
        const participantsResponse = await api(`/api/waves/${encodeURIComponent(id)}/participants`);
        let loadedParticipants: Participant[] = [];
        if (participantsResponse.ok && participantsResponse.data?.participants) {
          loadedParticipants = participantsResponse.data.participants as Participant[];
          setParticipants(loadedParticipants);
        }

        // Convert participants to contributor format for blips
        const contributors: BlipContributor[] = loadedParticipants.map(p => ({
          id: p.userId,
          email: p.email,
          name: p.email.split('@')[0],
          role: p.role,
        }));

        const blipLimit = getPerfBlipLimit();
        const blipsResponse = await api(`/api/blips?waveId=${encodeURIComponent(id)}&limit=${blipLimit}`);

        if (blipsResponse.ok && blipsResponse.data?.blips) {
          const rawBlips = blipsResponse.data.blips as Array<any>;
          const unreadSet = unreadStateRef.current?.unreadSet ?? new Set<string>();
          const blipMap = new Map<string, BlipData>();
          const currentIsAuthed = isAuthedRef.current;
          rawBlips.forEach(raw => {
            // Generate blipPath from id (e.g., "waveId:b1234567" -> "b1234567")
            const rawId = raw._id || raw.id;
            const blipPathSegment = rawId.includes(':') ? rawId.split(':')[1] : rawId;
            blipMap.set(rawId, {
              id: rawId,
              blipPath: blipPathSegment, // BLB: path segment for URL navigation
              content: raw.content || '',
              authorId: raw.authorId || '',
              authorName: raw.authorName || 'Unknown',
              createdAt: raw.createdAt || Date.now(),
              updatedAt: raw.updatedAt || raw.createdAt || Date.now(),
              isRead: !unreadSet.has(rawId),
              parentBlipId: raw.parentId || null,
              childBlips: [],
              isFoldedByDefault: typeof raw.isFoldedByDefault === 'boolean' ? raw.isFoldedByDefault : undefined,
              // Permissions - if user is authed, they can edit/comment
              permissions: {
                canEdit: currentIsAuthed,
                canComment: currentIsAuthed,
                canRead: true,
              },
              // Attach topic participants as contributors to each blip
              contributors: contributors,
              // BLB: If blip has anchorPosition, it's inline (shown as [+] marker, not in list)
              anchorPosition: raw.anchorPosition,
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
          setAllBlipsMap(blipMap); // Store for subblip navigation
        }

        // DISABLED: Refreshing unread state here was contributing to infinite loop
        // The useWaveUnread hook has its own refresh mechanism
        // if (unreadStateRef.current?.refresh) {
        //   try { await unreadStateRef.current.refresh(); } catch {}
        // }
        setError(null);
      } else {
        setError('Failed to load topic');
      }
    } catch {
      setError('Failed to load topic');
    } finally {
      state.isLoading = false;
      state.lastCompleteTime = Date.now();
    }
  }, [id]);

  // Initial load
  useEffect(() => { load(); }, [load]);

  // BLB: Find and set the current subblip when blipPath changes
  useEffect(() => {
    // Check if hash indicates a subblip path (may be ahead of prop due to timing)
    const hash = window.location.hash || '';
    const hashMatch = hash.match(/^#\/topic\/[^/]+\/(.+?)(?:\?.*)?$/);
    const hashBlipPath = hashMatch ? hashMatch[1].replace(/\/$/, '') : null;

    // Use prop first, but fall back to hash if prop is null but hash has a path
    // This handles the race condition where hash is updated before parent re-renders
    const effectiveBlipPath = blipPath || hashBlipPath;

    if (!effectiveBlipPath) {
      setCurrentSubblip(null);
      return;
    }

    // Find blip by blipPath segment
    // blipPath can be a single segment like "b1234567" or multiple "b123/b456"
    const pathSegment = effectiveBlipPath.replace(/\/$/, ''); // Remove trailing slash

    // Search through all blips to find one matching this path
    // First check pendingBlipsRef for newly created blips (avoids race condition)
    let foundInPending: BlipData | undefined;
    for (const [, blip] of pendingBlipsRef.current) {
      if (blip.blipPath === pathSegment) {
        foundInPending = blip;
        break;
      }
    }

    // Then check allBlipsMap if not found in pending
    let foundInMap: BlipData | undefined;
    if (!foundInPending) {
      for (const [, blip] of allBlipsMap) {
        if (blip.blipPath === pathSegment) {
          foundInMap = blip;
          break;
        }
      }
    }

    const foundBlip = foundInPending || foundInMap;
    if (foundBlip) {
      setCurrentSubblip(foundBlip);
      // Clean up from pending ref if found in main map
      if (allBlipsMap.has(foundBlip.id)) {
        pendingBlipsRef.current.delete(foundBlip.id);
      }
    } else {
      // Blip not found - maybe still loading
      setCurrentSubblip(null);
    }
  }, [blipPath, allBlipsMap]);

  // BLB: Navigation helper to go back to parent
  const navigateToParent = useCallback(() => {
    if (currentSubblip?.parentBlipId) {
      // Find the parent blip
      const parent = allBlipsMap.get(currentSubblip.parentBlipId);
      if (parent?.blipPath) {
        window.location.hash = `#/topic/${id}/${parent.blipPath}/`;
      } else {
        // Parent is the topic root
        window.location.hash = `#/topic/${id}`;
      }
    } else {
      // No parent - go to topic root
      window.location.hash = `#/topic/${id}`;
    }
  }, [currentSubblip, allBlipsMap, id]);

  // BLB: Navigation helper to navigate into a subblip
  const navigateToSubblip = useCallback((blip: BlipData) => {
    if (blip.blipPath) {
      window.location.hash = `#/topic/${id}/${blip.blipPath}/`;
    }
  }, [id]);

  // Update the ref with the actual createInlineChildBlip implementation
  // BLB: Creates a subblip and navigates into it
  useEffect(() => {
    createInlineChildBlipRef.current = async (anchorPosition: number) => {
      if (!isAuthed) {
        toast('Sign in to create comments', 'error');
        return;
      }
      await ensureCsrf();
      const requestBody = {
        waveId: id,
        content: '<p></p>', // Minimal placeholder content (server requires non-empty)
        parentId: null, // This is a child of the topic/wave itself (root-level blip)
        anchorPosition: anchorPosition, // The cursor position where this inline comment is anchored
      };
      try {
        const response = await api('/api/blips', {
          method: 'POST',
          body: JSON.stringify(requestBody)
        });
        if (response.ok && response.data) {
          const newBlip = response.data as { id?: string; _id?: string; content?: string; authorId?: string; authorName?: string; createdAt?: number; updatedAt?: number };
          const newBlipId = newBlip.id || newBlip._id;

          if (newBlipId) {
            // BLB: Insert [+] marker at cursor position in the topic content
            // This makes the marker PART of the content (like original Rizzoma)
            const editor = topicEditorRef.current;
            if (editor) {
              (editor.commands as any)['insertBlipThread']({ threadId: newBlipId, hasUnread: false });
            }

            // BLB: Extract blipPath and navigate to the new subblip
            const blipPathSegment = newBlipId.includes(':') ? newBlipId.split(':')[1] : newBlipId;

            // BLB: Create the blip data object
            const newBlipData: BlipData = {
              id: newBlipId,
              blipPath: blipPathSegment,
              content: newBlip.content || '<p></p>',
              authorId: newBlip.authorId || '',
              authorName: newBlip.authorName || 'Anonymous',
              createdAt: newBlip.createdAt || Date.now(),
              updatedAt: newBlip.updatedAt || Date.now(),
              isRead: true,
              parentBlipId: undefined,
              childBlips: [],
              permissions: { canEdit: true, canComment: true, canRead: true },
              contributors: [],
            };

            // BLB: Add to pendingBlipsRef for IMMEDIATE access
            pendingBlipsRef.current.set(newBlipId, newBlipData);

            // BLB: Also add to allBlipsMap state
            setAllBlipsMap(prev => {
              const updated = new Map(prev);
              updated.set(newBlipId, newBlipData);
              return updated;
            });

            // BLB: Navigate into the new subblip document
            window.location.hash = `#/topic/${id}/${blipPathSegment}/`;
          } else {
            toast('Subblip created');
            load(true); // Fallback: reload to show the new blip
          }
        } else {
          toast('Failed to create comment', 'error');
        }
      } catch (err) {
        console.error('[TopicDetail] Error creating blip:', err);
        toast('Failed to create comment', 'error');
      }
    };
  }, [isAuthed, id, load]);

  // Debounced load for socket/event-triggered reloads
  // These pass fromSocket=true so they respect the longer socket cooldown period
  const debouncedLoadRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedLoad = useCallback(() => {
    if (debouncedLoadRef.current) clearTimeout(debouncedLoadRef.current);
    debouncedLoadRef.current = setTimeout(() => {
      debouncedLoadRef.current = null;
      load(true, true); // force=true, fromSocket=true
    }, 500);
  }, [load]);

  // DISABLED: Socket-triggered reloads were causing infinite API call loops
  // The socket events trigger after each load, creating a feedback loop
  // User actions (edit, reply, delete) will still trigger reloads via their handlers
  useEffect(() => {
    if (!id) return;
    // Temporarily disabled to fix infinite loop
    // const unsub = subscribeTopicDetail(id, () => debouncedLoad());
    // return () => unsub();
    return () => {};
  }, [id, debouncedLoad]);

  // Listen for refresh events from RizzomaBlip (e.g., after duplicate/paste)
  // Using direct load with throttle instead of debounced to avoid feedback loop
  useEffect(() => {
    const handleRefresh = () => {
      // Use direct load with force=true but fromSocket=true for throttling
      load(true, true);
    };
    window.addEventListener('rizzoma:refresh-topics', handleRefresh);
    return () => window.removeEventListener('rizzoma:refresh-topics', handleRefresh);
  }, [load]);

  // BLB: Update inline marker unread state
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const unreadSet = unreadStateRef.current?.unreadSet ?? new Set<string>();
    const updateMarkers = () => {
      const markers = Array.from(document.querySelectorAll<HTMLElement>('.blip-thread-marker'));
      markers.forEach((marker) => {
        const threadId = marker.getAttribute('data-blip-thread') || '';
        const hasUnread = threadId && unreadSet.has(threadId);
        marker.classList.toggle('has-unread', hasUnread);
        marker.textContent = '+';
      });
    };
    const raf = window.requestAnimationFrame(updateMarkers);
    return () => window.cancelAnimationFrame(raf);
  }, [unreadState?.version, allBlipsMap.size]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debouncedLoadRef.current) clearTimeout(debouncedLoadRef.current);
    };
  }, []);

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
      if (r.ok) { toast('Blip created'); setNewBlipContent(''); load(true); }
      else { toast('Failed to create blip', 'error'); }
    } catch { toast('Failed to create blip', 'error'); }
    setBusy(false);
  }, [newBlipContent, busy, isAuthed, id, load]);

  // Handlers for RizzomaBlip component
  const handleBlipUpdate = useCallback((_blipId: string, _content: string) => {
    // Blip was updated - reload to get fresh data
    load(true);
  }, [load]);

  const handleAddReply = useCallback((_parentBlipId: string, _content: string) => {
    // Reply was added - reload to get fresh data
    load(true);
  }, [load]);

  const handleDeleteBlip = useCallback(async (blipId: string) => {
    await ensureCsrf();
    const r = await api(`/api/blips/${encodeURIComponent(blipId)}`, { method: 'DELETE' });
    if (r.ok) {
      toast('Deleted');
      load(true);
    } else {
      toast('Delete failed', 'error');
      throw new Error('Delete failed');
    }
  }, [load]);

  const handleBlipRead = useCallback(async (blipId: string) => {
    // Mark blip as read
    try {
      await api(`/api/blips/${encodeURIComponent(blipId)}/read`, { method: 'POST' });
    } catch {
      // Silent fail for read status
    }
  }, []);

  const handleExpand = useCallback((blipId: string) => {
    setExpandedBlips(prev => {
      const next = new Set(prev);
      next.add(blipId);
      return next;
    });
  }, []);

  const handleToggleCollapse = useCallback((blipId: string) => {
    setExpandedBlips(prev => {
      const next = new Set(prev);
      if (next.has(blipId)) {
        next.delete(blipId);
      } else {
        next.add(blipId);
      }
      return next;
    });
  }, []);

  // Close gear menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (gearMenuRef.current && !gearMenuRef.current.contains(event.target as Node)) {
        setShowGearMenu(false);
      }
      if (editGearMenuRef.current && !editGearMenuRef.current.contains(event.target as Node)) {
        setShowEditGearMenu(false);
      }
    };
    if (showGearMenu || showEditGearMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showGearMenu, showEditGearMenu]);

  // Topic gear menu handlers (used by both collab and edit toolbars)
  const closeGearMenus = () => {
    setShowGearMenu(false);
    setShowEditGearMenu(false);
  };

  const handleMarkTopicRead = async () => {
    closeGearMenus();
    try {
      await ensureCsrf();
      await api(`/api/waves/${encodeURIComponent(id)}/read`, { method: 'POST' });
      toast('Topic marked as read');
      if (unreadState?.refresh) {
        unreadState.refresh();
      }
    } catch {
      toast('Failed to mark topic as read', 'error');
    }
  };

  const handleToggleFollow = async () => {
    closeGearMenus();
    setIsFollowing(!isFollowing);
    toast(isFollowing ? 'Unfollowed topic' : 'Following topic');
  };

  const handlePrint = () => {
    closeGearMenus();
    window.print();
  };

  const handleExportTopic = () => {
    closeGearMenus();
    setShowExportModal(true);
  };

  const handleCopyEmbedCode = () => {
    closeGearMenus();
    const embedUrl = `${window.location.origin}/embed/topic/${id}`;
    const embedCode = `<iframe src="${embedUrl}" width="600" height="400" frameborder="0"></iframe>`;
    navigator.clipboard.writeText(embedCode).then(() => {
      toast('Embed code copied to clipboard');
    }).catch(() => {
      toast('Failed to copy embed code', 'error');
    });
  };

  // Auto-save topic content (BLB: extracts title from first H1/line)
  const autoSaveTopicContent = useCallback(async (content: string) => {
    if (content === lastSavedContentRef.current) {
      return;
    }
    try {
      const extractedTitle = extractTitleFromContent(content);
      if (!extractedTitle) return;

      await ensureCsrf();
      const response = await api(`/api/topics/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: extractedTitle, content: content })
      });
      if (response.ok) {
        lastSavedContentRef.current = content;
        setTopic(prev => prev ? { ...prev, title: extractedTitle, content: content } : prev);
        // No toast for auto-save - it's real-time
      }
    } catch {
      // Silent fail for auto-save - will retry on next change
    }
  }, [id]);

  // Start editing topic (BLB: topic is meta-blip)
  const startEditingTopic = useCallback(() => {
    if (!isAuthed) {
      toast('Sign in to edit', 'error');
      return;
    }
    // BLB: Topic content should always have title as first H1
    // Merge title + existing content, ensuring title is H1 at the start
    let initialContent = '';
    const titleH1 = `<h1>${topic?.title || 'Untitled'}</h1>`;

    if (topic?.content) {
      // Check if content already starts with the title as H1
      const contentHasTitle = topic.content.toLowerCase().includes(`<h1>${(topic.title || '').toLowerCase()}</h1>`);
      if (contentHasTitle) {
        // Use content as-is
        initialContent = topic.content;
      } else {
        // Wrap content in <p> if it's plain text (no HTML tags)
        let wrappedContent = topic.content;
        if (!/<[^>]+>/.test(wrappedContent)) {
          wrappedContent = `<p>${wrappedContent}</p>`;
        }
        // Prepend title as H1 to content
        initialContent = titleH1 + wrappedContent;
      }
    } else {
      // No content, just use title as H1
      initialContent = titleH1;
    }
    const inlineRootBlips = blips.filter((b) => typeof b.anchorPosition === 'number');
    const nextContent = injectInlineMarkers(initialContent, inlineRootBlips);
    setTopicContent(nextContent);
    lastSavedContentRef.current = nextContent;
    setIsEditingTopic(true);
    // The useEffect will handle syncing the editor content when isEditingTopic changes
  }, [isAuthed, topic?.title, topic?.content, blips]);

  // Finish editing topic
  const finishEditingTopic = useCallback(() => {
    // Clear any pending save timeout
    if (topicSaveTimeoutRef.current) {
      clearTimeout(topicSaveTimeoutRef.current);
      topicSaveTimeoutRef.current = null;
    }
    // Final save if content changed
    const currentContent = topicEditor?.getHTML() || topicContent;
    if (currentContent !== lastSavedContentRef.current) {
      autoSaveTopicContent(currentContent);
    }
    setIsEditingTopic(false);
    if (topicEditor) {
      topicEditor.setEditable(false);
    }
  }, [autoSaveTopicContent, topicContent, topicEditor]);

  if (error) {
    return (
      <div className="rizzoma-topic-detail">
        <div className="error-message">{error}<button onClick={() => load(true)}>Retry</button></div>
      </div>
    );
  }

  if (!topic) {
    return <div className="rizzoma-topic-detail loading">Loading...</div>;
  }

  const tags = extractTags(topic.content || '');
  const inlineRootBlips = blips.filter(b => typeof b.anchorPosition === 'number');
  const listBlips = blips.filter(b => b.anchorPosition === undefined || b.anchorPosition === null);
  const topicContentHtmlBase = topic.content && topic.content.trim().length > 0
    ? topic.content
    : `<h1>${topic.title || 'Untitled'}</h1>`;
  const topicContentHtml = injectInlineMarkers(topicContentHtmlBase, inlineRootBlips);
  const topicBlip: BlipData = {
    id: topic.id,
    content: topicContentHtml,
    authorId: topic.authorId,
    authorName: topic.authorName,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    isRead: true,
    permissions: {
      canEdit: isAuthed,
      canComment: isAuthed,
      canRead: true,
    },
    childBlips: listBlips,
  };
  const topicContentOverride = isEditingTopic ? (
    <div className="topic-content-edit">
      <EditorContent editor={topicEditor} />
    </div>
  ) : null;
  const topicContentFooter = tags.length > 0 ? (
    <div className="topic-tags">
      {tags.map((tag, i) => <span key={i} className="topic-tag">{tag}</span>)}
    </div>
  ) : null;
  const topicChildFooter = isAuthed ? (
    <div className="write-reply-section">
      <input
        type="text"
        className="write-reply-input"
        placeholder="Write a reply..."
        value={newBlipContent}
        onChange={(e) => setNewBlipContent(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && newBlipContent.trim()) { e.preventDefault(); createRootBlip(); } }}
      />
    </div>
  ) : null;

  return (
    <div className="rizzoma-topic-detail">
      {/* ========================================
          TOPIC COLLABORATION BAR (outside meta-blip)
          Original Rizzoma: Invite | avatars | +N | Share | gear
      ======================================== */}
      <div className="topic-collab-toolbar">
        <button
          className="collab-btn invite-btn"
          title="Invite participants"
          onClick={() => setShowInviteModal(true)}
        >
          Invite
        </button>
        <div className="collab-participants">
          {/* Participant avatars */}
          {participants.length > 0 ? (
            <>
              {participants.slice(0, 5).map((p) => (
                <img
                  key={p.id}
                  className={`participant-avatar ${p.role === 'owner' ? 'owner' : ''} ${p.status === 'pending' ? 'pending' : ''}`}
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(p.email.split('@')[0] || 'U')}&size=28&background=${p.role === 'owner' ? '4EA0F1' : 'random'}`}
                  alt={p.email}
                  title={`${p.email}${p.role === 'owner' ? ' (owner)' : ''}${p.status === 'pending' ? ' (invited)' : ''}`}
                />
              ))}
              {participants.length > 5 && (
                <span className="participant-overflow" title={participants.slice(5).map(p => p.email).join(', ')}>
                  +{participants.length - 5}
                </span>
              )}
            </>
          ) : (
            <img
              className="participant-avatar"
              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(topic.authorName || 'U')}&size=28&background=random`}
              alt={topic.authorName || 'Author'}
              title={`Author: ${topic.authorName || 'Unknown'}`}
            />
          )}
        </div>
        <button
          className="collab-btn share-btn"
          title="Share settings"
          onClick={() => setShowShareModal(true)}
        >
          🔒 Share
        </button>
        <div className="gear-menu-container" ref={gearMenuRef}>
          <button
            className={`collab-btn gear-btn ${showGearMenu ? 'active' : ''}`}
            title="Topic settings"
            onClick={() => setShowGearMenu(!showGearMenu)}
          >
            ⚙️
          </button>
          {showGearMenu && (
            <div className="gear-dropdown">
              <button className="gear-menu-item" onClick={handleMarkTopicRead}>
                Mark topic as read
              </button>
              <button className="gear-menu-item" onClick={handleToggleFollow}>
                {isFollowing ? 'Unfollow topic' : 'Follow topic'}
              </button>
              <div className="gear-menu-divider" />
              <button className="gear-menu-item" onClick={handlePrint}>
                Print
              </button>
              <button className="gear-menu-item" onClick={handleExportTopic}>
                Export topic
              </button>
              <button className="gear-menu-item" onClick={handleCopyEmbedCode}>
                Get embed code
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================
          BLB SUBBLIP VIEW - When navigated into a subblip
          Shows: Hide button + subblip content + child blips
      ======================================== */}
      {currentSubblip && (
        <div className="subblip-view">
          {/* Subblip navigation bar */}
          <div className="subblip-nav-bar">
            <button
              className="subblip-hide-btn"
              onClick={navigateToParent}
              title="Return to parent (Hide)"
            >
              Hide
            </button>
            <span className="subblip-breadcrumb">
              <a href={`#/topic/${id}`} onClick={(e) => { e.preventDefault(); window.location.hash = `#/topic/${id}`; }}>
                {topic.title}
              </a>
              {' → '}
              <span className="current-blip-label">
                {extractTitleFromContent(currentSubblip.content) || 'Subblip'}
              </span>
            </span>
          </div>

          {/* Subblip content rendered as root */}
          <div className="subblip-content">
            <RizzomaBlip
              key={currentSubblip.id}
              blip={currentSubblip}
              isRoot={true}
              depth={0}
              onBlipUpdate={handleBlipUpdate}
              onAddReply={handleAddReply}
              onToggleCollapse={handleToggleCollapse}
              onDeleteBlip={handleDeleteBlip}
              onBlipRead={handleBlipRead}
              onExpand={handleExpand}
              expandedBlips={expandedBlips}
              onNavigateToSubblip={navigateToSubblip}
              forceExpanded={true}
            />
          </div>
        </div>
      )}

      {/* ========================================
          UNIFIED TOPIC META-BLIP CONTAINER
          BLB Philosophy: Topic IS the root blip
          Contains: toolbar + content + child blips + reply input
          Only shown when NOT viewing a subblip
      ======================================== */}
      {!currentSubblip && (<div className="topic-meta-blip">
        {/* Meta-blip toolbar (like BlipMenu for regular blips) */}
        <div className={`topic-blip-toolbar ${isEditingTopic ? 'editing' : ''}`}>
          <button
            className={`topic-tb-btn ${isEditingTopic ? 'active primary' : ''}`}
            title={isEditingTopic ? 'Done editing (changes auto-saved)' : 'Edit topic content'}
            onClick={() => {
              if (isEditingTopic) {
                finishEditingTopic();
              } else {
                startEditingTopic();
              }
            }}
          >
            {isEditingTopic ? 'Done' : 'Edit'}
          </button>
          <button
            className={`topic-tb-btn ${showCommentsPanel ? 'active' : ''}`}
            title={showCommentsPanel ? 'Hide inline comments' : 'Show inline comments'}
            onClick={() => {
              setShowCommentsPanel(!showCommentsPanel);
              toast(showCommentsPanel ? 'Comments hidden' : 'Comments shown');
            }}
          >
            💬
          </button>
          {/* Insert inline comment button - only visible in edit mode */}
          {isEditingTopic && (
            <button
              className="topic-tb-btn insert-comment-btn"
              title="Insert inline comment at cursor (Ctrl+Enter)"
              onClick={() => {
                console.log('[TopicDetail] Insert comment button clicked');
                console.log('[TopicDetail] topicEditor:', topicEditor);
                console.log('[TopicDetail] createInlineChildBlipRef.current:', createInlineChildBlipRef.current);
                // Get cursor position from the editor
                if (topicEditor) {
                  const { from } = topicEditor.state.selection;
                  console.log('[TopicDetail] Cursor position:', from);
                  if (createInlineChildBlipRef.current) {
                    console.log('[TopicDetail] Calling createInlineChildBlipRef.current with:', from);
                    createInlineChildBlipRef.current(from);
                  } else {
                    console.error('[TopicDetail] createInlineChildBlipRef.current is not set!');
                    toast('Comment function not ready', 'error');
                  }
                } else {
                  toast('Editor not ready', 'error');
                }
              }}
            >
              💬+
            </button>
          )}
          <button
            className="topic-tb-btn"
            title="Copy topic link"
            onClick={() => {
              const url = `${window.location.origin}/#/topic/${id}`;
              navigator.clipboard.writeText(url).then(() => {
                toast('Topic link copied');
              }).catch(() => {
                toast('Failed to copy link', 'error');
              });
            }}
          >
            🔗
          </button>
          {/* Topic edit toolbar gear menu - "Other" options */}
          <div className="gear-menu-container" ref={editGearMenuRef}>
            <button
              className={`topic-tb-btn ${showEditGearMenu ? 'active' : ''}`}
              title="Other options"
              onClick={() => setShowEditGearMenu(!showEditGearMenu)}
            >
              ⚙️
            </button>
            {showEditGearMenu && (
              <div className="gear-dropdown">
                <button className="gear-menu-item" onClick={handleMarkTopicRead}>
                  Mark topic as read
                </button>
                <button className="gear-menu-item" onClick={handleToggleFollow}>
                  {isFollowing ? 'Unfollow topic' : 'Follow topic'}
                </button>
                <div className="gear-menu-divider" />
                <button className="gear-menu-item" onClick={handlePrint}>
                  Print
                </button>
                <button className="gear-menu-item" onClick={handleExportTopic}>
                  Export topic
                </button>
                <button className="gear-menu-item" onClick={handleCopyEmbedCode}>
                  Get embed code
                </button>
              </div>
            )}
          </div>
          <span className="topic-toolbar-spacer" />
          {/* Meta info on right side of toolbar */}
          <div className="topic-meta-info">
            <div className="topic-avatars-stack-small">
              {(() => {
                const owner = participants.find(p => p.role === 'owner');
                const others = participants.filter(p => p.role !== 'owner').slice(0, 2);
                const allToShow = owner ? [owner, ...others] : participants.slice(0, 3);
                if (allToShow.length === 0) {
                  return (
                    <img
                      className="topic-avatar-small"
                      src={`https://ui-avatars.com/api/?name=${encodeURIComponent(topic.authorName || 'U')}&size=24&background=random`}
                      alt={topic.authorName || 'Author'}
                      title={topic.authorName || 'Author'}
                    />
                  );
                }
                return allToShow.map((p, idx) => (
                  <img
                    key={p.id}
                    className={`topic-avatar-small ${p.role === 'owner' ? 'owner' : ''}`}
                    style={{ zIndex: allToShow.length - idx, marginLeft: idx > 0 ? '-8px' : '0' }}
                    src={`https://ui-avatars.com/api/?name=${encodeURIComponent(p.email.split('@')[0] || 'U')}&size=24&background=${p.role === 'owner' ? '4EA0F1' : 'random'}`}
                    alt={p.email}
                    title={`${p.email}${p.role === 'owner' ? ' (owner)' : ''}`}
                  />
                ));
              })()}
            </div>
            <span className="topic-date-small">{formatDate(topic.updatedAt)}</span>
          </div>
        </div>

        {/* Meta-blip body: topic content + child blips in ONE scrollable container */}
        <div className="topic-blip-body">
          {isPerfLite ? (
            <>
              <div className="topic-blip-content">
                {isEditingTopic ? (
                  <div className="topic-content-edit">
                    <EditorContent editor={topicEditor} />
                  </div>
                ) : (
                  <div
                    className="topic-content-view"
                    onClick={isAuthed ? startEditingTopic : undefined}
                    style={isAuthed ? { cursor: 'pointer' } : undefined}
                    title={isAuthed ? 'Click to edit topic content' : undefined}
                  >
                    {topicContentHtml ? (
                      <div dangerouslySetInnerHTML={{ __html: topicContentHtml }} />
                    ) : (
                      <h1 className="topic-title">{topic.title || 'Untitled'}</h1>
                    )}
                  </div>
                )}
                {tags.length > 0 && (
                  <div className="topic-tags">
                    {tags.map((tag, i) => <span key={i} className="topic-tag">{tag}</span>)}
                  </div>
                )}
              </div>
              <div className="topic-blip-children">
                {(() => {
                  if (!listBlips.length) return null;
                  return (
                    <div className="blip-list">
                      {listBlips.map((blip) => {
                        const text = blip.content
                          ? blip.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
                          : '';
                        const label = text
                          ? text.length > 80
                            ? `${text.slice(0, 80)}…`
                            : text
                          : (blip.authorName || 'Blip');
                        const hasUnread = !blip.isRead;
                        return (
                          <div key={blip.id} className="rizzoma-blip perf-blip-row" data-blip-id={blip.id}>
                            <div className={`blip-collapsed-row perf-collapsed ${hasUnread ? 'has-unread' : ''}`}>
                              <span className="blip-bullet">•</span>
                              <span className="blip-collapsed-label-text">{label}</span>
                              <span className={`blip-expand-icon ${hasUnread ? 'has-unread' : ''}`}>+</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                {topicChildFooter}
              </div>
            </>
          ) : (
            <RizzomaBlip
              key={topicBlip.id}
              blip={topicBlip}
              isRoot={true}
              depth={0}
              onBlipUpdate={handleBlipUpdate}
              onAddReply={handleAddReply}
              onToggleCollapse={handleToggleCollapse}
              onDeleteBlip={handleDeleteBlip}
              onBlipRead={handleBlipRead}
              onExpand={handleExpand}
              expandedBlips={expandedBlips}
              forceExpanded={true}
              renderMode="topic-root"
              contentContainerClassName="topic-blip-content"
              childContainerClassName="topic-blip-children"
              contentClassName="topic-content-view"
              contentTitle={isAuthed ? 'Click to edit topic content' : undefined}
              onContentClick={!isEditingTopic && isAuthed ? startEditingTopic : undefined}
              contentOverride={topicContentOverride}
              contentFooter={topicContentFooter}
              childFooter={topicChildFooter}
              // BLB: NO navigation - expand/collapse INLINE like original Rizzoma
            />
          )}
        </div>
      </div>)}

      {/* Modals */}
      <InviteModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        topicId={id}
        topicTitle={topic.title}
      />
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        topicId={id}
        topicTitle={topic.title}
      />
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        topicTitle={topic?.title || 'Untitled'}
        topicId={id}
        blips={blips}
      />
    </div>
  );
}
