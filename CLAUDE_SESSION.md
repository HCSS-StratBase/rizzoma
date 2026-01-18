# Claude Session Context (2026-01-18)

**Read this file first when resuming work on this project.**

## Current Branch
`feature/rizzoma-core-features` (main branch is `master`)

## Recent Session Summary

### What Was Fixed (2026-01-18)
1. **Perf harness `perf=full` mode** - Added support for `perf=full` URL param that loads all blips (vs `perf=1` which renders stubs only). This allows measuring full blip rendering performance.
   - File: `src/client/components/RizzomaTopicDetail.tsx:34-36` - Added `isPerfLeanMode` flag
   - File: `src/client/components/RizzomaTopicDetail.tsx:438-453` - Render real blips in `perf=full` mode
   - File: `perf-harness.mjs:11` - Changed perfQuery to `perf=full`

2. **N+1 API calls eliminated in perf mode** - Each blip was triggering 2 API calls (`/collapse-default` and `/inline-comments-visibility`). In perf mode, these are now skipped.
   - File: `src/client/components/blip/RizzomaBlip.tsx:126` - Changed `perf=1` check to `perf=` to match all perf modes
   - File: `src/client/components/blip/RizzomaBlip.tsx:664-666` - Added isPerfMode check to visibility preference useEffect

3. **Perf harness timing fix** - Harness was counting blips too early (before React finished rendering children). Now waits for expected label count.
   - File: `perf-harness.mjs:192-208` - Added waitForFunction to wait for all labels before counting
   - Results now correctly show all seeded blips rendered

4. **Previous session fixes preserved**:
   - Blips API 600x performance improvement (sort clause for CouchDB index)
   - bcrypt dev mode optimization (2 rounds vs 10)
   - Follow-green smoke test stabilization

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
2. **Mobile validation** - Test unread/follow-green/toolbar on mobile viewports
3. **Backup automation** - Automate `git bundle` + GDrive copy cadence

### Parity Gaps (not yet ported from CoffeeScript)
- Playback timeline/history UI
- Email notifications/invites (SMTP/templates)
- Gear menu copy/paste variants
- Mobile-specific layouts

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
| `src/client/hooks/useWaveUnread.ts` | Unread state management |
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
