# Editor Realtime (Yjs)

Status: Initial realtime is implemented and merged (behind `EDITOR_ENABLE=1`).

What’s implemented now
- Incremental updates: client sends Yjs updates with a sequence to `/api/editor/:waveId/updates`.
- Broadcast: server emits `editor:update` with `{ waveId, blipId?, seq, updateB64 }` to all clients; clients apply updates.
- Snapshots: client still posts full snapshots every 5s for durability and search; server stores optional `text` for search.
- Per‑blip context: optional `blipId` is supported on updates and snapshots.

Where the main details live
- See `docs/EDITOR.md` for the end‑to‑end flow and API details.

Next steps
- Room scoping per wave/blip (Socket.IO rooms) and presence/awareness.
- Search materialization polish (indexes, endpoint hardening).
- Recovery tools: rebuild a clean snapshot from updates.
- Consider y‑websocket adapter long‑term; keep HTTP hybrid as safe fallback.
