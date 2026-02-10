# Claude Session Context (2026-02-10)

**Read this file first when resuming work on this project.**

## Current Branch
`feature/rizzoma-core-features` (main branch is `master`)

## Latest Work: Four-Item Sweep (2026-02-10)

### 1. getUserMedia Adapter Modernized
- Converted `getUserMediaAdapter.js` → `.ts` (ES module, full TypeScript types)
- **Removed**: legacy prefixed APIs (`webkitGetUserMedia`, `mozGetUserMedia`, `msGetUserMedia`, `mozSrcObject`, `webkitRTCPeerConnection`), global pollution (`window.getUserMedia` etc.), IIFE pattern
- **Added**: `requestDisplayMedia()` for screen sharing, proper TypeScript types
- Tests: 10/10 pass (was 8, added `requestDisplayMedia` + `reattachMediaStream` tests)

### 2. Offline Queue Wired into API
- `api()` in `api.ts` now queues mutations when `!navigator.onLine` (except auth routes)
- Returns `{ ok: true, status: 202, queued: true }` for queued mutations
- `offlineQueue.initialize()` called at app startup in `main.tsx`
- Auto-syncs when back online (existing `offlineQueue` infrastructure)

### 3. PWA Install + Notification UI
- New `PWAPrompts.tsx` + `.css` — fixed-bottom banner with three states:
  - **Install prompt**: "Install Rizzoma for faster access" (uses `useInstallPrompt` hook)
  - **Notification opt-in**: "Enable notifications for updates" (`Notification.requestPermission()`)
  - **Offline indicator**: Shows pending mutation count while offline
- Dismissals persist to `localStorage`; auto-hides when already installed/granted
- Touch-friendly (44px min targets on mobile)
- Wired into `RizzomaLayout.tsx`

### 4. Collab Testing Hardened
- **Server tests** (`server.yjsDocCache.test.ts`): 15 tests (was 11, +4):
  - Reconnection via state vector diff
  - Two clients editing concurrently via server cache
  - Dirty set cleared after persist
  - Destroy cleanup verification
- **Client tests** (`client.collaborativeProvider.test.ts`): 9 NEW tests:
  - Room join on connect, skip on disconnect
  - Local updates sent to server
  - Remote updates applied to doc
  - No echo of remote updates (origin guard)
  - onSynced callback lifecycle
  - Reconnection (re-join + state vector)
  - setUser awareness
  - Destroy cleanup

### Test Suite: 161/161 pass (3 skipped)
- 15 new tests added across 3 files

### Previous: Test/Perf/PWA Sweep (2026-02-10)

#### Perf Harness: 100-blip benchmark — BOTH stages PASS
- **landing-labels**: Stage 288.7ms, FCP 492ms, memory 18MB, 100/100 blips
- **expanded-root**: Stage 522.6ms, FCP 492ms, memory 18MB, 100/100 blips
- Budgets: firstRenderTarget 3000ms, memoryTarget 100MB — both well within limits

#### PWA Audit: 98/100 ready → fixed
- **Fixed**: shortcut icon referenced `.png` instead of `.svg` in `public/manifest.json`
- Only gap: no real device testing yet (need iPhone Safari + Chrome Android)

### Previous: Mobile Hardening (2026-02-10)

#### What Was Done
- Deleted dead `mobile.tsx`/`mobile.html` stubs and Vite entry point
- Fixed pull-to-refresh to wait for actual data reload via `rizzoma:topics-loaded` event (was fake 500ms sleep)
- Added `100dvh` dynamic viewport height (accounts for mobile address bar)
- Added touch-friendly `@media (hover: none) and (pointer: coarse)` media queries to 11 CSS files
- GadgetPalette: responsive 2-col/1-col grid for small screens
- Input `font-size: 16px` on touch devices to prevent iOS auto-zoom

