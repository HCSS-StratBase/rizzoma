# Claude Session Context (2026-01-18)

**Read this file first when resuming work on this project.**

## Current Branch
`feature/rizzoma-core-features` (main branch is `master`)

## Recent Session Summary

### What Was Implemented (2026-01-18 - Late Night Session)

**Major Dependency Upgrades:**

1. **Express 4 → 5** - Full async middleware support
2. **Redis 4 → 5** - New client API
3. **Vite 5 → 7** - Requires Node 20.19+
4. **Vitest 1 → 4** - Updated test runner
5. **@vitejs/plugin-react → 5.0.0**

**AWS SDK v3 Migration:**
- Added `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` as optional dependencies
- Migrated `src/server/routes/uploads.ts` from AWS SDK v2 to v3
- Implemented lazy S3 initialization for test compatibility

**Legacy Cleanup (massive):**
- Removed 480 files, -66,949 net lines of code
- Deleted all CoffeeScript source files (`src/share/`, `src/*_index.coffee`)
- Deleted all legacy static assets (`src/static/` - images, CSS, jQuery plugins)
- Removed legacy test scripts (`run-test-with-global-playwright.js`, etc.)
- Added `public/android-app.svg` placeholder for PWA

### Previous Session (2026-01-18 - Evening)

**Major Feature Implementations:**

1. **Backup Automation Script** (`scripts/backup.sh`)
   - Git bundle creation with timestamps
   - Optional GDrive upload via rclone
   - Keeps last 5 local backups

2. **Blip Playback Timeline UI** (BlipHistoryModal rewrite)
   - Timeline slider, playback controls, diff view
   - Speed control (0.5x-4x), visual timeline dots

3. **Email Notifications System**
   - `src/server/services/email.ts` - Nodemailer integration
   - `src/server/routes/notifications.ts` - API endpoints

4. **Gear Menu Copy/Paste Variants**
   - `POST /api/blips/:id/duplicate` and `/move` endpoints
   - Extended clipboardStore with cut/paste support

### Test Status
- **Vitest**: 42 files, 131 tests passing, 3 skipped - verified 2026-01-18
- **Typecheck**: Passing
- **All tests passing** (editor hook timeouts fixed)

## What's Left To Do

### Completed This Session
- ~~Major version upgrades (Express 5, Redis 5, Vite 7, Vitest 4)~~ - DONE
- ~~AWS SDK v3 migration for S3 uploads~~ - DONE
- ~~Remove legacy CoffeeScript files~~ - DONE
- ~~Remove legacy static assets~~ - DONE
- ~~Remove legacy test scripts~~ - DONE
- ~~Fix editor test hook timeouts~~ - DONE
- ~~Add MODERNIZATION_COMPLETE.md~~ - DONE

### Remaining Tasks
**None** - Modernization is complete. Only optional mobile device validation remains (PWA is ready).

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
npm run perf:harness           # Perf benchmark

# Backup
./scripts/backup.sh --gdrive   # Create bundle and upload to GDrive

# Utilities
npm run snapshots:pull         # Fetch CI artifacts
curl http://localhost:8000/api/health  # Health check
```

## Key Files
| File | Purpose |
|------|---------|
| `scripts/backup.sh` | Backup automation script |
| `src/server/services/email.ts` | Email notification service |
| `src/server/routes/notifications.ts` | Notification API endpoints |
| `src/server/routes/uploads.ts` | S3/local file uploads (AWS SDK v3) |
| `src/client/components/blip/BlipHistoryModal.tsx` | Timeline playback UI |
| `src/client/components/blip/RizzomaBlip.tsx` | Blip with duplicate/cut/paste |
| `src/client/components/blip/clipboardStore.ts` | Clipboard state management |
| `src/client/lib/getUserMediaAdapter.js` | WebRTC media adapter |
| `src/server/routes/blips.ts` | Blips API with duplicate/move endpoints |

## Gotchas
- **CouchDB Mango queries**: Must include sort clause matching index fields
- **bcrypt in tests**: Use 2 rounds in dev, 10 in production
- **TypeScript process.env**: Use bracket notation `process.env['NODE_ENV']`
- **tsx watch mode hangs**: Kill all processes and restart if stuck
- **AWS SDK v3 dynamic imports**: Use `@vite-ignore` comment for optional imports
- **S3 initialization**: Lazy init in `ensureS3Initialized()` for test compatibility

## Git Status Snapshot
All changes committed to `feature/rizzoma-core-features`:
- Commit `e919e5c`: Major dependency upgrades and legacy cleanup (480 files, -66,949 lines)
- Commit `99102b7`: Mobile PWA modernization

Bundle backup recommended before major changes.

---
*Updated: 2026-01-18 after dependency upgrade session*
