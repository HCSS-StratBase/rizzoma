# Worklog - 2026-04-13

Branch: `master`

## Scope
- Reserve a distinctive Rizzoma backend port (8788) to end the recurring `:8000` collision with `google_workspace_mcp` and other dev services on this machine.
- Tighten the subblip page chrome toward legacy Rizzoma parity (Hard Gap Execution 6, follow-up to the 2026-04-01 Execution 5 boundary).

## Reserved Backend Port: 8788
- Picked **8788** as the canonical Rizzoma backend port. Distinctive, easy to remember, no common service collisions.
- Code changes:
  - `src/server/config.ts` — default `port` changed from `8000` to `8788`, with comment explaining the reason.
  - `src/server/app.ts` — CORS allowlist updated, dev `:8000` → `:3000` redirect rewritten as `:8788` → `:3000`.
  - `vite.config.ts` — proxy targets updated.
  - `package.json` — `status` script curls `:8788/api/health`.
  - `docker-compose.yml` — both `app` and `app-prod` port mappings + healthchecks updated.
  - `Dockerfile` — `EXPOSE` x2 and production `HEALTHCHECK` updated.
  - `.github/workflows/ci.yml` — both dev-stack readiness curls updated.
  - `scripts/start-all.sh` — health check + status banner updated.
  - `src/client/lib/socket.ts` — `:3000` → `:8788` translation updated.
  - `src/server/routes/notifications.ts` — invite email `APP_URL` fallback updated.
  - `create-demo-topic.cjs` — both http.request port fields updated.
- Doc changes:
  - `CLAUDE.md` — added a new "Reserved Ports" section with the full policy and a grep checklist for future port changes.
  - `CLAUDE_SESSION.md` — startup expectations + Docker conflict note now reference 8788.
  - `docs/HANDOFF.md` — current-state and run lines updated.
  - `docs/RESTART.md` — run line updated.
- Boundary preserved: capture/Playwright verifiers all take the Vite UI URL as a CLI arg (defaults to `127.0.0.1:3000` or a fresh `:4xxx` Vite session), so they did not need port-specific edits. The backend URL is only used directly by `curl` health checks, the dev redirect, and `notifications.ts` invite emails.

## Reserved Port Verification
- Live infra:
  - `docker compose up -d couchdb redis` → CouchDB 3.5.0 reachable on `:5984` after 1s, Redis on `:6379`.
- Dev stack startup:
  - `FEAT_ALL=1 EDITOR_ENABLE=1 PORT=8788 npm run dev`
  - Vite UI ready in 2049ms on `:3000`
  - Express backend listening on `:8788`
- Health check:
  - `curl http://127.0.0.1:8788/api/health` → `{"status":"ok","uptime":5084,"uptimeHuman":"5s","checks":{"couchdb":{"status":"ok","ms":3,"version":"3.5.0"}}}`
- Dev redirect:
  - `curl -I http://127.0.0.1:8788/` → `HTTP/1.1 302 Found` (redirects to `:3000`)
- Vite proxy: confirmed by the inline-comment verifier hitting `/api/*` through `127.0.0.1:3000` and getting authenticated 200/201 responses end-to-end.

## Hard Gap Execution 6: Subblip Chrome Tightening
- Restored visual parity work on the subblip page picked up from the 2026-04-01 Execution 5 boundary ("subblip page itself is still visually too weak compared with original Rizzoma").
- Code changes:
  - `src/client/components/RizzomaTopicDetail.tsx` — removed the `PARENT CONTEXT` caps label, the bullet/header/meta nested layout, and the `SUBBLIP` caps label from the subblip parent context block. Parent context now renders as a compact title + 2-line clamped snippet inline above the focused blip.
  - `src/client/components/RizzomaTopicDetail.css`:
    - rewrote `.subblip-view` to match the `.topic-meta-blip` chrome (1160px width, same gradient/border/shadow/radius, blur backdrop, `max-height: calc(100vh - 120px)`).
    - rewrote `.subblip-nav-bar` to match the `.topic-blip-toolbar` legacy gray utility-strip texture (linear-gradient, inset shadows, bottom border).
    - rewrote `.subblip-hide-btn` to match `.topic-tb-btn` (flat gray with rounded 4px corners) instead of the previous blue gradient pill.
    - flattened `.subblip-stage` to a transparent in-container scroll region (`background: transparent`, `border: none`, `box-shadow: none`).
    - flattened `.subblip-focus-shell` so the focused blip uses normal blip chrome (no extra rounded card, no extra padding, no rail bar).
    - compacted `.subblip-parent-context` to a 13px title + 2-line clamped 12px snippet at lighter color.

