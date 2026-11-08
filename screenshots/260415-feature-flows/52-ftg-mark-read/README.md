# 52-ftg-mark-read

`POST /api/waves/:id/blips/:id/read` + bulk mark-read endpoint. Emits `blip:read` / `wave:unread` sockets.

Verification: `test-collab-smoke.mjs` covers this flow in CI (mark-read + sidebar refresh).
