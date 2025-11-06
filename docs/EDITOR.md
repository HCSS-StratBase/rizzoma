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
  - On load: applies `snapshotB64` via `Y.applyUpdate` if present.

- Server: `src/server/routes/editor.ts`
  - `GET /api/editor/:waveId/snapshot` → `{ snapshotB64, nextSeq }`
  - `POST /api/editor/:waveId/snapshot { snapshotB64 }` — saves the latest snapshot.
  - `POST /api/editor/:waveId/updates { seq, updateB64 }` — stores incremental updates (reserved for realtime providers).
  - Emits socket events: `editor:snapshot`, `editor:update` (used by clients to refresh state if needed).

## Roadmap

- Add socket-driven realtime (broadcast incremental updates) after persistence stabilizes.
- Materialize text for search and indexing.
- Recovery tools: rebuild a clean snapshot from updates.
- Basic editor mount in WaveView for selected blip.

