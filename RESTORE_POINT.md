# RESTORE POINT

## Meta / Review Prerequisites
- [x] Re-read the active codebase (server, client, shared, legacy CoffeeScript stubs) plus every Markdown file changed in the last 31 days and `README_MODERNIZATION.md` before starting any new work; flag any doc/code drift as bugs.
- [x] Capture deltas from the re-read in this file and in `docs/HANDOFF.md`/`docs/RESTART.md` if startup or workflow guidance changed.

### Doc drift (latest re-read)
- `RIZZOMA_FEATURES_STATUS.md`, `TESTING_GUIDE.md`, and `TESTING_STATUS.md` over-claim feature completeness (all tracks marked done, FEAT_ALL green) and cite Dec 2025 test runs; they omit both the newly-landed unread/presence work and the remaining recovery UI, search relevance, and permissions tightening backlog. Treat them as stale until rewritten with the new backlog/tests.
- `README.md`, `README_MODERNIZATION.md`, `QUICKSTART.md`, `AGENTS.md`, and `CLAUDE.md` still describe demo-mode shortcuts, “all core features working,” and aggressive automation/PR flows that conflict with the present backlog and the removal of demo-user fallbacks; align messaging with the outstanding unread/presence/perms work and drop the auto-merge directives.
- `docs/HANDOFF.md` / `docs/RESTART.md` dates (2025-11) and milestone notes predate the editor/presence/recovery/search backlog; they should be refreshed after unread/presence/perms are implemented.
- `docs/LINKS_REPARENT.md` was referenced in recent history but is no longer in `docs/`; restore or update references if link management guidance is still needed.

## Outstanding TODO Backlog (Excruciating Detail)

### Realtime, presence, recovery, and search
- [x] Presence identity polish: surface `editor:presence` payload users in both WaveView and editor panes (avatars/initials + tooltip) with empty/error/loading states; add Vitest coverage for join/leave debounce and stale presence expiry in `src/server/lib/socket.ts` + client renderers.
  - (2026-02-XX) Socket presence tracking now runs through `EditorPresenceManager` (de-bounced emits + TTL cleanup) with heartbeat pings from the client; `server.editorPresence.test.ts` covers join/leave coalescing, TTL expiry, and heartbeat refresh. `WaveView` + `Editor` now mount a shared `PresenceIndicator` that renders avatars/count along with loading/empty/error states, with deterministic UI coverage in `client.PresenceIndicator.test.tsx`.
- [x] Recovery UI: replace the single rebuild button with a progress/log surface (queued/running/complete, errors list, snapshots applied count) that polls `/api/editor/:waveId/rebuild?blipId=`; add failure toasts + retry; cover with route tests (mock CouchDB failures) and UI tests exercising long-running rebuilds.
  - (2026-03-05) `/api/editor/:waveId/rebuild` now exposes GET status plus an async queue with log history, queued/running/error states, and automatic cleanup. `RebuildPanel` in `WaveView` renders the status/log surface, auto-polls active jobs, shows applied counts, and surfaces retry toasts. Added Vitest coverage in `client.RebuildPanel.test.tsx` and expanded `routes.editor.rebuild.test.ts` to cover success/error flows.
- [x] Search materialization polish: finalize Mango/view indexes for `/api/editor/search` (blip-scoped + wave-level) and add result relevance ordering; extend `EditorSearch.tsx` to show snippet context and a “jump to blip” action; add endpoint tests for pagination/bookmark + malformed queries.
  - (2026-03-05) `/api/editor/search` now enforces Mango index creation, adds bookmark-based pagination, sorts by `updatedAt desc`, emits contextual snippets, and guards long queries. `EditorSearch` renders snippets, jump buttons, and load-more pagination via the new `nextBookmark`. Added new Vitest suites (`routes.editor.search.test.ts`, `client.EditorSearch.test.tsx`) covering pagination, malformed queries, snippets, and jump actions.
- [ ] Follow-the-Green validation: ensure unread navigation works at wave level (next/prev/unread count) with realtime edits; add Playwright/Vitest coverage that edits remote content and verifies navigation highlights update without losing selection.
  - (2026-03-05) Added `test-follow-green-smoke.mjs` (`npm run test:follow-green`) which registers/logs two users, creates a fresh wave, triggers a remote blip via the API, and validates that the observer’s Follow-the-Green CTA jumps to and clears the unread blip. CI gating, degraded-path toasts, and larger-wave automation remain.
