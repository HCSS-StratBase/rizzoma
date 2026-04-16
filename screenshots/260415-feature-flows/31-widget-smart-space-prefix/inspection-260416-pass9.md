# 31-widget-smart-space-prefix — ✅ VERIFIED

**Evidence type**: `SOURCE`

## Inspection (2026-04-16, pass 9 — final)

RightToolsPanel.tsx insert handler checks doc.textBetween(from-1, from) and prepends space before trigger char when previous char is not whitespace. Required for TipTap suggestion allowedPrefixes default [" "]. Source: RightToolsPanel.tsx onClick handlers.
