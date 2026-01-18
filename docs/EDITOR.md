# Editor (TipTap + Yjs)

Status: Milestone B+ (IN PROGRESS). Feature‑flagged; safe to keep merged.

## Enable
- Set `EDITOR_ENABLE=1` in the server environment.

## Components
- Client: `src/client/components/Editor.tsx`
  - Creates a `Y.Doc` and mounts TipTap with Collaboration extension.
  - Realtime: listens to `ydoc` updates and POSTs incrementals to `/api/editor/:waveId/updates` with a running `seq`; subscribes to `editor:update` and applies remote updates.
  - Room scoping: emits `editor:join { waveId, blipId?, userId? }` on mount; emits `editor:leave` on unmount.
- Client: `src/client/components/EditorSearch.tsx`
  - Simple UI at `#/editor/search` to hit `/api/editor/search?q=&limit=` and list `{ waveId, blipId?, updatedAt? }` results.
  - Results link into `WaveView` and focus the matching blip when `blipId` is present.
- Client: `src/client/components/EditorAdmin.tsx`
  - Dev-only helper at `#/editor/admin` that calls `/api/editor/search` with a small sample query to surface a few recent snapshots.
  - Intended for development/debugging; main user-facing search is `EditorSearch`.
- Client: `src/client/components/blip/BlipMenu.tsx`
  - Inline toolbar used in the Rizzoma layout; mirrors the shared `EditorToolbar` controls (undo/redo, bold/italic/underline/strike, lists, clear formatting, link/image/attachment placeholders).
  - Hooks directly into TipTap commands via the `Editor` instance and reflects active mark state via `selectionUpdate`/`transaction` events.
  - Hide/Show comments button now toggles the `InlineComments` plugin per blip and persists the preference per user via `localStorage` so multiple editor surfaces remain in sync.
  - Overflow ("Other"/gear) menu surfaces Copy Comment, Paste as Reply, and Paste at Cursor actions powered by a per-blip clipboard store (`clipboardStore.ts`) so legacy workflows continue to work without relying on the OS clipboard.
  - Collapse-by-default toggle (read + edit states) writes to CouchDB (`collapse-default:<userId>:<blipId>`) with a resilient localStorage fallback so blips reopen consistently across tabs/devices.
  - Inline comments surface fetches/persists annotations via `/api/blip/:blipId/comments` + `/api/comments` endpoints, falling back to optimistic local state when writes fail.
  - View-mode selections now trigger a floating inline comment composer (also backed by `/api/comments`) so annotations retain `{ start, end, text }` metadata instead of creating reply fallbacks.
  - See `INLINE_COMMENTS_VS_REPLIES.md` for a deeper dive into the inline comment data model, persistence helpers, and Vitest/API coverage.
  - Attachment/image buttons now rely on `createUploadTask` so uploads surface inline preview/progress/cancel/retry/dismiss UI (`upload-status` card) and respect the hardened `/api/uploads` pipeline (MIME sniffing + optional ClamAV + filesystem/S3/MinIO storage via `UPLOADS_STORAGE`, `UPLOADS_S3_*`, `CLAMAV_HOST`/`CLAMAV_PORT`).
- Presence UI: `PresenceIndicator.tsx` renders shared avatars/count badges (WaveView header + inline Editor panes) with loading/error/empty states sourced from `usePresence`, so realtime presence payloads stay visible and resilient without needing to inspect tooltips/text logs.
- Recovery UI: `RebuildPanel.tsx` (mounted in `WaveView`) surfaces a dev/admin snapshot recovery surface backed by `/api/editor/:waveId/rebuild`. It scopes to the current blip (when selected), queues rebuild jobs, polls `GET /rebuild` for status/logs, shows applied update counts, and exposes retry/error toasts so long-running rebuilds are observable without hammering the API.
  - Snapshots: every 5 seconds posts full snapshot to `/snapshot` (with optional `text`) for durability/search.
  - Per‑blip: optional `blipId` scopes snapshots/updates/search.

## Toolbar parity tracker
- See `docs/EDITOR_TOOLBAR_PARITY.md` for a running list of legacy toolbar controls vs the TipTap implementations plus the outstanding todo items to restore parity.

- Server routes: `src/server/routes/editor.ts`
  - `GET /api/editor/:waveId/snapshot` → `{ snapshotB64, nextSeq }` (supports `?blipId=`)
  - `POST /api/editor/:waveId/snapshot { snapshotB64, text?, blipId? }`
  - `POST /api/editor/:waveId/updates { seq, updateB64, blipId? }` → emits `editor:update { waveId, blipId?, seq, updateB64 }`
  - `GET /api/editor/:waveId/rebuild?blipId=` — return current rebuild job status/logs for the wave/blip
  - `POST /api/editor/:waveId/rebuild { blipId? }` — enqueue snapshot rebuild from stored updates (async queue with logs/applied count)
  - `GET /api/editor/search?q=...&limit=...&blipId=...` — search by materialized text

- Server sockets: `src/server/lib/socket.ts`
  - Rooms: wave and blip rooms via `editor:join`/`editor:leave`.
  - Presence: broadcasts `editor:presence { room, waveId, blipId?, count, users?: Array<{ userId?: string; name?: string }> }` with debounced emits + TTL cleanup; clients also emit `editor:presence:heartbeat` for keepalive so stale sockets expire automatically.
  - Helper: `emitEditorUpdate(waveId, blipId?, payload)` targets appropriate rooms.

## Roadmap
- Recovery UI: extend the new RebuildPanel (queue/log view) with historical runs + multi-wave admin dashboards if we need richer observability than the per-wave surface.
- Search materialization polish: indexes + endpoint hardening (in place) and richer client search UI (basic search view implemented).
