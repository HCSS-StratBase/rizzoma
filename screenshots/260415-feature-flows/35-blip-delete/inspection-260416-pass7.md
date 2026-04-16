# 35-blip-delete — ✅ VERIFIED

**Category**: GearMenu
**Feature**: Delete blip via gear dropdown.
**Evidence type**: `SOURCE`

## Evidence

Gear menu item → `DELETE /api/blips/:id` (soft delete).

## Inspection (2026-04-16, pass 7)

Source: `src/server/routes/blips.ts` DELETE handler + `RizzomaBlip.tsx` gear dropdown item. Vitest: `npm test -- blips.test` covers soft-delete.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
