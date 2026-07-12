# 🚀 Rizzoma Core Features Implementation Status

## REST/Yjs coherence candidate — 2026-07-12

- Collaborative HTML materialization now carries the exact durable Yjs
  generation plus a SHA-256 digest of the full encoded Yjs state and is
  accepted only from the matching writable HTTP/Socket.IO session.
- REST replacement, socket join/update, and snapshot persistence serialize per
  blip. An external replacement advances the generation; a replacement cannot
  overwrite acknowledged dirty state, and generation-keyed caches/snapshots/
  browser documents cannot revive an older history.
- Remote convergence is materialized too, so Couch HTML and derived Task/
  mention documents cannot remain behind when the originating tab closes.
  Topic-root seeding now honors the same socket-owned single-seeder contract as
  nested blips, socket writes recheck authorization inside the mutation lock,
  the legacy editor has its own snapshot namespace, and missing Task
  side-documents return an honest 404.
- Per-wave policy epochs invalidate pending joins across demotion/deletion, the
  provider retries a stale authorization result without exposing write access,
  and partial access-policy writes cannot leave live socket authority stale.
- Snapshot loading now distinguishes a successful empty query from a storage or
  decode failure; decoding occurs in a disposable document so partial mutation
  cannot poison authority, and failures trigger only bounded, paused retries.
- Local gates: **108 test files / 647 passed / 3 skipped**, typecheck,
  full-source ESLint `--quiet`, and a **3,315-module** production build.
- Boundary: branch `fix/rest-yjs-content-coherence` is not merged or deployed;
  exact private-lane collaboration proof and resumed public acceptance still
  gate release.

## Integrated application merge — 2026-07-12

