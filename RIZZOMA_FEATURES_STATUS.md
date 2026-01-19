# 🚀 Rizzoma Core Features Implementation Status

## Summary
Core editor tracks remain behind feature flags, and unread tracking/presence are now persisted per user (CouchDB read docs + Socket.IO events) and rendered across the Rizzoma layout (list badges, WaveView navigation bar, Follow-the-Green button). Demo-mode shortcuts have been removed in favor of real sessions, and permissions now enforce real authorship. Recovery UI for rebuilds and editor search materialization/snippets are implemented and covered by tests. Follow-the-Green now has deterministic Vitest coverage (CTA happy/degraded paths), a multi-user Playwright smoke (multi unread + forced mark-read failure + mobile viewport), and CI gating via the `browser-smokes` GitHub job (with snapshots/artifacts). Uploads run through MIME sniffing + optional ClamAV, optionally stream to S3/MinIO, and the client surfaces cancel/retry/preview UI. A perf harness (`npm run perf:harness`) seeds 5k-blip waves and captures time-to-first-render screenshots/metrics under `snapshots/perf/`. Health/inline-comments/uploads checks now run in CI via the `health-checks` job (`npm run test:health`). **BLB implementation fix (2026-01-19)**: Audited and fixed BLB (Bullet-Label-Blip) functionality in RizzomaTopicDetail - Fold button now properly wired with localStorage + server persistence, expand icons changed from +/- to □, duplicate toolbar buttons removed. See `docs/BLB_LOGIC_AND_PHILOSOPHY.md` for methodology. **Mobile modernization (2026-01-18)**: Implemented complete mobile PWA infrastructure with zero new dependencies - responsive breakpoints, MobileContext, BottomSheet component, PWA manifest/SW/icons, gesture hooks (swipe, pull-to-refresh), View Transitions API, offline mutation queue with retry logic, and mobile view switching in RizzomaLayout. **Recent performance fixes (2026-01-17)**: Blips API query optimized by adding sort clause to force CouchDB index usage (18s → 29ms, 600x improvement); bcrypt rounds reduced to 2 in dev/test mode for faster auth (~6s → ~100ms per hash). **Perf harness fixes (2026-01-18)**: N+1 API calls eliminated in perf mode (20+ individual `/inline-comments-visibility` calls → 0); timing fix ensures all labels render before counting; CI `perf-budgets` job added with optional budget enforcement. Mobile device validation on iPhone Safari/Chrome Android remains outstanding.

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
- **Time indicators** - Shows when content changed.
- **Persistent tracking** - Saves read state to localStorage or per-wave unread docs.
- **Files created:**
  - `useChangeTracking.ts` - Local change tracking hook (dev/test harness).
  - `useWaveUnread.ts` - Wave-level unread state hook backed by `/api/waves/:id/unread`.
  - `GreenNavigation.tsx` - Legacy navigation component using `useChangeTracking`.
  - `FollowTheGreen.tsx` / `RightToolsPanel.tsx` - Rizzoma layout Follow-the-Green CTA and tools panel.
  - `FollowGreen.css` / `FollowTheGreen.css` - Green visual styling.

### Track D: Real-time Collaboration
- **Live cursors** - See where others are typing
- **Collaborative selection** - See what others have selected
- **Typing indicators** - "User is typing..." display
- **Presence awareness** - Full Yjs awareness protocol
- **User colors** - Each user gets a unique color
- **Files created:**
  - `CollaborativeCursors.tsx/css` - Cursor system
  - Enhanced `CollaborativeProvider.ts` with awareness

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

### BLB (Bullet-Label-Blip) Structure
- **Core methodology** - Rizzoma's fractal outliner structure where each blip shows only its label (first line) when collapsed
- **Fold functionality** - Blips can be folded/collapsed via "Fold" button in toolbar (both edit and view modes)
- **Persistence** - Fold state persists to localStorage AND server (`/api/blips/:id/collapse-default`)
- **Visual indicators** - Collapsed blips show □ expand icon, expanded blips show −
- **Documentation** - Complete BLB methodology documented in `docs/BLB_LOGIC_AND_PHILOSOPHY.md`
- **Files modified:**
  - `RizzomaTopicDetail.tsx` - Main topic view with Fold button wiring
  - `BlipMenu.tsx` - Toolbar with Fold button (duplicates removed)
  - `RizzomaBlip.tsx` - Updated expand icons (+ → □)
  - `collapsePreferences.ts` - localStorage persistence for fold state

### Permissions & Auth
- `requireAuth` now guards topic/blip write endpoints, logs denied operations, and respects actual author IDs.
- Rizzoma layout login flow uses the real `AuthPanel` modal instead of demo users.
- New Vitest coverage exercises unauthenticated, unauthorized, and authorized flows.

## Still pending
- Perf/resilience sweeps for large waves/blips, inline comments, playback, and realtime updates; run `npm run perf:harness` regularly, document thresholds/limits, and add alerts/budgets.
- Mobile parity: broader mobile validation for media/device flows, unread navigation, and toolbar/inline comment ergonomics.
- Legacy cleanup: migrate remaining CoffeeScript entrypoints/static assets, drop unused legacy CSS/JS, and finish dependency upgrades.
- Playback/history parity: ensure playback controls/history popovers match the original CoffeeScript implementation (edit/read states, gear overflow, copy/paste variants) with Playwright coverage.
- Email/notifications parity: restore/validate wave email notifications/invites vs the original Rizzoma behavior (SMTP paths, templates).
- Backup workflow automation (bundle + GDrive copy) and CI alerting for failures (typecheck/tests/build/docker).

## Original parity gaps (CoffeeScript vs modern)

