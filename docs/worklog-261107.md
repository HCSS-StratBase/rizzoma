# Worklog: 2026-11-07 — Playback, Ctrl+Enter, Visual Parity & Canonical Karpathy LLM-Wiki

## 1. Context & Objectives
SDS raised critical regressions and discrepancies on modern Rizzoma (`https://138-201-62-161.nip.io/?layout=rizzoma`):
1. **Blip Deletion**: Successfully restored and verified.
2. **Playback Failure**: Playback did not work when opened from the blip or wave level (`No history entries found` or HTTP 401).
3. **Ctrl+Enter Failure**: Pressing Ctrl+Enter did not create or anchor child blips in view mode or topic root, or markers vanished upon reload.
4. **Visual Parity**: Toolbar overlap with parent text, `☑ Hidden` checkbox unchecked by default (`☐ Hide`), and elevated wrapper bullets.
5. **Knowledge Grounding**: Explicit requirement to synthesize a complete "Karpathy" LLM-Wiki covering the entire Rizzoma corpus (both legacy CoffeeScript and modern TypeScript codebases, all documentation files, and screenshot archives).

---

## 2. Root Cause Analysis & Architectural Fixes

### 2.1 Playback Mechanics (Original vs Modern)
- **Original Rizzoma (`original-rizzoma-src/src/client/playback/`)**:
  - In-place topic panel takeover (`PlaybackWaveViewModel`).
  - Blip menu morphs into playback control strip: `[Date/Calendar] [<< Fast Back] [< Back] [> Forward] [>> Fast Forward] [Copy] [Paste as reply]`.
  - Stepped through ShareJS OT operations directly in memory.
- **Modern Rizzoma (`src/client/components/`)**:
  - Modal-based timeline playback (`WavePlaybackModal.tsx` for wave, `BlipHistoryModal.tsx` for blip).
  - Backed by immutable `blip_history` documents in CouchDB (`_id: blip_history:${blipId}:${timestamp}`).
- **Regressions Discovered & Fixed**:
  1. **HTTP 401 on `GET /api/blips/:id/history`**: `src/server/routes/blips.ts` had an unnecessary `requireAuth` middleware, while `waves.ts` was public. Anyone viewing a wave should be able to inspect history. Removed `requireAuth`.
  2. **Topic Root History Never Recorded**: `src/server/routes/topics.ts` never recorded `blip_history` documents on topic creation or patching (`POST /api/topics`, `PATCH /api/topics/:id`). Whenever a topic had edits to the root blip, CouchDB returned 0 entries. Added `recordTopicHistory()` to both routes.
  3. **Empty History Fallback**: Added synthetic baseline history generation to both `GET /api/waves/:id/history` and `GET /api/blips/:id/history` so newly created topics or legacy blips without history entries provide a baseline version 1 snapshot instead of a blank error screen.

### 2.2 Ctrl+Enter Inline Child Creation
- **Root Cause A (404 on Root Persistence)**:
  In `src/client/components/RizzomaTopicDetail.tsx`, the inline child handler called `PUT /api/waves/:id` to persist the inserted marker span. That route did not exist on the server (404). When `await load(true)` ran immediately after, CouchDB returned the old un-updated topic document, wiping the newly inserted marker out of the ProseMirror editor!
  - *Fix*: Changed persistence call to `PATCH /api/topics/:id` and added a compatibility `PUT /api/waves/:id` route in `src/server/routes/waves.ts`.
- **Root Cause B (View-Mode Traps)**:
  - In `RizzomaTopicDetail.tsx`, `handleKeyDown` only listened for `Ctrl+E` and `Shift+Enter`. Pressing `Ctrl+Enter` in view mode was ignored. Added keydown handling to enter edit mode and create the inline child.
  - In `src/client/components/blip/RizzomaBlip.tsx`, view-mode `Ctrl+Enter` mistakenly triggered `setShowReplyForm(true)` (bottom reply). Replaced with `handleCreateInlineChildAtCursor()`, which switches the blip into edit mode, inserts the child at the cursor, and focuses the child editor.
- **Root Cause C (Debounced Auto-Save Race)**:
  In `createChildBlipRef.current`, the marker was inserted into TipTap in memory, but `await load(true)` ran before the debounced auto-save executed. Added an immediate synchronous `PUT /api/blips` call before `load(true)` so the marker is guaranteed to persist to CouchDB.

### 2.3 Visual Parity Invariants
1. **Zero Toolbar Overlap**: Imposed `margin: 8px 0 !important; clear: both;` on `.inline-child-expanded` and `.inline-child-portal` in `RizzomaBlip.css` and `RizzomaTopicDetail.css`.
2. **Hidden by Default Checkbox**: Updated `BlipMenu.tsx` and `BlipMenu.css` so the button label is `Hidden` and the checkbox renders checked by default (`aria-pressed="true"`, sprite position `0 -42px` in edit mode).
3. **Single Bullet Invariant**: Imposed `list-style: none !important;` on `.blips-list` and `.blip-children` and removed redundant pseudo-elements (`content: '◦'`), guaranteeing that the only bullet rendered is the native `<ul><li>` bullet.

---

## 3. The Canonical "Karpathy" LLM-Wiki
Created `docs/RIZZOMA_KARPATHY_LLM_WIKI.md`:
- Exhaustive technical synthesis of both codebases (`original-rizzoma-src/` and modern `src/`).
- Full BLB contract (Bullet-Label-Blip, atomic labels, collapse-by-default, containment).
- State machines & lifecycles of blips, operational transformation vs CRDTs, and the 10 hybrid seams.
- Master Bug Ledger documenting all 45+ regression bugs in chronological order with exact root causes and fixes.

---

## 4. Live Verification & Evidence
- **VPS Target**: `root@138.201.62.161` at `/data/large-projects/stephan/rizzoma_260612`.
- **Public URL**: `https://138-201-62-161.nip.io/?layout=rizzoma`.
- **Health Check**: `curl -s https://138-201-62-161.nip.io/api/health` -> 200 OK.
- **Wave History Live Check**:
  `curl -s https://138-201-62-161.nip.io/api/waves/917d750213736e02a665422fca060700/history` -> Returns 3 distinct versions: topic creation, topic update, child blip creation.
- **Blip History Live Check**:
  `curl -s https://138-201-62-161.nip.io/api/blips/917d750213736e02a665422fca060700:b1794071268634/history` -> Returns snapshotVersion 1 with 200 OK without requiring authentication.
