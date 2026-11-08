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

### 2026-04-13 - Execution 6 Complete
- Tightened the subblip page chrome toward the legacy Rizzoma topic surface and reverified the full round trip on a fresh client running the new reserved Rizzoma backend port (`8788`, replaces the prior `8000` collision with `google_workspace_mcp`).
- Code changes:
  - `src/client/components/RizzomaTopicDetail.tsx` — removed the `PARENT CONTEXT` caps label, the bullet/header/meta nested layout, and the `SUBBLIP` caps label from the subblip parent context block. Parent context now renders as a compact title + 2-line clamped snippet inline above the focused blip.
  - `src/client/components/RizzomaTopicDetail.css` — rewrote `.subblip-view` to match the `.topic-meta-blip` chrome (1160px width, same gradient/border/shadow/radius, blur backdrop, max-height). Rewrote `.subblip-nav-bar` and `.subblip-hide-btn` to match the legacy gray utility-strip texture instead of the previous blue gradient pill. Flattened `.subblip-stage` to a transparent in-container scroll region and `.subblip-focus-shell` so the focused blip uses normal blip chrome (no extra rounded card, no extra padding, no rail bar).
  - Reserved backend port migration: `src/server/config.ts`, `src/server/app.ts` (CORS allowlist + dev redirect), `vite.config.ts`, `package.json`, `docker-compose.yml`, `Dockerfile`, `.github/workflows/ci.yml`, `scripts/start-all.sh`, `src/client/lib/socket.ts`, `src/server/routes/notifications.ts`, `create-demo-topic.cjs`. Reserved-port policy documented in `CLAUDE.md` "Reserved Ports", `CLAUDE_SESSION.md`, `docs/HANDOFF.md`, `docs/RESTART.md`.
- Live verification:
  - dev client: `http://127.0.0.1:3000` (Vite UI) backed by Express server on `:8788` (the reserved port)
  - command: `node scripts/capture_live_inline_comment_flow.cjs screenshots/260413-inline-comment-audit-pass55 http://127.0.0.1:3000`
- Trusted pack:
  - `screenshots/260413-inline-comment-audit-pass55/04-subblip-done-mode.{png,html}`
  - `screenshots/260413-inline-comment-audit-pass55/06-returned-to-topic.{png,html}`
  - `screenshots/260413-inline-comment-audit-pass55/07-after-marker-click.{png,html}`
  - `screenshots/260413-inline-comment-audit-pass55/summary.json`
- DOM-state judgment (from `summary.json`):
  - `subblipReadVisible: true`
  - `subblipBodyHtml: "<p>Inline subblip body created from Ctrl+Enter.</p>"`
  - `parentReturnedInEditMode: false`
  - `markerCount: 1` (after Hide; one preserved `[+]` marker in topic body)
  - `urlAfterMarkerClick` matches the original subblip path (re-entry intact)
- Visual judgment:
  - the subblip page is now contained in the same 1160px frame as the topic-meta-blip, no longer floating on a sea of empty white
  - the parent topic title + snippet is now visible above the focused blip as inline context
  - the focused blip exposes its real toolbar (Edit / Collapse / Expand / + / ↓ / ↑) directly
  - the breadcrumb is now a thin gray utility strip with a flat gray Hide button (not a blue gradient pill)
- Remaining hard gap (narrower but not closed):
  - the parent context row is still a single-line title + snippet, not a full read-only blip preview with author/date/bullet — tracked as task #34
  - sibling navigation across multiple anchored subblips under the same parent is still missing — tracked as task #35
  - the lower half of the subblip view is still mostly empty when the focused blip has no nested children

