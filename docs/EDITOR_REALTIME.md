# Editor Realtime — Summary

Implemented (behind `EDITOR_ENABLE=1`)
- Incremental updates → `/api/editor/:waveId/updates` and broadcast/apply via Socket.IO.
- Snapshots every 5s → `/api/editor/:waveId/snapshot` (with optional `text` for search).
- Rooms/Presence: join/leave per wave/blip; presence payload includes counts and users.
- Recovery endpoint: `/api/editor/:waveId/rebuild { blipId? }`.
- Search materialization: `/api/editor/search` with Mango indexes, snippets, and pagination.

See `docs/EDITOR.md` for details and API shapes.

Next steps
- Perf/resilience sweeps (large waves, inline comments, playback, unread flows).
- CI health checks coverage + scheduled perf harness runs.
