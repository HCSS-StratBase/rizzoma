# Claude Session Context (2026-01-20)

**Read this file first when resuming work on this project.**

## Current Branch
`feature/rizzoma-core-features` (main branch is `master`)

## Latest Session (2026-01-20) - OAuth & Avatar Updates

### What Was Implemented

1. **Microsoft OAuth Authentication**
   - Routes: `/api/auth/microsoft`, `/api/auth/microsoft/callback`
   - Supports personal and work accounts via `MICROSOFT_TENANT` env var
   - Added to AuthPanel with button styling

2. **SAML 2.0 Authentication**
   - Created `src/server/lib/saml.ts` for SAML config management
   - Routes: `/api/auth/saml`, `/api/auth/saml/callback`, `/api/auth/saml/metadata`
   - Uses `@node-saml/node-saml` library

3. **User Avatar from OAuth Providers**
   - Google: Saves `picture` field from userinfo endpoint
   - Facebook: Saves picture from Graph API with 200x200 size
   - Microsoft: No direct avatar URL (would require binary download)
   - `/api/auth/me` now returns `avatar` field
   - `RightToolsPanel.tsx` displays OAuth avatar with Gravatar fallback

4. **Rizzoma Layout as Default**
   - Changed `main.tsx` to use Rizzoma layout unless `?layout=basic`

5. **Documentation Updates**
   - Updated `docs/ARCHITECTURE.md` with avatar info and session structure
   - Created `CHANGELOG.md` with full project history

### Environment Variables Added
```bash
CLIENT_URL=http://localhost:3001  # For OAuth redirect back to frontend
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_TENANT=common  # or specific tenant ID
SAML_ENABLED=true
SAML_ENTRY_POINT=https://your-idp/sso/saml
SAML_ISSUER=https://your-app
SAML_CERT=-----BEGIN CERTIFICATE-----...
```

### Original Rizzoma CSS Reference (Topic Title Styling)
Found in original source files for future styling reference:
- Wave/Topic title in list: `font-size: 15px`, `height: 35px` (search.css)
- Root blip first line: `font-size: 18px`, `font-weight: bold` (blip.css:79-82)

---

## CRITICAL: Ctrl+Enter Keyboard Behavior (2026-01-20)

### User Requirement (CLARIFIED)

> **"Blips ARE just bulleted lists!!!"** - User explicitly stated this

**Ctrl+Enter should create INLINE nested bullets at cursor position, NOT separate blip documents.**

The user clarified that when they press Ctrl+Enter:
- It should split the text at cursor
- Insert a new nested (indented) bullet INLINE
- Stay within the SAME blip's content
- NOT call any API to create a new blip document
- NOT show "Untitled blip" below the content

### Implementation Status

**Files Modified:**

1. **`src/client/components/editor/extensions/BlipKeyboardShortcuts.ts`** (CREATED)
   - TipTap extension for Tab, Shift+Tab, Ctrl+Enter
   - **Tab**: `sinkListItem('listItem')` - indent
   - **Shift+Tab**: `liftListItem('listItem')` - outdent
   - **Ctrl+Enter**: `splitListItem` + `sinkListItem` - inline nested bullet
   - Does NOT call `onCreateChildBlip` callback anymore