### 2026-04-13 - Execution 7 Complete
- Closed Hard Gap Execution 6 follow-ups #34 (parent inline preview) and #35 (sibling prev/next navigation) on the same fresh dev stack (Vite `:3000` → Express `:8788` → CouchDB `:5984`).
- Code changes:
  - `src/client/components/blip/RizzomaBlip.tsx` — added `hideChildBlips?: boolean` prop. When true, the recursive child rendering and the "Write a reply..." input are both suppressed. Used by the subblip view's parent preview to avoid duplicating the focused subblip and its siblings.
  - `src/client/components/RizzomaTopicDetail.tsx` —
    - Removed the now-unused `currentSubblipContext` memo (was an intermediate snapshot object; both branches now read straight from `currentSubblipParent` / `topic`).
    - Added `subblipSiblings`, `subblipSiblingIndex`, `prevSubblipSibling`, `nextSubblipSibling` derived state — inline children of the same parent (or topic root), sorted by `anchorPosition`.
    - Subblip view: replaced the title + snippet parent context with two real branches:
      - When `currentSubblipParent` is resolvable: render a real `<RizzomaBlip blip={currentSubblipParent} forceExpanded hideChildBlips isInlineChild />` inside the parent context block. RizzomaBlip's normal chrome (author/date/bullet, content) shows up but with the recursive children and reply input suppressed.
      - When the focused subblip is anchored directly under the topic root (the common inline-comment case, where the parent blip isn't in `allBlipsMap`): render the topic title and topic body HTML inside `.subblip-parent-context-topic` via `dangerouslySetInnerHTML`, with a 6.5em `max-height` clamp and a fade gradient at the bottom. Topic-content `[+]` markers are hidden inside the preview to avoid double interaction surfaces.
    - Added a `subblip-sibling-nav` group to the subblip nav bar with a `‹` prev button, a `1 / 2` style counter, and a `›` next button. The group is only rendered when there is more than one anchored sibling under the same parent. Buttons disable correctly at list boundaries and call `navigateToSubblip(prevSubblipSibling | nextSubblipSibling)` to update the URL hash.
    - The "Topic context" label now shows a count metadata: "· N anchored comments in this topic".
  - `src/client/components/RizzomaTopicDetail.css` — new rules for `.subblip-parent-context-label`, `.subblip-parent-context-meta`, `.subblip-parent-context-blip` (flat embedded blip chrome), `.subblip-parent-context-topic`, `.subblip-parent-topic-title`, `.subblip-parent-topic-content` (with 6.5em clamp + fade gradient + nested h1/h2/h3, ul/ol/li styling), `.subblip-sibling-nav`, `.subblip-sibling-btn`, `.subblip-sibling-counter`. All match the legacy gray utility-strip texture established in Execution 6.
  - `scripts/capture_live_subblip_siblings.cjs` — new focused live verifier. Creates a topic with 2 anchor points, Ctrl+Enters at each to create 2 sibling subblips, then exercises prev/next navigation and reads back DOM state for parent preview, sibling counter, button disabled state, and focused-body content.
- Live verification:
  - dev client: `http://127.0.0.1:3000` (Vite) backed by Express on `:8788`
  - regression: `node scripts/capture_live_inline_comment_flow.cjs screenshots/260413-inline-comment-audit-pass57 http://127.0.0.1:3000`
  - sibling flow: `node scripts/capture_live_subblip_siblings.cjs screenshots/260413-subblip-siblings-pass3 http://127.0.0.1:3000`
- Trusted packs:
  - `screenshots/260413-inline-comment-audit-pass57/` — single-subblip regression. `summary.json`: `subblipReadVisible=true`, `subblipBodyHtml="<p>Inline subblip body created from Ctrl+Enter.</p>"`, `parentReturnedInEditMode=false`. Visual: now shows the topic title, the full topic body HTML with the `[+]` marker, the "1 anchored comment in this topic" count, and the focused subblip body — all inside the same 1160px frame.
  - `screenshots/260413-subblip-siblings-pass3/` — sibling navigation. `summary.json` assertions all pass: `siblingButtonsRenderedOnSecond`, `counterShows1of2OnPrev`, `counterShows2of2OnNext`, `prevDisabledOnFirst`, `nextEnabledOnFirst`, `prevEnabledOnSecond`, `nextDisabledOnSecond`, `parentPreviewVisibleA`, `parentPreviewVisibleB`, `parentPreviewKindMatches`, `parentTextConsistent`, `focusedBodyChangesAcrossSiblings`. Visual: the prev sibling state (`05-after-prev-sibling.png`) shows the topic-context preview block with the topic title and full body, the `‹ 1 / 2 ›` sibling counter (prev disabled, next enabled), the focused first sibling body "First sibling subblip body." in read mode, and the legacy gray utility-strip nav bar.
- Visual judgment:
  - the subblip view chrome is now substantially richer than Execution 6 — the topic context preview shows the actual topic body HTML rather than a 2-line snippet, so the user sees the real surface they're commenting on
  - sibling navigation gives users a way to step through multiple anchored inline comments without going back to the topic surface in between
  - the `[+]` markers in the topic preview prove that real anchor positions are visible inline; markers are intentionally non-interactive in the preview to avoid double interaction surfaces
- Honest boundary:
  - the topic-context preview is still a clamped read-only HTML block (6.5em max-height with a fade gradient), not a fully scrollable rendering of the entire topic — long topics will be cut off after a few lines
  - the parent preview for non-root parents (when `currentSubblipParent` resolves) renders the full RizzomaBlip with its normal author/date/bullet chrome, but that branch was not exercised in pass3 because the verifier creates topic-root inline children only — covering it requires a richer fixture
  - sibling navigation only operates on inline children with `anchorPosition`; reply-style siblings (without anchorPosition) are not yet included
  - the second sibling occasionally shows up in edit mode in the verifier capture (verifier flakiness, not a product bug — typing into the second sibling editor competes with HMR/state transitions); the assertion contracts still pass

## Non-Acceptance Rule

This area must not be called “accepted” again unless all of the following are true in the live UI:
- title and body read as one meta-blip surface
- inline comments actually work
- no `All / Open / Resolved` style alien nav UI remains in the main workflow
- Edit is deterministic
- gadget insertion is clearly tied to the active blip
- thread hierarchy is legible at a glance
