import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { api, ensureCsrf } from '../lib/api';
// DISABLED: Socket subscription was causing infinite loop
// import { subscribeTopicDetail } from '../lib/socket';
import { toast } from './Toast';
import { InviteModal } from './InviteModal';
import { ShareModal } from './ShareModal';
import ExportModal from './ExportModal';
import { WavePlaybackModal } from './WavePlaybackModal';
import './RizzomaTopicDetail.css';
import type { WaveUnreadState } from '../hooks/useWaveUnread';
import { RizzomaBlip, type BlipData, type BlipContributor } from './blip/RizzomaBlip';
import { injectInlineMarkers } from './blip/inlineMarkers';
import { useEditor, EditorContent } from '@tiptap/react';
import { generateHTML, type Editor } from '@tiptap/core';
import { flushSync } from 'react-dom';
import { getEditorExtensions, defaultEditorProps } from './editor/EditorConfig';
import { EDIT_MODE_EVENT, INSERT_EVENTS } from './RightToolsPanel';
import { useCollaboration } from './editor/useCollaboration';
import { yjsDocManager } from './editor/YjsDocumentManager';
import { FEATURES } from '@shared/featureFlags';
import { insertGadget } from '../gadgets/insert';
import type { GadgetInsertDetail } from '../gadgets/types';

// Global state to track loading per topic to prevent infinite loops
// Uses window property to persist across Vite HMR reloads
const LOAD_THROTTLE_MS = 5000; // Minimum time between loads
const SOCKET_COOLDOWN_MS = 10000; // Cooldown period after load to ignore socket events
const APP_FRAME_DATA_EVENT = 'rizzoma:app-frame-data-updated';
const TOPIC_RETURN_READ_MODE_KEY = '__RIZZOMA_TOPIC_RETURN_READ_MODE__';
const TOPIC_SUPPRESS_TOOLBAR_UNTIL_KEY = '__RIZZOMA_TOPIC_SUPPRESS_TOOLBAR_UNTIL__';

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

function serializeEditorContent(editor: Editor | null, fallback: string) {
  if (!editor) return fallback;
  try {
    return generateHTML(editor.getJSON(), editor.extensionManager.extensions);
  } catch {
    return editor.getHTML() || fallback;
  }
}

function isEffectivelyEmptyHtml(html: string) {
  if (!html) return true;
  const normalized = html
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/<p[^>]*>\s*<\/p>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length === 0;
}

function isEditorEffectivelyEmpty(editor: Editor | null) {
  if (!editor) return true;
  const text = editor.getText().replace(/\u200b/g, '').trim();
  if (text.length > 0) {
    return false;
  }
  return isEffectivelyEmptyHtml(editor.getHTML() || '');
}

function applyLiveAppFrameOverrides(html: string, overrides: Map<string, string>) {
  if (!html || overrides.size === 0 || typeof window === 'undefined') {
    return html;
  }

  const container = window.document.createElement('div');
  container.innerHTML = html;
  const overrideEntries = Array.from(overrides.entries());
  const figures = Array.from(container.querySelectorAll('figure[data-gadget-type="app-frame"]'));
  const applied = new Set<string>();

  figures.forEach((node, index) => {
    const instanceId = node.getAttribute('data-app-instance-id') || '';
    const exactMatch = overrideEntries.find(([key]) => key === instanceId) || null;
    const fallbackMatch = exactMatch ? null : overrideEntries[index] || null;
    const match = exactMatch || fallbackMatch;
    if (!match) return;

    const [nextInstanceId, nextData] = match;
    if (!nextData) return;
    node.setAttribute('data-app-data', nextData);
    if (!instanceId || instanceId !== nextInstanceId) {
      node.setAttribute('data-app-instance-id', nextInstanceId);
    }
    applied.add(nextInstanceId);
  });

  if (!applied.size && figures.length === 1 && overrideEntries.length === 1) {
    const [nextInstanceId, nextData] = overrideEntries[0];
    figures[0].setAttribute('data-app-instance-id', nextInstanceId);
    figures[0].setAttribute('data-app-data', nextData);
  }

  return container.innerHTML;
}