- PR [#66](https://github.com/HCSS-StratBase/rizzoma/pull/66), merged as
  `bacb8a50`, combines persisted sharing roles, authenticated collaboration,
  owner-partitioned offline state, ACL-backed uploads with mandatory ClamAV,
  secure OAuth/password recovery, realtime structural reloads, recursive
  export, mentions, and durable Tasks on the React/TipTap parity renderer.
- Account/session boundaries now remount all stateful topic/editor surfaces by
  authenticated owner. A denied or failed topic load scrubs topic, blip,
  participant, draft, editor, and modal state before another account can render.
- Task completion is server-authoritative in normal and edit views. Only an
  author or assignee receives toggle authority; denied refreshes fail closed,
  stale generations cannot revoke newer grants, view→edit mutations remain
  ordered, and reconnect/access changes restore authority without navigation.
- Exact local gates are green: **107/107 test files, 588 passed, 3 skipped, 0
  failed**; typecheck; full-source ESLint `--quiet`; and a **3,314-module**
  production build. The independent final audit returned **GO**.
- Responsive local evidence covers Task owner/public/toggle/editor-handoff at
  1280/1366/1440/1600 plus 390 mobile and Share/Invite dialogs at all four
  desktop widths. See the [candidate evidence](screenshots/260712-1928-final-candidate-ui/README.md).
- All seven PR checks passed on exact source head `b8c9d110`. Public production
  remains on the earlier parity release. PR #67 merged as `599fe025`, but its
  private candidate was held after an installed-versus-lock dependency drift;
  the lockfile-driven production reinstall, managed exact-SHA redeploy, and
  full public acceptance remain mandatory.

## Offline/auth isolation candidate — 2026-07-12

- The modern shell now has one real auth surface per viewport and a reserved
  offline/read-only strip; offline mutation controls and active editors freeze.
- Production durable replay remains disabled behind an empty allowlist. Queue
  records, Yjs documents, pending acknowledgements, and unresolved in-memory
  recovery snapshots are partitioned by authenticated owner.
- Auth epochs propagate across tabs; an authoritative server-user mismatch
  fails closed before Yjs sync. Literal state-changing client `fetch` calls
  were removed in favor of the shared online-only API boundary.
- Local gates: targeted 60/60, full 343 passed / 3 skipped, typecheck,
  3,306-module build, and 24 visually inspected desktop/mobile captures with 0
  unexpected console errors.
- Boundary: integrate PR #66's server socket auth/access/revocation/user result
  with this candidate's client owner/ack checks before two-user browser
  acceptance or deployment.

## Authenticated cursor identity candidate — 2026-07-12

- Topic-root, nested-blip, and generic editor collaboration now seed Yjs
  awareness from the authenticated account before TipTap creates its cursor
  extension.
- The display name uses the account name with email fallback; the cursor color
  is deterministic for the stable user ID. Anonymous test/harness surfaces use
  the honest label `Anonymous`, never an invented numbered user.
- Cursor decorations and typing indicators resolve the same awareness identity.
  The production shells now provide their real authenticated user; reconnect
  waits for the server's authorized `blip:sync` before sending offline Yjs state
  and re-announcing awareness.
- Local gates: 23/23 focused tests (including actual topic/nested/generic
  component boundaries), typecheck, and the 3,300-module production build. The
  concurrent regression run passed 307 tests / skipped 3, with one unrelated
  OAuth timeout whose complete file passed 3/3 serially.
- Boundary: this is a follow-on draft candidate, not a public/deployed claim.
  Two real signed-in users still need Playwright and visual PNG acceptance.

## Production-service hardening candidate — 2026-07-12

- The accepted parity application can now run as one compiled Express service
  serving hashed client assets, rather than a public Vite development server
  plus a tsx API process.
- Production defaults to loopback, requires a non-development session secret,
  accepts a bounded previous secret for no-logout rotation, and treats Redis
  session persistence as readiness-critical.
- SIGTERM/SIGINT now drain Socket.IO and HTTP, flush version-aware dirty Yjs
  snapshots with retries, close Redis, and only then exit.
- Immutable exact-SHA blue/green release assets and systemd automation live in
  `deploy/systemd/` and `scripts/deploy-vps.sh`; candidate deployment cannot
  alter public nginx.
- Local gates passed: 63 test files, 299 passed, 3 skipped, typecheck, and the
  3,298-module production build.
- Boundary: this candidate is not public until merge, direct preflight,
  zero-overlap maintenance drain, both-vhost cutover, and strict public
  collaboration/unread/browser acceptance complete.
- Active Redis compromise was contained and eradicated: evidence preserved, 54
  untrusted keys/sessions flushed, container recreated clean, and dual-stack
  public access closed for dependencies and direct Rizzoma internal ports.
  Public HTTPS health remains green; users must sign in once after secret
  rotation.

## Stacked sharing-authorization checkpoint — 2026-07-12

- `codex/sharing-access-control-stack`, rebased onto merged hardening commit `2595d2de` (tree-identical to source head `dda4d1d5`), persists private/link/public policy and implements viewer/commenter/editor/owner roles through one server resolver.
- Topic/wave listing and reads, topic/blip/comment/link/editor writes, participants/invitations, and Socket.IO collaboration rooms now enforce the same capabilities. Live demotion removes Yjs/awareness write authority immediately.
- Share settings load their saved value and fail closed on load error. Invite UI can assign viewer, commenter, or editor.
- New topics are explicitly private. Legacy documents missing both policy shapes remain discoverable **read-only**; no unaffiliated legacy edit/comment/socket write is preserved.
- Stacked verification is green at 67 files / 361 passed / 3 skipped, with build/typecheck, ESLint at **0 errors / 6,684 warnings**, and the required four-width UI sweep. See the [sharing and authorization reference](docs/SHARING_AUTHORIZATION.md).
- Production inventory measured **26 topic metadata documents: 0 explicit policies, 26 missing-policy legacy documents, and 0 malformed policies**. All 26 therefore use the public-read-only outsider fallback; owners retain management. Boundary: this stacked branch is not merged or deployed.

## Public production checkpoint — 2026-07-12

- **Runtime correction:** public production is the React/TipTap parity implementation, not the native fractal renderer. The live client has `FEAT_RIZZOMA_PARITY_RENDER=1` and `FEAT_RIZZOMA_NATIVE_RENDER` unset; `NativeWaveView` is still an opt-in, read-only path and cannot replace the editing UI. The Express API runs in production mode, while the public frontend is served as source modules by Vite in development mode.
- PR [#60](https://github.com/HCSS-StratBase/rizzoma/pull/60) merged as `fe6988fb` and is public-live through the accepted blue/green lane. It removed proxy-sensitive unread self-fetching, awaits one topic reload for not-yet-materialized remote blips, and keeps the real Next action available on mobile.
- CI passed **284 tests across 62 files** with 3 skipped; typecheck, production build, browser, health, performance, iOS, and aggregate gates passed; lint measured 0 errors and 6,354 warnings.
- Public two-process collaboration passed **10/10** with a measured **39 ms** relay, **0** receiving-client REST PUTs, bidirectional convergence, reconnect catch-up, and stable unread drain.
- Public Follow-the-Green passed the strict real-control contract on desktop and emulated Pixel 5 mobile: persisted unread state moved **2 → 1 → 0**, with unread HTTP 200 and mark-read HTTP 201 responses.
- Public health/OAuth passed, RedisStore is active, zero API 5xx responses were recorded across acceptance, and the 1280/1366/1440/1600 visual sweep passed. Evidence: `screenshots/260712-0530-pr60-production-final/`.
- Boundary: the active Node/Vite processes remain unsupervised, the public frontend is still a development server, and both active and rollback lanes share production CouchDB. Native-render completion, 500/1,000 full-render sweeps, physical iPhone Safari, test-data cleanup, backup automation, and the lint backlog remain open.

## Summary
Core editor tracks remain behind feature flags, and unread tracking/presence are now persisted per user (CouchDB read docs + Socket.IO events) and rendered across the Rizzoma layout (list badges, WaveView navigation bar, Follow-the-Green button). Demo-mode shortcuts have been removed in favor of real sessions, and permissions now enforce real authorship. Recovery UI for rebuilds and editor search materialization/snippets are implemented and covered by tests. Follow-the-Green now has deterministic Vitest coverage, multi-user Playwright coverage, and CI gating. Uploads run through MIME sniffing plus mandatory production ClamAV, bind opaque metadata to the canonical wave, and recheck current read access on every local-file download; missing, empty, or malformed scanner verdicts fail closed. S3/MinIO is fail-closed until it can preserve the same revocation guarantee. The client surfaces cancel/retry/preview UI. The performance harness continuously gates the 120-blip full-render/lazy path, while larger 500/1,000 full-render sweeps remain scale work. Health/inline-comments/uploads checks run in CI. Pixel 9 Pro XL / Android Chrome evidence exists; physical iPhone Safari remains outstanding.

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
- **Proxy-safe server order** - Wave detail, unread, next, and previous routes share direct data-level wave-tree loading instead of self-fetching through nginx/Vite metadata.
- **Remote materialization** - If a socket-delivered unread target is not yet in the observer DOM, the real Next handler awaits one topic reload before navigating and marking it read.
- **Strict release gate** - Desktop and mobile browser smokes require the actual `.next-button.has-unread`, exact endpoint IDs, and persisted `2 → 1 → 0`; missing controls, malformed/non-2xx unread responses, DOM mutation, and direct-API fallbacks fail the test.
- **Files created:**
  - `useChangeTracking.ts` - Local change tracking hook (dev/test harness).
  - `useWaveUnread.ts` - Wave-level unread state hook backed by `/api/waves/:id/unread`.
  - `GreenNavigation.tsx` - Legacy navigation component using `useChangeTracking`.
  - `FollowTheGreen.tsx` / `RightToolsPanel.tsx` - Rizzoma layout Follow-the-Green CTA and tools panel.
  - `FollowGreen.css` / `FollowTheGreen.css` - Green visual styling.

### Track D: Real-time Collaboration (VERIFIED 2026-07-12)
- **Y.js + TipTap + Socket.IO** - Full CRDT-based real-time document sync
- **Two-process sync verified** - Socket.IO room-based relay delivers Y.js updates between separate browser processes; final CI passed 10/10 with 1 ms relay and zero receiving-client REST PUTs.
- **Persistence round-trip verified** - Y.Doc state persisted to CouchDB via server-side yjsDocCache, restored on reconnection
- **Relay-first architecture** - Server relays `blip:update` to room members BEFORE applying to local cache, ensuring cache errors don't block delivery
- **Live cursors** - See where others are typing
- **Collaborative selection** - See what others have selected
- **Typing indicators** - "User is typing..." display
- **Presence awareness** - Canonical Yjs `encodeAwarenessUpdate`, `applyAwarenessUpdate`, and `removeAwarenessStates`, with remote-origin suppression so relayed awareness is not echoed back.
- **User colors** - Each user gets a unique color
- **Reconnection handling** - `setupReconnect` re-joins rooms and sends a state vector; final CI verified disconnect, reconnect, and catch-up convergence.
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
- **Tests** - Persistence/UI suites plus toolbar-inline, Follow-the-Green, and two-process collaboration Playwright smokes cover the current release contract.
- **Automation** - The `browser-smokes` GitHub job runs all three Playwright flows, captures `snapshots/<feature>/`, and uploads dev logs/artifacts on regressions.
  - The job now runs even when the main build fails so snapshots/artifacts are always available for triage; fetch them locally with `npm run snapshots:pull` if you need the latest screenshots without rerunning Playwright.

### Uploads & gadget nodes
- **Server safeguards** - `/api/uploads` inspects MIME signatures, blocks executables by signature/extension, requires CSRF plus edit access to the canonical blip, and streams production file buffers through ClamAV. Only an explicit `OK` verdict is accepted; malware, scanner outage, missing configuration, and an empty/malformed verdict fail closed. `/uploads/:id` resolves current wave-read access on every request and sends private/no-store/nosniff responses. S3/MinIO fails closed until object streaming is ACL-proxied.
- **Client UX** - `src/client/lib/upload.ts` exposes a cancelable `createUploadTask`, and `RizzomaBlip` renders inline preview/progress/cancel/retry controls so attachments/images surface their state (with toasts for success/failure). The toolbar upload buttons respect the new `isUploading` state, and Vitest exercises the degraded flows.
- **Tests** - `src/tests/routes.uploads.edgecases.test.ts` covers authentication, CSRF, edit authorization, canonical-wave binding, wave mismatch, file/virus failures, metadata cleanup, S3 fail-closed behavior, private download, cache headers, and immediate known-URL revocation. `src/tests/server.virusScan.test.ts` proves explicit clean/malware verdicts plus empty-response and unconfigured-production failure. `src/tests/client.uploadCancellation.test.ts` proves a pre-CSRF cancellation never opens or sends XHR. `src/tests/client.editor.GadgetNodes.test.ts` exercises the chart/poll gadget parse/render/command helpers.

### Media adapter
- **Modern getUserMedia adapter** - `src/static/js/getUserMediaAdapter.js` now normalizes constraints (including simple strings), prefers modern `mediaDevices.getUserMedia`, detects display media support, exposes permission status helpers and device enumeration, and retains legacy fallbacks. Covered by `src/tests/client.getUserMediaAdapter.test.ts`.

### Mobile Modernization (PWA)
- **Zero new dependencies** - All features use native browser APIs (Touch Events, Service Worker, View Transitions, localStorage)
- **Responsive breakpoints** - CSS variables and hooks for consistent breakpoints (xs: 320px, sm: 480px, md: 768px, lg: 1024px, xl: 1200px)
- **Mobile context** - `MobileProvider` wraps app, `useMobileContext()` provides isMobile/isTablet/isDesktop/isTouchDevice state
- **BottomSheet component** - Slide-up mobile menu with swipe-to-dismiss, backdrop click, escape key, body scroll lock, safe area padding
- **PWA installability** - Web manifest, service worker (cache-first for public assets; network-only for `/api`, `/socket.io`, and `/uploads`; v2 activation purges legacy dynamic caches), 8 SVG icons, apple-touch-icon support
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
- `requireAuth` guards authenticated mutations; centralized wave access additionally enforces viewer/commenter/editor/owner capabilities across REST and Socket.IO.
- Sharing policy is persisted through owner-only `GET/PATCH /api/waves/:id/sharing`; participant roles and public comment/edit flags are effective, not display-only.
- Legacy missing-policy topics remain public read-only until explicitly stamped; `npm run sharing:count-legacy` measures the remaining inventory without writing it.
- Rizzoma layout login flow uses the real `AuthPanel` modal instead of demo users.
- The route matrix and Socket.IO integration coverage exercise anonymous, outsider, viewer, commenter, editor, owner, identity spoofing, and live demotion flows.

## Still pending
- **App runtime expansion**: The first persistence-critical sandboxed app bug is now fixed. Root cause was rogue topic-root `PUT /api/blips/:topicId` writes overwriting the correct topic PATCH after `Done`; fresh verification on `http://127.0.0.1:4192` now shows the saved planner payload keeps `Ship preview (delayed)` at `16:30` and no rogue writes remain (`screenshots/260330-app-runtime/live-topic-planner-debug-saved-topic.json`, `.../live-topic-planner-debug-mutation-traffic.json`, `.../topic-patch-log.ndjson`). Next work is broader app-frame/host-API expansion, not basic correctness repair.
- **Shared app shell**: Kanban and Planner now use the same browser-side bootstrap (`public/gadgets/apps/app-shell.js`), and a third preview app (`Focus Timer`) is mounted on the same pattern. The generalized shell itself is accepted via the dedicated runtime harness (`src/client/test-app-runtime.html`) with fresh Playwright artifacts under `screenshots/260330-app-runtime/runtime-harness-*.{png,html}`. The fresh localhost authenticated topic-app verifier was unstable during that same pass, so the harness is the current source of truth for shell/bridge reuse.
- **Perf/resilience sweeps**: the 120-blip full-render/lazy path is release-gated; 500/1,000 full-render stress, inline comments under load, and realtime updates at scale remain.
- **Mobile device validation**: Pixel 9 Pro XL / Android Chrome is evidenced; physical iPhone Safari remains.
- **Legacy reference disposition**: All active code is TypeScript (zero CoffeeScript in `src/`). The `original-rizzoma-src/` and `original-rizzoma/` directories contain legacy reference code — decide whether to keep, archive, or remove.
- **Gadget iframe rendering**: Modernized to **Interactive React Nodes** via **Mantine v7** and **Lucide React**. Selected gadgets (Poll Gadget) now render as live, collaborative React components with distinguished teal/slate aesthetics.
- **~~Playback timeline~~**: DONE — `WavePlaybackModal.tsx` provides wave-level playback with split pane, color-coded timeline dots, date jump, per-blip diff, cluster fast-forward, and keyboard shortcuts. Per-blip playback also available via `BlipHistoryModal.tsx`.
- **Gear menu copy/paste variants**: Core gear actions work (reply, edit, delete, duplicate, cut/paste, copy link, history). The original's "copy reply" / "paste cursor" variants are not yet reimplemented.
- **Visual polish**: Nav panel icons (emojis → **Lucide icons**), toolbar icons (emojis → **Lucide icons**), date format ("Feb 7" → "7 Feb"), unread bar color (green → blue), Next button color (red → green). Mantine Provider integrated for distinguished styling.
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
| Twitter OAuth | Removed | Supported | Removed (API deprecated) |
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
| Live cursors (Yjs awareness, user colors) | Done | [orig](screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-presence.png) | — |
| Typing indicators | Done | — | — |
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
| ClamAV virus scanning | Done (new) | None | Required and fail-closed in production; optional in local/test |
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
| Service worker (cache-first assets, network-only authenticated transports) | Done (new) | None | `public/sw.js` v2 purges legacy dynamic caches |
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
| Unit/integration tests: 283 across 62 files, 3 skipped | Done | ~10 tests | 283 tests |
| E2E: toolbar inline smoke (Playwright) | Done | — | — |
| E2E: follow-the-green multi-user smoke | Done | — | — |
| E2E: two-browser-process collaboration smoke | Done | — | — |
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
| Perf harness (metrics + screenshots; configurable scale) | Done | — | — |
| CI perf budgets (120 full-render blips + lazy-slot gate) | Done, release-blocking | — | — |
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
| Toolbar icons | Emojis instead of SVG sprites; BLB per-blip toolbar strip is now flatter and closer to legacy texture, but the iconography itself still needs sprite-level parity | LOW |
| Topics list date format | "Feb 7" instead of "7 Feb" | LOW |
| Topics list unread bar color | Green instead of blue | LOW |
| Topics list filter dropdown | "Inbox ▼" filter missing | LOW |
| Mentions tab content | Empty — mention indexing from blip content needed | MEDIUM |
| Tasks tab filters | Filter buttons missing | LOW |
| Right panel Next button color | Red instead of green | LOW |
| Right panel mind map icon | Text instead of SVG | LOW |
| User avatars | Generated initials instead of OAuth photos | LOW |
| Keyboard shortcuts panel | Bottom of nav panel — missing | LOW |
| [+] green for unread | Root-topic read mode now uses the same gray/green inline marker language as editor and collapsed blips, and a richer BLB unread probe now passes with a real server-backed mix of green unread markers, gray read markers, and child-driven unread collapsed rows; broader parity against richer legacy/live cases still needs expansion | LOW |
| Nested inline expansion | Live BLB probe for root-inline plus nested-inline expansion now passes on `master`, a mixed inline/list-thread probe now also passes, and a dedicated toolbar-state probe now proves the expanded-vs-collapsed toolbar contract on live threaded replies; broader parity against richer legacy threaded cases still needs expansion | LOW |
| Mobile device validation | PWA infrastructure and Pixel 9 Pro XL / Android Chrome evidence exist; physical iPhone Safari remains | MEDIUM |
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
- `y-prosemirror` - Direct TipTap/Yjs collaboration peer for portable installs

## 🔧 Integration Points

1. **EditorConfig** - All editor extensions integrated
2. **BlipEditor** - Toolbar conditionally rendered
3. **Main App** - GreenNavigation component added
4. **Server Routes** - Inline comments API registered
5. **CollaborativeProvider** - Awareness protocol added

## 🚦 Next Steps

1. **Reusable app host + install lifecycle** - The cleaned app-frame runtime path is accepted end-to-end in the live authenticated topic flow for Planner, Focus, and Kanban on `master`; the Store controls real preview-app availability in the gadget picker (`screenshots/260331-store-lifecycle/`); that install state persists through the authenticated `/api/gadgets/preferences` path (`screenshots/260331-store-lifecycle-server/`); and the lifecycle is now explicit about `schemaVersion`, `scope: user`, shipped defaults, and reset behavior with fresh-login proof (`screenshots/260331-store-lifecycle-session7/`). BLB parity also moved forward with a denser topic-root shell probe (`screenshots/260331-blb-parity/`), a real nested inline-thread expansion probe (`screenshots/260331-blb-inline/`), a mixed inline/list-thread probe (`screenshots/260331-blb-mixed/`), a richer server-backed unread/thread probe (`screenshots/260331-blb-unread/`), an explicit toolbar-state probe with a flatter legacy-style toolbar strip (`screenshots/260331-blb-toolbar/`), and a denser authenticated business-topic scenario whose structure now honors the documented topic = meta-blip model while also preserving the single-toolbar contract on a fresh client (`screenshots/260331-blb-live-scenario/blb-live-scenario-v3.{png,html}` on `:4198`, with `expandedReplyCount = 3`, `visibleToolbarCount = 1`). The matching narrow-screen acceptance pass still lives at `screenshots/260331-blb-live-scenario-mobile/blb-live-scenario-mobile-v1.{png,html}`.
   - A direct live workflow smoke now also confirms that the ordinary topic path still works on `master`: `screenshots/260331-workflow-exploration/workflow-v1.{png,html,json}` shows successful root reply creation, reply expansion, nested reply submission, topic edit mode entry, and gadget palette opening on `http://127.0.0.1:4198`.
   - A larger numbered live workflow audit still documents those regressions at `screenshots/260331-complex-workflow/`, but the worst root-topic breakage from that audit is now fixed on a fresh rebuilt client: `screenshots/260331-complex-workflow-pass14/` proves that topic edit mode preserves the root body, gadget insertion happens inside that body, and done mode persists the poll without erasing the original topic text. A follow-up polish pass at `screenshots/260331-complex-workflow-pass15/` improves toolbar salience and gadget-palette anchoring while keeping that repaired root-topic flow intact, and the latest nested-readability pass at `screenshots/260331-complex-workflow-pass19/` makes the active nested reply area denser, less washed out, and less dominated by degraded-state warnings on a fresh `:4198` client.
2. **Testing** - Start services with `docker compose up -d couchdb redis`, then run `FEAT_ALL=1 EDITOR_ENABLE=1 SESSION_STORE=memory REDIS_URL=memory:// npm run dev` (real auth only).
3. **Polish** - Fine-tune UI/UX based on testing.
4. **Performance** - Extend the release-gated 120-blip full-render path to 500/1,000-blip resilience sweeps.
5. **Mobile** - Validate unread/navigation/toolbar ergonomics on physical iPhone Safari.
6. **Documentation** - Update user guides and remove demo-mode language.

## 🎯 What You Can Do Now

With `FEAT_ALL=1` + real auth enabled:

1. **Rich Editing** - Full formatting toolbar on all blips.
2. **@mentions** - Type @ to mention users.
3. **Tasks** - Create task lists with checkboxes.
4. **Comments** - `Ctrl+Enter` now creates anchored inline-comment/subblip markers again in the live topic workflow, clicking `[+]` drills into the subblip URL, typed subblip content survives into read mode after `Done`, and `Hide` returns to the parent topic in read mode with the marker still visible (`screenshots/260401-inline-comment-audit-pass44/`). The older annotation-style `Inline comments / All / Open / Resolved` product surface has been removed from the live editor workflow. The remaining gap is the weak visual treatment of the subblip page itself compared with original Rizzoma.
5. **Follow Green** - Navigate through unread changes in WaveView and the Rizzoma layout; some multi-session/large-wave edge cases still rely on manual testing.
6. **Live Collaboration** - See other users' cursors.
7. **Real-time Updates** - Core realtime flows and current release CI gates are active; production deployment verification and larger-scale performance remain.

Most of the core Rizzoma experience is available; see **Still pending** for remaining gaps.
