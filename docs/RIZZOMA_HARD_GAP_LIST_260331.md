# Rizzoma Hard Gap List

Branch: `master`  
Date: 2026-03-31

This is a strict structural gap list for the current Rizzoma build.

It is grounded in:
- `docs/BLB_LOGIC_AND_PHILOSOPHY.md`
- `docs/TOPIC_RENDER_UNIFICATION.md`
- `docs/EDITOR_TOOLBAR_PARITY.md`
- legacy references in `original-rizzoma/` and `original-rizzoma-src/`
- legacy screenshots in `screenshots/rizzoma-live/feature/rizzoma-core-features/`

This is not a polish backlog. These are the current non-negotiable mismatches between the documented/original Rizzoma model and the present build.

## Core Model That Must Hold

1. Topic = meta-blip.
2. Topic title = first line of the same meta-blip content, not a detached title widget.
3. Replies are blips under a blip, created from `Write a reply...` at the bottom.
4. Inline comments are blips in a blip, created by `Ctrl+Enter`, anchored at a precise point.
5. Expanded/focused blip owns the blip-level toolbar.
6. Gadget insertion belongs to the active editable blip, following the original active-blip insertion model.
7. The UI must read like one coherent wave/topic surface, not a page with disconnected cards and panels.

## Must Remove

These elements are wrong in kind, not just in styling.

### 1. Detached Title Container Behavior

Current problem:
- the topic title still reads as if it lives in a separate container above the body
- this contradicts the documented model that the title is the first line of the meta-blip content

Why it is wrong:
- `docs/BLB_LOGIC_AND_PHILOSOPHY.md` is explicit: title is the first line of the same blip
- `docs/TOPIC_RENDER_UNIFICATION.md` is explicit: topic meta-blip should render through the same tree path

Required removal:
- no distinct visual “title card” or detached title region that behaves unlike the rest of the topic body

### 2. Inline Comments Navigation/Product Surface

Current problem:
- the `All / Open / Resolved` inline-comments navigation UI is present
- it appears as a productized side panel competing with the reading/editing surface

Why it is wrong:
- it is not part of the documented Rizzoma model
- it is not part of the original interaction the user expects
- it actively obscures the main blip/thread surface

Required removal:
- remove the `All / Open / Resolved` navigation surface from the main live Rizzoma workflow
- remove the degraded inline-comments side-nav intrusion from the active reply/thread reading column

### 3. Degraded-State Banner Pollution in the Main Thread Surface

Current problem:
- “Inline comments are temporarily unavailable” still shows up as visible chrome in the active thread surface
- it competes with the actual blip content and toolbar

Why it is wrong:
- degraded-state messaging is currently taking precedence over the actual BLB content
- the original product did not let failure notices become the visual center of the blip

Required removal:
- no degraded-state banner inside the primary reading/editing band of an expanded reply

### 4. Acceptance of Synthetic/Mechanical Success as Functional Truth

Current problem:
- scripted captures have been allowed to validate flows that are semantically wrong

Why it is wrong:
- “action succeeded” is insufficient if the underlying product model is violated

Required removal:
- no more accepting UI states that contradict the documented topic/meta-blip or inline-comment model just because Playwright can traverse them

## Must Restore

These are behaviors or structural truths that existed in the original and/or are explicitly documented.

### 1. Single Meta-Blip Topic Surface

Must restore:
- topic reads as one meta-blip
- title is visually and behaviorally the first line of the same content surface
- body follows directly under it in the same conceptual container

Acceptance test:
- the topic should no longer look like “title block above separate content card”

### 2. Genuine Reply vs Inline Comment Split

Must restore:
- `Write a reply...` creates a reply under the blip
- `Ctrl+Enter` creates an inline comment at the exact anchor point
- these two interactions must be visibly and behaviorally distinct

Acceptance test:
- inline comments must actually work as one of the main mechanisms of Rizzoma
- no fake substitute UI counts as parity

### 3. Active-Blip-Centered Gadget Insertion

Must restore:
- gadget insertion belongs to the active editable blip
- the interaction should feel like the original active-blip insertion pattern, not a detached app-wide modal gesture

Acceptance test:
- focus a specific blip, invoke gadget insertion, and get the gadget in that blip with no ambiguity

### 4. Clear BLB Hierarchy

Must restore:
- actual parent/child structure must read immediately
- nested replies must feel structurally subordinate, not just padded cards

Acceptance test:
- a user should be able to glance at the thread and understand what is root, what is child, and what is sibling without effort

### 5. Reliable Edit Semantics