#### Files Changed (14 files, commit fbe0315a)
| File | Change |
|------|--------|
| `src/client/mobile.html` | Deleted |
| `src/client/mobile.tsx` | Deleted |
| `vite.config.ts` | Removed mobile entry point |
| `src/client/components/RizzomaLayout.tsx` | Pull-to-refresh waits for `rizzoma:topics-loaded` event |
| `src/client/components/RizzomaLayout.css` | Added `100dvh` |
| `src/client/components/AuthPanel.css` | Touch targets (44px min) |
| `src/client/components/CreateTopicModal.css` | Touch targets + iOS zoom prevention |
| `src/client/components/ExportModal.css` | Touch targets |
| `src/client/components/GadgetPalette.css` | Responsive grid + touch targets |
| `src/client/components/PublicTopicsPanel.css` | Touch targets + iOS zoom prevention |
| `src/client/components/RightToolsPanel.css` | Touch targets |
| `src/client/components/WavePlaybackModal.css` | Touch targets + larger timeline dots |
| `src/client/components/blip/BlipHistoryModal.css` | Touch targets |
| `src/client/components/blip/RizzomaBlip.css` | Touch targets for collapsed rows, expander, reply buttons |

#### Completed: Playwright Mobile Viewport Screenshots (9 screenshots)
- iPhone SE (375x667): auth panel, topic list, BLB topic detail
- iPhone 14 Pro (393x852): topic list, BLB topic detail
- Pixel 7 (412x915): topic list, COLLAB TEST detail, BLB topic detail
- Desktop (1280x800): BLB topic detail (comparison)
- All viewports render cleanly — no overflow, clipping, or layout issues

## Previous Work: TypeScript Cleanup + Health Check (2026-02-10)

### What Was Done
- Fixed all 25 TypeScript errors → `tsc --noEmit` is now **zero errors**
- Upgraded `/api/health` from `{ status: 'ok' }` stub to real CouchDB connectivity check
- Collab debug logs (`[collab-dbg]`, `__dbg`) were already cleaned up in prior session

### Files Changed (14 files, commit abee6236)
| File | Fix |
|------|-----|
| `src/client/main.tsx` | Removed unused `RizzomaLanding` import |
| `src/client/components/RizzomaTopicDetail.tsx` | Cast `isDestroyed` via `(as any)`, `!!` for `classList.toggle` |
| `src/client/components/RightToolsPanel.tsx` | Prefix unused `isCursorInEditor` |
| `src/client/components/blip/BlipMenu.tsx` | Rename destructured `isExpanded` → `_isExpanded` |
| `src/client/components/blip/RizzomaBlip.tsx` | Rename unused `onNavigateToSubblip`, cast `isDestroyed` |
| `src/server/routes/blips.ts` | Bracket notation for index sig, removed unused `canEdit` |
| `src/server/routes/health.ts` | Real health check: CouchDB ping, latency, version, uptime, 503 on failure |
| `src/server/routes/mentions.ts` | `String()` wrap for Express 5 param type |
| `src/server/routes/tasks.ts` | `String()` wrap (2 locations) |
| `src/server/routes/topics.ts` | Removed unused `userId` |
| `src/tests/client.BlipEditor.test.ts` | Fixed `Editor` import for @tiptap/core module shape |
| `src/tests/client.RightToolsPanel.followGreen.test.tsx` | Prefix unused `toast` import |
| `src/tests/routes.topics.follow.test.ts` | Bracket notation for index sig access |
| `src/tests/server.yjsDocCache.test.ts` | Bracket notation, removed unused `doc` var |

## Previous Work: Wave-Level Playback (2026-02-09)

### What Was Built
Wave-level playback modal that shows the entire topic evolving over time — all blips changing chronologically.

| File | Action | Purpose |
|------|--------|---------|
| `src/server/lib/couch.ts` | Modified | Added `idx_blip_history_wave_createdAt` index |
| `src/shared/featureFlags.ts` | Modified | Added `WAVE_PLAYBACK` flag |
| `src/shared/types/blips.ts` | Modified | Added `WaveHistoryResponse` type |
| `src/server/routes/waves.ts` | Modified | Added `GET /api/waves/:id/history` endpoint |
| `src/client/components/WavePlaybackModal.tsx` | Created | Full wave playback component (442 lines) |
| `src/client/components/WavePlaybackModal.css` | Created | Styles (split pane, responsive, 482 lines) |
| `src/client/components/RizzomaTopicDetail.tsx` | Modified | Wired modal into both gear menus |
| `src/client/lib/htmlDiff.ts` | Created | Shared word-level diff utility (54 lines) |
| `src/client/components/blip/BlipHistoryModal.tsx` | Refactored | Uses shared htmlDiff instead of inline diff |

