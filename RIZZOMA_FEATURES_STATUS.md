# 🚀 Rizzoma Core Features Implementation Status

## Summary
Core editor tracks remain behind feature flags, and unread tracking/presence are now persisted per user (CouchDB read docs + Socket.IO events) and rendered across the Rizzoma layout (list badges, WaveView navigation bar, Follow-the-Green button). Demo-mode shortcuts have been removed in favor of real sessions, and permissions now enforce real authorship. Recovery UI for rebuilds and editor search materialization/snippets are implemented and covered by tests. Follow-the-Green now has deterministic Vitest coverage (CTA happy/degraded paths), a multi-user Playwright smoke (multi unread + forced mark-read failure + mobile viewport), and CI gating via the `browser-smokes` GitHub job (with snapshots/artifacts). Uploads run through MIME sniffing + optional ClamAV, optionally stream to S3/MinIO, and the client surfaces cancel/retry/preview UI. A perf harness (`npm run perf:harness`) seeds large waves and captures render screenshots/metrics; as of 2026-04-24 it supports `RIZZOMA_PERF_RENDER=lite|full`, records the profile in metrics, and has a public-prod 100-blip full-render baseline under `screenshots/260424-prod-perf-baseline/` (stage durations 1193.7ms landing / 524.5ms expanded, memory 33-36MB). A fresh visual/runtime verdict now lives under `screenshots/260424-025320-feature-sweep/`: 42 primary screenshots, `coverage.md` mapping all 161 screenshot-valid rows (101 static screenshot-covered, 2 dynamic screenshot-covered, 58 non-screenshot/test-artifact, 0 screenshot gaps), and `BUILD_QUALITY_VERDICT.md` rating the branch 160 green / 1 orange / 0 red after Redis session, Twitter/X OAuth2 PKCE, and mobile/PWA/offline runtime tests. Health/inline-comments/uploads checks now run in CI via the `health-checks` job (`npm run test:health`), and `server.health.test.ts` covers both OK/degraded paths with a mocked CouchDB check so local runs do not depend on Docker. **BLB implementation fix (2026-01-19)**: Audited and fixed BLB (Bullet-Label-Blip) functionality in RizzomaTopicDetail - Fold button now properly wired with localStorage + server persistence, expand icons changed from +/- to □, duplicate toolbar buttons removed. See `docs/BLB_LOGIC_AND_PHILOSOPHY.md` for methodology. **Mobile modernization (2026-01-18)**: Implemented complete mobile PWA infrastructure with zero new dependencies - responsive breakpoints, MobileContext, BottomSheet component, PWA manifest/SW/icons, gesture hooks (swipe, pull-to-refresh), View Transitions API, offline mutation queue with retry logic, and mobile view switching in RizzomaLayout. **Recent orange-row fixes (2026-04-24)**: TipTap collaboration editors now recreate when collab extensions become active, typing awareness renders visibly, mobile topic content is captured directly, avatar fallbacks render locally without broken external placeholders, Twitter/X OAuth exists again via OAuth2 PKCE, sessions use Redis 5 by default, and focused runtime tests cover mobile gesture/BottomSheet/PWA/offline behavior. Physical iPhone Safari / Chrome Android validation remains the one open orange row.

## ✅ Implemented Features

### Track A: Inline Comments System
- **Text selection tracking** - Select any text to add a comment
- **Comment anchoring** - Comments attached to specific text ranges
- **Comment sidebar** - View and manage all comments
- **Resolve/unresolve** - Mark comments as resolved
- **Visibility preference** - Per-blip inline comment visibility persisted server-side with localStorage fallback and keyboard shortcuts (Ctrl+Shift+Up/Down)
- **API endpoints** - Full backend support for comments
- **Files created:**
  - `InlineComments.tsx/css` - UI components
  - `types/comments.ts` - Data models
  - `routes/inlineComments.ts` - API endpoints

### Track B: Rich Text Editor
- **Formatting toolbar** - Bold, italic, headings, lists, undo/redo, clear formatting, link/image/attachment placeholders
- **@mentions** - Type @ to mention users with autocomplete
- **Task lists** - Checkbox support for tasks
- **Links** - Add/remove hyperlinks
- **Highlight** - Text highlighting support
- **Files created:**
  - `EditorToolbar.tsx/css` - Rich formatting UI
  - `MentionList.tsx/css` - @mention dropdown
  - Enhanced `EditorConfig.tsx` with extensions

### Track C: "Follow the Green" Visual System
- **Change tracking (experimental)** - Local hook to track unread changes per user in developer/test views.
- **Green indicators** - Visual highlighting of new or unread content.
- **Navigation helper** - "Follow the Green" button with unread count.
- **Collapse-before-jump** - Previous expanded blip auto-collapses when navigating to next unread (no view clutter).
- **Next Topic navigation** - Blue "Next Topic ▶▶" button appears when current topic fully read; jumps to next topic with unread.
- **Inline expansion** - Next button expands collapsed inline children ([+] markers) via `rizzoma:toggle-inline-blip` event.
- **Time indicators** - Shows when content changed.
- **Persistent tracking** - Saves read state to localStorage or per-wave unread docs.
- **Files created:**
  - `useChangeTracking.ts` - Local change tracking hook (dev/test harness).
  - `useWaveUnread.ts` - Wave-level unread state hook backed by `/api/waves/:id/unread`.
  - `GreenNavigation.tsx` - Legacy navigation component using `useChangeTracking`.
  - `FollowTheGreen.tsx` / `RightToolsPanel.tsx` - Rizzoma layout Follow-the-Green CTA and tools panel.
  - `FollowGreen.css` / `FollowTheGreen.css` - Green visual styling.

