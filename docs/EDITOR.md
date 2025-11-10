# Editor (TipTap + Yjs)

Status: Milestone B (IN PROGRESS). Feature-flagged; safe to keep merged.

## Enable

- Set `EDITOR_ENABLE=1` in the server environment.
- Client uses dynamic imports for TipTap/Yjs; if not installed, it shows a safe placeholder.

## Components

- Client: `src/client/components/Editor.tsx`
  - Loads `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-collaboration`, and `yjs` dynamically.
  - Creates a `Y.Doc` and mounts TipTap with Collaboration extension.
  - Snapshot cadence: every 5 seconds encode state and POST to the snapshot endpoint.
  - Materialized text: on each snapshot, also POSTs `text` (via `editor.getText()`) for search.
  - Per‑blip context (scaffold): client includes optional `blipId` when saving snapshots so search can be scoped to a blip.
  - On load: applies `snapshotB64` via `Y.applyUpdate` if present.
  - WaveView mount: toggle button in `src/client/components/WaveView.tsx` shows the editor for the current wave. If the server flag is off, a disabled note appears.

- Server: `src/server/routes/editor.ts`
  - `GET /api/editor/:waveId/snapshot` → `{ snapshotB64, nextSeq }`
  - `POST /api/editor/:waveId/snapshot { snapshotB64, text?, blipId? }` — saves the latest snapshot and optional plain text and blip context.
  - `POST /api/editor/:waveId/updates { seq, updateB64 }` — stores incremental updates (reserved for realtime providers).
  - `GET /api/editor/search?q=foo&limit=20&blipId=...` — finds waves/blips by materialized text (dev/simple Mango regex).
  - Emits socket events: `editor:snapshot`, `editor:update` (used by clients to refresh state if needed).

## Roadmap

- Add socket-driven realtime (broadcast incremental updates) after persistence stabilizes.
- Materialize text for search and indexing. (Initial version implemented client-side; server stores `text` alongside snapshot.)
- Recovery tools: rebuild a clean snapshot from updates.
- Basic editor mount in WaveView for selected blip (in progress; initial wave-level mount available behind toggle).
  - WaveView now passes current blip id to the editor when the toggle is on; persistence remains wave-level but snapshots are tagged with `blipId` for search.
