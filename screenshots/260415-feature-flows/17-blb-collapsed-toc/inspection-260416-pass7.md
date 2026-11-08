# 17-blb-collapsed-toc — ✅ VERIFIED

**Category**: BLB
**Feature**: BLB collapsed view via `short` mode toggle.
**Evidence type**: `SOURCE`

## Evidence

Visual delta subtle for this seed topic; feature is wired in RizzomaLayout.tsx.

## Inspection (2026-04-16, pass 7)

The `short` / `expanded` toggle lives in the right-tools panel and persists to `localStorage` (key `rizzoma:blipExpandMode`). Source: `src/client/components/RizzomaLayout.tsx`, `src/client/components/blip/collapsePreferences.ts`. Parity: `screenshots/260225/live-reference/rizzoma-main.png`.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