### Track D: Real-time Collaboration (VERIFIED 2026-04-24)
- **Y.js + TipTap + Socket.IO** - Full CRDT-based real-time document sync
- **Cross-tab sync verified** - Socket.IO room-based relay delivers Y.js updates between tabs; content syncs via both Y.js CRDT merge and API refresh
- **Persistence round-trip verified** - Y.Doc state persisted to CouchDB via server-side yjsDocCache, restored on reconnection
- **Relay-first architecture** - Server relays `blip:update` to room members BEFORE applying to local cache, ensuring cache errors don't block delivery
- **Live cursors** - See where others are typing
- **Collaborative selection** - See what others have selected
- **Typing indicators** - "User is typing..." display
- **Screenshot evidence** - `screenshots/260424-025320-feature-sweep/042-real-time-cursor-and-typing-indicator-visible.png` shows a second authenticated editor producing remote cursor and typing UI in public production.
- **Presence awareness** - Full Yjs awareness protocol with loop prevention (`applyingRemoteAwareness` flag)
- **User colors** - Each user gets a unique color
- **Reconnection handling** - `setupReconnect` re-joins rooms and sends state vector on reconnect; server sends diff update
- **Feature flags** - Gated by `REALTIME_COLLAB` + `LIVE_CURSORS` (both enabled by `FEAT_ALL=1`)
- **Files:**
  - `CollaborativeProvider.ts` - SocketIOProvider with Y.Doc sync, awareness, reconnection
  - `useCollaboration.ts` - React hook with synchronous provider creation (critical for TipTap plugin init)
  - `YjsDocumentManager.ts` - Client-side Y.Doc singleton cache
  - `src/server/lib/yjsDocCache.ts` - Server-side Y.Doc cache with CouchDB persistence
  - `src/server/lib/socket.ts` - Collab handlers: blip:join/leave/update, sync:request, awareness relay
  - `CollaborativeCursors.tsx/css` - Cursor system

### Unread tracking & presence
- **Per-user read state** - `/api/waves/:id/unread`, `/next`, `/prev`, and `/blips/:blipId/read` persist `readAt` vs `updatedAt`.
- **Wave list badges** - `WavesList` pulls `/unread_counts` and renders unread/total pills with quick links to the first unread blip.
- **WaveView toolbar** - Inline unread counter, next/prev/first/last controls, keyboard shortcuts (j/k/g/G) plus optimistic mark-read + rollback on failure.
- **Follow-the-Green** - `useWaveUnread` hydrates per-wave unread sets, `RizzomaTopicDetail` decorates blips with `isRead`/`unread` classes, and `RightToolsPanel` + `FollowTheGreen` expose the CTA, inline status messages, and count; the older `GreenNavigation`/`useChangeTracking` pair remains a test harness only.
- **PresenceIndicator** - Shared component shows avatars/initials, loading/error text, and overflow counts in both `WaveView` and `Editor`.
- **Tests** - `routes.waves.unread.test.ts`, `client.followGreenNavigation.test.tsx`, `client.RightToolsPanel.followGreen.test.tsx`, `client.useWaveUnread.test.tsx`, `routes.uploads.edgecases.test.ts`, `server.editorPresence.test.ts`, `client.PresenceIndicator.test.tsx`, and `routes.blips.permissions.test.ts` cover the persistence + UI states. Playwright smokes `test-toolbar-inline-smoke.mjs` and `test-follow-green-smoke.mjs` exercise inline toolbar parity and multi-user Follow-the-Green flows respectively (additional CI gating still pending).
- **Automation** - The `browser-smokes` GitHub job runs both Playwright suites, captures `snapshots/toolbar-inline/` + `snapshots/follow-the-green/`, and uploads dev logs/artifacts whenever the toolbar or Follow-the-Green flows regress.
  - The job now runs even when the main build fails so snapshots/artifacts are always available for triage; fetch them locally with `npm run snapshots:pull` if you need the latest screenshots without rerunning Playwright.

### Uploads & gadget nodes
- **Server safeguards** - `/api/uploads` inspects MIME signatures, blocks executables by signature/extension, optionally streams file buffers through ClamAV (`CLAMAV_HOST`/`CLAMAV_PORT`), and supports filesystem or S3/MinIO storage (configure via `UPLOADS_STORAGE`, `UPLOADS_S3_*`, `UPLOADS_S3_PUBLIC_URL`). Docker Compose now includes an optional `clamav` service for local scanning.
- **Client UX** - `src/client/lib/upload.ts` exposes a cancelable `createUploadTask`, and `RizzomaBlip` renders inline preview/progress/cancel/retry controls so attachments/images surface their state (with toasts for success/failure). The toolbar upload buttons respect the new `isUploading` state, and Vitest exercises the degraded flows.
- **Tests** - `src/tests/routes.uploads.edgecases.test.ts` covers auth/missing file/virus/S3 flows, and `src/tests/client.editor.GadgetNodes.test.ts` exercises the chart/poll gadget parse/render/command helpers so the restored gadget buttons stay in sync with the CoffeeScript UI.

### Media adapter
- **Modern getUserMedia adapter** - `src/static/js/getUserMediaAdapter.js` now normalizes constraints (including simple strings), prefers modern `mediaDevices.getUserMedia`, detects display media support, exposes permission status helpers and device enumeration, and retains legacy fallbacks. Covered by `src/tests/client.getUserMediaAdapter.test.ts`.

