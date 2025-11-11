# Editor (TipTap + Yjs)

Status: Milestone B (IN PROGRESS). Feature-flagged; safe to keep merged.

## Enable

- Set `EDITOR_ENABLE=1` in the server environment.
- Client uses dynamic imports for TipTap/Yjs; if not installed, it shows a safe placeholder.

## Components

- Client: `src/client/components/Editor.tsx`
  - Loads `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-collaboration`, and `yjs` dynamically.
  - Creates a `Y.Doc` and mounts TipTap with Collaboration extension.
- Realtime: listens to `ydoc` updates and POSTs incremental updates to `/api/editor/:waveId/updates` with a running `seq`. Subscribes to `editor:update` via Socket.IO and applies remote updates.
  - Room scoping: client emits `editor:join { waveId, blipId?, userId? }` to receive targeted updates; emits `editor:leave` on unmount. Server tracks lightweight presence and broadcasts `editor:presence { room, waveId, blipId?, count, users?: Array<{ userId?: string; name?: string }> }`.
- Snapshot cadence: every 5 seconds, encodes full state and POSTs to `/snapshot` for durability and search.
  - Materialized text: on each snapshot, also POSTs `text` (via `editor.getText()`) for search.
  - Per‑blip context: include optional `blipId` on load/save so search and updates can be scoped to a blip.
  - On load: applies `snapshotB64` via `Y.applyUpdate` if present.
  - WaveView mount: toggle button in `src/client/components/WaveView.tsx` shows the editor for the current wave/current blip.

- Server: `src/server/routes/editor.ts`
  - `GET /api/editor/:waveId/snapshot` → `{ snapshotB64, nextSeq }` (supports `?blipId=`)
  - `POST /api/editor/:waveId/snapshot { snapshotB64, text?, blipId? }` — persists snapshot and optional plain text.
  - `POST /api/editor/:waveId/updates { seq, updateB64, blipId? }` — stores incremental updates and broadcasts `editor:update` including `updateB64`.
  - `POST /api/editor/:waveId/rebuild { blipId? }` — rebuilds a snapshot from stored incremental updates (dev/recovery).
  - `GET /api/editor/search?q=foo&limit=20&blipId=...` — finds waves/blips by materialized text (Mango regex; dev‑friendly).
  - Socket events: `editor:snapshot`, `editor:update`.

## Roadmap

- Realtime enhancements: room scoping per wave/blip and presence/awareness.
- Materialize text for search and indexing. (Initial version implemented client-side; server stores `text` alongside snapshot.)
- Recovery tools: rebuild a clean snapshot from updates.
- Basic editor mount in WaveView for selected blip (in progress; initial wave-level mount available behind toggle).
  - WaveView now passes current blip id to the editor when the toggle is on; persistence remains wave-level but snapshots are tagged with `blipId` for search.