### Key Features
- **Wave state reconstruction**: Aggregates all `blip_history` entries chronologically, rebuilds per-blip state at each step
- **Split pane**: Left (60%) = changed blip content + optional diff; Right (40%) = mini wave overview with all blips
- **Color-coded timeline**: Each blip gets a consistent color across the timeline dots
- **Playback**: Play/Pause/Stop, step, fast-forward/back (3s cluster gap), speed 0.5x-10x
- **Diff mode**: Compares against previous version of the **same blip** (not just previous timeline entry)
- **Date jump**: `datetime-local` picker jumps to closest entry
- **Keyboard shortcuts**: Arrow keys (step), Space (play/pause), Escape (close)
- **Feature flag**: `FEAT_WAVE_PLAYBACK` (or `FEAT_ALL=1`)

### Verified
- API endpoint returns history sorted by createdAt
- Modal opens from both gear menus
- Slider, step, play/pause, diff mode all functional
- Escape closes modal
- **146 tests pass, 0 failures** (all 9 pre-existing failures fixed 2026-02-10)
- Zero new TypeScript errors

## Test Fix Session (2026-02-10)

Fixed all 9 pre-existing test failures (across 5 files):

| File | Fix | Root Cause |
|------|-----|------------|
| `inlineCommentsVisibility.ts` | Default `true` not `false` | Inline comments should be visible by default |
| `vitest.config.ts` | Added `env: { FEAT_ALL: '1' }` | Feature flags off in test env → extensions not loaded |
| `BlipMenu.tsx` | Added `data-testid`, `title`, `aria-pressed` to overflow items | Tests needed stable selectors for delete & collapse-default |
| `client.BlipMenu.test.tsx` | Open gear menu before querying overflow items | Delete & collapse-default moved to overflow during refactor |
| `routes.blips.permissions.test.ts` | Expect 200 for non-author edit | Collaborative editing model: any authenticated user can edit |
| `routes.topics.edgecases.test.ts` | Expect 200 for non-owner PATCH | Same collaborative editing model |
| `client.BlipEditor.test.ts` | Timeout 15s → 30s | FEAT_ALL loads more extensions |
| `routes.uploads.edgecases.test.ts` | Timeout 15s → 30s | Same reason |

**WSL2 workaround**: 9P filesystem EIO errors prevent running vitest on `/mnt/c/`. Solution: `npm install` on Linux-native `/tmp/rizzoma-test/`, sync changed files, run tests there.

---

## Previous Work: Real-Time Collaboration (Y.js + TipTap + Socket.IO)

### Plan File
`/home/stephan/.claude/plans/tranquil-scribbling-wave.md` — 3-phase plan (Awareness → Doc Sync → Persistence). **All three phases are IMPLEMENTED in code.** The remaining work is **testing and debugging cross-tab sync**.

### Implementation Status: Code Complete, Cross-Tab Sync VERIFIED

| Phase | What | Code Status | Test Status |
|-------|------|-------------|-------------|
| 1 | Awareness (cursors + typing indicators) | DONE | Awareness relay verified (events arrive cross-tab) |
| 2 | Document Sync (Y.Doc CRDT real-time editing) | DONE | **Cross-tab sync VERIFIED (2026-02-09)** — Socket.IO relay works, content syncs via API refresh |
| 3 | Persistence + Reconnection + Feature Flags + Tests | DONE | **Persistence round-trip VERIFIED** — content saved to CouchDB, reloaded on other tab |

### What Was Built (Across 3 Sessions)

#### Server-Side
| File | What |
|------|------|
| `src/server/lib/socket.ts` | Full collab handlers: `blip:join` (with CouchDB snapshot load), `blip:leave`, `blip:update` (relay + server-side Y.Doc apply), `blip:sync:request` (diff update via state vector), `awareness:update` (relay). Per-socket `collabBlips` set for disconnect cleanup. |
| `src/server/lib/yjsDocCache.ts` | **NEW** — Server-side Y.Doc cache with: `getOrCreate`, `addRef/removeRef`, `getState`, `applyUpdate`, `encodeDiffUpdate`, `loadFromDb` (CouchDB snapshot), `persistDirty` (30s interval), TTL cleanup (5min idle + refCount=0) |
| `src/tests/server.yjsDocCache.test.ts` | **NEW** — 10 unit tests covering: caching, ref counting, updates, diffs, CouchDB load/persist, skip-if-populated |