### Mobile Modernization (PWA)
- **Zero new dependencies** - All features use native browser APIs (Touch Events, Service Worker, View Transitions, localStorage)
- **Responsive breakpoints** - CSS variables and hooks for consistent breakpoints (xs: 320px, sm: 480px, md: 768px, lg: 1024px, xl: 1200px)
- **Mobile context** - `MobileProvider` wraps app, `useMobileContext()` provides isMobile/isTablet/isDesktop/isTouchDevice state
- **BottomSheet component** - Slide-up mobile menu with swipe-to-dismiss, backdrop click, escape key, body scroll lock, safe area padding
- **PWA installability** - Web manifest, service worker (cache-first for assets, network-first for API), 8 SVG icons, apple-touch-icon support
- **Gesture hooks** - `useSwipe` (swipe detection with threshold/timeout), `usePullToRefresh` (with visual indicator), `useSwipeToDismiss`
- **View Transitions** - `useViewTransition` wraps native View Transitions API with reduced-motion support, navigation transitions
- **Offline support** - `offlineQueue` queues mutations when offline, auto-syncs on reconnect, max 3 retries, localStorage persistence; `useOfflineStatus` hook with toast notifications
- **Mobile layout** - `RizzomaLayout` switches between list/content views on mobile with swipe navigation, mobile header with back button
- **Touch optimization** - 44px minimum touch targets, touch-friendly button sizing
- **Files created:**
  - `src/client/styles/breakpoints.css` - CSS variables
  - `src/client/hooks/useMediaQuery.ts` - Breakpoint hooks
  - `src/client/contexts/MobileContext.tsx` - Mobile context provider
  - `src/client/components/mobile/BottomSheet.tsx` - Bottom sheet component
  - `src/client/components/mobile/BottomSheet.css` - Bottom sheet styles
  - `src/client/components/mobile/BottomSheetMenu.tsx` - Menu variant
  - `src/client/components/mobile/BottomSheetMenu.css` - Menu styles
  - `src/client/hooks/useSwipe.ts` - Swipe detection
  - `src/client/hooks/usePullToRefresh.ts` - Pull-to-refresh
  - `src/client/hooks/useViewTransition.ts` - View Transitions wrapper
  - `src/client/styles/view-transitions.css` - Transition animations
  - `src/client/hooks/useServiceWorker.ts` - SW registration
  - `src/client/lib/offlineQueue.ts` - Offline mutation queue
  - `src/client/hooks/useOfflineStatus.ts` - Online/offline hooks
  - `public/manifest.json` - PWA manifest
  - `public/sw.js` - Service worker
  - `public/icons/*.svg` - App icons (72-512px)
- **Tests** - `src/tests/client.mobilePwa.test.tsx` covers breakpoints, mobile/tablet/desktop hooks, manifest icons, service-worker strategies, left/right swipe callbacks, pull-to-refresh threshold, View Transition fallback, offline queue persistence/max-3 retry, and BottomSheet open/dismiss/Escape behavior.

### BLB (Bullet-Label-Blip) Structure
- **Core methodology** - Rizzoma's fractal outliner structure where each blip shows only its label (first line) when collapsed
- **Fold functionality** - Blips can be folded/collapsed via "Fold" button in toolbar (both edit and view modes)
- **Persistence** - Fold state persists to localStorage AND server (`/api/blips/:id/collapse-default`)
- **Visual indicators** - Collapsed blips show □ expand icon, expanded blips show −
- **Inline expansion (2026-02-08)** - [+] markers expand child blips inline at their anchor position
  - Click [+] expands child directly below the marker line (portal-based rendering)
  - Click [−] collapses back to [+] marker
  - Expanded children rendered via `createPortal` into `.inline-child-portal` containers
  - `useLayoutEffect` finds portals after `dangerouslySetInnerHTML` renders, synchronous re-render before paint
  - `isInlineChild` prop hides toolbar/expander for clean inline display
  - Orphaned markers (from imported content referencing other waves) hidden via `display: none`
  - Custom event `rizzoma:toggle-inline-blip` bridges view mode clicks and edit mode TipTap
- **Documentation** - Complete BLB methodology documented in `docs/BLB_LOGIC_AND_PHILOSOPHY.md`
- **Right panel insert shortcuts** - ↵, @, ~, #, Gadgets buttons shown when blip is active (editable) or in edit mode; auto-enter edit mode on click via `pendingInsertRef` pattern
- **Marker styling** - Unified gray #b3b3b3 across view and edit modes, 16x14px, white text, 3px border-radius
- **Widget styling** - @mention turquoise pill with pipes, ~task turquoise pill with checkbox, #tag plain turquoise text
- **Toolbar decluttered** - Hide/Delete moved to gear overflow menu, dynamic badge count
- **Three-state toolbar** - Inline children: [+] expand = no toolbar, click into content = read toolbar, click Edit = full toolbar, click outside = hides toolbar
- **Grade: A** (all 5 plan phases complete + toolbar three-state behavior + inline editing + Ctrl+Enter inline expansion)
- **Files modified:**
  - `RizzomaTopicDetail.tsx` - Main topic view, childBlips includes inline children
  - `RizzomaBlip.tsx` - Portal rendering, inline expansion, isInlineChild prop
  - `inlineMarkers.ts` - Marker injection, portal containers, orphan detection, expanded state sync
  - `RizzomaBlip.css` - Inline child styles, portal container, orphaned marker hiding
  - `BlipMenu.tsx` - Toolbar with Fold button (duplicates removed)
  - `collapsePreferences.ts` - localStorage persistence for fold state
  - `RightToolsPanel.tsx` - Insert shortcuts visible when blip active+editable OR in edit mode; `BLIP_ACTIVE_EVENT` listener
  - `RizzomaTopicDetail.tsx` - Dispatches EDIT_MODE_EVENT + handles insert events with topicEditor

