# 13-editor-link — ❌ NOT DEMONSTRATED

**Category**: Editor
**Feature**: Link via toolbar 🔗 button.

## Flow captured (pass 3)
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 3)

Pass 3 with stronger `hardOpenTopic()` cleared overlay contamination, but the 🔗 button click still doesn't produce a visible link prompt in the capture. The dialog handler is registered but the 🔗 button selector likely matches wrong button — there are multiple 🔗 buttons in the DOM (topic toolbar, blip toolbar, and link-add/remove pair). Pass 4 needs to select the one INSIDE the topic editor toolbar specifically.
