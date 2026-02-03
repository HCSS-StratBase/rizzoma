# BLB Parity Checklist (Legacy vs Modern)

Branch: `feature/rizzoma-core-features`  
Date: 2026-02-03

Use this checklist to verify BLB (Bullet‑Label‑Blip) parity with the legacy CoffeeScript UI and behavior. Each item should be validated against legacy sources (`original-rizzoma-src`) and the reference screenshots under `screenshots/rizzoma-live/feature/rizzoma-core-features/`.

## 1) Core Data Model
- [x] `isFoldedByDefault` is a **shared blip property** (not per-user). All users see the same “Hidden” state.
- [x] `isFoldedByDefault` is stored on the blip doc and synced through OT/Yjs (not localStorage only).
- [x] Blip export/serialization includes `isFoldedByDefault` (legacy behavior in `original-rizzoma-src/src/server/blip/*`).

## 2) Collapsed/Expanded Behavior
- [x] Default view is **collapsed** for all blips (label-only, no body, no toolbar).
- [x] Clicking `[+]` **navigates into the subblip view** (URL changes to `/topic/{waveId}/{blipPath}/`).
- [x] Expanding a parent does **not** auto-expand children.
- [x] Collapsing returns to label-only state (TOC view).

## 3) Label Rendering
- [x] Label is the **first line** of the blip content (not a separate title field).
- [x] Collapsed rows show **bullet + label + [+]** only (no avatar/date).
- [x] Child blips use the **same label-only collapsed format** as root blips.

## 4) Inline Marker (+) Behavior
- [x] Inline `[+]` marker is a visual widget (legacy plus/minus style), not raw text.
- [x] Clicking the marker **navigates to the child blip view** (subblip route) rather than expanding inline.
- [x] Marker color indicates unread state (green when unread).
- [x] Snapshot harness clicks the inline marker directly (matches the default UI path).
- [x] Inline marker click handler uses event delegation (`closest`) with capture-phase listener to keep view-mode clicks reliable.
- [x] Legacy anchor-positioned child blips inject `[+]` markers into the parent view even if the stored HTML lacks markers.
- [x] Editing a parent blip/topic injects inline `[+]` markers so legacy anchor-positioned children are visible in edit mode as well.

## 5) Toolbar Parity (Blip-Level)
- [x] Toolbar appears **only on expanded/focused blips**.
- [x] View mode toolbar includes: Edit, Hide/Show comments, Link, Hide, Delete, Gear menu.
- [x] Edit mode toolbar includes: Done, Undo/Redo, Link, Attach, Image, Bold/Italic/Underline/Strike, BG color, Clear formatting, Bullets/Numbers, Hide, Delete, Gear menu.
- [x] Gear menu includes: Copy comment, Paste as reply, Paste at cursor, Copy link, Playback.

## 6) Reply vs Inline Comment
- [x] “Write a reply…” only appears at the bottom of an **expanded** blip.
- [x] Inline comments (Ctrl+Enter) insert a `[+]` marker **in the parent content**, not in a separate list.
- [x] Inline child blips behave the same as normal blips (collapsed/expanded states).

## 7) Unread Indicators
- [x] Collapsed `[+]` is green when unread.
- [x] Unread state propagates to collapsed label rows and inline markers.
- [x] Unread state clears when blip is opened/read (same as legacy).

## 8) Navigation & Drill‑Down
- [x] Subblip drill-down is **default** on inline marker click (URL changes to `/topic/{waveId}/{blipPath}/`).
- [x] Inline expansion is **not** used; subblip view is the primary UI.

## 9) Snapshot Coverage (Modern)
- [x] Landing (collapsed labels only) snapshot.
- [x] Expanded blip with toolbar snapshot.
- [x] Inline `[+]` navigation snapshot (subblip view).
- [x] Unread green `[+]` snapshot.

## 10) Reference Sources
- [x] Legacy UI screenshots reviewed (`rizzoma-main.png`, `rizzoma-blip-view.png`, `rizzoma-blip-edit.png`, `rizzoma-blips-nested.png`).
- [x] Legacy CoffeeScript sources reviewed:
  - `original-rizzoma-src/src/client/blip/blip_thread.coffee`
  - `original-rizzoma-src/src/client/blip/view.coffee`
  - `original-rizzoma-src/src/client/blip/menu/*`
  - `original-rizzoma-src/src/server/blip/*`