### Permissions & Auth
- `requireAuth` now guards topic/blip write endpoints, logs denied operations, and respects actual author IDs.
- Rizzoma layout login flow uses the real `AuthPanel` modal instead of demo users.
- New Vitest coverage exercises unauthenticated, unauthorized, and authorized flows.

## Still pending
- **Perf/resilience sweeps**: large waves/blips stress testing, inline comments under load, realtime updates at scale; run `npm run perf:harness` regularly, document thresholds/limits, add alerts/budgets.
- **Full-render scale-up**: 100-blip public-prod full-render baseline now passes; rerun at 500/1000 blips, compare against lite mode, and investigate optional absolute-TTF drift.
- **Visual sweep hardening**: `npm run visual:sweep` and `npm run visual:coverage` now produce a broad fresh feature sweep plus a row-level coverage matrix for all 161 screenshot-valid rows. The current verdict is 160 green / 1 orange / 0 red; the remaining orange row is physical real-device mobile validation.
- **Mobile device validation**: PWA infrastructure and runtime tests are complete, but real-device testing on iPhone Safari / Chrome Android remains.
- **Legacy reference disposition**: All active code is TypeScript (zero CoffeeScript in `src/`). The `original-rizzoma-src/` and `original-rizzoma/` directories contain legacy reference code — decide whether to keep, archive, or remove.
- **Gadget iframe rendering**: Gadget palette (11 types) works, but selected gadgets render as URL prompts/placeholders, not interactive iframes (YouTube, Yes/No/Maybe poll, etc.).
- **~~Playback timeline~~**: DONE — `WavePlaybackModal.tsx` provides wave-level playback with split pane, color-coded timeline dots, date jump, per-blip diff, cluster fast-forward, and keyboard shortcuts. Per-blip playback also available via `BlipHistoryModal.tsx`.
- **Gear menu copy/paste variants**: Core gear actions work (reply, edit, delete, duplicate, cut/paste, copy link, history). The original's "copy reply" / "paste cursor" variants are not yet reimplemented.
- **Visual polish**: Nav panel icons (emojis → SVG sprites), toolbar icons (emojis → SVG), date format ("Feb 7" → "7 Feb"), unread bar color (green → blue), Next button color (red → green).
- **Backup automation**: Bundle script exists (`scripts/backup.sh`), but automated GDrive cadence and CI alerting for failures are not set up.
- **Mentions tab content**: Tab exists but shows "No mentions yet" — needs mention indexing from blip content.
- **Tasks tab filters**: Tab shows tasks but lacks the "All 68 | No date 14 | With date" filter buttons.

## Comprehensive Feature Comparison: Original vs Modern

> Full comparison across all 18 feature areas. See also `RIZZOMA_FULL_COMPARISON.md` for detailed implementation notes per row.

### 1. Authentication & Security

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| User registration (email/password) | Done | — | — |
| User login (rate-limited, secure cookies) | Done | [orig](screenshots/comparison-analysis/orig-02-login-modal.png) | [new](screenshots/refactor-2026-01-18/modern-login-modal.png) |
| Google OAuth 2.0 | Done | — | — |
| Facebook OAuth | Done | — | — |
| Microsoft OAuth (hand-rolled, Graph API) | Done | — | — |
| SAML 2.0 (`@node-saml/node-saml` v5) | Done | — | — |
| Twitter OAuth | Done | Supported | OAuth2 PKCE via `/api/auth/twitter` |
| Session management (Redis 5) | Done | — | — |
| CSRF protection (double-submit token) | Done | — | — |
| Permission guards (`requireAuth` middleware) | Done | — | — |
| Zod request validation | Done (new) | None | All endpoints |
| Rate limiting (per-route) | Done (new) | None | 100 req/15min (register), 30 req/10min (login) |

### 2. Waves & Blips (Core Data Model)

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| Wave (topic) schema + typed interface | Done | — | — |
| Wave CRUD API (list, create, read, update, delete) | Done | — | — |
| Blip schema + typed interface | Done | — | — |
| Blip CRUD API (list, create, read, update, delete) | Done | — | — |
| Blip tree retrieval (single Mango query, 18s → 29ms) | Done | — | — |
| Blip soft-delete + cascade to children | Done | — | — |
| Topic view with full blip tree | Done | [orig](screenshots/comparison-analysis/orig-03-topic-view.png) | [new](screenshots/side-by-side/05-full-topic-new-260208-0053.png) |
| Wave participants API | Done | — | — |

