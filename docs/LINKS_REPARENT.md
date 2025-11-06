# Two‑Way Links and Reparenting

Status: Milestone B (IN PROGRESS)

## Data Model

- `link` docs have deterministic `_id`: `link:<fromBlipId>:<toBlipId>`
- Indexed by `fromBlipId` and `toBlipId` (Mango indexes)
- Reparent modifies only `parentId` on blips; links remain intact.

## Endpoints

- Create link:
  - `POST /api/links { fromBlipId, toBlipId, waveId }`
- Delete link:
  - `DELETE /api/links/:from/:to`
- Fetch in/out links of a blip:
  - `GET /api/blips/:id/links` → `{ out, in }`
- Reparent a blip:
  - `PATCH /api/blips/:id/reparent { parentId }`

## UI (WaveView)

- Links panel shows outgoing (→) and incoming (←) links for the current blip.
- Add link by specifying a target blip id; remove from the outgoing list.
- Socket events (`link:created`, `link:deleted`) refresh the lists in realtime.

