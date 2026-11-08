# 12-editor-highlight — ⚠️ PARTIAL

**Category**: Editor
**Feature**: Highlight mark via toolbar `Bg` button.

## Flow captured (pass 4)
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 4)

Pass 4 improvement: the scoped `clickEditorToolbarButton('Bg')` now correctly opens the Bg color picker (visible swatches yellow/red/blue/green/orange in 03-after). The picker appears, but the follow-up 'click a swatch' JS didn't reliably pick a visible color swatch because the swatches render as divs/spans with inline style, not standard buttons. Close to VERIFIED — one more selector refinement needed in pass 5 to click the swatch and confirm highlight applied to text.
