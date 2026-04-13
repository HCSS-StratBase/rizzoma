# Editor Realtime — Summary

Last refreshed: 2026-04-13 (master, after Hard Gap Executions 6 + 7).

Implemented (behind `EDITOR_ENABLE=1`)
- Incremental updates → `/api/editor/:waveId/updates` and broadcast/apply via Socket.IO.
- Snapshots every 5s → `/api/editor/:waveId/snapshot` (with optional `text` for search).
- Rooms/Presence: join/leave per wave/blip; presence payload includes counts and users.
- Recovery endpoint: `/api/editor/:waveId/rebuild { blipId? }`.
- Search materialization: `/api/editor/search` with Mango indexes, snippets, and pagination.
- **Y.js + TipTap collaborative editing** (verified 2026-02-09, commit `ae62a22b`): cross-tab realtime sync via Y.Doc fragment 'default', synchronous provider creation in `useCollaboration`, awareness loop break via `applyingRemoteAwareness` flag in `CollaborativeProvider.ts`, relay-first server pattern (`blip:update` relayed to room before applying to yjsDocCache). Behind `REALTIME_COLLAB` + `LIVE_CURSORS` (both enabled by `FEAT_ALL=1`).

See `docs/EDITOR.md` for the request/response shapes and `CLAUDE_SESSION.md` "Real-Time Collaboration" section for the TipTap collaboration gotchas (synchronous provider, history conflict, fragment name `'default'` not `'prosemirror'`).

Next steps (current focus, 2026-04-13)
- **Move past `perfRender=lite`** for full-render perf on 1000-blip waves. Lite-mode passes (~1.5s landing / ~0.5s expanded / 23MB memory per `snapshots/perf/metrics-1770042725851-*.json`) but full-render TTF and memory still need work — tracked as task #15 in the modernization backlog.
- **Perf/resilience sweep for inline comments and wave-level playback** specifically — `perf-harness.mjs` doesn't yet cover (a) topics with N anchored inline comments, or (b) `WavePlaybackModal` opening on a 100/500-blip wave history. Tracked as task #16.
- **Real-device PWA validation** on iPhone Safari + Chrome Android — emulated viewports passed but no real-device pass yet. Tracked as task #18.
- **Health-check + inline-comments + uploads CI gating** — `/api/health` is now a real CouchDB connectivity check (commit `8182cd06`); the health-checks job needs to gate merges. Tracked as task #19.
