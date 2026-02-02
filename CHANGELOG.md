# Changelog

All notable changes to the Rizzoma project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added
- **BLB parity snapshots** - Automated BLB snapshot set captured for legacy comparison
- **BLB parity checklist** - `docs/BLB_PARITY_CHECKLIST.md`
- **BLB snapshot assertions** - Snapshot harness now verifies collapsed/default, toolbar, inline, and unread states
- **Dependency upgrade audit** - `docs/DEPENDENCY_UPGRADE_AUDIT.md` with major/minor staging plan
- **Backup script** - `scripts/backup-bundle.sh` to create bundles and copy to GDrive
- **Topic follow API** - `/api/topics/:id/follow` and `/api/topics/:id/unfollow` endpoints with persisted follow docs
- **Topics list enrichment** - Topics payload now includes author metadata, snippets, and follow state for signed-in users
- **Topics follow tests** - `src/tests/routes.topics.follow.test.ts` coverage for follow/unfollow and list enrichment
- **Microsoft OAuth Authentication** - Users can now sign in with Microsoft accounts
  - Supports both personal and work/school accounts via configurable tenant
  - Routes: `/api/auth/microsoft`, `/api/auth/microsoft/callback`
- **SAML 2.0 Authentication** - Enterprise SSO support
  - SP metadata endpoint: `/api/auth/saml/metadata`
  - Configurable via `SAML_*` environment variables
  - Uses `@node-saml/node-saml` library
- **User Avatar from OAuth Providers** - Profile pictures now display from Google/Facebook
  - Avatar stored in user document and session
  - Gravatar fallback for users without OAuth avatar
  - Displayed in RightToolsPanel (56x56px circular)
- **Comprehensive Architecture Documentation** - `docs/ARCHITECTURE.md`
  - Layout system configuration
  - OAuth provider setup
  - Component hierarchy
  - Styling architecture
  - Development notes including Vite HMR issues

### Changed
- **BLB default behavior** - All blips start collapsed; inline `[+]` expands in place
- **BLB toolbars** - Read/edit toolbars aligned to legacy (Hide/Show comments, Link, Hide, Delete, Gear)
- **BLB expansion focus** - Expanding a collapsed blip now marks it active so the toolbar appears immediately
- **BLB read toolbar** - Added explicit Collapse/Expand buttons in view mode for legacy parity
- **BLB docs alignment** - Topic pane diagram + view/edit toolbar notes now match live screenshots
- **Dependency maintenance** - Applied minor/patch updates for Playwright/Vitest/Prettier, AWS SDK, and session/email utilities
- **Topic meta-blip body** - Topic content + child blips now share a single scroll container so the title is the first line of one unified pane
- **Rizzoma Layout is now the default** - Basic layout requires `?layout=basic`
- **OAuth redirect flow** - Now uses `CLIENT_URL` environment variable for proper redirect to frontend
- **Session structure** - Now includes `userAvatar` field for OAuth profile pictures
- **Perf wave fetches** - Perf mode can raise `/api/blips` limits via `perfLimit` to pull full wave sets during harness runs
- **Perf harness windowed metrics** - Perf harness now records the time to render the first 200 labels/blips for large waves
- **Perf history writes** - Blip history writes are skipped when requests include `x-rizzoma-perf=1`
- **Perf mode detection** - `perf=full` now triggers perf-mode skips (unread/sidebar) like `perf=1`
- **Perf render mode** - `perfRender=lite` renders lightweight collapsed rows for large-wave perf runs
- **Perf harness benchmarks** - Benchmarks now use per-stage duration (from stage start) to avoid double-counting navigation time
- **Playwright auth check** - Toolbar + Follow-the-Green smokes now wait for the modern layout instead of a legacy Logout button
- **CORS allowlist defaults** - Added `127.0.0.1` dev origins so Playwright can auth against localhost/127.0.0.1
- **BLB [+] navigation** - Inline blip markers now navigate into subblip documents instead of expanding inline; topic/blip Ctrl+Enter navigates into the new subblip after inserting the marker

### Fixed
- **BLB unread cues** - Unread state now propagates to collapsed rows and inline markers
- **BLB inline marker clicks** - Event delegation now uses `closest()` and capture phase to keep inline marker toggles responsive in view mode
- **Perf harness landing selector** - Perf harness now waits for `.blip-collapsed-row` instead of legacy `.blip-collapsed-label`
- **BLB export** - JSON export now serializes `isFoldedByDefault`
- **dotenv loading** - Added `import 'dotenv/config'` to ensure .env file is loaded

## [2026-01-19]

### Added
- **BLB (Bullet-Label-Blip) Fold functionality** - Full implementation
  - Fold button in edit and view mode toolbars
  - Fold state persists to localStorage and server
  - Changed expand icon from `+` to `□`
- **BLB Logic and Philosophy documentation** - `docs/BLB_LOGIC_AND_PHILOSOPHY.md`

### Fixed
- **Fold button in edit mode** - Was completely non-functional, now wired up
- **Duplicate toolbar buttons** - Removed duplicate Show/Hide buttons from BlipMenu

## [2026-01-18]

### Added
- **Major dependency upgrades**:
  - Express 4 → 5 (full async middleware support)
  - Redis 4 → 5 (new client API)
  - Vite 5 → 7 (requires Node 20.19+)
  - Vitest 1 → 4
  - @vitejs/plugin-react → 5.0.0
- **AWS SDK v3 migration** - S3 uploads now use modular `@aws-sdk/client-s3`
- **Mobile PWA infrastructure** - Complete mobile modernization:
  - Responsive breakpoints
  - MobileProvider context
  - BottomSheet component
  - PWA manifest and service worker
  - Gesture hooks (useSwipe, usePullToRefresh)
  - View Transitions API support
  - Offline queue with mutation retry
- **Backup automation script** - `scripts/backup.sh` with GDrive upload support
- **Blip playback timeline UI** - BlipHistoryModal with timeline slider and diff view
- **Email notifications system** - Nodemailer integration
- **Gear menu copy/paste** - Duplicate and move blip endpoints

### Removed
- **Legacy CoffeeScript files** - All `src/share/` and `*.coffee` files
- **Legacy static assets** - All `src/static/` (images, CSS, jQuery plugins)
- **Legacy test scripts** - Old Playwright test runners
- **480 files, -66,949 lines of code** total legacy cleanup

### Fixed
- **N+1 API calls** - Perf mode skips individual `/inline-comments-visibility` calls
- **Blips API performance** - CouchDB index usage (18s → 29ms, 600x improvement)
- **Editor test hook timeouts**

## [2026-01-17]

### Fixed
- **Blips API query performance** - Added proper CouchDB Mango index

## Earlier History

For changes before 2026-01-17, see git history on the `feature/rizzoma-core-features` branch.

---

*This changelog was started on 2026-01-20.*