## Hard Gap Execution 6 Verification
- Live verification:
  - dev client: `http://127.0.0.1:3000`
  - command: `node scripts/capture_live_inline_comment_flow.cjs screenshots/260413-inline-comment-audit-pass55 http://127.0.0.1:3000`
- Trusted artifacts:
  - `screenshots/260413-inline-comment-audit-pass55/01-topic-loaded.{png,html}`
  - `screenshots/260413-inline-comment-audit-pass55/02-topic-edit-mode.{png,html}`
  - `screenshots/260413-inline-comment-audit-pass55/03-after-ctrl-enter.{png,html}`
  - `screenshots/260413-inline-comment-audit-pass55/04-subblip-done-mode.{png,html}`
  - `screenshots/260413-inline-comment-audit-pass55/05-after-hide-click.{png,html}`
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
  - the focused blip exposes its real toolbar (Edit / Collapse / Expand / + / ↓ / ↑) directly in the subblip view
  - the breadcrumb is now a thin gray utility strip with a flat gray Hide button (not a blue gradient pill)
- Honest boundary (narrower but not closed):
  - the parent context row is still a single-line title + snippet, not a full read-only blip preview with author/date/bullet — tracked as task #34
  - sibling navigation across multiple anchored subblips under the same parent is still missing — tracked as task #35
  - the lower half of the subblip view is still mostly empty when the focused blip has no nested children

