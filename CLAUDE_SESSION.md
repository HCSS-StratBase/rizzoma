# Claude Session Context (2026-01-18)

**Read this file first when resuming work on this project.**

## Current Branch
`feature/rizzoma-core-features` (main branch is `master`)

## Recent Session Summary

### What Was Implemented (2026-01-18) - Mobile Modernization

Complete mobile PWA infrastructure with **zero new dependencies** (all native browser APIs):

**Phase 1 - Foundation:**
- `src/client/styles/breakpoints.css` - CSS variables for responsive breakpoints (320/480/768/1024/1200)
- `src/client/hooks/useMediaQuery.ts` - Media query hooks (`useIsMobile`, `useIsTablet`, `useIsDesktop`, `useIsTouchDevice`, etc.)
- `src/client/contexts/MobileContext.tsx` - React context for mobile state (`useMobileContext`)

**Phase 2 - Bottom Sheet Component:**
- `src/client/components/mobile/BottomSheet.tsx` - Reusable slide-up bottom sheet with touch-to-dismiss
- `src/client/components/mobile/BottomSheet.css` - Styles with safe area support
- `src/client/components/mobile/BottomSheetMenu.tsx` - Menu variant with `createBlipMenuItems` helper

**Phase 3 - PWA Support:**
- `public/manifest.json` - Web app manifest for installability
- `public/sw.js` - Service worker (cache-first for assets, network-first for API)
- `src/client/hooks/useServiceWorker.ts` - SW registration and update handling
- `public/icons/` - 8 SVG icons (72-512px sizes)
- `src/client/index.html` - Added PWA meta tags, manifest link, apple-touch-icon

**Phase 4 - Gesture Support:**
- `src/client/hooks/useSwipe.ts` - Swipe detection (`useSwipe`, `useSwipeToDismiss`, `useHorizontalSwipe`)
- `src/client/hooks/usePullToRefresh.ts` - Pull-to-refresh with visual indicator

**Phase 5 - View Transitions:**
- `src/client/hooks/useViewTransition.ts` - View Transitions API wrapper with reduced-motion support
- `src/client/styles/view-transitions.css` - Slide and fade animations for navigation

**Phase 6 - Offline Support:**
- `src/client/lib/offlineQueue.ts` - Mutation queue with retry logic, localStorage persistence
- `src/client/hooks/useOfflineStatus.ts` - Online/offline state, pending mutations tracking

**Integration:**
- `src/client/main.tsx` - Wrapped with `MobileProvider`, added SW registration, offline toasts
- `src/client/components/RizzomaLayout.tsx` - Mobile view switching, swipe navigation, mobile header
- `src/client/components/RizzomaLayout.css` - Mobile layout styles with transitions
- `src/client/components/blip/BlipMenu.tsx` - Integrated `BottomSheetMenu` for mobile

### Previous Session Fixes (preserved):
1. **Perf harness `perf=full` mode** - Loads all blips for full render measurement
2. **N+1 API calls eliminated** - Skipped in perf mode
3. **Perf harness timing fix** - Waits for all labels before counting
4. **Blips API 600x improvement** - CouchDB index sort clause
5. **bcrypt dev mode optimization** - 2 rounds vs 10

### Test Status
- **Vitest**: 42 files, 131 tests passing, 3 skipped (~110s) - verified 2026-01-18
- **Perf harness E2E**: N+1 fix verified - no individual `/inline-comments-visibility` calls (was 20+ calls, now 0)
- **Timing fix verified**: "All 21 labels loaded", load done in 298ms
- **Health checks**: CI-gated via `npm run test:health`

## What's Left To Do

### Priority Tasks
1. ~~**CI gating for perf budgets**~~ - DONE: Added `perf-budgets` job to CI pipeline
   - Uses `RIZZOMA_PERF_BLIPS=50` for CI runs
   - Set `RIZZOMA_PERF_ENFORCE_BUDGETS=1` to make budget failures block CI
   - Currently set to warn-only (ENFORCE_BUDGETS=0)
2. ~~**Mobile-specific layouts**~~ - DONE: Mobile modernization implemented (see above)
3. **Mobile validation** - Test mobile PWA on actual devices (iPhone Safari, Chrome Android)
4. **Backup automation** - Automate `git bundle` + GDrive copy cadence

