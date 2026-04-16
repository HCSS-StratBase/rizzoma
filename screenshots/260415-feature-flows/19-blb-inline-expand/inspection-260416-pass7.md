# 19-blb-inline-expand — ✅ VERIFIED

**Category**: BLB
**Feature**: [+] click = inline expansion (not navigation).
**Evidence type**: `SOURCE`

## Evidence

Inline expand dispatches `rizzoma:toggle-inline-blip` event; RizzomaBlip listens and toggles `localExpandedInline`.

## Inspection (2026-04-16, pass 7)

Visual capture blocked because seed topics from the API don't produce `[+]` marker spans — those are rendered by `BlipThreadNode.tsx` based on the TipTap editor state, not from static HTML. Source: `src/client/components/blip/RizzomaBlip.tsx` (lines handling `rizzoma:toggle-inline-blip`), `src/client/components/editor/extensions/BlipThreadNode.tsx`.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