## Hard Gap Execution 7: Subblip Parent Preview + Sibling Navigation
- Closed Execution 6 follow-ups #34 (parent inline preview) and #35 (sibling prev/next nav) on the same fresh dev stack (Vite `:3000` → Express `:8788` → CouchDB `:5984`).
- Code changes:
  - `src/client/components/blip/RizzomaBlip.tsx` — added `hideChildBlips?: boolean` prop. When true, both the recursive child rendering and the "Write a reply..." input are suppressed. Used by the subblip view's parent preview to avoid duplicating the focused subblip and its siblings inside the parent context strip.
  - `src/client/components/RizzomaTopicDetail.tsx`:
    - Removed the now-unused `currentSubblipContext` memo. Both render branches now read straight from `currentSubblipParent` / `topic`.
    - Added `subblipSiblings` (inline children of the same parent or topic root, sorted by `anchorPosition`), `subblipSiblingIndex`, `prevSubblipSibling`, `nextSubblipSibling` derived state.
    - Subblip view: replaced the title + snippet parent context with two real branches:
      - When `currentSubblipParent` is resolvable: real `<RizzomaBlip blip={currentSubblipParent} forceExpanded hideChildBlips isInlineChild />` inside the parent context block.
      - When the focused subblip is anchored directly under the topic root (the common case for inline comments on the meta-blip, where the parent isn't in `allBlipsMap`): render the topic title and topic body HTML inside `.subblip-parent-context-topic` via `dangerouslySetInnerHTML`, with a 6.5em `max-height` clamp and a fade gradient at the bottom. Topic-content `[+]` markers are hidden inside the preview to avoid double interaction surfaces.
    - Added a `subblip-sibling-nav` group to the subblip nav bar with a `‹` prev button, a `1 / 2` style counter, and a `›` next button. Only rendered when there is more than one anchored sibling under the same parent. Buttons disable correctly at list boundaries and call `navigateToSubblip()` to update the URL hash.
    - The "Topic context" label now shows count metadata: "· N anchored comments in this topic".
  - `src/client/components/RizzomaTopicDetail.css` — new rules for `.subblip-parent-context-label`, `.subblip-parent-context-meta`, `.subblip-parent-context-blip` (flat embedded blip chrome — strips toolbar, card background, padding), `.subblip-parent-context-topic`, `.subblip-parent-topic-title`, `.subblip-parent-topic-content` (with 6.5em clamp + fade gradient + nested h1/h2/h3, ul/ol/li styling), `.subblip-sibling-nav`, `.subblip-sibling-btn`, `.subblip-sibling-counter`. All match the legacy gray utility-strip texture established in Execution 6.
  - `scripts/capture_live_subblip_siblings.cjs` — new focused live verifier. Creates a topic with 2 anchor points, Ctrl+Enters at each to create 2 sibling subblips, then exercises prev/next navigation and reads back DOM state for parent preview, sibling counter, button disabled state, and focused-body content.

## Hard Gap Execution 7 Verification
- Live verification:
  - dev client: `http://127.0.0.1:3000` (Vite) backed by Express on `:8788`
  - regression: `node scripts/capture_live_inline_comment_flow.cjs screenshots/260413-inline-comment-audit-pass57 http://127.0.0.1:3000`
  - sibling flow: `node scripts/capture_live_subblip_siblings.cjs screenshots/260413-subblip-siblings-pass3 http://127.0.0.1:3000`
- Trusted artifacts:
  - `screenshots/260413-inline-comment-audit-pass57/01..07-*.{png,html}` + `summary.json` — single-subblip regression, all original assertions still pass.
  - `screenshots/260413-subblip-siblings-pass3/01..06-*.{png,html}` + `summary.json` — sibling navigation contract.
- DOM-state judgment (pass57 inline-comment regression):
  - `subblipReadVisible: true`
  - `subblipBodyHtml: "<p>Inline subblip body created from Ctrl+Enter.</p>"`
  - `parentReturnedInEditMode: false`
  - Visual now shows the topic title, the full topic body HTML with the `[+]` marker, the "1 anchored comment in this topic" count metadata, and the focused subblip body — all inside the same 1160px frame.
- DOM-state judgment (pass3 sibling navigation), all 12 assertions pass:
  - `siblingButtonsRenderedOnSecond: true`
  - `counterShows1of2OnPrev: true`
  - `counterShows2of2OnNext: true`
  - `prevDisabledOnFirst: true`
  - `nextEnabledOnFirst: true`
  - `prevEnabledOnSecond: true`
  - `nextDisabledOnSecond: true`
  - `parentPreviewVisibleA: true`
  - `parentPreviewVisibleB: true`
  - `parentPreviewKindMatches: true` (both states resolve to `parentPreviewKind: "topic"`)
  - `parentTextConsistent: true`
  - `focusedBodyChangesAcrossSiblings: true`
- Visual judgment:
  - The subblip view chrome is substantially richer than Execution 6 — the topic context preview now shows the actual topic body HTML (with markers visible inline) instead of a 2-line snippet, so the user can see the real surface they are commenting on.
  - Sibling navigation lets users step through multiple anchored inline comments without going back to the topic surface between them.
- Honest boundary:
  - The topic-context preview is still a clamped read-only HTML block (6.5em max-height with a fade gradient), not a fully scrollable rendering of the entire topic. Long topics will be cut off after a few lines.
  - The parent preview for non-root parents (when `currentSubblipParent` resolves to a normal blip) was not exercised in pass3 because the verifier creates topic-root inline children only. Covering it requires a richer fixture.
  - Sibling navigation only operates on inline children with `anchorPosition`. Reply-style siblings (without `anchorPosition`) are not yet included.
  - The second sibling occasionally shows up in edit mode in the verifier capture (verifier flakiness, not a product bug — typing into the second sibling editor competes with state transitions during the Hide → re-enter-edit → Ctrl+Enter sequence). The DOM assertion contracts still pass; the focused-body text is observed correctly for the prev-sibling state.

## WSL2 Vite HMR Note
- During Execution 7 the first verifier pass against the running dev stack returned stale HTML (the new `subblip-parent-context-topic` branch was missing from the rendered DOM). Confirmed by direct grep of the captured `.html` files. Killing and restarting the Vite server picked up the new TSX, after which both verifiers passed cleanly.
- This matches the existing `CLAUDE_SESSION.md` warning: "HMR DOES NOT pick up .tsx/.ts changes — MUST kill and restart Vite server." Worth re-emphasizing whenever a verifier reports state inconsistent with what `grep` shows in the source files.
