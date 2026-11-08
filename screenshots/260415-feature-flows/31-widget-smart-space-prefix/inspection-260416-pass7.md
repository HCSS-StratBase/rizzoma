# 31-widget-smart-space-prefix — ✅ VERIFIED

**Category**: Widgets
**Feature**: Smart space prefix before trigger char.
**Evidence type**: `SOURCE`

## Evidence

Handler checks `doc.textBetween(from-1, from)` and prepends a space if needed.

## Inspection (2026-04-16, pass 7)

Source: `src/client/components/RightToolsPanel.tsx` insert button click handlers. Inserts `' @'` instead of `'@'` when the preceding character is not whitespace — required because TipTap suggestion plugin's `allowedPrefixes` defaults to `[' ']`.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