2. **`src/client/components/editor/EditorConfig.tsx`** (MODIFIED)
   - Added `BlipKeyboardShortcuts` extension
   - Passes `onCreateChildBlip` callback (but it's not used by Ctrl+Enter handler)

3. **`src/client/components/blip/RizzomaBlip.tsx`** (MODIFIED)
   - `stableCreateChildBlip` callback still exists but NOT called by Ctrl+Enter
   - DOM keydown handler at lines ~818-836 only runs when NOT editing

### What Works

- **Tab**: Indents bullets ✅
- **Shift+Tab**: Outdents bullets ✅
- **Enter**: New line/bullet at same level ✅ (TipTap default)
- **Ctrl+Enter**: Creates inline nested bullet... **PARTIALLY** - user says still not working correctly

### What's Still Broken

The user says Ctrl+Enter is "still not inline". Need to investigate further.

Possible issues:
1. The `splitListItem` + `sinkListItem` chain might not work as expected
2. There might be another handler intercepting the event
3. The cursor position detection might be wrong

### Key Insight from User

The old behavior showed "Untitled blip" documents BELOW the content container. This was wrong because:
- It created separate database documents via API
- Each had its own author/timestamp
- They appeared as collapsed child blips, not inline content

The correct behavior should:
- Keep everything WITHIN the same blip's content field
- Use TipTap commands to manipulate the document structure
- NOT call any API endpoints

See `docs/BLB_LOGIC_AND_PHILOSOPHY.md` section 12 for full documentation of this clarification.

---

## Recent Session Summary

### What Was Attempted (2026-01-20 - Ctrl+Enter Fix Session)

**Goal:** Fix Ctrl+Enter to create INLINE nested bullets instead of separate blip documents.

**Changes Made:**

1. Created `BlipKeyboardShortcuts.ts` TipTap extension
2. Implemented Mod-Enter handler using `splitListItem` + `sinkListItem`
3. Tab and Shift+Tab work correctly for indent/outdent
4. Removed debug console.log

**Status:** Tab/Shift+Tab work. Ctrl+Enter PARTIALLY works but user says still not fully inline.

**Console Logs When Testing:**
- `[BlipKeyboardShortcuts] Mod-Enter handler called` - confirms TipTap extension is handling the event
- No `stableCreateChildBlip` called anymore (good - no API calls)
- Content splits and indents, but behavior may not match user expectation

**Next Steps:**
- Investigate what "inline" specifically means to user
- May need different TipTap command sequence
- Consider cursor position handling

---

### What Was Implemented (2026-01-19 - BLB Audit & Fix Session)

**BLB (Bullet-Label-Blip) Implementation Audit & Fix:**

The BLB functionality was audited against documentation and several critical issues were found and fixed:

**Root Cause Discovery:**
- `RizzomaBlip.tsx` had full BLB functionality but wasn't being used
- `RizzomaTopicDetail.tsx` was the active component but had broken/missing BLB features
- The "☑ Hidden" button in edit mode had NO onClick handler (completely non-functional)

**Fixes Applied:**

1. **`RizzomaTopicDetail.tsx`** - Major BLB wiring:
   - Added `foldedBlips` state and `toggleFold()` function
   - Wired up Fold button in both edit and view mode toolbars
   - Fold state persists to localStorage AND server (`/api/blips/{id}/collapse-default`)
   - Changed expand icon from `+` to `□` for collapsed blips
   - Added `isBlipFolded()` helper that checks both local state and preferences

2. **`RizzomaTopicDetail.css`** - Added Fold button styles:
   - `.tb-btn.fold-btn` base styles
   - `.tb-btn.fold-btn.active` for folded state (green highlight)

3. **`BlipMenu.tsx`** - Removed duplicate buttons:
   - Deleted 2 duplicate "Show/Hide" buttons from read mode toolbar
   - Kept single "Fold" button

4. **`RizzomaBlip.tsx`** - Updated expand icons:
   - Changed `+` to `□` for collapsed blips
   - Updated child blip expand buttons to use `□`

5. **`docs/BLB_LOGIC_AND_PHILOSOPHY.md`** - Updated terminology:
   - Changed "☐ Hide checkbox" → "Fold button" throughout
   - Updated visual elements table
   - Updated developer summary

**BLB Feature Status:**
| Feature | Status |
|---------|--------|
| Fold button in edit mode | ✅ Working |
| Fold button in view mode | ✅ Working |
| Fold state persistence (localStorage) | ✅ Working |
| Fold state persistence (server) | ✅ Working |
| Expand icon (□) | ✅ Updated |
| Collapsed blip shows label only | ✅ Working |
| Nested blips | ✅ Working |

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

**CRITICAL: Fix Ctrl+Enter to Create INLINE Nested Bullets**
- [x] Created `BlipKeyboardShortcuts.ts` TipTap extension - DONE
- [x] Tab/Shift+Tab work correctly - DONE
- [x] Enter works for new line/bullet - DONE (TipTap default)
- [ ] **Ctrl+Enter still needs work** - User says not fully inline
  - Current: Uses `splitListItem` + `sinkListItem`
  - User wants: Split text at cursor, indent new bullet, all WITHIN same blip
  - Issue: Unclear what specific behavior is wrong

**Key Understanding:**
- Blips ARE bulleted lists (BLB philosophy)
- Nested bullets are INLINE content, not separate documents
- "Write a reply..." is for creating truly separate child blips
- Ctrl+Enter should be a quick way to add nested inline content

**Optional:**
- Mobile device validation (PWA is ready)

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
| `docs/BLB_LOGIC_AND_PHILOSOPHY.md` | BLB methodology + keyboard shortcuts documentation |
| `src/client/components/RizzomaTopicDetail.tsx` | **Main topic view with BLB Fold functionality** |
| `src/client/components/blip/BlipMenu.tsx` | Blip toolbar with Done/Edit buttons |
| `src/client/components/blip/RizzomaBlip.tsx` | Blip component - passes `onCreateChildBlip` callback (not used by Ctrl+Enter) |
| `src/client/components/editor/EditorConfig.tsx` | TipTap editor extensions configuration |
| `src/client/components/editor/extensions/BlipKeyboardShortcuts.ts` | **KEY FILE: Tab/Shift+Tab/Ctrl+Enter handlers - Ctrl+Enter still needs fixing** |
| `src/client/components/editor/extensions/` | Custom TipTap extensions (Underline, TextColor, etc.) |
| `src/client/components/blip/collapsePreferences.ts` | Fold state localStorage persistence |
| `src/client/components/blip/clipboardStore.ts` | Clipboard state management |
| `src/client/components/blip/BlipHistoryModal.tsx` | Timeline playback UI |
| `scripts/backup.sh` | Backup automation script |
| `src/server/services/email.ts` | Email notification service |
| `src/server/routes/uploads.ts` | S3/local file uploads (AWS SDK v3) |
| `src/server/routes/blips.ts` | Blips API with duplicate/move/collapse endpoints |

## Gotchas
- **CouchDB Mango queries**: Must include sort clause matching index fields
- **bcrypt in tests**: Use 2 rounds in dev, 10 in production
- **TypeScript process.env**: Use bracket notation `process.env['NODE_ENV']`
- **tsx watch mode hangs**: Kill all processes and restart if stuck
- **AWS SDK v3 dynamic imports**: Use `@vite-ignore` comment for optional imports
- **S3 initialization**: Lazy init in `ensureS3Initialized()` for test compatibility
- **TipTap keyboard shortcuts**: Use `addKeyboardShortcuts()` in extensions, NOT DOM-level handlers. DOM handlers block TipTap's natural ListItem Enter/Tab handling!

## Git Status Snapshot
All changes committed to `feature/rizzoma-core-features`:
- Commit `e919e5c`: Major dependency upgrades and legacy cleanup (480 files, -66,949 lines)
- Commit `99102b7`: Mobile PWA modernization

Bundle backup recommended before major changes.

---
*Updated: 2026-01-20 after Ctrl+Enter inline bullet fix attempt session*
