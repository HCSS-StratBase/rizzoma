# Claude Session Context (2026-01-18)

**Read this file first when resuming work on this project.**

## Current Branch
`feature/rizzoma-core-features` (main branch is `master`)

## Recent Session Summary

### What Was Implemented (2026-01-18 - Evening Session)

**Major Feature Implementations:**

1. **Backup Automation Script** (`scripts/backup.sh`)
   - Git bundle creation with timestamps
   - Optional GDrive upload via rclone
   - Keeps last 5 local backups
   - Usage: `./scripts/backup.sh --gdrive --name mybackup`

2. **Blip Playback Timeline UI** (BlipHistoryModal rewrite)
   - `src/client/components/blip/BlipHistoryModal.tsx` - Timeline slider, playback controls
   - `src/client/components/blip/BlipHistoryModal.css` - Full styling with mobile support
   - Features: play/pause/step, speed control (0.5x-4x), diff view, visual timeline dots

3. **Email Notifications System**
   - `src/server/services/email.ts` - Nodemailer integration with templates
   - `src/server/routes/notifications.ts` - API endpoints for invites and preferences
   - Functions: `sendInviteEmail`, `sendNotificationEmail`, `sendDigestEmail`

4. **Gear Menu Copy/Paste Variants**
   - `POST /api/blips/:id/duplicate` - Duplicate blip as sibling
   - `POST /api/blips/:id/move` - Cut & paste (move blip to new parent)
   - Extended `clipboardStore.ts` with `isCut`, `getGlobalClipboard()`, `clearCutState()`
   - Added handlers in `RizzomaBlip.tsx`: `handleDuplicate`, `handleCut`, `handlePasteAsNewBlip`

**Cleanup & Modernization:**

5. **Removed Legacy Assets**
   - Deleted `src/static/` directory (5.2MB, 428+ files)
   - Migrated `getUserMediaAdapter.js` to `src/client/lib/`
   - Removed unused CoffeeScript files (21 files in `src/share/`, `src/*.coffee`)
   - Updated `tsconfig.json` to remove legacy references

6. **Security Fixes** (package.json updates)
   - `jsonwebtoken` ^9.0.3 - HMAC bypass vulnerability fix
   - `nodemailer` ^7.0.3 - DoS vulnerability fix
   - `bcrypt` ^6.0.0 - tar vulnerability fix

7. **Dependency Upgrades** (within major versions)
   - Removed deprecated: `aws-sdk` v2, `mandrill-api`
   - Updated: express ^4.22.1, redis ^4.7.1, vite ^5.4.21
   - Updated: typescript ^5.8.3, react ^18.3.1, socket.io ^4.8.1
   - Updated: All @tiptap packages to ^2.27.2
   - Updated: bcryptjs ^3.0.3, zod ^3.24.4, winston ^3.17.0

**TypeScript Fixes:**
   - Fixed unused variable warnings in multiple files
   - Fixed `visibility` type assertion in RizzomaBlip.tsx
   - Fixed bracket notation access for `process.env` and `dataset`

### Previous Session (2026-01-18 - Morning) - Mobile Modernization

Complete mobile PWA infrastructure with **zero new dependencies**:
- Foundation: breakpoints.css, useMediaQuery hooks, MobileContext
- BottomSheet component with touch-to-dismiss
- PWA: manifest.json, sw.js, icons, useServiceWorker
- Gestures: useSwipe, usePullToRefresh hooks
- View Transitions API wrapper
- Offline queue with retry logic

### Test Status
- **Vitest**: 42 files, 131 tests passing, 3 skipped (~110s) - verified 2026-01-18
- **Typecheck**: Passing
- All perf fixes verified working

## What's Left To Do

### Completed This Session
- ~~Backup automation~~ - DONE
- ~~Playback timeline/history UI~~ - DONE
- ~~Email notifications/invites~~ - DONE
- ~~Gear menu copy/paste variants~~ - DONE
- ~~Remove unused CoffeeScript files~~ - DONE
- ~~Remove legacy static assets~~ - DONE
- ~~Security vulnerability fixes~~ - DONE
- ~~Dependency upgrades (minor/patch)~~ - DONE
- ~~Remove deprecated packages~~ - DONE

### Remaining Tasks
1. **Mobile validation** - Test PWA on actual devices (iPhone Safari, Chrome Android)
2. **Major version upgrades** - Consider upgrading to:
   - express 5.x (breaking changes)
   - redis 5.x (breaking changes)
   - vite 7.x / vitest 4.x (major version jumps)
3. **AWS SDK v3 migration** - If S3 storage needed, migrate from v2 (now removed)

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
| `src/client/components/blip/BlipHistoryModal.tsx` | Timeline playback UI |
| `src/client/components/blip/BlipHistoryModal.css` | Playback UI styles |
| `src/client/components/blip/RizzomaBlip.tsx` | Blip with duplicate/cut/paste |
| `src/client/components/blip/clipboardStore.ts` | Clipboard state management |
| `src/client/lib/getUserMediaAdapter.js` | WebRTC media adapter |
| `src/server/routes/blips.ts` | Blips API with duplicate/move endpoints |

## Gotchas
- **CouchDB Mango queries**: Must include sort clause matching index fields
- **bcrypt in tests**: Use 2 rounds in dev, 10 in production
- **TypeScript process.env**: Use bracket notation `process.env['NODE_ENV']`
- **tsx watch mode hangs**: Kill all processes and restart if stuck

## Git Status Snapshot
Modified but uncommitted:
- Many source files with new features
- New files: `scripts/backup.sh`, email service, notification routes, BlipHistoryModal

Bundle backup recommended before major changes.

---
*Updated: 2026-01-18 after feature implementation session*