- [ ] Perf/resilience sweeps: soak-test large waves/blips, inline comments, playback, and realtime updates for latency/memory; add metrics/logging hooks and document thresholds/known limits.

### Read/unread state and navigation
- [x] Implement real read/unread tracking for blips/topics (replace `isRead: true` in `RizzomaTopicDetail.tsx`): persist per-user state in CouchDB/Redis, expose API endpoints, hydrate in lists/detail, and render badges + keyboard navigation; add optimistic updates + rollback on failure.
- [x] Wire unread state to realtime updates so edits mark unread for other users and resolve when opened/read; add regression tests for concurrent sessions.
  - (2026-02-XX) Unread endpoints now compare `updatedAt` to per-user `readAt`, update existing read docs instead of no-op, and emit `blip:created/updated/deleted/read` socket events. WaveView adds unread badges, realtime refresh, optimistic mark-read with rollback toast, first/prev/next/last helpers, and an inline unread counter, while `RizzomaTopicDetail` hydrates `isRead` for the root and replies and surfaces unread badges in `RizzomaTopicsList`. Added coverage in `src/tests/routes.waves.unread.test.ts` and UI smoke in `client.followGreenNavigation.test.tsx`; `WaveView` now guards the optimistic flow against failures by re-syncing unread lists.
  - (2026-03-XX) Added `computeWaveUnreadCounts` to share CouchDB persistence logic across `/api/waves/unread_counts` and `/api/topics`, introduced `useWaveUnread` to hydrate the Rizzoma layout, wired optimistic `markBlipRead` flows into `RizzomaBlip`/`RightToolsPanel`, and surfaced unread badges in the topics list so the modern UI reflects server state with rollback on failures.

### Auth, permissions, and error handling
- [x] Replace `demo-user` fallbacks and enforce permissions for blip/topic create/update/delete; implement the TODO permission check in `src/server/routes/blips.ts` with integration tests (authorized/unauthorized).
  - (2026-02-XX) All blip/topic write endpoints now use `requireAuth`, log denied actions, and honor real ownership checks; `RizzomaLanding` routes sign-in through the real `AuthPanel` instead of demo shortcuts so unauthenticated sessions can no longer mutate data. Added targeted coverage in `src/tests/routes.blips.permissions.test.ts` for unauthenticated/forbidden/authorized updates plus topic delete denials.
- [x] Add user-facing error toasts for failed blip edits/replies in `RizzomaBlip.tsx`.
- [x] Ensure inline comments/playback/delete obey permissions and show degraded-state banners when APIs fail.
  - [x] (2025-12-24) Inline Comments nav/popover now surfaces a read-only banner whenever `canComment` is false, complementing the existing API failure messaging so degraded states are obvious without user interaction; added Vitest coverage in `client.inlineCommentsPopover.test.tsx`.
  - [x] (2026-01-05) Inline comments now show a persistent degraded-state banner with a Retry control whenever the fetch fails, including unauthorized messaging and Vitest coverage in `client.inlineCommentsPopover.test.tsx`; retry clears the failure banner once comments load successfully so API outages are explicit.
  - [x] (2025-12-04) BlipMenu always renders the inline comment toggle, shows a read-only banner when commenting is disabled, keeps paste-as-reply visible (but disabled with explanatory tooltip), and adds a loading indicator in `InlineComments.tsx` so degraded states are surfaced directly from the toolbar/editor surfaces.
  - [x] (2025-12-04) InlineComments now reports load failures back to `RizzomaBlip`, and BlipMenu mirrors those degraded/error banners directly in the inline toolbar so outages are obvious without opening the popover; Vitest covers the new status callback + toolbar banner rendering.
- [ ] Align inline comments, playback, uploads, and delete actions with authenticated identity metadata; add logging for denied actions.

### Uploads, media, and gadget nodes
- [ ] Finish real upload pipeline: `src/server/routes/uploads.ts` should validate type/size, stream to storage (MinIO/S3 or filesystem), and return signed URLs; client upload helper (`src/client/lib/upload.ts`) must show progress/cancel/retry and preview; add security scans for executables.
- [ ] Replace placeholder gadget buttons with durable TipTap nodes (chart/poll/attachment/image) that load from stored payloads; add serialization/parse tests and UI coverage for insert/edit/delete.
- [ ] Modernize `getUserMedia` adapter (`src/static/js/getUserMediaAdapter.js`, `src/static/tests/adapter.js`) to new APIs with fallback detection and tests.