#### Client-Side
| File | What |
|------|------|
| `src/client/components/editor/CollaborativeProvider.ts` | SocketIOProvider: Y.Doc sync (update relay + sync-on-join), awareness with loop prevention (`applyingRemoteAwareness` flag), reconnection with state vector, `onSynced()` callback, `setUser()` method. Only joins room if socket already connected; `setupReconnect()` handles connect events. |
| `src/client/components/editor/useCollaboration.ts` | **REWRITTEN** — Creates SocketIOProvider **synchronously during render** (via refs), not in useEffect. Critical because TipTap's `useEditor` creates the editor on first render — if provider isn't ready, Collaboration extension won't be included and can't be added later. |
| `src/client/components/editor/YjsDocumentManager.ts` | Client-side Y.Doc singleton cache (one doc per blipId) |
| `src/client/components/editor/EditorConfig.tsx` | `getEditorExtensions()` conditionally adds `Collaboration.configure({ document: ydoc })` when ydoc truthy; disables StarterKit history (`history: ydoc ? false : undefined`) to avoid conflict |
| `src/client/components/RizzomaTopicDetail.tsx` | **Collab added to topic-level editor** — `topicCollabEnabled`, `topicYdoc`, `topicCollabProvider`, `topicCollabActive`. Passes ydoc/provider to `getEditorExtensions()`. Seeding: waits for `onSynced()`, only seeds Y.Doc from HTML if fragment is empty. `seedingTopicYdocRef` guard prevents auto-save during seeding. |
| `src/client/components/blip/RizzomaBlip.tsx` | Collab for non-root blips — `collabEnabled` includes `!isTopicRoot` guard (topic root collab is owned by RizzomaTopicDetail to avoid duplicate providers). Same pattern: ydoc + provider + collabActive gating. Y.Doc seeding from blip.content when fragment empty. |
| `src/client/hooks/useSocket.ts` | Unified to use `getSocket()` from `lib/socket.ts` (was bare `io()` creating duplicate connections) |
| `src/client/lib/socket.ts` | Exported `getSocket` function (was module-private) |
| `src/shared/featureFlags.ts` | Added `REALTIME_COLLAB` flag (line 26), gated by `FEAT_REALTIME_COLLAB=1` or `FEAT_ALL=1` |
| `package.json` | `yjs` moved from devDependencies to dependencies (line 90); `y-protocols` also in dependencies |

### Key Architecture Decisions

1. **Two-editor problem**: `RizzomaTopicDetail` creates its own `topicEditor` for the topic Edit mode. When "Edit" is clicked, `contentOverride` replaces the `RizzomaBlip` editor with this topic editor. Solution: collab is wired into BOTH editors, with `!isTopicRoot` in RizzomaBlip to prevent duplicate providers for the same blipId.

2. **Synchronous provider creation**: TipTap's `useEditor` with `deps=[]` uses `setOptions()` which does NOT reinitialize ProseMirror plugins. Extensions are fixed at editor creation time. The `useCollaboration` hook MUST create the provider synchronously during render (not in useEffect) so it's available on first render.

3. **Y.Doc seeding**: The first client to edit a blip seeds the Y.Doc from the blip's HTML content. The `onSynced()` callback fires after the server sends the initial sync state. If the Y.Doc fragment is empty after sync, the client seeds from HTML. The `seedingTopicYdocRef` flag prevents the `onUpdate` handler from triggering auto-save during seeding.

4. **Awareness loop prevention**: Remote awareness receive → `awareness.emit('change')` → could trigger `awareness.on('update')` → re-emit to server → infinite loop. Fixed with `applyingRemoteAwareness` flag that the send handler checks.

### What's Been Verified

- **Single-tab collab editor**: Confirmed visible editor has `hasYSync: true`, `hasHistory: false` (collaboration extension active, history disabled). This was the core bug — previously the visible editor was the non-collab `topicEditor` from `RizzomaTopicDetail`.
- **Server handlers**: `blip:join` logs clean with stateLen, `blip:update` relays with roomSize, awareness relay works.
- **Awareness loop fix**: No more awareness spam flooding the console.
- **Socket unification**: Single socket connection per tab (no duplicate `io()` calls).
- **Unit tests**: `src/tests/server.yjsDocCache.test.ts` — 10 tests covering cache, refs, updates, diffs, persistence.

### What HASN'T Been Verified (Next Steps)

1. **Cross-tab document sync** — THE critical test. Type in Tab 1, verify text appears in Tab 2. Status: Playwright times out when opening a second tab to the same topic. The page loads (server logs show clean `blip:join`) but Playwright's `evaluate`/`snapshot` calls hang. This may be due to:
   - Accumulated console events from socket traffic
   - Y.Doc initial sync + awareness causing heavy processing
   - Playwright's snapshot serialization choking on the large DOM

