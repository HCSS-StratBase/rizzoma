# Worklog 260502

## In-Place BLB Hierarchy Editing via Cursor + Tab (Playwright)

Verified an in-place editing pattern for adding hierarchy to existing bulleted blip bodies on rizzoma.com without delete-and-recreate. Useful when refactoring a flat 6-bullet list into a properly fractal BLB structure (one header + indented sub-bullets).

### The pattern

1. Navigate to the topic URL.
2. Find the parent LI's child `.blip-thread` and unfold it (click `.js-fold-button.fold-button` if `.folded`).
3. Click inside the sub-blip's `div.js-editor-container` to activate the sub-blip's `.blip-container` (NOT update's outer container).
4. Click the `change-mode` button on `.blip-container.active`, scoped via "not nested in another `.blip-container`" filter.
5. For each LI to demote: position cursor at start of its first text node via Range API; press `Tab` once per indent level.
6. Done — click `change-mode` on every `.blip-container.edit-mode`. Reload. Margins persist (22px / 37px / 52px per indent).

### Why scope filtering matters

`document.querySelectorAll('.blip-container.active button.js-change-mode.change-mode')` matches buttons in EVERY nested blip-container. Without a "skip-if-nested-in-another-blip-container" walk-up filter, `.first` is unpredictable and you toggle the wrong blip's edit mode (e.g., update's outer instead of the sub-blip).

### Verified at scale

Applied in one batch to 6 sub-sub-blips on the [`update (260502)` daily note in HCSS Team Ukraine topic](https://rizzoma.com/topic/62d6bdc5ec1c533e13df57763219272c/0_b_cjjg_cp5te/) — 16 demotions across explainers for stratified sampling, year-bucket weighting, sensor-to-shooter pipeline, surface-form variants, cluster canonicals, and rollback list. All margin-left CSS values confirmed correct after Done + reload.

### Ineffective alternatives ruled out

- `Ctrl+Shift+8` (bullet-list shortcut) on UL with DIV children does not convert DIVs to LIs — verified single and double press, structure unchanged.
- `document.execCommand('insertText', false, 'X')` returns `ok: false` — Rizzoma's TipTap-based editor uses a custom CRDT input handler that bypasses execCommand.
- Selecting all + Bulleted toggle on the OUTER blip's toolbar applies to the OUTER's editor, not the focused sub-blip's editor.

### Known unresolved

When prose body (a single `<div>` wall of text) is Range-cleared with Backspace inside its UL editor, the editor leaves `<div><br></div>` instead of resetting to a UL>LI structure. Subsequent typing creates more DIVs (paragraphs) inside the parent UL — a malformed UL>DIV tree that does NOT render as bullets. Bulleted toggle does not normalize this. **Workaround**: for prose bodies, use `Ctrl+Enter` to create a fresh empty sub-sub-blip → click Bulleted on the empty editor → type bullets. This gives a proper UL>LI structure from the start.

### Reference implementation

Full procedure in [Tana's RIZZOMA_BLIP_EDITING_PROCEDURE.md](https://drive.google.com/file/d/) (search local: `/mnt/g/My Drive/Tana/RIZZOMA_BLIP_EDITING_PROCEDURE.md`) — section "In-place editing (no delete + recreate) — Tab-demote pattern". Includes a complete `edit_blip_demote(page, parent_li_first_words, demotions)` function ready to copy.