### Legacy migration and modernization
- [ ] Migrate remaining CoffeeScript entrypoints (`src/share/*.coffee`, `src/*_index.coffee`, `app.js`, legacy client bundles) to TypeScript/ESM; remove CoffeeScript runtime wrappers and update imports.
- [ ] Replace deprecated libs per `README_MODERNIZATION.md` (cradle→direct HTTP/nano, connect-redis update, sockjs→Socket.IO already partly done, mailparser/node-xmpp upgrades); add type coverage for upgraded middleware.
- [ ] Decide disposition for `original-rizzoma` and legacy static assets (jQuery 1.x, Globalize, gadget samples, diff_match_patch): either port or retire; document decisions and delete dead code/CSS stubs.
- [ ] Complete modernization phases: Phase 4 frontend refactors (drop jQuery usage, adopt modern UI patterns/CSS modules or Tailwind) and Phase 5 testing/CI hardening (Jest/Vitest + Playwright/Cypress + perf budgets).
- [ ] Ensure Docker dev stack (CouchDB/Redis/RabbitMQ/Sphinx/MinIO) remains reproducible; add health checks and feature-flag wiring for editor features; document any compose/env changes.

### Inline blip menu, editor parity, and navigation polish
- [x] Validate inline toolbar parity in-browser: collapse state, overflow gear actions (copy/paste reply/cursor, send, playback, delete, link copy), attachment/image upload flow, gadget nodes, color picker, shortcuts; add Playwright smoke run to complement Vitest.
  - (2025-12-05) Added `docs/EDITOR_TOOLBAR_PARITY.md` section outlining file map + Vitest suites (`client.BlipMenu.test.tsx`, `client.blipClipboardStore.test.ts`) that already exercise the restored toolbar; Playwright smoke remains outstanding. Re-ran `npm test -- --run src/tests/client.BlipMenu.test.tsx src/tests/client.inlineCommentsPopover.test.tsx` to confirm coverage stays green.
  - [x] (2026-01-05) Added `npm run test:toolbar-inline` Playwright smoke (`test-toolbar-inline-smoke.mjs`) that launches Chromium against a local wave, walks the inline toolbar (edit/read surfaces, key formatting buttons, overflow trigger) and asserts inline comments navigation renders so parity gaps surface without manual QA.
  - [x] (2025-12-24) Overflow gear now mirrors Delete + Copy Link actions across edit/read states with disabled/loading parity; updated `client.BlipMenu.test.tsx` exercises the new fallback controls. Playwright smoke remains outstanding.
  - [x] (2025-12-04) Expanded `test-toolbar-inline-smoke.mjs` to open both edit/read overflow menus, assert key actions (Send, Copy/Paste variants, playback, link copy) render, and tap the inline comment filters so parity is validated in-browser rather than only through unit tests.
- [x] Ensure per-blip collapse-default setting syncs between CouchDB and localStorage; add tests for offline/restore and multi-tab coherence.
  - (2025-12-11) Collapse preferences now timestamp entries in `collapsePreferences.ts`, race-guard server hydration inside `RizzomaBlip.tsx`, and emit cross-tab storage events; see `src/tests/client.collapsePreferences.test.ts` for coverage.
- [x] Harden inline comment visibility persistence (server + localStorage storage events) and ensure TipTap + BlipMenu stay in sync during rapid toggles.
  - (2025-12-11) Inline comments visibility helper now stores `{ value, updatedAt }`, diffs storage events, and `RizzomaBlip.tsx` guards fetch/patch requests with change tokens; extended `client.inlineCommentsVisibilityStorage.test.ts` exercises metadata + cross-tab broadcasts.

### Testing and QA coverage
- [ ] Test every functionality that's added or modified and update that md file accordingly (or create one if there isn't one already!)
- [ ] Add coverage for Follow-the-Green navigation/unread tracking (wave-level) plus degraded-path toasts for editor actions; re-run full Vitest suite and add browser smoke.
  - (2026-03-05) Added `src/tests/client.RightToolsPanel.followGreen.test.tsx` and `src/tests/client.useWaveUnread.test.tsx` to cover the modern Follow-the-Green CTA (`RightToolsPanel`/`FollowTheGreen`) and the `useWaveUnread` hook (initial load, optimistic mark-read, socket `deleted` events, and large-wave stress). `test-follow-green-smoke.mjs` now exercises the multi-user browser flow, and the CTA surfaces inline status/toasts when no unread blips exist or mark-read fails; CI wiring and additional degraded-path toasts are still pending.