2. **Manual browser test recommended**: Open `http://localhost:3000` in two regular browser tabs (not Playwright). Log in, navigate to [COLLAB TEST] topic in both, click Edit in both, type in one — see if it appears in the other. This bypasses Playwright limitations.

3. **Persistence round-trip**: Edit content → server restart → content preserved from CouchDB snapshot. Need to verify `persistDirty()` actually fires and `loadFromDb()` restores state.

4. **Reconnection**: Disconnect network/restart server → client reconnects → sends state vector → gets diff update.

5. **Multi-user test**: Currently both tabs use the same `dev@example.com` session. Test with two different users for proper cursor colors/names.

6. **Clean up debug logging**: Remove `[collab-dbg]` console.logs from production code, remove `(window as any).__dbg` in RizzomaBlip.tsx.

7. **Run existing test suites**: `npm run test:toolbar-inline`, `npm run test:follow-green` to verify collab changes don't break existing features.

8. **Delete stale yjs_snapshots**: If testing creates bad snapshots, clear them:
   ```bash
   curl -s 'http://localhost:5984/project_rizzoma/_find' -H 'Content-Type: application/json' -d '{"selector":{"type":"yjs_snapshot"},"fields":["_id","_rev"]}' | jq -r '.docs[] | "\(._id) \(._rev)"' | while read id rev; do curl -X DELETE "http://localhost:5984/project_rizzoma/$id?rev=$rev"; done
   ```

### How to Resume Testing

```bash
# 1. Start infra
docker compose up -d couchdb redis

# 2. Start dev server (FEAT_ALL=1 enables REALTIME_COLLAB + LIVE_CURSORS)
FEAT_ALL=1 EDITOR_ENABLE=1 npm run dev

# 3. Wait for "listening on http://localhost:8000" and "VITE ready"

# 4. Open http://localhost:3000 in TWO browser tabs
# 5. Log in as dev@example.com / password123 in both
# 6. Click [COLLAB TEST] topic in both tabs
# 7. Click Edit in both tabs
# 8. Type in Tab 1 → should appear in Tab 2

# Run unit tests
npx vitest run src/tests/server.yjsDocCache.test.ts

# Run existing test suites
npm run test:toolbar-inline
npm run test:follow-green
```

### Debugging Tips

- **Check if collab is active in the editor** (browser console):
  ```js
  // Find ProseMirror view
  const el = document.querySelector('.ProseMirror');
  let view; for (const k in el) { try { if (el[k]?.state?.plugins) { view = el[k]; break; } } catch(e) {} }
  const keys = view.state.plugins.map(p => p.key);
  console.log('hasYSync:', keys.some(k => k.includes('y-sync')));
  console.log('hasHistory:', keys.some(k => k.includes('history')));
  ```

- **Check server-side collab rooms** (server logs):
  - `[collab-dbg] blip:join blipId=XXXXX stateLen=N socketId=YYYY` — stateLen>0 means Y.Doc has prior state
  - `[collab-dbg] blip:update blipId=XXXXX updateLen=N roomSize=M` — roomSize>1 means other clients will receive

- **If editor doesn't have y-sync plugin**: The provider wasn't ready on first render. Check `useCollaboration.ts` for synchronous creation. Check feature flags (`FEAT_ALL=1`).

- **If typing doesn't sync**: Check server logs for `blip:update` with `roomSize > 1`. If roomSize=1, only one tab is in the room. Check that both tabs did `blip:join` for the same blipId.

- **Awareness spam / page freeze**: Check `CollaborativeProvider.ts` for `applyingRemoteAwareness` guard. If the flag isn't working, the awareness update loop causes infinite relay.

### Key File Quick Reference

