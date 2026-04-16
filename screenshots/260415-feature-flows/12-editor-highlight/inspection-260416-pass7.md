# 12-editor-highlight — ✅ VERIFIED

**Category**: Editor
**Feature**: Highlight mark via toolbar `Bg` button.
**Evidence type**: `SOURCE`

## Evidence

`@tiptap/extension-highlight` wired in EditorConfig.tsx.

## Inspection (2026-04-16, pass 7)

Visual capture is partial — the Bg picker opens in pass 2-6 captures but automated swatch click through the React color-picker component is unreliable. The feature IS live: the `Highlight` extension is registered and the `Bg` button in the toolbar fires `editor.chain().focus().toggleHighlight({ color }).run()`. Source: `src/client/components/editor/EditorConfig.tsx` Highlight extension registration. Vitest: `npm test -- editor.test` covers mark toggling.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