### 3. Rich Text Editor

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| Editor framework (TipTap v2 / ProseMirror) | Done | — | — |
| Bold / Italic / Underline / Strikethrough | Done | — | — |
| Headings (H1-H6) | Done | — | — |
| Bullet list / Ordered list | Done | — | — |
| Task lists (checkboxes) | Done | — | — |
| Code / Code block / Blockquote | Done | — | — |
| Code block: syntax highlighting (30 languages) | Done (new) | SyntaxHighlighter 2.1.364 (2009 gadget) | `@tiptap/extension-code-block-lowlight` + React NodeView |
| Highlight (text background color) | Done (new) | None | `@tiptap/extension-highlight` |
| Links (add/edit/remove) | Done | — | — |
| Images (node extension) | Done | — | — |
| @mentions autocomplete dropdown | Done | — | [new](screenshots/local-blb-study/260206-2220-mention-dropdown.png) |
| Edit mode toolbar (blue #4EA0F1) | Done | [orig](screenshots/comparison-analysis/orig-10-edit-mode-toolbar.png) | [new](screenshots/side-by-side/blb-04-edit-mode-toolbar-new-260208.png) |
| Read mode toolbar (minimal) | Done | [orig](screenshots/side-by-side/blb-06-readmode-full-old-260208.png) | [new](screenshots/blb-state2-read-toolbar_new-260208-1244.png) |
| Gadget nodes (chart, poll, attachment, image) | Done | — | [new](screenshots/local-blb-study/260207-gadget-palette-open.png) |
| Gadget palette (11 types in grid layout) | Done | — | [new](screenshots/local-blb-study/260207-gadget-palette-open.png) |
| Toolbar icons: SVG sprites vs emoji characters | Gap | SVG sprites (monochrome white) | Emoji characters (🔗😀📎🖼️🎨❌) |

### 4. Real-time Collaboration

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| Transport layer (Socket.IO v4) | Done | — | — |
| CRDT engine (Yjs) | Done | — | — |
| Live cursors (Yjs awareness, user colors) | Done | [orig](screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-presence.png) | [new](screenshots/260424-025320-feature-sweep/042-real-time-cursor-and-typing-indicator-visible.png) |
| Typing indicators | Done | — | [new](screenshots/260424-025320-feature-sweep/042-real-time-cursor-and-typing-indicator-visible.png) |
| Presence indicator (avatars, overflow counts) | Done | [orig](screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-presence.png) | — |
| Event broadcasting (blip:created/updated/deleted) | Done | — | — |

### 5. Unread Tracking (Follow-the-Green)

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| Per-user read state (CouchDB BlipRead docs) | Done | — | — |
| Mark single blip read API | Done | — | — |
| Mark batch read API | Done | — | — |
| Unread count aggregation (batch query) | Done | — | — |
| Next/Prev unread navigation (server-computed) | Done | — | — |
| Green left border on unread blips | Done | [orig](screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-unread.png) | — |
| Wave list badge (unread/total count) | Done | — | — |
| "Follow the Green" CTA button | Done | — | — |
| Keyboard navigation (j/k/g/G) | Done | — | — |

### 6. Inline Comments System

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| Comment structure (range anchoring, text snapshot) | Done | — | — |
| Comment CRUD APIs | Done | — | — |
| Comment threading (rootId + parentId) | Done | — | — |
| Resolve / unresolve | Done | — | — |
| Visibility preference per-blip (server + localStorage) | Done | — | — |
| Keyboard shortcuts (Ctrl+Shift+Up/Down) | Done | — | — |

### 7. File Uploads & Storage

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| Upload endpoint (Multer, 10MB limit) | Done | — | — |
| MIME magic-byte sniffing | Done (new) | Extension-only | Magic bytes |
| Executable extension blocking (.exe, .bat, etc.) | Done (new) | None | Blocked |
| ClamAV virus scanning (optional) | Done (new) | None | Optional Docker service |
| Storage backends: local filesystem | Done | — | — |
| Storage backends: AWS S3 / MinIO | Done (new) | None | Configurable |
| Client upload library (progress, cancel, retry) | Done | — | — |

### 8. Search & Recovery

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| Full-text search (Mango regex, title + content) | Done | [orig](screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-search-overlay.png) | — |
| Snippet generation (150-char context + highlight) | Done (new) | None | `GET /api/editor/:waveId/snapshot` |
| Yjs document rebuild | Done | — | — |
| Wave materialization | Done | — | — |
| Rebuild status polling | Done (new) | None | `GET /api/editor/rebuild/:id/status` |

### 9. Blip Operations (Gear Menu)

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| Reply (create child blip) | Done | — | — |
| Edit (inline TipTap editor) | Done | — | — |
| Delete (soft delete + children) | Done | — | — |
| Duplicate blip | Done | — | — |
| Cut / Paste (clipboard store, reparent) | Done | — | — |
| Copy link (navigator clipboard) | Done | — | — |
| History modal (timeline, play/pause, diff) | Done | — | — |
| Gear dropdown menu | Partial | [orig](screenshots/comparison-analysis/orig-05-other-dropdown.png) | — |
| Copy/paste reply/cursor variants | Not started | [orig](screenshots/comparison-analysis/orig-05-other-dropdown.png) | — |

### 10. History & Playback

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| History storage (BlipHistoryDoc, snapshots) | Done | — | — |
| History API (`GET /api/blips/:id/history`) | Done | — | — |
| Per-blip playback UI (timeline slider, play/pause/step) | Done | — | — |
| Per-blip playback speed (0.5x to 4x) | Done | — | — |
| Per-blip diff view (before/after comparison) | Done | — | — |
| Wave-level history API (`GET /api/waves/:id/history`) | Done (new) | — | CouchDB indexed query |
| Wave-level playback modal (all blips chronologically) | Done (new) | Legacy `playback/*` CoffeeScript | `WavePlaybackModal.tsx` |
| Wave playback: split pane (content + wave overview) | Done (new) | — | Color-coded blip overview |
| Wave playback: cluster fast-forward/back (3s gap) | Done (new) | — | Skip between edit clusters |
| Wave playback: date jump (datetime picker) | Done (new) | Calendar picker | `datetime-local` picker |
| Wave playback: per-blip diff (same blip comparison) | Done (new) | — | Shared `htmlDiff.ts` utility |
| Wave playback: keyboard shortcuts | Done (new) | — | Arrow/Space/Escape |
| Wave playback: speed (0.5x to 10x) | Done (new) | — | — |

### 11. Email Notifications

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| Email service (Nodemailer v7) | Done | — | — |
| Invite emails | Done | — | [new](screenshots/invite-email-mailhog_new-260208-0437.png) |
| Activity notifications (mentions, replies) | Done | Custom templates | `sendNotificationEmail()` with HTML/text |
| Digest emails (daily/weekly summary) | Done (new) | None | `sendDigestEmail()` with HTML/text |
| Notification preferences API | Done | — | — |
| SMTP templates (styled HTML) | Done | Styled HTML templates | HTML/text variants for invite, notification, digest |

### 12. Mobile & PWA

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| Responsive breakpoints (xs/sm/md/lg/xl) | Done (new) | 30+ separate mobile files | Single responsive codebase |
| Mobile detection hooks (isMobile/isTablet/isDesktop) | Done (new) | User-agent sniffing | Media queries + touch detection |
| PWA manifest + icons (8 sizes) | Done (new) | None | `public/manifest.json` |
| Service worker (cache-first assets, network-first API) | Done (new) | None | `public/sw.js` |
| Swipe gestures (left/right panel navigation) | Done (new) | None | `useSwipe.ts` |
| Pull to refresh | Done (new) | None | `usePullToRefresh.ts` |
| View Transitions API (with reduced-motion) | Done (new) | None | `useViewTransition.ts` |
| Offline mutation queue (auto-sync, max 3 retries) | Done (new) | None | `offlineQueue.ts` |
| BottomSheet mobile menu | Done (new) | None | `mobile/BottomSheet.tsx` |
| Touch targets (44px minimum) | Done (new) | Inconsistent | CSS |
| Mobile layout (device validation on real devices) | Needs testing | [orig](screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-mobile.png) | — |

### 13. User Interface Components

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| Three-panel layout (nav + topic + tools) | Done | [orig](screenshots/side-by-side/01-full-layout-old-260208-0048.png) | [new](screenshots/side-by-side/01-full-layout-new-260208-0048.png) |
| Navigation panel (Topics, Mentions, Tasks, Public, Store, Teams) | Done | [orig](screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-nav-topics.png) | [new](screenshots/side-by-side/06-topics-list-new-260208-0054.png) |
| Navigation panel icons (SVG sprites vs emojis) | Gap | Monochrome SVG sprites | Emojis (📄 @ ✓ 🌐 🛒 👥) |
| Navigation badge count | Done | Dynamic from server | Dynamic (was hardcoded "11", fixed) |
| Topics list | Done | [orig](screenshots/side-by-side/06-topics-list-old-260208-0054.png) | [new](screenshots/side-by-side/06-topics-list-new-260208-0054.png) |
| Topics list: date format | Gap | "6 Feb" (d MMM) | "Feb 7" (MMM d) |
| Topics list: unread bar color | Gap | Blue vertical bar | Green/colored bars |
| Topics list: filter dropdown (Inbox/All/By me) | Not started | "Inbox ▼" dropdown | Missing |
| Mentions tab | Partial | [orig](screenshots/side-by-side/04-mentions-tab-old-260208-0053.png) | [new](screenshots/side-by-side/04-mentions-tab-new-260208-0051.png) |
| Mentions tab: populated content | Gap | 50+ mentions with rich data | Empty ("No mentions yet") |
| Tasks tab | Partial | [orig](screenshots/side-by-side/07-tasks-tab-old-260208-0055.png) | [new](screenshots/side-by-side/07-tasks-tab-new-260208-0055.png) |
| Tasks tab: filter buttons | Not started | "All 68 \| No date 14 \| With date" | Missing |
| Participants bar (invite + avatars) | Partial | [orig](screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-invite-modal.png) | — |
| Share modal | Done | [orig](screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-share-modal.png) | — |
| Right panel: user avatar | Gap | Real OAuth photo | Generated initials circle |
| Right panel: Next button color | Gap | Green "Next ▶" | Red "Next ▶" |
| Right panel: hide/show replies icons | Gap | Speech bubble SVG icons | ▲/▼ unicode arrows |
| Right panel: mind map button | Gap | Branch SVG icon | ⟨⟩ text |
| Login modal | Done | [orig](screenshots/comparison-analysis/orig-02-login-modal.png) | [new](screenshots/refactor-2026-01-18/modern-login-modal.png) |
| Hide replies / folded view | Done | [orig](screenshots/comparison-analysis/orig-06-hide-replies-folded.png) | — |
| Auth panel (modal, not page) | Done | — | [new](screenshots/refactor-2026-01-18/auth-panel-styled.png) |
| Toast notifications | Done (new) | Alert dialogs | React `Toast.tsx` |
| Keyboard shortcuts panel (bottom of nav) | Not started | Present | Missing |

### 14. BLB (Bullet-Label-Blip) — Core Paradigm

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| Collapsed TOC (bullet + label + [+]) | Done | [orig](screenshots/side-by-side/blb-01-collapsed-toc-old-260208.png) | [new](screenshots/side-by-side/blb-01-collapsed-toc-new-260208.png) |
| Section expanded (blip content visible) | Done | [orig](screenshots/side-by-side/blb-02-section-expanded-old-260208.png) | [new](screenshots/side-by-side/blb-02-section-expanded-new-260208.png) |
| [+] click = INLINE expansion (not navigation) | Done | [orig](screenshots/blb-inline-expanded_old-260208-0226.png) | [new](screenshots/blb-inline-expanded_new-260208-0330.png) |
| [−] click = collapse back | Done | — | [new](screenshots/blb-state3-after-clickout_new-260208-1244.png) |
| Portal-based rendering (child at marker position) | Done | — | [new](screenshots/blb-portal-inline-expanded_new-260208-0155.png) |
| Three-state toolbar: [+] expand = just text | Done | [orig](screenshots/blb-inline-expanded_old-260208-0226.png) | [new](screenshots/blb-state1-just-text_new-260208-1244.png) |
| Three-state toolbar: click into child = read toolbar | Done | [orig](screenshots/side-by-side/blb-06-readmode-full-old-260208.png) | [new](screenshots/blb-state2-read-toolbar_new-260208-1244.png) |
| Three-state toolbar: click Edit = full edit toolbar | Done | [orig](screenshots/side-by-side/blb-04-edit-mode-toolbar-old-260208.png) | [new](screenshots/blb-inline-edit-toolbar_new-260208-1240.png) |
| Click outside inline child = toolbar hidden | Done | — | [new](screenshots/blb-state3-after-clickout_new-260208-1244.png) |
| Toolbar left-aligned in inline children | Done | — | [new](screenshots/blb-toolbar-aligned_new-260208-1250.png) |
| Ctrl+Enter creates inline child at cursor position | Done | — | [new](screenshots/blb-ctrl-enter-expanded_new-260208-0347.png) |
| Inline child editing (Edit button, content persists) | Done | — | [new](screenshots/blb-inline-edit-persisted_new-260208-0332.png) |
| [+] marker styling (gray #b3b3b3, 16x14px, white text) | Done | [orig](screenshots/comparison-analysis/orig-09-blb-inline-expanded.png) | [new](screenshots/blb-inline-expanded_new-260208-0330.png) |
| [+] marker: green for unread, gray for read | Partial | Green = unread, gray = read | Gray only (unread green TBD) |
| Orphaned markers hidden (cross-wave references) | Done | — | — |
| All sections expanded simultaneously | Done | [orig](screenshots/comparison-analysis/orig-08-blb-study-full.png) | [new](screenshots/blb-all-four-expanded_new-260208-0400.png) |
| Fold/Unfold all (▲/▼ in right panel) | Done | — | [new](screenshots/blb-view-with-shortcuts_new-260208-0310.png) |
| Fold state persistence (localStorage + server) | Done | — | — |
| Reply vs inline comment distinction | Done | — | — |
| Mid-sentence [+] markers (multiple per paragraph) | Done | [orig](screenshots/comparison-analysis/orig-04-inline-expanded-mentions.png) | [new](screenshots/blb-inline-expanded-full_new-260208-0312.png) |
| Nested inline expansion ([+] within expanded [+]) | Needs testing | — | — |
| Auth-gated Edit button | Done | — | [new](screenshots/blb-auth-fixed-edit-visible_new-260208-0422.png) |

### 15. Inline Widgets & Styling

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| @mention: turquoise pill with pipe delimiters (\|@Name\|) | Done | [orig](screenshots/side-by-side/blb-05-turquoise-buttons-old-260208.png) | [new](screenshots/side-by-side/blb-10-turquoise-closeup-new-260208.png) |
| ~task: turquoise pill with checkbox (\|☐ Name DD Mon\|) | Done | [orig](screenshots/side-by-side/blb-10-turquoise-closeup-old-260208.png) | [new](screenshots/side-by-side/blb-10-turquoise-closeup-new-260208.png) |
| #tag: plain turquoise text (no background/border) | Done | [orig](screenshots/side-by-side/blb-10-turquoise-closeup-old-260208.png) | [new](screenshots/side-by-side/blb-10-turquoise-closeup-new-260208.png) |
| Insert shortcuts (right panel: ↵ @ ~ # Gadgets) | Done | [orig](screenshots/side-by-side/blb-03-right-panel-buttons-old-260208.png) | [new](screenshots/blb-view-with-shortcuts_new-260208-0310.png) |
| Insert shortcut button styling (light blue bg, white icons) | Done | [orig](screenshots/side-by-side/blb-09-turquoise-active-old-260208.png) | [new](screenshots/blb-view-with-shortcuts_new-260208-0310.png) |
| Insert buttons auto-enter-edit-mode | Done (new) | Buttons only work in edit mode | Click @ on active blip → auto-enters edit + inserts + opens dropdown |
| Toolbar decluttered (Hide/Delete → gear overflow) | Done | — | — |
| Gadget iframe rendering (Yes/No/Maybe poll, YouTube, etc.) | Partial | Embedded iframes | Code block = enhanced (lowlight); others = URL prompt / placeholder |

### 16. Database & Storage

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| CouchDB client (nano v10) | Done | — | — |
| Typed document schemas (wave, blip, topic, comment, read, etc.) | Done | — | — |
| CouchDB Mango indexes (centralized at startup) | Done | — | — |
| Redis sessions (v5 + connect-redis v7) | Done | — | — |
| CouchDB view deploy scripts | Done | — | — |

### 17. API Architecture

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| Express 5 (async/await, Zod validation) | Done | — | — |
| Middleware: request ID, logging, CORS, Helmet, compression | Done | — | — |
| Middleware: rate limiting, session, CSRF, auth, error handler | Done | — | — |
| Route files (auth, topics, waves, blips, comments, uploads, editor, etc.) | Done | — | — |
| Health endpoint (`GET /api/health`) | Done (new) | None | Inline-comments + uploads checks |

### 18. Testing & Quality

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| Test framework (Vitest v4) | Done | — | — |
| Unit tests: 134 across 44 files | Done | ~10 tests | 134 tests |
| E2E: toolbar inline smoke (Playwright) | Done | — | — |
| E2E: follow-the-green multi-user smoke | Done | — | — |
| Health checks CI job (`npm run test:health`) | Done | — | — |
| Browser smokes CI job (snapshots + artifacts) | Done | — | — |

### 19. Performance Optimizations

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| Blips-by-wave query (18,000ms → 29ms, 600x) | Done | — | — |
| Topics query (8-12s → 181ms, 40x) | Done | — | — |
| Unread counts (N+1 → batch query, ~20x) | Done | — | — |
| Inline visibility (20+ calls → perf mode skip) | Done | — | — |
| Bcrypt (10 → 2 rounds in dev, ~60x) | Done | — | — |
| Perf harness (5k-blip seed, metrics, screenshots) | Done | — | — |
| CI perf budgets (`RIZZOMA_PERF_ENFORCE_BUDGETS=1`) | Done | — | — |
| Bundle size (~5MB → ~500KB, 90% reduction) | Done | — | — |

### 20. DevOps & Deployment

| Functionality | Status | Original Rizzoma | New Rizzoma |
|---|---|---|---|
| Docker Compose (CouchDB, Redis, optional ClamAV) | Done | — | — |
| Dockerfile (production image) | Done | — | — |
| CI/CD: unit tests (GitHub Actions) | Done | — | — |
| CI/CD: E2E Playwright | Done | — | — |
| CI/CD: health checks job | Done | — | — |
| CI/CD: perf budgets job | Done | — | — |
| Feature flags (`FEAT_ALL`, `EDITOR_ENABLE`, per-feature) | Done | — | — |
| Backup scripts (bundle) | Done | — | — |
| Backup automation (GDrive cadence) | Not started | — | — |
| getUserMedia adapter (modern constraints, permissions) | Done | — | — |
| Legacy assets disposition (jQuery-era static) | Not started | — | — |

### Summary: Remaining Gaps

| Area | Gap | Priority |
|---|---|---|
| ~~Microsoft OAuth / SAML 2.0~~ | ~~Not implemented~~ **DONE** — hand-rolled OAuth + `@node-saml` | ~~HIGH~~ RESOLVED |
| ~~Playback timeline~~ | ~~Legacy `playback/*` CoffeeScript not ported~~ **DONE** — `WavePlaybackModal.tsx` with split pane, color-coded timeline, date jump, diff, keyboard shortcuts | ~~MEDIUM~~ RESOLVED |
| Gadget iframe rendering | Gadget palette exists but gadgets don't render as interactive iframes | MEDIUM |
| ~~Email templates~~ | ~~Basic stubs only~~ **DONE** — HTML/text variants for invite, notification, digest | ~~MEDIUM~~ RESOLVED |
| Nav panel icons | Emojis instead of monochrome SVG sprites | LOW |
| Toolbar icons | Emojis instead of SVG sprites | LOW |
| Topics list date format | "Feb 7" instead of "7 Feb" | LOW |
| Topics list unread bar color | Green instead of blue | LOW |
| Topics list filter dropdown | "Inbox ▼" filter missing | LOW |
| Mentions tab content | Empty — mention indexing from blip content needed | MEDIUM |
| Tasks tab filters | Filter buttons missing | LOW |
| Right panel Next button color | Red instead of green | LOW |
| Right panel mind map icon | Text instead of SVG | LOW |
| User avatars | Generated initials instead of OAuth photos | LOW |
| Keyboard shortcuts panel | Bottom of nav panel — missing | LOW |
| [+] green for unread | Only gray implemented; green-for-unread TBD | LOW |
| Nested inline expansion | [+] within expanded [+] — needs testing | LOW |
| Mobile device validation | PWA infrastructure done, real-device testing remains | MEDIUM |
| Backup automation | Bundle script exists, GDrive cadence missing | LOW |
| Legacy assets | jQuery-era static in `original-rizzoma-src` — disposition pending | LOW |

## 🎛️ Feature Flags

All features are behind flags in `src/shared/featureFlags.ts`:

```bash
# Enable individual features
FEAT_INLINE_COMMENTS=1    # Inline commenting system
FEAT_RICH_TOOLBAR=1       # Rich text toolbar
FEAT_MENTIONS=1           # @mentions
FEAT_TASK_LISTS=1         # Task checkboxes
FEAT_FOLLOW_GREEN=1       # "Follow the green" navigation
FEAT_LIVE_CURSORS=1       # Collaborative cursors
FEAT_TYPING_INDICATORS=1  # Typing indicators
FEAT_WAVE_PLAYBACK=1      # Wave-level playback timeline

# Or enable all at once
FEAT_ALL=1
```

## 📦 Dependencies Added
- `@tiptap/extension-mention` - @mentions support
- `@tiptap/extension-task-list/item` - Task lists
- `@tiptap/extension-highlight` - Text highlighting
- `@tiptap/extension-link` - Hyperlinks
- `tippy.js` - Dropdown positioning
- `y-protocols` - Yjs awareness for cursors

## 🔧 Integration Points

1. **EditorConfig** - All editor extensions integrated
2. **BlipEditor** - Toolbar conditionally rendered
3. **Main App** - GreenNavigation component added
4. **Server Routes** - Inline comments API registered
5. **CollaborativeProvider** - Awareness protocol added

## 🚦 Next Steps

1. **Testing** - Start services with `docker compose up -d couchdb redis`, then run `FEAT_ALL=1 EDITOR_ENABLE=1 SESSION_STORE=memory REDIS_URL=memory:// npm run dev` (real auth only).
2. **Polish** - Fine-tune UI/UX based on testing.
3. **Performance** - Optimize for large documents (beyond `perfRender=lite`).
4. **Mobile** - Validate unread/navigation/toolbar ergonomics on device.
5. **Documentation** - Update user guides and remove demo-mode language.

## 🎯 What You Can Do Now

With `FEAT_ALL=1` + real auth enabled:

1. **Rich Editing** - Full formatting toolbar on all blips.
2. **@mentions** - Type @ to mention users.
3. **Tasks** - Create task lists with checkboxes.
4. **Comments** - Select text and add inline comments.
5. **Follow Green** - Navigate through unread changes in WaveView and the Rizzoma layout; some multi-session/large-wave edge cases still rely on manual testing.
6. **Live Collaboration** - See other users' cursors.
7. **Real-time Updates** - Core realtime flows are active; perf/CI hardening is still in progress.

Most of the core Rizzoma experience is available; see **Still pending** for remaining gaps.
