# 25-blb-ctrl-enter-child — ✅ VERIFIED

**Category**: BLB
**Feature**: Ctrl+Enter creates inline child at cursor.
**Evidence type**: `SOURCE`

## Evidence

Keybinding wired in BlipKeyboardShortcuts.ts.

## Inspection (2026-04-16, pass 7)

Source: `src/client/components/editor/extensions/BlipKeyboardShortcuts.ts` — `Mod-Enter` binding creates an inline child blip at the cursor position via the blips API. Visual capture intermittent because the resulting React portal renders asynchronously.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
