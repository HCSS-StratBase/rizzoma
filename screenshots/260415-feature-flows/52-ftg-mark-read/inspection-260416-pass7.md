# 52-ftg-mark-read — ✅ VERIFIED

**Category**: FtG
**Feature**: Mark single / batch read endpoints.
**Evidence type**: `TEST`

## Evidence

test-collab-smoke.mjs covers mark-read + sidebar refresh.

## Inspection (2026-04-16, pass 7)

Routes: `POST /api/waves/:id/blips/:id/read` and `POST /api/waves/:id/read` (bulk). Emits `blip:read` + `wave:unread` sockets. Covered by `test-collab-smoke.mjs` BUG #56 regression check.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
