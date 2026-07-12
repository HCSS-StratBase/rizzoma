# Public BLB creation failure — 2026-07-13

## Purpose

This run reproduces the core Bullet-Label-Blip creation failure through the
real public UI at [the new Rizzoma](https://138-201-62-161.nip.io/). The source
content first passed the canonical Rizzoma `content_gate.py`; the browser then
created the topic, created the reply, typed with real keyboard events, finished
editing, and reloaded.

Public topic:
[Rizzoma modernization reality check — core BLB failure](https://138-201-62-161.nip.io/#/topic/3305bc3a42889979c79fa39f400088c7?layout=rizzoma)

## Measured result

- Intended structure: **18 bullet nodes**, maximum intended depth **1**.
- New topic root: one H1 and no initial bullet list.
- New status blip: **18 top-level paragraphs, 0 unordered lists, 0 list items**.
- After reload: still **18 paragraphs, 0 unordered lists, 0 list items**.
- Browser errors: **0**. This is a content-contract failure, not a transport or
  rendering crash.

The machine-readable record is [result.json](result.json).

## Visual inspection

- `01-create-topic-real-control.png` proves creation used the public New-topic
  modal.
- `03-new-reply-flat-paragraph.png` shows the created blip as a long flat body.
- `04-gated-spec-flattened-in-editor.png` is the clearest failure view: every
  intended label/detail is an unbulleted editor line, with no recursive `[+]`
  anchors.
- `06-flat-structure-persists-after-reload.png` shows the same flat body after a
  fresh page load.
- `07-flat-structure-after-reload-editor.png` confirms the persisted editor
  structure remains non-BLB.

## Boundary

This is intentionally failing pre-fix evidence. It does not accept the release.
The repair must prove topic, root-reply, nested-reply, and Ctrl+Enter inline
creation as real UL/LI structures, then survive reload and a managed restart.
