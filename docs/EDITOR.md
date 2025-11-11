# Editor (TipTap + Yjs)

Status: Milestone B+ (IN PROGRESS). Feature‑flagged; safe to keep merged.

## Enable
- Set `EDITOR_ENABLE=1` in the server environment.

## Components
- Client: `src/client/components/Editor.tsx`
  - Creates a `Y.Doc` and mounts TipTap with Collaboration extension.
  - Realtime: listens to `ydoc` updates and POSTs incrementals to `/api/editor/:waveId/updates` with a running `seq`; subscribes to `editor:update` and applies remote updates.
  - Room scoping: emits `editor:join { waveId, blipId?, userId? }` on mount; emits `editor:leave` on unmount.
  - Presence UI: WaveView shows “Present: N” with tooltip of user names/ids (from presence payload).
  - Snapshots: every 5 seconds posts full snapshot to `/snapshot` (with optional `text`) for durability/search.
  - Per‑blip: optional `blipId` scopes snapshots/updates/search.

- Server routes: `src/server/routes/editor.ts`
  - `GET /api/editor/:waveId/snapshot` → `{ snapshotB64, nextSeq }` (supports `?blipId=`)
  - `POST /api/editor/:waveId/snapshot { snapshotB64, text?, blipId? }`
  - `POST /api/editor/:waveId/updates { seq, updateB64, blipId? }` → emits `editor:update { waveId, blipId?, seq, updateB64 }`
  - `POST /api/editor/:waveId/rebuild { blipId? }` — rebuild snapshot from stored updates (recovery)
  - `GET /api/editor/search?q=...&limit=...&blipId=...` — search by materialized text

- Server sockets: `src/server/lib/socket.ts`
  - Rooms: wave and blip rooms via `editor:join`/`editor:leave`.
  - Presence: broadcasts `editor:presence { room, waveId, blipId?, count, users?: Array<{ userId?: string; name?: string }> }`.
  - Helper: `emitEditorUpdate(waveId, blipId?, payload)` targets appropriate rooms.

## Roadmap
- Presence identity polish; inline editor-pane indicators.
- Recovery UI: admin action to trigger rebuild and surface results.
- Search materialization polish: indexes + endpoint hardening; client search UI.