Must restore:
- clicking Edit should open editing for that blip/topic only
- it must not surface random gadget states or unpredictable content shifts

Acceptance test:
- Edit never unexpectedly “opens a poll”
- editing is boringly reliable

## Must Reimplement

These areas are currently too wrong or too drifted to treat as polish.

### 1. Inline Comments as a First-Class Core Feature

Current reality:
- inline comments are one of the most important elements of Rizzoma
- right now they do not work as a trustworthy core interaction

Required reimplementation target:
- anchored inline comment creation via `Ctrl+Enter`
- visible inline anchor markers consistent with the documented/original model
- expansion/navigation behavior that supports the anchored blip model rather than replacing it with unrelated panel chrome

### 2. Topic-Root Rendering Contract

Current reality:
- topic-root handling has drifted into special-case behavior that repeatedly breaks the documented model

Required reimplementation target:
- enforce the topic as meta-blip through the same rendering tree
- keep topic-level toolbar persistence without splitting title/body into separate conceptual containers

### 3. Verification Protocol

Current reality:
- screenshots have been captured, but acceptance has not been strict enough

Required reimplementation target:
- every verification loop for this area must check:
  - topic title/body unity
  - reply vs inline comment distinction
  - active-blip edit behavior
  - gadget insertion into the intended active blip
  - no alien panel/filter UI in the main reading/editing surface

## Immediate Priority Order

1. Remove the alien inline-comments nav/filter product surface.
2. Re-establish true inline-comment behavior (`Ctrl+Enter`, anchor-based).
3. Reassert topic title/body unity as one meta-blip surface.
4. Re-verify gadget insertion only after active-blip semantics are solid again.
5. Rebuild the acceptance pack against those restored semantics.

## Execution Notes

### 2026-03-31 - Execution 1 Complete
- Removed the alien inline-comments nav/filter product surface from the live editing workflow.
- Trusted pack:
  - `screenshots/260331-complex-workflow-pass23/`

### 2026-03-31 - Execution 2 Complete
- Removed the competing annotation-style inline-comment UI from live blip/topic surfaces.
- Restored the live product to one inline-comment model:
  - `Ctrl+Enter` creates an anchored child blip marker
  - `[+]` persists in parent content
  - clicking `[+]` navigates into the anchored subblip URL
- Trusted packs:
  - `screenshots/260331-inline-comment-audit-pass3/`
  - `screenshots/260331-complex-workflow-pass24/`
- Remaining hard gap:
  - the subblip page reached from that marker is still visually too weak and must be improved before this area is acceptable

### 2026-04-01 - Execution 3 Complete
- Restored the full anchored inline-comment round trip on a fresh client.
- Trusted pack:
  - `screenshots/260401-inline-comment-audit-pass25/`
- Accepted result:
  - `Ctrl+Enter` creates the anchored marker
  - the subblip route opens directly
  - `Done` reaches subblip read mode
  - `Hide` returns to the parent topic with the marker preserved
  - clicking the parent marker reopens the subblip route
- Remaining hard gap:
  - the parent-return presentation is still too weak because the topic currently comes back in edit mode after `Hide`
  - the subblip view still needs stronger legacy-style visual treatment

### 2026-04-01 - Execution 4 Complete
- Cleaned up the parent-return presentation for the anchored inline-comment round trip.
- Trusted pack:
  - `screenshots/260401-inline-comment-audit-pass40/`
- Accepted result:
  - after `Hide`, the parent topic returns in read mode
  - the root toolbar shows `Edit`
  - the anchored `[+]` marker remains visible in topic view
  - clicking `[+]` reopens the anchored subblip route
- Remaining hard gap:
  - the subblip page itself is still visually too weak and still needs stronger legacy-style treatment

### 2026-04-01 - Execution 5 Complete
- Reverified the anchored inline-comment round trip with real typed content on a fresh client.
- Trusted pack:
  - `screenshots/260401-inline-comment-audit-pass44/`
- Accepted result:
  - typed subblip content now survives into subblip read mode after `Done`
  - `Hide` still returns to the parent topic in read mode
  - the parent marker remains visible and still reopens the anchored subblip route
- Remaining hard gap:
  - the subblip page itself is still visually too weak compared with original Rizzoma

## Non-Acceptance Rule

This area must not be called “accepted” again unless all of the following are true in the live UI:
- title and body read as one meta-blip surface
- inline comments actually work
- no `All / Open / Resolved` style alien nav UI remains in the main workflow
- Edit is deterministic
- gadget insertion is clearly tied to the active blip
- thread hierarchy is legible at a glance
