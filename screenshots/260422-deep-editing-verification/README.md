# Deep-nesting editing + delete verification

Beyond just creating DEPTH-1/2/3 (covered in `screenshots/260421-bug40-subblip-nesting/`), this folder proves that **editing**, **rich formatting**, **emoji insertion**, **gear-menu Delete**, and **cascading delete** all work at depth-3.

Against live VPS (`138.201.62.161:8200`, commit `c4844c73`), session 2026-04-22.

## Test matrix covered

| Test | Result | Evidence |
|---|---|---|
| **Enter edit mode on DEPTH-3 via gear menu** | ✅ | `deep-edit-01`: `.ProseMirror[contenteditable="true"]` appears, DEPTH-3's own rich toolbar renders (Done / undo / redo / link / emoji / attach / image / B / I / U / S / color / clear / bullet / number / gear) |
| **Type plain text at DEPTH-3** | ✅ | "DEPTH-3 great-grandchild" → "DEPTH-3 great-grandchild edited" |
| **Bold via Ctrl+B at DEPTH-3** | ✅ | `<strong>BOLD</strong>` in editor HTML |
| **Italic via Ctrl+I at DEPTH-3** | ✅ | `<em>ital</em>` in editor HTML |
| **Emoji via DEPTH-3's toolbar picker** | ✅ | `🤩` (star struck) inserted — `deep-edit-01` shows picker open, DEPTH-3 content ends with the emoji |
| **Done button saves DEPTH-3 content** | ✅ | `deep-edit-02` shows the saved state; CouchDB doc rev=20, `content = <p>DEPTH-3 great-grandchild edited <strong>BOLD</strong> <em>ital</em> 🤩</p>` |
| **gear-menu "Delete blip" at DEPTH-3 (not top-level)** | ✅ | `deep-edit-03`: `DELETE /api/blips/...%3Ab1776813231293 → 200`, blip gone from DOM |
| **Cascading delete: DEPTH-1 gear → Delete → DEPTH-2 also gone** | ✅ | `deep-edit-04`: only topic-root left; CouchDB: both b1776812968505 (DEPTH-1) and b1776813105751 (DEPTH-2) have `deleted=True, deletedBy=hp`. `markBlipAndDescendantsDeleted()` traversal works. |

## Not covered in this test

- **@mention autocomplete at depth** — would need a second user to @ (not set up)
- **#tag and ~task suggestion popups at depth** — keyboard shortcut path, untested
- **Gadget insert at depth** — gadget picker palette, untested
- **File/image upload at depth** — would require an S3 / MinIO round-trip
- **Code block creation at depth** — CodeBlockLowlight extension, untested

Per the commit and BUG #40 + #43 fixes, each feature above reuses the SAME code path as top-level blips (the RizzomaBlip component is the same React component at every depth — `collabEnabled` is gated on `!isTopicRoot`, not on depth). So they should work, but this session didn't run those specific UI checks.

If any of these regress at depth specifically, expect the symptom to show up in Playwright as "works on top-level blip, fails on nested"; open a new issue with clear repro.

## Browser console evidence snippets

```
POST /api/blips 201       (DEPTH-1 created)
POST /api/blips 201       (DEPTH-2 grandchild created)
POST /api/blips 201       (DEPTH-3 great-grandchild created)
PUT  /api/blips/...:b1776813231293 200   (DEPTH-3 edited + saved, rev→20)
DELETE /api/blips/...%3Ab1776813231293 200   (DEPTH-3 deleted)
DELETE /api/blips/...%3Ab1776812968505 200   (DEPTH-1 deleted — cascaded to DEPTH-2)
```

Topic returned to pre-test state cleanly.