function summarizeAppFrameData(raw: string) {
  try {
    const data = JSON.parse(raw || '{}');
    if (Array.isArray(data?.columns)) {
      const totalCards = data.columns.reduce(
        (sum: number, column: any) => sum + (Array.isArray(column?.cards) ? column.cards.length : 0),
        0
      );
      return `${data.columns.length} columns · ${totalCards} cards`;
    }
    if (Array.isArray(data?.milestones)) {
      const tail = data.milestones[data.milestones.length - 1];
      return tail?.title ? `Latest: ${tail.title}` : `${data.milestones.length} milestones`;
    }
    if (data?.session) {
      return data.session.label ? `Focus: ${data.session.label}` : `${data.session.duration ?? 0} min · ${data.session.state ?? 'ready'}`;
    }
  } catch {
    // Fall through to generic fallback.
  }
  return 'Sandbox preview';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAppFrameFigureMarkup(figure: HTMLElement) {
  const title = figure.getAttribute('data-app-title') || 'Sandboxed app';
  const appId = figure.getAttribute('data-app-id') || 'app-frame';
  const src = figure.getAttribute('data-app-src') || '';
  const height = figure.getAttribute('data-app-height') || '430';
  const rawData = figure.getAttribute('data-app-data') || '{}';
  const summary = summarizeAppFrameData(rawData);
  const className = figure.getAttribute('class') || 'gadget-block gadget-app-frame';

  return `
    <figure
      data-gadget-type="app-frame"
      data-app-id="${escapeHtml(appId)}"
      data-app-instance-id="${escapeHtml(figure.getAttribute('data-app-instance-id') || 'app-frame')}"
      data-app-title="${escapeHtml(title)}"
      data-app-src="${escapeHtml(src)}"
      data-app-height="${escapeHtml(height)}"
      data-app-data="${escapeHtml(rawData)}"
      data-app-summary="${escapeHtml(summary)}"
      class="${escapeHtml(className)}"
    >
      <iframe
        src="${escapeHtml(src)}"
        title="${escapeHtml(title)}"
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        allow="clipboard-read; clipboard-write; fullscreen"
        style="width: 100%; min-height: ${escapeHtml(height)}px; border: 0; border-radius: 16px; background: white; box-shadow: inset 0 0 0 1px rgba(136,156,178,0.18);"
      ></iframe>
    </figure>
  `.trim();
}

function hydrateAppFrameFigures(html: string) {
  if (!html || typeof window === 'undefined') {
    return html;
  }

  const container = window.document.createElement('div');
  container.innerHTML = html;
  container.querySelectorAll('figure[data-gadget-type="app-frame"]').forEach((node) => {
    const figure = node as HTMLElement;
    if (figure.querySelector('iframe')) {
      return;
    }
    figure.outerHTML = buildAppFrameFigureMarkup(figure);
  });

  return container.innerHTML;
}

function hydrateAppFrameFigureElements(root: ParentNode) {
  if (typeof window === 'undefined') {
    return;
  }

  root.querySelectorAll('figure[data-gadget-type="app-frame"]').forEach((node) => {
    const figure = node as HTMLElement;
    if (figure.querySelector('iframe')) {
      return;
    }
    const title = figure.getAttribute('data-app-title') || 'Sandboxed app';
    const appId = figure.getAttribute('data-app-id') || 'app-frame';
    const src = figure.getAttribute('data-app-src') || '';
    const height = figure.getAttribute('data-app-height') || '430';
    const rawData = figure.getAttribute('data-app-data') || '{}';
    const summary = summarizeAppFrameData(rawData);

    const iframe = window.document.createElement('iframe');
    iframe.setAttribute('src', src);
    iframe.setAttribute('title', title);
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
    iframe.setAttribute('allow', 'clipboard-read; clipboard-write; fullscreen');
    iframe.setAttribute(
      'style',
      `width: 100%; min-height: ${height}px; border: 0; border-radius: 16px; background: white; box-shadow: inset 0 0 0 1px rgba(136,156,178,0.18);`
    );

    figure.setAttribute('data-app-summary', summary);
    figure.replaceChildren(iframe);
  });
}

function extractTopicEditSeedHtml(root: HTMLElement | null) {
  if (!root || typeof window === 'undefined') {
    return '';
  }

  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.inline-child-portal').forEach((node) => node.remove());
  clone.querySelectorAll('iframe').forEach((frame) => {
    const figure = frame.closest('figure[data-gadget-type="app-frame"]') as HTMLElement | null;
    if (!figure) {
      frame.remove();
    }
  });

  return clone.innerHTML.trim();
}

function collectLiveAppFrameOverrides() {
  const overrides = new Map<string, string>();
  if (typeof window === 'undefined') {
    return overrides;
  }

  window.document
    .querySelectorAll('.topic-content-edit .app-frame-live-state[data-app-instance-id][data-app-live-data]')
    .forEach((node) => {
      const instanceId = node.getAttribute('data-app-instance-id') || '';
      const liveData = node.getAttribute('data-app-live-data') || '';
      if (instanceId && liveData) {
        overrides.set(instanceId, liveData);
      }
    });

  return overrides;
}

function collectIframeAppFrameOverrides() {
  const overrides = new Map<string, string>();
  if (typeof window === 'undefined') {
    return overrides;
  }

  window.document
    .querySelectorAll('.topic-content-edit .app-frame-live-state[data-app-instance-id] iframe')
    .forEach((frame) => {
      const iframe = frame as HTMLIFrameElement;
      const instanceId = iframe
        .closest('.app-frame-live-state')
        ?.getAttribute('data-app-instance-id') || '';
      const liveData = (iframe.contentWindow as any)?.__RIZZOMA_APP_STATE;
      if (instanceId && liveData) {
        overrides.set(instanceId, JSON.stringify(liveData));
      }
    });

  return overrides;
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

function extractPlainSnippet(html: string, limit = 180): string {
  const plain = (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';
  return plain.length > limit ? `${plain.slice(0, limit).trim()}…` : plain;
}

function ensureTopicTitleHeading(html: string, fallbackTitle: string): string {
  const safeTitle = fallbackTitle.trim() || 'Untitled';
  if (!html) {
    return `<h1>${safeTitle}</h1>`;
  }
  if (/<h1[\s>]/i.test(html)) {
    return html;
  }
  return `<h1>${safeTitle}</h1>${html}`;
}

function replaceTopicTitleHeading(html: string, nextTitle: string): string {
  const safeTitle = nextTitle.trim() || 'Untitled';
  if (!html) {
    return `<h1>${safeTitle}</h1>`;
  }
  if (/<h1[\s>]/i.test(html)) {
    return html.replace(/<h1[^>]*>.*?<\/h1>/i, `<h1>${safeTitle}</h1>`);
  }
  return `<h1>${safeTitle}</h1>${html}`;
}

function stripFirstTopicHeading(html: string): string {
  if (!html) return '';
  return html.replace(/^\s*<h1[^>]*>.*?<\/h1>/i, '').trim();
}

function extractTopicTitle(html: string, fallbackTitle: string): string {
  const h1Match = html?.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (h1Match?.[1]) {
    return h1Match[1].replace(/<[^>]+>/g, '').trim() || fallbackTitle;
  }
  return fallbackTitle.trim() || 'Untitled';
}

function resolveSafeTopicTitle(content: string, extractedTitle: string, fallbackTitle: string): string {
  if (content.includes('data-gadget-type="app-frame"')) {
    return fallbackTitle.trim() || extractedTitle || 'Untitled';
  }
  return extractedTitle || fallbackTitle.trim() || 'Untitled';
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
  // Performance: Scroll tracking for virtualization in perf-lite mode
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(1000);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!isPerfLite) return;
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);
    if (target.clientHeight !== viewportHeight) {
      setViewportHeight(target.clientHeight);
    }
  }, [isPerfLite, viewportHeight]);

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
  const [showWavePlayback, setShowWavePlayback] = useState(false);
  const [showCommentsPanel, setShowCommentsPanel] = useState(true);

  // Topic content editing state (BLB: topic is meta-blip, title is first line)
  const [isEditingTopic, setIsEditingTopic] = useState(false);
  const [forceTopicReadMode, setForceTopicReadMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(TOPIC_RETURN_READ_MODE_KEY) === id;
    } catch {
      return false;
    }
  });
  const initialSuppressTopicToolbarUntil = (() => {
    if (typeof window === 'undefined') return 0;
    try {
      const raw = window.sessionStorage.getItem(TOPIC_SUPPRESS_TOOLBAR_UNTIL_KEY);
      const parsed = raw ? Number(raw) : 0;
      return Number.isFinite(parsed) ? parsed : 0;
    } catch {
      return 0;
    }
  })();
  const isEditingTopicRef = useRef(false);
  const isFinishingTopicEditRef = useRef(false);
  const [topicContent, setTopicContent] = useState('');
  const topicSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topicSaveAbortRef = useRef<AbortController | null>(null);
  const lastSavedContentRef = useRef<string>('');
  const latestTopicContentRef = useRef<string>('');
  const latestAppFrameDataRef = useRef<Map<string, string>>(new Map());
  const pendingTopicBootstrapRef = useRef<string | null>(null);
  const bootstrappingTopicEditRef = useRef(false);
  const returningFromSubblipRef = useRef(false);
  const suppressTopicToolbarUntilRef = useRef(initialSuppressTopicToolbarUntil);
  const topicContentViewRef = useRef<HTMLDivElement | null>(null);
  const topicContentInnerRef = useRef<HTMLDivElement | null>(null);
  const editingTopicTitleRef = useRef('Untitled');
  const topicInlineRootBlips = useMemo(
    () => blips.filter((b) => typeof b.anchorPosition === 'number'),
    [blips]
  );
  const topicContentHtmlBase = useMemo(() => {
    const baseHtml = topic?.content && topic.content.trim().length > 0
      ? `<h1>${topic?.title || 'Untitled'}</h1>${hydrateAppFrameFigures(stripFirstTopicHeading(topic.content))}`
      : `<h1>${topic?.title || 'Untitled'}</h1>`;
    return injectInlineMarkers(baseHtml, topicInlineRootBlips);
  }, [topic?.content, topic?.title, topicInlineRootBlips]);
  const showTopicEditMode = isEditingTopic && !forceTopicReadMode;
  const currentSubblipParent = useMemo(() => {
    if (!currentSubblip?.parentBlipId) return null;
    return allBlipsMap.get(currentSubblip.parentBlipId) || null;
  }, [allBlipsMap, currentSubblip]);
  const currentSubblipSiblingCount = currentSubblip
    ? currentSubblip.parentBlipId
      ? (allBlipsMap.get(currentSubblip.parentBlipId)?.childBlips?.filter((child) => child.anchorPosition === undefined || child.anchorPosition === null).length || 0)
      : blips.filter((child) => child.anchorPosition === undefined || child.anchorPosition === null).length
    : 0;
  // currentSubblipContext was retired in 2026-04-13 Execution 7 — the parent
  // preview now renders either as a real RizzomaBlip (when currentSubblipParent
  // is resolvable) or as the topic content via dangerouslySetInnerHTML (when
  // the focused subblip is anchored directly under the topic root). Both
  // branches read straight from `currentSubblipParent` / `topic`, so the
  // intermediate context object is no longer needed.

  // Sibling navigation: inline children sharing the same parent (topic root or
  // a specific blip), sorted by anchorPosition. Lets the subblip view step
  // through multiple anchored inline comments under the same parent without
  // returning to the topic surface in between.
  const subblipSiblings = useMemo(() => {
    if (!currentSubblip) return [] as BlipData[];
    const candidates: BlipData[] = currentSubblipParent
      ? (currentSubblipParent.childBlips || [])
      : topicInlineRootBlips;
    return candidates
      .filter((b) => b.anchorPosition !== undefined && b.anchorPosition !== null)
      .slice()
      .sort((a, b) => (a.anchorPosition ?? 0) - (b.anchorPosition ?? 0));
  }, [currentSubblip, currentSubblipParent, topicInlineRootBlips]);
  const subblipSiblingIndex = currentSubblip
    ? subblipSiblings.findIndex((s) => s.id === currentSubblip.id)
    : -1;
  const prevSubblipSibling = subblipSiblingIndex > 0 ? subblipSiblings[subblipSiblingIndex - 1] : null;
  const nextSubblipSibling = subblipSiblingIndex >= 0 && subblipSiblingIndex < subblipSiblings.length - 1
    ? subblipSiblings[subblipSiblingIndex + 1]
    : null;

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

  // --- Real-time collaboration for topic root blip ---
  // RizzomaBlip skips collab for topic root (isTopicRoot), so this is the sole owner.
  // Topic-root collaboration is currently less reliable than normal blip collaboration:
  // it can hydrate the meta-blip editor with a blank placeholder and clobber the real
  // topic body on entry. Keep root-topic editing on the stable non-collab path until
  // the dedicated topic-root Yjs bootstrap is rebuilt.
  const topicCollabEnabled = false;
  const topicYdoc = useMemo(
    () => topicCollabEnabled ? yjsDocManager.getDocument(id) : undefined,
    [id, topicCollabEnabled]
  );
  const topicCollabProvider = useCollaboration(topicYdoc, id, topicCollabEnabled);
  const topicCollabActive = topicCollabEnabled && !!topicYdoc && !!topicCollabProvider;
  const seedingTopicYdocRef = useRef(false);

  // TipTap editor for topic content (meta-blip editing)
  const topicEditor = useEditor({
    extensions: getEditorExtensions(
      topicCollabActive ? topicYdoc : undefined,
      topicCollabActive ? topicCollabProvider : undefined,
      {
        waveId: id,
        onCreateInlineChildBlip: stableCreateInlineChildBlip,
      }
    ),
    content: '',
    editable: false,
    editorProps: defaultEditorProps,
    onUpdate: ({ editor, transaction }: { editor: Editor; transaction: any }) => {
      // Skip auto-save during Y.Doc seeding
      if (seedingTopicYdocRef.current) return;
      if (isFinishingTopicEditRef.current || !isEditingTopicRef.current) return;

      const html = serializeEditorContent(editor, editor.getHTML());
      if (
        bootstrappingTopicEditRef.current &&
        isEffectivelyEmptyHtml(html) &&
        !isEffectivelyEmptyHtml(latestTopicContentRef.current)
      ) {
        return;
      }

      if (bootstrappingTopicEditRef.current && !isEffectivelyEmptyHtml(html)) {
        bootstrappingTopicEditRef.current = false;
        pendingTopicBootstrapRef.current = null;
      }

      setTopicContent(html);
      latestTopicContentRef.current = html;

      // Skip auto-save for remote Y.Doc sync updates (origin is ySyncPlugin object)
      const isRemoteSync = transaction?.origin != null && typeof transaction.origin === 'object';
      if (isRemoteSync) return;

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
      isFinishingTopicEditRef.current = false;
    }
    isEditingTopicRef.current = isEditingTopic;
  }, [isEditingTopic]);

  // Notify RightToolsPanel of edit mode changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(EDIT_MODE_EVENT, { detail: { isEditing: showTopicEditMode } }));
  }, [showTopicEditMode]);

  // Handle insert events from RightToolsPanel when topic editor is active
  useEffect(() => {
    if (!showTopicEditMode || !topicEditor) return;

    // Helper: insert trigger char with space prefix if needed (suggestion plugins require allowedPrefixes=[' '])
    const insertTrigger = (char: string) => {
      topicEditor.commands['focus']();
      const { from } = topicEditor.state.selection;
      const $from = topicEditor.state.doc.resolve(from);
      const charBefore = from > $from.start() ? topicEditor.state.doc.textBetween(from - 1, from) : '';
      const prefix = charBefore && charBefore !== ' ' ? ' ' : '';
      document.execCommand('insertText', false, prefix + char);
    };
    const handleInsertMention = () => insertTrigger('@');
    const handleInsertTask = () => insertTrigger('~');
    const handleInsertTag = () => insertTrigger('#');
    const handleInsertReply = () => {
      const { from } = topicEditor.state.selection;
      createInlineChildBlipRef.current?.(from);
    };
    const handleInsertGadget = (e: Event) => {
      const detail = (e as CustomEvent<GadgetInsertDetail>).detail;
      insertGadget(topicEditor as any, detail);
    };

    window.addEventListener(INSERT_EVENTS.MENTION, handleInsertMention);
    window.addEventListener(INSERT_EVENTS.TASK, handleInsertTask);
    window.addEventListener(INSERT_EVENTS.TAG, handleInsertTag);
    window.addEventListener(INSERT_EVENTS.REPLY, handleInsertReply);
    window.addEventListener(INSERT_EVENTS.GADGET, handleInsertGadget);
    return () => {
      window.removeEventListener(INSERT_EVENTS.MENTION, handleInsertMention);
      window.removeEventListener(INSERT_EVENTS.TASK, handleInsertTask);
      window.removeEventListener(INSERT_EVENTS.TAG, handleInsertTag);
      window.removeEventListener(INSERT_EVENTS.REPLY, handleInsertReply);
      window.removeEventListener(INSERT_EVENTS.GADGET, handleInsertGadget);
    };
  }, [showTopicEditMode, topicEditor]);

  // Sync editor content and editable state when entering edit mode.
  // With Collaboration, wait for server sync before seeding — only seed if Y.Doc is empty.
  useEffect(() => {
    const handleAppFrameData = (event: Event) => {
      const detail = (event as CustomEvent<{ instanceId?: string; data?: string }>).detail;
      if (!detail?.instanceId || !detail?.data) return;
      latestAppFrameDataRef.current.set(detail.instanceId, detail.data);
    };

    window.addEventListener(APP_FRAME_DATA_EVENT, handleAppFrameData);
    return () => window.removeEventListener(APP_FRAME_DATA_EVENT, handleAppFrameData);
  }, []);

  useEffect(() => {
    if (topicEditor && showTopicEditMode && topicContent && !hasSetInitialContentRef.current) {
      const setContentAndFocus = () => {
        if ((topicEditor as any).isDestroyed) return;
        topicEditor.setEditable(true);
        setTimeout(() => {
          if ((topicEditor as any).isDestroyed) return;
          const bootstrapContent = pendingTopicBootstrapRef.current;
          if (bootstrapContent && isEditorEffectivelyEmpty(topicEditor)) {
            seedingTopicYdocRef.current = true;
            topicEditor.commands.setContent(bootstrapContent);
            seedingTopicYdocRef.current = false;
          }
          if (!isEditorEffectivelyEmpty(topicEditor)) {
            bootstrappingTopicEditRef.current = false;
            pendingTopicBootstrapRef.current = null;
          }
        }, 120);
        setTimeout(() => { topicEditor.commands['focus']('end'); }, 50);
      };

      if (topicCollabActive && topicYdoc && topicCollabProvider) {
        // Collab: wait for server sync, only seed if Y.Doc fragment is empty
        hasSetInitialContentRef.current = true;
        topicCollabProvider.onSynced(() => {
          if ((topicEditor as any).isDestroyed) return;
          const frag = topicYdoc!.getXmlFragment('default');
          if (frag.length === 0 || isEditorEffectivelyEmpty(topicEditor)) {
            seedingTopicYdocRef.current = true;
            topicEditor.commands.setContent(topicContent);
            seedingTopicYdocRef.current = false;
          }
          setContentAndFocus();
        });
      } else {
        // No collab: set content directly
        hasSetInitialContentRef.current = true;
        topicEditor.commands.setContent(topicContent);
        setContentAndFocus();
      }
    } else if (topicEditor && !showTopicEditMode) {
      topicEditor.setEditable(false);
    }
  }, [topicEditor, showTopicEditMode, topicContent, topicCollabActive, topicYdoc, topicCollabProvider]);

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
          const currentIsAuthed = isAuthed;
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
  }, [id, isAuthed]);

  // Initial load + reload when auth state changes
  // load depends on [id, isAuthed], so when isAuthed changes (false→true after auth check),
  // load is recreated and this effect re-fires, reloading with correct permissions
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

  useEffect(() => {
    if (typeof window === 'undefined' || currentSubblip) return;
    try {
      if (window.sessionStorage.getItem(TOPIC_RETURN_READ_MODE_KEY) === id) {
        setForceTopicReadMode(true);
        window.sessionStorage.removeItem(TOPIC_RETURN_READ_MODE_KEY);
      }
      const rawSuppressUntil = window.sessionStorage.getItem(TOPIC_SUPPRESS_TOOLBAR_UNTIL_KEY);
      const suppressUntil = rawSuppressUntil ? Number(rawSuppressUntil) : 0;
      if (Number.isFinite(suppressUntil) && suppressUntil > Date.now()) {
        suppressTopicToolbarUntilRef.current = suppressUntil;
      } else {
        window.sessionStorage.removeItem(TOPIC_SUPPRESS_TOOLBAR_UNTIL_KEY);
      }
    } catch {
      // Best-effort UI guard only.
    }
  }, [currentSubblip, id]);

  useEffect(() => {
    if (!currentSubblip) return;
    pendingTopicBootstrapRef.current = null;
    bootstrappingTopicEditRef.current = false;
    isFinishingTopicEditRef.current = true;
    isEditingTopicRef.current = false;
    setForceTopicReadMode(true);
    setIsEditingTopic(false);
    if (topicEditor) {
      topicEditor.setEditable(false);
    }
  }, [currentSubblip, topicEditor]);

  useEffect(() => {
    if (currentSubblip || !returningFromSubblipRef.current) return;
    pendingTopicBootstrapRef.current = null;
    bootstrappingTopicEditRef.current = false;
    isFinishingTopicEditRef.current = true;
    isEditingTopicRef.current = false;
    setForceTopicReadMode(true);
    setIsEditingTopic(false);
    if (topicEditor) {
      topicEditor.setEditable(false);
    }
    const timeout = window.setTimeout(() => {
      isEditingTopicRef.current = false;
      setIsEditingTopic(false);
      if (topicEditor) {
        topicEditor.setEditable(false);
      }
      returningFromSubblipRef.current = false;
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [currentSubblip, topicEditor]);

  // BLB: Navigation helper to go back to parent
  const navigateToParent = useCallback(() => {
    returningFromSubblipRef.current = true;
    suppressTopicToolbarUntilRef.current = Date.now() + 500;
    isFinishingTopicEditRef.current = true;
    isEditingTopicRef.current = false;
    flushSync(() => {
      setForceTopicReadMode(true);
      setIsEditingTopic(false);
    });
    try {
      window.sessionStorage.setItem(TOPIC_RETURN_READ_MODE_KEY, id);
      window.sessionStorage.setItem(TOPIC_SUPPRESS_TOOLBAR_UNTIL_KEY, String(suppressTopicToolbarUntilRef.current));
    } catch {
      // Best-effort UI guard only.
    }
    if (topicEditor) {
      topicEditor.setEditable(false);
    }
    let nextHash = `#/topic/${id}`;
    if (currentSubblip?.parentBlipId) {
      // Find the parent blip
      const parent = allBlipsMap.get(currentSubblip.parentBlipId);
      if (parent?.blipPath) {
        nextHash = `#/topic/${id}/${parent.blipPath}/`;
      }
    }
    window.setTimeout(() => {
      window.location.hash = nextHash;
    }, 0);
  }, [allBlipsMap, currentSubblip, id, topicEditor]);

  const shouldSuppressTopicToolbar = useCallback(() => {
    const suppressed = Date.now() < suppressTopicToolbarUntilRef.current;
    if (!suppressed && typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(TOPIC_SUPPRESS_TOOLBAR_UNTIL_KEY);
      } catch {
        // Best-effort UI guard only.
      }
    }
    return suppressed;
  }, []);

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
              const fallbackTitle = editingTopicTitleRef.current || topic?.title || 'Untitled';
              const currentContent = ensureTopicTitleHeading(editor.getHTML(), fallbackTitle);
              setTopicContent(currentContent);
              latestTopicContentRef.current = currentContent;
              lastSavedContentRef.current = currentContent;
              try {
                const token = await ensureCsrf();
                await fetch(`/api/topics/${encodeURIComponent(id)}`, {
                  method: 'PATCH',
                  credentials: 'include',
                  headers: {
                    'content-type': 'application/json',
                    ...(token ? { 'x-csrf-token': token } : {}),
                  },
                  body: JSON.stringify({ title: fallbackTitle, content: currentContent }),
                });
              } catch (persistError) {
                console.error('[TopicDetail] Failed to persist topic marker before subblip navigation', persistError);
              }
              isFinishingTopicEditRef.current = true;
              isEditingTopicRef.current = false;
              flushSync(() => {
                setForceTopicReadMode(true);
                setIsEditingTopic(false);
              });
              editor.setEditable(false);
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

            // Refresh and navigate into the new anchored child blip.
            load(true);
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
  }, [ensureCsrf, id, isAuthed, load, topic?.title]);

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
        const hasUnread = !!(threadId && unreadSet.has(threadId));
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
  const handleBlipUpdate = useCallback((blipId: string, content: string) => {
    const updatedAt = Date.now();

    pendingBlipsRef.current.set(blipId, {
      ...(pendingBlipsRef.current.get(blipId) || {
        id: blipId,
        content,
        authorId: '',
        authorName: 'Anonymous',
        createdAt: updatedAt,
        updatedAt,
        isRead: true,
        childBlips: [],
        permissions: { canEdit: true, canComment: true, canRead: true },
        contributors: [],
      }),
      content,
      updatedAt,
    });

    setAllBlipsMap(prev => {
      if (!prev.has(blipId)) return prev;
      const next = new Map(prev);
      const current = next.get(blipId);
      if (current) {
        next.set(blipId, { ...current, content, updatedAt });
      }
      return next;
    });

    setCurrentSubblip(prev => (
      prev && prev.id === blipId
        ? { ...prev, content, updatedAt }
        : prev
    ));

    // Keep the broader topic/blip tree in sync after the immediate local update.
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
      await api(`/api/waves/${encodeURIComponent(id)}/blips/${encodeURIComponent(blipId)}/read`, { method: 'POST' });
    } catch {
      // Silent fail for read status
    }
  }, [id]);

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

  // Global fold-all / unfold-all event listeners (from RightToolsPanel ▲/▼ buttons)
  useEffect(() => {
    const collectAllBlipIds = (blipList: BlipData[]): string[] => {
      const ids: string[] = [];
      const walk = (list: BlipData[]) => {
        for (const b of list) {
          ids.push(b.id);
          if (b.childBlips) walk(b.childBlips);
        }
      };
      walk(blipList);
      return ids;
    };

    const handleFoldAll = () => {
      setExpandedBlips(new Set());
    };

    const handleUnfoldAll = () => {
      const allIds = collectAllBlipIds(blips);
      setExpandedBlips(new Set(allIds));
    };

    window.addEventListener('rizzoma:fold-all', handleFoldAll);
    window.addEventListener('rizzoma:unfold-all', handleUnfoldAll);
    return () => {
      window.removeEventListener('rizzoma:fold-all', handleFoldAll);
      window.removeEventListener('rizzoma:unfold-all', handleUnfoldAll);
    };
  }, [blips]);

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

  const handleWavePlayback = () => {
    closeGearMenus();
    setShowWavePlayback(true);
  };

  // Auto-save topic content (BLB: extracts title from first H1/line)
  const autoSaveTopicContent = useCallback(async (content: string, force = false) => {
    if (!force && content === lastSavedContentRef.current) {
      return;
    }
    if (!force && latestTopicContentRef.current && content !== latestTopicContentRef.current) {
      return;
    }
    const abortController = new AbortController();
    if (topicSaveAbortRef.current) {
      topicSaveAbortRef.current.abort();
    }
    topicSaveAbortRef.current = abortController;
    try {
      const fallbackTitle = editingTopicTitleRef.current || 'Untitled';
      const normalizedContent = content.includes('data-gadget-type="app-frame"')
        ? replaceTopicTitleHeading(content, fallbackTitle)
        : content;
      const finalTitle = fallbackTitle;
      if (!finalTitle) return;

      await ensureCsrf();
      const response = await api(`/api/topics/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: finalTitle, content: normalizedContent }),
        signal: abortController.signal,
      });
      if (abortController.signal.aborted) {
        return;
      }
      if (response.ok) {
        lastSavedContentRef.current = normalizedContent;
        if (latestTopicContentRef.current !== content) {
          return;
        }
        setTopic(prev => prev ? { ...prev, title: finalTitle, content: normalizedContent } : prev);
        // No toast for auto-save - it's real-time
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        return;
      }
      // Silent fail for auto-save - will retry on next change
    } finally {
      if (topicSaveAbortRef.current === abortController) {
        topicSaveAbortRef.current = null;
      }
    }
  }, [id]);

  // Start editing topic (BLB: topic is meta-blip)
  const startEditingTopic = useCallback(() => {
    try {
      if (typeof window !== 'undefined') {
        const rawSuppressUntil = window.sessionStorage.getItem(TOPIC_SUPPRESS_TOOLBAR_UNTIL_KEY);
        const suppressUntil = rawSuppressUntil ? Number(rawSuppressUntil) : 0;
        if (Number.isFinite(suppressUntil) && suppressUntil > Date.now()) {
          return;
        }
      }
    } catch {
      // Best-effort guard only.
    }
    if (!isAuthed) {
      toast('Sign in to edit', 'error');
      return;
    }
    let initialContent = '';
    const viewSeed = extractTopicEditSeedHtml(topicContentInnerRef.current);
    if (viewSeed) {
      initialContent = viewSeed;
    } else {
      const titleH1 = `<h1>${topic?.title || 'Untitled'}</h1>`;
      if (topic?.content) {
        const bodyContent = stripFirstTopicHeading(topic.content);
        const contentHasTitle = topic.content.toLowerCase().includes(`<h1>${(topic.title || '').toLowerCase()}</h1>`);
        if (contentHasTitle) {
          initialContent = titleH1 + bodyContent;
        } else {
          let wrappedContent = bodyContent;
          if (!/<[^>]+>/.test(wrappedContent)) {
            wrappedContent = `<p>${wrappedContent}</p>`;
          }
          initialContent = titleH1 + wrappedContent;
        }
      } else {
        initialContent = titleH1;
      }
    }
    const inlineRootBlips = blips.filter((b) => typeof b.anchorPosition === 'number');
    const nextContent = injectInlineMarkers(initialContent, inlineRootBlips);
    editingTopicTitleRef.current = topic?.title || 'Untitled';
    pendingTopicBootstrapRef.current = nextContent;
    bootstrappingTopicEditRef.current = true;
    setTopicContent(nextContent);
    lastSavedContentRef.current = nextContent;
    latestTopicContentRef.current = nextContent;
    latestAppFrameDataRef.current = new Map();
    isFinishingTopicEditRef.current = false;
    setForceTopicReadMode(false);
    isEditingTopicRef.current = true;
    setIsEditingTopic(true);
    // The useEffect will handle syncing the editor content when isEditingTopic changes
    if (topicEditor && !(topicEditor as any).isDestroyed) {
      topicEditor.setEditable(true);
      seedingTopicYdocRef.current = true;
      topicEditor.commands.setContent(nextContent);
      seedingTopicYdocRef.current = false;
      window.setTimeout(() => {
        if ((topicEditor as any).isDestroyed || !isEditingTopicRef.current) return;
        topicEditor.setEditable(true);
        if (isEditorEffectivelyEmpty(topicEditor)) {
          seedingTopicYdocRef.current = true;
          topicEditor.commands.setContent(nextContent);
          seedingTopicYdocRef.current = false;
        }
      }, 80);
    }
  }, [isAuthed, topic?.title, topic?.content, blips, topicEditor]);

  // Finish editing topic
  const finishEditingTopic = useCallback(() => {
    isFinishingTopicEditRef.current = true;
    isEditingTopicRef.current = false;
    setForceTopicReadMode(false);
    // Clear any pending save timeout
    if (topicSaveTimeoutRef.current) {
      clearTimeout(topicSaveTimeoutRef.current);
      topicSaveTimeoutRef.current = null;
    }
    // Final save if content changed
    const liveOverrides = collectLiveAppFrameOverrides();
    const mergedOverrides = new Map(latestAppFrameDataRef.current);
    liveOverrides.forEach((value, key) => mergedOverrides.set(key, value));
    const iframeOverrides = collectIframeAppFrameOverrides();
    iframeOverrides.forEach((value, key) => mergedOverrides.set(key, value));
    const fallbackTitle = editingTopicTitleRef.current || 'Untitled';
    const serializedContent = ensureTopicTitleHeading(
      serializeEditorContent(topicEditor, topicContent),
      fallbackTitle
    );
    const currentContent = replaceTopicTitleHeading(
      hydrateAppFrameFigures(applyLiveAppFrameOverrides(serializedContent, mergedOverrides)),
      fallbackTitle
    );
    if (typeof window !== 'undefined') {
      const finishDebug = {
        serializedContent,
        currentContent,
        topicContentState: topicContent,
        eventOverrides: Array.from(latestAppFrameDataRef.current.entries()),
        liveOverrides: Array.from(liveOverrides.entries()),
        iframeOverrides: Array.from(iframeOverrides.entries()),
        mergedOverrides: Array.from(mergedOverrides.entries()),
      };
      (window as any).__RIZZOMA_LAST_FINISH_DEBUG = finishDebug;
      try {
        window.sessionStorage.setItem('__RIZZOMA_LAST_FINISH_DEBUG', JSON.stringify(finishDebug));
      } catch {
        // Best-effort debug snapshot only.
      }
    }
    latestTopicContentRef.current = currentContent;
    const finalTitle = fallbackTitle;
    if (finalTitle) {
      setTopic(prev => prev ? { ...prev, title: finalTitle, content: currentContent } : prev);
    }
    if (currentContent !== lastSavedContentRef.current) {
      lastSavedContentRef.current = currentContent;
      void ensureCsrf()
        .then((token) =>
          fetch(`/api/topics/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: {
              'content-type': 'application/json',
              ...(token ? { 'x-csrf-token': token } : {}),
            },
            body: JSON.stringify({ title: finalTitle, content: currentContent }),
          })
        )
        .then((response) => {
          if (!response?.ok) {
            lastSavedContentRef.current = '';
          }
        })
        .catch(() => {
          lastSavedContentRef.current = '';
        });
    }
    setIsEditingTopic(false);
    if (topicEditor) {
      topicEditor.setEditable(false);
    }
  }, [id, topic?.title, topicContent, topicEditor]);

  useEffect(() => {
    if (showTopicEditMode || !topicContentViewRef.current || !topicContentInnerRef.current) {
      return;
    }
    topicContentInnerRef.current.innerHTML = topicContentHtmlBase || '';
    hydrateAppFrameFigureElements(topicContentViewRef.current);
  }, [showTopicEditMode, topicContentHtmlBase]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    (window as any).__RIZZOMA_TOPIC_EDITOR_DEBUG = {
      isEditingTopic,
      forceTopicReadMode,
      showTopicEditMode,
      hasTopicEditor: !!topicEditor,
      topicEditorEditable: topicEditor?.isEditable ?? null,
      topicEditorHtml: topicEditor?.getHTML?.() ?? null,
      topicContentState: topicContent,
      pendingBootstrap: pendingTopicBootstrapRef.current,
      bootstrapping: bootstrappingTopicEditRef.current,
      topicContentHtmlBase,
      viewSeedHtml: extractTopicEditSeedHtml(topicContentInnerRef.current),
    };
  }, [isEditingTopic, forceTopicReadMode, showTopicEditMode, topicEditor, topicContent, topicContentHtmlBase]);

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
  const inlineRootBlips = topicInlineRootBlips;
  const listBlips = blips.filter(b => b.anchorPosition === undefined || b.anchorPosition === null);
  // Don't inject markers here — let RizzomaBlip handle it with expanded state tracking
  const topicBlip: BlipData = {
    id: topic.id,
    content: topicContentHtmlBase,
    authorId: topic.authorId,
    authorName: topic.authorName,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    isRead: true,
    permissions: {
      canEdit: false,
      canComment: false,
      canRead: true,
    },
    childBlips: [...listBlips, ...inlineRootBlips],
  };
  const topicContentOverride = showTopicEditMode ? (
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
              {FEATURES.WAVE_PLAYBACK && (
                <>
                  <div className="gear-menu-divider" />
                  <button className="gear-menu-item" onClick={handleWavePlayback}>
                    Wave Timeline
                  </button>
                </>
              )}
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
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigateToParent();
              }}
              title="Return to parent (Hide)"
            >
              Hide
            </button>
            {/* Sibling navigation: prev/next inline siblings under the same parent */}
            {subblipSiblings.length > 1 && (
              <span className="subblip-sibling-nav">
                <button
                  className="subblip-sibling-btn subblip-sibling-prev"
                  type="button"
                  disabled={!prevSubblipSibling}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (prevSubblipSibling) navigateToSubblip(prevSubblipSibling);
                  }}
                  title={prevSubblipSibling ? `Previous sibling: ${extractTitleFromContent(prevSubblipSibling.content) || 'Subblip'}` : 'No previous sibling'}
                  aria-label="Previous sibling subblip"
                >
                  ‹
                </button>
                <span className="subblip-sibling-counter" aria-label="Sibling position">
                  {subblipSiblingIndex + 1} / {subblipSiblings.length}
                </span>
                <button
                  className="subblip-sibling-btn subblip-sibling-next"
                  type="button"
                  disabled={!nextSubblipSibling}
                  onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (nextSubblipSibling) navigateToSubblip(nextSubblipSibling);
                  }}
                  title={nextSubblipSibling ? `Next sibling: ${extractTitleFromContent(nextSubblipSibling.content) || 'Subblip'}` : 'No next sibling'}
                  aria-label="Next sibling subblip"
                >
                  ›
                </button>
              </span>
            )}
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

          <div className="subblip-stage">
            {currentSubblipParent && (
              <div className="subblip-parent-context subblip-parent-context-blip">
                <div className="subblip-parent-context-label">
                  Parent thread
                  {currentSubblipSiblingCount > 0 && (
                    <span className="subblip-parent-context-meta"> · {currentSubblipSiblingCount} {currentSubblipSiblingCount === 1 ? 'reply' : 'replies'} in this thread</span>
                  )}
                </div>
                <RizzomaBlip
                  key={`parent-${currentSubblipParent.id}`}
                  blip={currentSubblipParent}
                  isRoot={false}
                  depth={0}
                  expandedBlips={expandedBlips}
                  forceExpanded={true}
                  hideChildBlips={true}
                  isInlineChild={true}
                />
              </div>
            )}
            {!currentSubblipParent && topic && (
              <div className="subblip-parent-context subblip-parent-context-topic">
                <div className="subblip-parent-context-label">
                  Topic context
                  {subblipSiblings.length > 0 && (
                    <span className="subblip-parent-context-meta"> · {subblipSiblings.length} anchored {subblipSiblings.length === 1 ? 'comment' : 'comments'} in this topic</span>
                  )}
                </div>
                <div className="subblip-parent-topic-title">
                  {topic.title?.trim() || 'Untitled topic'}
                </div>
                <div
                  className="subblip-parent-topic-content"
                  dangerouslySetInnerHTML={{ __html: stripFirstTopicHeading(topic.content || '') || '<p>No topic preview available.</p>' }}
                />
              </div>
            )}

            <div className="subblip-focus-shell">
              <RizzomaBlip
                key={currentSubblip.id}
                blip={currentSubblip}
                isRoot={false}
                depth={1}
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
        <div className={`topic-blip-toolbar ${showTopicEditMode ? 'editing' : ''}`}>
          <button
            className={`topic-tb-btn ${showTopicEditMode ? 'active primary' : ''}`}
            title={showTopicEditMode ? 'Done editing (changes auto-saved)' : 'Edit topic content'}
            onClick={() => {
              if (shouldSuppressTopicToolbar()) return;
              if (showTopicEditMode) {
                finishEditingTopic();
              } else {
                startEditingTopic();
              }
            }}
          >
            {showTopicEditMode ? 'Done' : 'Edit'}
          </button>
          <button
            className={`topic-tb-btn ${showCommentsPanel ? 'active' : ''}`}
            title={showCommentsPanel ? 'Hide inline comments' : 'Show inline comments'}
            onClick={() => {
              if (shouldSuppressTopicToolbar()) return;
              setShowCommentsPanel(!showCommentsPanel);
              toast(showCommentsPanel ? 'Comments hidden' : 'Comments shown');
            }}
          >
            💬
          </button>
          {/* Insert inline comment button - only visible in edit mode */}
          {showTopicEditMode && (
            <button
              className="topic-tb-btn insert-comment-btn"
              title="Insert inline comment at cursor (Ctrl+Enter)"
              onClick={() => {
                if (shouldSuppressTopicToolbar()) return;
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
              if (shouldSuppressTopicToolbar()) return;
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
              onClick={() => {
                if (shouldSuppressTopicToolbar()) return;
                setShowEditGearMenu(!showEditGearMenu);
              }}
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
                {FEATURES.WAVE_PLAYBACK && (
                  <>
                    <div className="gear-menu-divider" />
                    <button className="gear-menu-item" onClick={handleWavePlayback}>
                      Wave Timeline
                    </button>
                  </>
                )}
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
        <div 
          ref={scrollContainerRef}
          className="topic-blip-body"
          onScroll={isPerfLite ? handleScroll : undefined}
        >
          {isPerfLite ? (
            <>
              <div className="topic-blip-content">
                {showTopicEditMode ? (
                  <div className="topic-content-edit">
                    <EditorContent editor={topicEditor} />
                  </div>
                ) : (
                  <div className="topic-content-view" ref={topicContentViewRef}>
                    {topicContentHtmlBase ? (
                      <div ref={topicContentInnerRef} dangerouslySetInnerHTML={{ __html: topicContentHtmlBase }} />
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
                  
                  // Virtualization parameters
                  const ROW_HEIGHT = 32; // Standard height for perf-lite collapsed row
                  const BUFFER = 5;
                  
                  // Calculate total height
                  const totalHeight = listBlips.length * ROW_HEIGHT;
                  
                  // Determine visible range
                  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER);
                  const endIndex = Math.min(listBlips.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER);
                  
                  const visibleBlips = listBlips.slice(startIndex, endIndex);
                  const topPadding = startIndex * ROW_HEIGHT;

                  return (
                    <div className="blip-list-virtual" style={{ height: totalHeight, position: 'relative' }}>
                      <div style={{ transform: `translateY(${topPadding}px)` }}>
                        {visibleBlips.map((blip) => {
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
                            <div key={blip.id} className="rizzoma-blip perf-blip-row" data-blip-id={blip.id} style={{ height: ROW_HEIGHT }}>
                              <div className={`blip-collapsed-row perf-collapsed ${hasUnread ? 'has-unread' : ''}`}>
                                <span className="blip-bullet">•</span>
                                <span className="blip-collapsed-label-text">{label}</span>
                                <span className={`blip-expand-icon ${hasUnread ? 'has-unread' : ''}`}>+</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
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
              isPerfLite={isPerfLite}
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
              contentTitle={undefined}
              onContentClick={undefined}
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
      {showWavePlayback && (
        <WavePlaybackModal
          waveId={id}
          topicTitle={topic?.title || 'Untitled'}
          blips={blips.map(b => ({ id: b.id, label: b.content ? b.content.replace(/<[^>]+>/g, '').trim().slice(0, 60) || `Blip ${b.id.slice(0, 8)}` : `Blip ${b.id.slice(0, 8)}` }))}
          onClose={() => setShowWavePlayback(false)}
        />
      )}
    </div>
  );
}