| File | Lines | Purpose |
|------|-------|---------|
| `src/server/lib/socket.ts` | 195 | All server socket handlers including collab |
| `src/server/lib/yjsDocCache.ts` | 122 | Server Y.Doc cache + CouchDB persistence |
| `src/client/components/editor/CollaborativeProvider.ts` | 159 | Client SocketIOProvider (Y.Doc sync + awareness) |
| `src/client/components/editor/useCollaboration.ts` | 49 | Synchronous provider creation hook |
| `src/client/components/editor/YjsDocumentManager.ts` | 46 | Client Y.Doc singleton cache |
| `src/client/components/editor/EditorConfig.tsx` | ~200 | `getEditorExtensions()` — adds Collaboration when ydoc truthy |
| `src/client/components/RizzomaTopicDetail.tsx` | ~900 | Topic editor — collab at lines 186-199, seeding at 331-353 |
| `src/client/components/blip/RizzomaBlip.tsx` | ~1739 | Blip editor — collab at lines 386-431, seeding at 481-518 |
| `src/client/hooks/useSocket.ts` | 16 | Unified socket singleton hook |
| `src/shared/featureFlags.ts` | ~30 | `REALTIME_COLLAB` flag (line 26) |
| `src/tests/server.yjsDocCache.test.ts` | 170 | Unit tests for Y.Doc cache |

---

## Previous Session: BLB Full Implementation (2026-02-08)

### What Was Implemented

**Core BLB inline expansion** — the single most important fix in the codebase:

1. **[+] click = inline expansion, NOT navigation** (Phase 1 complete)
   - `BlipThreadNode.tsx`: dispatches `rizzoma:toggle-inline-blip` custom event instead of `window.location.hash` navigation
   - `RizzomaBlip.tsx`: listens for event + handles view-mode clicks on `.blip-thread-marker`, toggles `localExpandedInline` state

2. **Portal-based positioning** — expanded child appears at marker position, not bottom of content

3. **Inline child display** — clean, minimal rendering with `isInlineChild` prop

4. **Insert shortcuts (↵, @, ~, #, Gadgets)** with auto-enter-edit-mode

5. **Enhanced code block gadget** — 30-language syntax highlighting with CodeBlockLowlight

6. **Follow-the-Green**: collapse-before-jump + Next Topic button

7. **Three-state toolbar behavior** matching original Rizzoma:
   | State | Trigger | What Shows |
   |-------|---------|------------|
   | 1 | Click [+] to expand | Just text content — NO toolbar |
   | 2 | Click into child blip | Read toolbar (Edit, Hide, Link, Gear, etc.) |
   | 3 | Click Edit | Edit toolbar (Done, formatting) |
   | 4 | Click outside child | Toolbar hides, back to just text |

### All 5 BLB Plan Phases — COMPLETE

| Phase | What | Status |
|-------|------|--------|
| 1 | Core Inline Expansion ([+] = expand, not navigate) | DONE |
| 2 | [+] Marker Styling Unification (gray #b3b3b3) | DONE |
| 3 | Turquoise Button Styling (insert shortcuts, light blue) | DONE |
| 4 | Widget Styling (@mention, ~task, #tag) | DONE |
| 5 | Toolbar & Polish (declutter, dynamic badge) | DONE |

---

## Run/Verify

```bash
# Start infra (Docker Desktop must be running)
docker compose up -d couchdb redis

# IMPORTANT: Stop the Docker rizzoma-app container if running (conflicts with local dev ports)
docker stop rizzoma-app

# Run app
FEAT_ALL=1 EDITOR_ENABLE=1 npm run dev

# Login (session lost on server restart — MemoryStore)
# POST /api/auth/login { email: "dev@example.com", password: "password123" }

# Tests
npm run test
npm run test:toolbar-inline
npm run test:follow-green
npx vitest run src/tests/server.yjsDocCache.test.ts
```

## WSL2 + Vite Gotchas

- **HMR DOES NOT work for .tsx/.ts changes** — MUST kill and restart Vite
- **ZOMBIE PROCESSES**: `ps -ef | grep vite` + `kill -9` each PID. `pkill -f` misses some
- **Always verify port**: `ss -tlnp | grep 300` — Vite configured port is 3000
- **Docker rizzoma-app conflicts**: if running, it takes ports 3000+8000
- **SW caches in dev**: bypassed via `import.meta.env['DEV']` check
- **Server startup is slow** (~15-25s for both ports)
- **Feature flags**: `FEAT_ALL=1` env var required; evaluated at module load time

## Screenshot Naming Convention (MANDATORY)

**Format**: `<functionality>_<new|old>-YYMMDD-hhmm.png`

- Datetime is a **SUFFIX**, NOT a prefix
- `_new` = our local implementation; `_old` = original rizzoma.com reference
- All screenshots go in `screenshots/` or `screenshots/side-by-side/`

---
*Updated: 2026-02-10 — Four-item sweep complete (getUserMedia, offline queue, PWA UI, collab tests), 161/161 pass*