| Functionality | Original implementation (CoffeeScript) | Modern status / gap |
| --- | --- | --- |
| Blip toolbar (read/edit, gear overflow, playback) | CoffeeKup toolbar with read/edit blocks, gear menu copy/paste reply/cursor, playback (`original-rizzoma-src/src/client/blip/menu/template.coffee`), playback menu/buttons (`original-rizzoma-src/src/client/playback/blip_menu.coffee`) | Modern toolbar in `src/client/components/blip/RizzomaBlip.tsx` + `RizzomaBlip.css`; Playwright `test-toolbar-inline-smoke.mjs` covers core buttons. Gear copy/paste variants and playback controls not yet reimplemented. |
| Playback timeline/history | Playback wave view/models, calendar/fast-forward/back buttons (`original-rizzoma-src/src/client/playback/*`) | No modern playback timeline UI; feature not ported. |
| Email notifications/invites | Notification utils/templates (`original-rizzoma-src/src/server/notification/utils.coffee`, mail assets under `original-rizzoma-src/src/static/img/mail/`) | Modern code lacks restored mail notifications/invites; SMTP/templates need port + tests. |
| Mobile layout | Mobile blip index/view variants (`original-rizzoma-src/src/client/blip/index_mobile.coffee`, `view_mobile.coffee`) | **Modernized**: PWA with responsive breakpoints, MobileContext, BottomSheet menus, gesture hooks (swipe/pull-to-refresh), View Transitions, offline queue, mobile view switching. Device validation on iPhone Safari/Chrome Android remains. |
| Uploads pipeline | Legacy CoffeeScript uploads (simple storage, limited validation) | Modernized uploads: MIME sniffing, optional ClamAV, local/S3 (`src/server/routes/uploads.ts`); client cancel/retry/preview (`src/client/lib/upload.ts`, `RizzomaBlip`). Parity exceeds original. |
| getUserMedia adapter | Legacy static adapter (`original-rizzoma/src/static/js/getUserMediaAdapter.js`) | Modern adapter with constraint normalization, display media detection, permission/device helpers + tests (`src/static/js/getUserMediaAdapter.js`, `src/tests/client.getUserMediaAdapter.test.ts`). |
| Inline comments | CoffeeScript inline comments widgets/routes | Modern TipTap inline comments with server routes (`src/server/routes/inlineComments.ts`), UI in `RizzomaBlip`, degraded banners, tests (`client.inlineCommentsPopover.test.tsx`, health tests). |
| Unread / Follow-the-Green | Legacy change tracking hooks + navigation | Modern unread persistence (`/api/waves/:id/unread`, `/unread_counts`), CTA in `RightToolsPanel`, hooks (`useWaveUnread`), Playwright smoke `test-follow-green-smoke.mjs`; blips API optimized (18s → 29ms) via CouchDB index sort clause; auto-navigation now marks blips read on wave load. |
| Presence / realtime cursors | Yjs awareness + presence badges in legacy UI | Modern presence via Yjs + `PresenceIndicator` in WaveView/Editor, tests (`server.editorPresence.test.ts`, `client.PresenceIndicator.test.tsx`). |
| Recovery / rebuild UI | Legacy rebuild actions | Modern rebuild status/log surface in WaveView; route tests + UI polling; shipped. |
| Search | Legacy search endpoints/UI | Modern `/api/editor/search` with Mango indexes/snippets/pagination; `EditorSearch.tsx` UI + tests. |
| Permissions/auth | Demo users + lax guards | Modern enforces `requireAuth`, removes demo shortcuts, guards blip/topic writes; toasts for failures; tests (`routes.blips.permissions.test.ts`); bcrypt rounds reduced to 2 in dev/test for faster auth. |
| Feature flags / enablement | Legacy flags in CoffeeScript | Modern `src/shared/featureFlags.ts`; `EDITOR_ENABLE` gate; FEAT_ALL supported. |
| Perf harness | Ad-hoc | Modern `perf-harness.mjs` seeds 5k blips and captures metrics/screens; budgets/schedules pending. |
| Health checks | Minimal | Modern `/api/health`, inline-comments/upload health tests; CI `health-checks` job runs `npm run test:health`. |
| Backup automation | Manual | Bundling described but automation/GDrive cadence still missing. |
| DB views / Couch | Legacy views and deploy scripts | Views deployment scripts exist (`npm run prep:views && npm run deploy:views`); keep in sync with modern Couch usage. |
| Gadget nodes | Legacy gadget buttons | Modern TipTap gadget nodes (chart/poll/attachment/image) with parse/command tests (`src/tests/client.editor.GadgetNodes.test.ts`). |
| Browser smokes | Manual QA | Modern GitHub `browser-smokes` job runs toolbar + follow-green Playwright suites with snapshots/artifacts. |
| Legacy assets | jQuery-era static assets | Disposition pending; need to keep/retire original static assets in `original-rizzoma-src`/`original-rizzoma`. |

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

1. **Testing** - Start services with `FEAT_ALL=1 npm run start:all`
2. **Polish** - Fine-tune UI/UX based on testing
3. **Performance** - Optimize for large documents
4. **Mobile** - Ensure responsive design
5. **Documentation** - Update user guides

## 🎯 What You Can Do Now

With `FEAT_ALL=1` enabled:

1. **Rich Editing** - Full formatting toolbar on all blips.
2. **@mentions** - Type @ to mention users.
3. **Tasks** - Create task lists with checkboxes.
4. **Comments** - Select text and add inline comments.
5. **Follow Green** - Navigate through unread changes in WaveView and the Rizzoma layout; some multi-session/large-wave edge cases still rely on manual testing.
6. **Live Collaboration** - See other users' cursors.
7. **Real-time Updates** - Core realtime flows are active; perf/CI hardening is still in progress.

Most of the core Rizzoma experience is available; see **Still pending** for remaining gaps.
