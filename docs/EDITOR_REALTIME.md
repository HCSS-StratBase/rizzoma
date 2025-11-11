# Editor Realtime (Yjs)

Options:
- y-websocket server adapter (preferred): rooms per wave/blip; auth; persistence bridge
- HTTP hybrid: continue snapshot/update cadence; poll/merge (fallback)

Tasks:
- Decide adapter; spike with simple room
- Server: socket auth + room lifecycle; persistence on intervals
- Client: provider wiring; awareness minimal; retry/backoff
- Tests: concurrency + conflict cases; compaction compatibility
- Rollout: flag gated; perf threshold; revert path