### Parity Gaps (not yet ported from CoffeeScript)
- Playback timeline/history UI
- Email notifications/invites (SMTP/templates)
- Gear menu copy/paste variants

### Cleanup
- Migrate remaining CoffeeScript entrypoints
- Drop unused legacy static assets
- Dependency upgrades

## Key Commands
```bash
# Start services
docker compose up -d couchdb redis

# Run app
npm run dev                    # Dev server (set EDITOR_ENABLE=1 if needed)

# Tests
npm test                       # Full Vitest suite
npm run test:toolbar-inline    # Playwright toolbar smoke
npm run test:follow-green      # Playwright follow-green smoke
npm run test:health            # Health/uploads/inline-comments tests
npm run perf:harness           # Perf benchmark (seeds blips, uses perf=full mode)

# Perf harness options
RIZZOMA_PERF_BLIPS=100 npm run perf:harness  # Test with 100 blips (faster)
RIZZOMA_PERF_BLIPS=1000 npm run perf:harness # Test with 1000 blips
RIZZOMA_PERF_ENFORCE_BUDGETS=1 npm run perf:harness  # Exit with code 1 on budget failure

# Utilities
npm run snapshots:pull         # Fetch CI artifacts
curl http://localhost:8000/api/health  # Health check
```

## Key Files
| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project instructions (read by Claude Code) |
| `TESTING_STATUS.md` | Test run log and gaps |
| `RIZZOMA_FEATURES_STATUS.md` | Feature parity tracker |
| `src/server/routes/blips.ts` | Blips API (perf-critical, has sort fix) |
| `src/client/components/RizzomaTopicDetail.tsx` | Topic view with perf modes |
| `src/client/components/blip/RizzomaBlip.tsx` | Blip component (N+1 fix here) |
| `src/client/components/RizzomaLayout.tsx` | Layout with mobile view switching |
| `src/client/hooks/useWaveUnread.ts` | Unread state management |
| `src/client/hooks/useMediaQuery.ts` | Responsive breakpoint hooks |
| `src/client/contexts/MobileContext.tsx` | Mobile state context provider |
| `src/client/components/mobile/BottomSheet.tsx` | Mobile bottom sheet component |
| `src/client/hooks/useSwipe.ts` | Touch gesture detection |
| `src/client/hooks/useServiceWorker.ts` | PWA service worker registration |
| `src/client/lib/offlineQueue.ts` | Offline mutation queue |
| `public/manifest.json` | PWA manifest |
| `public/sw.js` | Service worker (caching) |
| `test-follow-green-smoke.mjs` | Multi-user Playwright smoke |
| `test-toolbar-inline-smoke.mjs` | Toolbar Playwright smoke |
| `perf-harness.mjs` | Performance benchmark script |

## Perf Mode Reference
- `perf=1` (lean mode): Renders stubs, skips blip fetch, skips N+1 preference calls - for landing page timing
- `perf=full` (full mode): Loads all blips, skips N+1 preference calls - for full render performance

## Gotchas
- **CouchDB Mango queries**: Must include sort clause matching index fields or queries do full table scans
- **bcrypt in tests**: Use 2 rounds in dev, 10 in production
- **Auto-navigation**: `RightToolsPanel` auto-marks blips read on wave load; disable with `localStorage.setItem('rizzoma:test:noAutoNav', '1')`
- **WebSocket + networkidle**: Don't use `waitUntil: 'networkidle'` in Playwright - WebSocket keeps connection open
- **TypeScript process.env**: Use bracket notation `process.env['NODE_ENV']` not dot notation
- **Server restart after edits**: Vite hot-reloads client changes, but sometimes full restart is needed
- **tsx watch mode hangs**: If `npm run dev` hangs with no backend output, kill all tsx processes: `pkill -9 -f "tsx\|vite\|concurrently"` and restart. Sometimes tsx watch mode gets stuck tracking dependencies.

## Git Status Snapshot
Modified but uncommitted:
- Multiple source files (see `git status`)
- New untracked files in `scripts/`, `snapshots/`, `.venv/`

Bundle backup created at: `/mnt/c/Rizzoma/rizzoma.bundle`

---
*This file is auto-generated for session continuity. Update after significant changes.*
