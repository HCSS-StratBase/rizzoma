# 50-ftg-next-prev — ✅ VERIFIED

**Category**: FtG
**Feature**: Next / prev unread navigation.
**Evidence type**: `SOURCE`

## Evidence

`GET /api/waves/:id/unread/next` server-computed.

## Inspection (2026-04-16, pass 7)

Source: `src/server/routes/waves.ts` unread endpoint + `RightToolsPanel.tsx` Next button. Covered by `test-collab-smoke.mjs` FtG path.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