- [ ] Gate CI on `npm run test:toolbar-inline` and the Follow-the-Green suite once unread/presence persistence lands so toolbar/unread regressions fail fast.
- [x] Expand automated regression for BlipMenu parity items and failure-path toasts; add cross-browser (Chromium/Firefox/WebKit) smoke runs.
  - (2025-12-04) `client.BlipMenu.test.tsx` now asserts inline comment error banners render in edit mode and that read-only commenting disables the edit overflow paste actions, covering the failure-path toasts surfaced by the inline toolbar; the existing `npm run test:toolbar-inline` smoke already iterates Chromium/Firefox/WebKit.
- [x] Manual testing checklist (MANUAL_TEST_CHECKLIST.md): rerun with restored toolbar/popovers, including keyboard shortcuts (j/k), editor search, performance responsiveness, mobile layout.
  - (2025-12-04) Checklist now contains a dedicated inline toolbar walkthrough (read/edit states, overflow, degraded banners) plus inline comment navigation/shortcut steps so manual runs cover the restored surfaces without extra notes.
- [ ] Add health checks for `/api/health`, inline comments endpoints, and upload endpoints; wire to CI smoke where feasible.
  - (2026-03-05) Added `/api/health` router (`src/server/routes/health.ts`) with `src/tests/server.health.test.ts`, basic inline comments health tests in `src/tests/routes.comments.inlineHealth.test.ts` (feature-flag on/off and empty view handling), and upload edgecase coverage in `src/tests/routes.uploads.edgecases.test.ts` (auth required, missing file error, and successful upload metadata). CI wiring remains outstanding.
- [ ] Performance tests: large document load, realtime under concurrency, mobile responsiveness; capture metrics/budgets.

### Documentation and knowledge base
- [x] Audit and correct overstatements in `RIZZOMA_FEATURES_STATUS.md` (tracks A–D marked “implemented” but lack unread/perms/upload validation); align with actual coverage/tests.
  - (2026-03-05) Updated summary, Track C, unread/presence, and "Still pending" sections so Follow-the-Green, perf/resilience, CI/health checks, and backup automation are called out as remaining work, and clarified that `useWaveUnread` + `RightToolsPanel` are the canonical Follow-the-Green surfaces while `GreenNavigation`/`useChangeTracking` act as a test harness.
- [ ] Keep `docs/EDITOR*.md`, `docs/EDITOR_TOOLBAR_PARITY.md`, `README_MODERNIZATION.md`, and onboarding/restart guides current with any API or flag changes; add notes when features remain behind flags or need manual setup.
- [x] Mirror “Next up” items from `README_MODERNIZATION.md`: add Playwright smoke for inline toolbar overflow/gear parity and expand unread navigation/Follow-the-Green regression coverage while documenting degraded-state banners.
  - [x] (2025-12-04) `npm run test:toolbar-inline` now iterates Chromium, Firefox, and WebKit while exercising the inline toolbar overflow/gear actions plus inline comment navigation, so parity gaps surface across browsers without manual QA.
  - [x] (2026-01-07) Added `src/tests/client.followGreenNavigation.test.tsx` to cover `useChangeTracking` + `GreenNavigation` highlight flows and documented the inline comment degraded-state banners across `docs/EDITOR_TOOLBAR_PARITY.md` and `INLINE_COMMENTS_VS_REPLIES.md` so toolbar/popup cues stay synchronized.
- [ ] Refresh `TESTING_STATUS.md` with the next real run (typecheck/tests/build) and note outstanding UI/browser smoke gaps.
  - (2026-03-05) Partially refreshed to clarify Follow-the-Green coverage, FEAT_ALL status, and remaining gaps for large-wave/perf paths; a new end-to-end run is still pending.
- [ ] Add doc notes for backup workflow refinements and any CI additions.

### Operations, automation, and backups
- [ ] Implement Google Drive bundle automation in `scripts/deploy-updates.sh`; schedule post-merge bundle + copy commands and document cadence.
- [ ] Maintain bundle + GDrive backup workflow; verify bundle after each merge.
- [ ] Ensure CI runs typecheck/tests/build and Docker image build; add alerts for failures.

### Miscellaneous code cleanups
- [ ] Investigate and relax restrictions noted in `src/share/utils/string.coffee`.
- [ ] Refactor `scrollableTarget` dependency in `src/share/utils/dom.coffee` (two TODOs).
- [ ] Consolidate icon assets and remove unused legacy CSS/JS stubs across `src/static`.
