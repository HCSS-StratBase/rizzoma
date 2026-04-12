# Worklog - 2026-03-31

Branch: `master`

## Scope
- Continue Rizzoma gadget/runtime modernization from the accepted planner baseline.
- Verify that the cleaned topic save + read-mode iframe bootstrap path generalizes beyond the planner app.

## Changes
- Updated `scripts/capture_live_topic_app.cjs` to always create the target artifact directories before writing post-save debug/output files.
- Carried the cleaned runtime path through the real authenticated topic flow on the fresh `http://127.0.0.1:4193` client for:
  - `Focus`
  - `Kanban`
- No new product-side runtime bug surfaced in these two follow-on passes; the planner-title/persistence/read-mode fixes generalized cleanly.

## Verification
- Accepted live artifacts:
  - `screenshots/260331-app-runtime/live-topic-focus-v1.png`
  - `screenshots/260331-app-runtime/live-topic-focus-v1.html`
  - `screenshots/260331-app-runtime/live-topic-kanban-v1.png`
  - `screenshots/260331-app-runtime/live-topic-kanban-v1.html`
- Visual judgment:
  - `Focus` is acceptable: the saved read view preserves the session state and the app shell reads coherently in-topic.
  - `Kanban` is acceptable: the added sample card persists and the saved board reads cleanly in-topic.

## Current Judgment
- The cleaned app-frame persistence/bootstrap path is now verified across all three preview apps:
  - Planner
  - Focus
  - Kanban
- Next step: move from “three accepted previews” toward a more explicit install/runtime lifecycle in the Store and tighten remaining BLB/live parity work on top of this stable baseline.

## Store Install Lifecycle
- Added workspace-level preview-app install state in `src/client/gadgets/apps/installState.ts`.
- Updated `StorePanel` so preview apps have real install/remove controls and removed the duplicate preview rows that were mixing registry and catalog entries.
- Updated `GadgetPalette` so sandboxed apps only appear when installed in the current workspace.
- Added live verification helpers:
  - `scripts/capture_live_store_install_lifecycle.cjs`
  - `scripts/capture_live_topic_palette.cjs`

## Store Install Verification
- Focused tests:
  - `npm test -- --run src/tests/client.gadgets.appsCatalog.test.ts src/tests/client.gadgets.insert.test.ts src/tests/client.gadgets.appInstallState.test.ts`
  - result: 3 files, 10 tests passed
- Branch/doc guard:
  - `npm run lint:branch-context` passed
- Accepted live artifacts on the clean `http://127.0.0.1:4196` client:
  - `screenshots/260331-store-lifecycle/store-focus-removed.{png,html}`
  - `screenshots/260331-store-lifecycle/palette-focus-removed.{png,html}`
  - `screenshots/260331-store-lifecycle/store-focus-installed.{png,html}`
  - `screenshots/260331-store-lifecycle/palette-focus-installed.{png,html}`
- Visual judgment:
  - the Store now expresses a real lifecycle instead of fake install copy
  - `Focus` disappears from the picker when removed and returns when installed

## Server-backed Gadget Preferences
- Added `src/server/routes/gadgets.ts` with `GET /api/gadgets/preferences` and `PATCH /api/gadgets/preferences` so preview-app install state is persisted through the authenticated server/CouchDB path instead of only `localStorage`.
- Mounted the new route in `src/server/app.ts`.
- Updated `src/client/gadgets/apps/installState.ts` to hydrate installed app IDs from the server and persist install/remove changes back to the server while still emitting the existing install-state event for the picker.
- Updated `src/client/components/StorePanel.tsx` and `src/client/components/GadgetPalette.tsx` so the live Store/picker flow uses the server-backed preference path.
- Updated `scripts/capture_live_store_install_lifecycle.cjs` so the verification reset/setup step also goes through `/api/gadgets/preferences`.

## Server-backed Gadget Verification
- Focused tests:
  - `npm test -- --run src/tests/client.gadgets.appsCatalog.test.ts src/tests/client.gadgets.insert.test.ts src/tests/client.gadgets.appInstallState.test.ts src/tests/server.gadgetPreferences.test.ts`
  - result: 4 files, 13 tests passed
- Branch/doc guard:
  - `npm run lint:branch-context` passed
- Accepted live artifacts on the clean `http://127.0.0.1:4196` client:
  - `screenshots/260331-store-lifecycle-server/store-focus-removed.{png,html}`
  - `screenshots/260331-store-lifecycle-server/palette-focus-removed.{png,html}`
  - `screenshots/260331-store-lifecycle-server/store-focus-installed.{png,html}`
  - `screenshots/260331-store-lifecycle-server/palette-focus-installed.{png,html}`
- Visual judgment:
  - the Store still reads cleanly after the preference migration
  - `Focus Timer` removal still removes `Focus` from the live picker
  - reinstalling `Focus Timer` still restores `Focus` to the live picker
  - the accepted user-facing behavior now rides on the authenticated server preference path instead of a local-only cache

## Preference Lifecycle Hardening
- Expanded the server response contract in `src/server/routes/gadgets.ts` so gadget preferences now declare:
  - `schemaVersion`
  - `scope: user`
  - `defaultInstalledAppIds`
  - `installedAppIds`
- Added explicit reset-to-default behavior on `PATCH /api/gadgets/preferences`.
- Updated `src/client/gadgets/apps/installState.ts` with `DEFAULT_INSTALLED_APP_IDS` and `resetInstalledAppIdsToServer()`.
- Updated `src/client/components/StorePanel.tsx` / `StorePanel.css` so the Store explains that preview-app availability is stored per signed-in user and now exposes a real `Reset preview apps` action.
- Hardened `scripts/capture_live_store_install_lifecycle.cjs` so the lifecycle proof is now truly cross-session:
  - waits for the real server-backed save
  - reopens fresh browser sessions between remove/install checks
  - captures the focused Store card state instead of page chrome

## Preference Lifecycle Verification
- Focused tests:
  - `npm test -- --run src/tests/server.gadgetPreferences.test.ts src/tests/client.gadgets.appInstallState.test.ts src/tests/client.gadgets.appsCatalog.test.ts src/tests/client.gadgets.insert.test.ts`
  - result: 4 files, 14 tests passed
- Accepted fresh cross-session artifacts on the clean server/client pair (`http://127.0.0.1:8000` + `http://127.0.0.1:4196`):
  - `screenshots/260331-store-lifecycle-session7/store-focus-removed.{png,html}`
  - `screenshots/260331-store-lifecycle-session7/palette-focus-removed.{png,html}`
  - `screenshots/260331-store-lifecycle-session7/store-focus-installed.{png,html}`
  - `screenshots/260331-store-lifecycle-session7/palette-focus-installed.{png,html}`
- Visual judgment:
  - fresh-login `Remove` persists to `Install` in the Store card
  - the reopened gadget picker drops `Focus` after removal and restores it after reinstall
  - the runtime lifecycle is now explicit about user scope and defaults instead of relying on implicit local cache behavior

## BLB Topic-root Parity Pass
- Tightened the root topic shell in `src/client/components/RizzomaTopicDetail.css` so BLB-style topic reading feels denser and less like a floating showcase card:
  - flattened the meta-blip chrome further
  - widened the topic root surface
  - tightened header/body spacing
  - reduced oversized heading/body typography
  - added explicit read-mode list spacing and inline thread-marker styling
- Upgraded `scripts/capture_blb_probe.cjs` so the BLB probe now seeds a denser topic-root document instead of a nearly empty stub. The probe content now includes:
  - a short intro paragraph
  - nested lists
  - inline thread markers
  - a closing note above the reply box

## BLB Topic-root Verification
- Live verification:
  - `node scripts/capture_blb_probe.cjs http://127.0.0.1:4196 screenshots/260331-blb-parity`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-parity/blb-probe-v1.png`
  - `screenshots/260331-blb-parity/blb-probe-v1.html`
- Visual judgment:
  - the root topic surface now reads flatter and denser
  - list content and inline markers feel closer to the legacy BLB texture
  - the reply box now sits more naturally beneath a unified topic-root body instead of a roomy presentation card

## BLB Marker Parity Refinement
- Aligned the topic-root read-mode `.blip-thread-marker` styling in `src/client/components/RizzomaTopicDetail.css` with the already-accepted editor/collapsed-blip marker contract:
  - gray rounded-square default
  - green unread state
  - matching hover colors
  - tighter left margin and sizing
- Re-ran the BLB probe on the clean `:4196` client and kept `screenshots/260331-blb-parity/blb-probe-v1.{png,html}` as the accepted artifact set for this refinement.

## BLB Inline-thread Parity Pass
- Extended `scripts/capture_blb_probe.cjs` with an `inline` mode that seeds:
  - a root-topic anchored inline child blip
  - a nested anchored inline child under that first child
  - Playwright expansion clicks for the first `[+]` marker and the nested `[+]` marker before capture
- Added an `inline-child` DOM class in `src/client/components/blip/RizzomaBlip.tsx` so inline-expanded children can be styled separately from normal blips.
- Tightened `src/client/components/blip/RizzomaBlip.css` so inline-expanded children read as thread continuations instead of stacked mini-cards:
  - lighter left-rail/thread styling
  - transparent/unstyled inline-child content shells
  - muted active chrome for inline children
  - quieter inline reply treatment
- Updated `src/client/components/blip/RizzomaBlip.tsx` so inline children only surface the reply input once the child is active, rather than rendering it immediately on expansion.

## BLB Inline-thread Verification
- Live verification:
  - `node scripts/capture_blb_probe.cjs http://127.0.0.1:4196 screenshots/260331-blb-inline inline`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-inline/blb-inline-probe-v1.png`
  - `screenshots/260331-blb-inline/blb-inline-probe-v1.html`
- Visual judgment:
  - real root-inline and nested-inline `[+]` expansion now render inside the authenticated topic shell without title corruption
  - the inline-expanded view reads as a lighter threaded continuation, not stacked white cards

## BLB Mixed-thread Parity Pass
- Extended `scripts/capture_blb_probe.cjs` with a `mixed` mode that seeds:
  - a root inline child with nested inline expansion
  - a separate root list-thread reply with its own nested collapsed child
  - Playwright expansion for both the inline markers and the list-thread row before capture
- Tightened collapsed list-thread row styling in `src/client/components/blip/RizzomaBlip.css` so the mixed threaded surface stays visually coherent beside the lighter inline-expanded thread.

## BLB Mixed-thread Verification
- Live verification:
  - `node scripts/capture_blb_probe.cjs http://127.0.0.1:4196 screenshots/260331-blb-mixed mixed`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-mixed/blb-mixed-probe-v1.png`
  - `screenshots/260331-blb-mixed/blb-mixed-probe-v1.html`
- Visual judgment:
  - the mixed live topic now shows inline-expanded and list-thread structures together without the lower collapsed row visually collapsing into a stray afterthought
  - the surface is still more modern than legacy, but the mixed thread texture is now acceptable as a live BLB parity baseline

## BLB Unread-thread Parity Pass
- Extended `scripts/capture_blb_probe.cjs` with an `unread` mode that creates a more realistic unread-state mix:
  - one root inline child kept unread
  - one nested inline child explicitly marked read
  - two additional root inline children explicitly marked read so their markers stay neutral gray
  - one collapsed list-thread parent explicitly marked read while its nested child stays unread
- Added a probe helper that calls the real `POST /api/waves/:waveId/blips/:blipId/read` route so the capture reflects server-backed unread state instead of CSS-only assumptions.
- Tightened `src/client/components/blip/RizzomaBlip.css` so unread collapsed list-thread rows read more clearly in the live topic shell:
  - soft green-tinted unread row background
  - stronger left-edge unread accent
  - greener bullet/label treatment
  - subtle unread wash on expanded inline-child content

## BLB Unread-thread Verification
- Live verification:
  - `node scripts/capture_blb_probe.cjs http://127.0.0.1:4196 screenshots/260331-blb-unread unread`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-unread/blb-unread-probe-v1.png`
  - `screenshots/260331-blb-unread/blb-unread-probe-v1.html`
- Visual judgment:
  - the live topic now shows a believable unread mix instead of an all-green/all-gray probe
  - the active inline-expanded thread keeps the toolbar while neutral gray markers remain visible elsewhere
  - a collapsed list-thread row can now read as unread because of a child without looking like a broken leftover state

## BLB Toolbar-state Parity Pass
- Extended `scripts/capture_blb_probe.cjs` with a `toolbar` mode that seeds:
  - a root inline thread kept quiet until activation,
  - a root list-thread reply used as the expanded-toolbar case,
  - and a second collapsed list-thread reply as the no-toolbar comparison row.
- Hardened collapsed-row expansion in `src/client/components/blip/RizzomaBlip.tsx` by stopping propagation on collapsed-row clicks and driving `handleToggleExpand()` directly from the collapsed row instead of relying on outer-container click behavior.
- Tightened the toolbar probe to activate target blips through the app’s own `rizzoma:activate-blip` event and to expand the list reply from inside the page, avoiding stale Playwright hit-target assumptions.

## BLB Toolbar-state Verification
- Live verification:
  - `node scripts/capture_blb_probe.cjs http://127.0.0.1:4196 screenshots/260331-blb-toolbar toolbar`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-toolbar/blb-toolbar-probe-v1.png`
  - `screenshots/260331-blb-toolbar/blb-toolbar-probe-v1.html`
- Visual judgment:
  - the expanded list-thread reply now shows its toolbar cleanly in the same live topic surface where the comparison row stays collapsed and toolbar-free
  - the capture is no longer ambiguous about “toolbar only for expanded blips”
  - the topic-root surface remains dense enough to compare against BLB without the toolbar state getting lost in a sparse demo harness

## BLB Toolbar Visual Parity Pass
- Flattened the per-blip toolbar in `src/client/components/blip/BlipMenu.css` to better match the legacy Rizzoma strip:
  - reduced toolbar height and button padding
  - switched the edit toolbar from a blue pill bar to a thin light-gray strip
  - softened separators and hover states
  - tightened inline-child toolbar sizing to keep it from dominating the thread

## BLB Toolbar Visual Verification
- Live verification:
  - `node scripts/capture_blb_probe.cjs http://127.0.0.1:4196 screenshots/260331-blb-toolbar toolbar`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-toolbar/blb-toolbar-probe-v1.png`
  - `screenshots/260331-blb-toolbar/blb-toolbar-probe-v1.html`
- Visual judgment:
  - the toolbar now reads as a legacy-style utility strip instead of a modern blue control bar
  - the expanded list-thread toolbar is materially quieter and closer to the CoffeeScript-era reference
  - the surface still feels modernized, but the toolbar no longer steals focus from the blip content

## BLB Dense Live Scenario Pass
- Added `scripts/capture_blb_live_scenario.cjs` to capture a more natural authenticated BLB-style topic instead of the stripped-down parity probes.
- The scenario now seeds:
  - a business-topic style root with `#MetaTopic`, short section bullets, and explanatory body copy
  - one unread inline thread activated in place
  - one read inline marker that stays neutral
  - one expanded list-thread reply with toolbar
  - one collapsed unread comparison reply driven by a nested child
- Fixed the scenario anchor positions so inline markers/threads stop corrupting the topic title and land inside the intended body rows.

## BLB Dense Live Scenario Verification
- Live verification:
  - `node scripts/capture_blb_live_scenario.cjs http://127.0.0.1:4196 screenshots/260331-blb-live-scenario`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v1.png`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v1.html`
- Visual judgment:
  - this is a better live baseline than the tiny probe shells because the topic root now reads like a plausible business topic
  - the title stays intact while mixed inline/list unread states remain visible lower in the same capture
  - some marker placements are still a little rough in the body text, but the overall live surface is now acceptable as a denser parity reference

## BLB Dense Live Toolbar-focus Pass
- Extended `scripts/capture_blb_live_scenario.cjs` beyond the single-toolbar case so the authenticated business-topic scenario now seeds:
  - one primary expanded list reply intended to own the active toolbar,
  - one secondary expanded list reply that should stay quieter,
  - and the existing collapsed unread comparison reply.
- Tightened `src/client/components/blip/RizzomaBlip.css` so inactive expanded replies get a lighter card treatment while the active expanded reply keeps the stronger focus treatment.
- Added DOM-state verification to the live scenario capture so the script now reports:
  - expanded reply count,
  - visible toolbar count,
  - whether the intended primary expanded reply is the active one at capture time.

## BLB Dense Live Toolbar-focus Verification
- Live verification:
  - `node scripts/capture_blb_live_scenario.cjs http://127.0.0.1:4196 screenshots/260331-blb-live-scenario`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v2.png`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v2.html`
- DOM-state judgment:
  - `expandedReplyCount = 2`
  - `visibleToolbarCount = 1`
  - `primaryExpandedIsActive = true`
- Visual judgment:
  - the denser live scenario now proves the toolbar-focus contract in a more realistic multi-reply topic
  - the active expanded reply owns the toolbar while the second expanded reply stays visually quieter instead of competing equally for focus

## BLB Active-blip Plumbing Pass
- Introduced a shared window-level active-blip source of truth in `src/client/components/blip/RizzomaBlip.tsx` so non-root blip activation is no longer split across ad hoc local `setIsActive(true)` paths.
- Routed non-root click/expand activation through the shared active-blip path instead of direct local activation.
- Re-ran the existing live toolbar probe after the refactor to make sure the accepted expanded-vs-collapsed toolbar case still holds.
- Important follow-up from the same batch:
  - the denser multi-reply live scenario still exposes an unresolved toolbar-focus leak across multiple expanded list replies
  - that richer case remains the next target and is not being claimed as accepted yet

## BLB Active-blip Plumbing Verification
- Live verification:
  - `node scripts/capture_blb_probe.cjs http://127.0.0.1:4196 screenshots/260331-blb-toolbar toolbar`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-toolbar/blb-toolbar-probe-v1.png`
  - `screenshots/260331-blb-toolbar/blb-toolbar-probe-v1.html`
- Visual judgment:
  - the accepted single-toolbar BLB case still holds after the activation refactor
  - the expanded reply retains the toolbar while the collapsed comparison row stays quiet

## BLB Dense Live Toolbar-focus Fix
- Reworked `src/client/components/blip/RizzomaBlip.tsx` so non-inline, non-topic-root replies derive their visible/interactive active state from a shared active-blip owner instead of stale per-instance `isActive` state.
- Added explicit `data-active-blip` rendering on blip containers so the DOM/CSS now reflects the same active-owner truth used by the component.
- Verified the prior `:4196` client was stale because the fresh HTML did not include the new `data-active-blip` attribute; restarted a forced Vite client and re-ran the live scenario against the clean `:4197` build.

## BLB Dense Live Toolbar-focus Verification
- Live verification:
  - `node scripts/capture_blb_live_scenario.cjs http://127.0.0.1:4197 screenshots/260331-blb-live-scenario`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.png`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.html`
- DOM-state judgment:
  - `expandedReplyCount = 2`
  - `visibleToolbarCount = 1`
  - `primaryExpandedIsActive = true`
- Visual judgment:
  - the dense live business-topic scenario now behaves correctly with two expanded top-level replies
  - only the primary expanded reply owns the toolbar
  - the secondary expanded reply stays visibly quieter while the collapsed unread comparison reply still reads correctly

## BLB Dense Live Content Naturalization Pass
- Reworked `scripts/capture_blb_live_scenario.cjs` so the business-topic seed uses more natural, less obviously synthetic thread copy while preserving the same inline/list/unread structure.
- Kept the same accepted toolbar-focus contract in the live scenario:
  - two expanded top-level replies,
  - one active toolbar owner,
  - one collapsed unread comparison reply.

## BLB Dense Live Content Naturalization Verification
- Live verification:
  - `node scripts/capture_blb_live_scenario.cjs http://127.0.0.1:4197 screenshots/260331-blb-live-scenario`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.png`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.html`
- DOM-state judgment:
  - `expandedReplyCount = 2`
  - `visibleToolbarCount = 1`
  - `primaryExpandedIsActive = true`
- Visual judgment:
  - the topic now reads more like a real business-thread conversation instead of a test harness
  - the reply distribution still feels controlled, and the active toolbar remains isolated to the primary expanded reply

## BLB Dense Live Uneven Unread Distribution Pass
- Extended `scripts/capture_blb_live_scenario.cjs` so the dense live scenario no longer uses a neat one-child-per-reply pattern.
- Both expanded top-level replies now carry:
  - one read child
  - one still-unread child
- The collapsed comparison reply now carries:
  - one unread child
  - one read child
- Kept the same accepted toolbar-focus contract while making the unread distribution feel less mechanically seeded.

## BLB Dense Live Uneven Unread Distribution Verification
- Live verification:
  - `node scripts/capture_blb_live_scenario.cjs http://127.0.0.1:4197 screenshots/260331-blb-live-scenario`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.png`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.html`
- DOM-state judgment:
  - `expandedReplyCount = 2`
  - `visibleToolbarCount = 1`
  - `primaryExpandedIsActive = true`
  - `collapsedUnreadVisible = true`
  - `collapsedUnreadHasUnreadIcon = true`
- Visual judgment:
  - the extra unread/read grandchildren make the thread feel less staged
  - the highlighted child rows add useful asymmetry without overwhelming the topic shell
  - the active toolbar still belongs only to the primary expanded reply

## BLB Dense Live Mobile Layout Pass
- Added explicit toolbar group classes in `src/client/components/blip/BlipMenu.tsx` so narrow-screen behavior can hide low-priority groups without relying on brittle group order.
- Tightened the mobile toolbar in `src/client/components/blip/BlipMenu.css`:
  - hides insert/format/highlight/list groups in edit mode on very small screens,
  - hides comments/link groups in read mode,
  - reduces button sizing,
  - keeps overflow/mobile triggers visible,
  - reduces nested toolbar left offset.
- Tightened the mobile blip header/content layout in `src/client/components/blip/RizzomaBlip.css`:
  - smaller author/contributor footprint,
  - narrower date block,
  - lighter expanded spacing,
  - slightly denser inline-child spacing.

## BLB Dense Live Mobile Verification
- Live verification:
  - `node scripts/capture_blb_live_scenario_mobile.cjs http://127.0.0.1:4197 screenshots/260331-blb-live-scenario-mobile`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-live-scenario-mobile/blb-live-scenario-mobile-v1.png`
  - `screenshots/260331-blb-live-scenario-mobile/blb-live-scenario-mobile-v1.html`
- DOM-state judgment:
  - `expandedReplyCount = 2`
  - `visibleToolbarCount = 1`
  - `primaryExpandedIsActive = true`
  - `collapsedUnreadVisible = true`
  - `collapsedUnreadHasUnreadIcon = true`
- Visual judgment:
  - the per-blip toolbar no longer overwhelms the expanded reply on a narrow viewport
  - author/date chrome is smaller and less competitive with the main text
  - the dense thread still reads coherently on mobile while preserving the single-toolbar contract

## BLB Dense Live Perf Baseline Instrumentation
- Extended `scripts/capture_blb_live_scenario.cjs` to emit a metrics JSON artifact alongside the accepted screenshot/HTML dump.
- The verifier now records:
  - step timings for initial load, inline expansion, inline activation, primary/secondary reply expansion, and final re-activation,
  - total scenario time,
  - DOM counts for rendered blips, visible menus, expanded replies, unread markers, and inline-expanded children.
- This is an instrumentation baseline, not yet a hard budget gate: the timings still include intentional waits used to stabilize the live scenario before capture.

## BLB Dense Live Perf Baseline Verification
- Live verification:
  - `node scripts/capture_blb_live_scenario.cjs http://127.0.0.1:4197 screenshots/260331-blb-live-scenario`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.png`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.html`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.metrics.json`
- Recorded baseline:
  - `initialLoadMs = 1944`
  - `inlineExpandMs = 4168`
  - `inlineActivateMs = 650`
  - `primaryExpandMs = 722`
  - `secondaryExpandMs = 1829`
  - `primaryActivateMs = 1215`
  - `totalScenarioMs = 14405`
  - `domBlipCount = 5`
  - `menuCount = 1`
  - `expandedReplies = 2`
  - `inlineExpanded = 1`
- Judgment:
  - the dense live scenario now has a repeatable perf instrumentation path tied to the same accepted toolbar/unread state
  - the next perf slice should reduce reliance on fixed wait windows so these numbers become more diagnostic

## BLB Dense Live Perf Wait-State Tightening
- Replaced the dense live scenario verifier's fixed post-action waits in `scripts/capture_blb_live_scenario.cjs` with state-based waits tied to:
  - inline child expansion,
  - inline child activation,
  - primary and secondary reply expansion,
  - and final primary active-owner restoration with a single visible toolbar.
- This keeps the verifier locked to the same accepted BLB state while removing most of the artificial delay from the timing output.

## BLB Dense Live Perf Wait-State Verification
- Live verification:
  - `node scripts/capture_blb_live_scenario.cjs http://127.0.0.1:4197 screenshots/260331-blb-live-scenario`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.png`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.html`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.metrics.json`
- Updated baseline:
  - `initialLoadMs = 290`
  - `inlineExpandMs = 308`
  - `inlineActivateMs = 280`
  - `primaryExpandMs = 19`
  - `secondaryExpandMs = 25`
  - `primaryActivateMs = 44`
  - `totalScenarioMs = 4227`
  - `domBlipCount = 5`
  - `menuCount = 1`
- Comparison to the coarse baseline:
  - previous `totalScenarioMs = 14405`
  - current `totalScenarioMs = 4227`
- Judgment:
  - the timing output is now far more diagnostic because it is dominated by actual UI state convergence instead of hard sleeps
  - the same accepted dense live toolbar/unread contract remains intact while the perf probe becomes useful for regression pressure

## BLB Dense Live Broader Reply Distribution Pass
- Broadened `scripts/capture_blb_live_scenario.cjs` with one additional neutral collapsed top-level reply plus a read child.
- The accepted dense scenario now covers:
  - two expanded top-level replies,
  - one collapsed unread comparison reply with mixed children,
  - one extra collapsed read-only follow-up thread,
  - the same single-toolbar active-owner rule.

## BLB Dense Live Broader Reply Distribution Verification
- Live verification:
  - `node scripts/capture_blb_live_scenario.cjs http://127.0.0.1:4197 screenshots/260331-blb-live-scenario`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.png`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.html`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.metrics.json`
- Updated state:
  - `expandedReplyCount = 2`
  - `visibleToolbarCount = 1`
  - `collapsedUnreadVisible = true`
  - `collapsedUnreadHasUnreadIcon = true`
  - `collapsedReadVisible = true`
- Updated perf snapshot:
  - `totalScenarioMs = 5276`
  - `domBlipCount = 6`
  - `menuCount = 1`
- Visual judgment:
  - the extra neutral collapsed thread broadens the distribution without breaking the shell rhythm
  - the active toolbar still belongs only to the primary expanded reply

## BLB Dense Live Less-Uniform Distribution Pass
- Reworked `scripts/capture_blb_live_scenario.cjs` again so the dense live topic is less mechanically regular:
  - the primary expanded reply now carries a second paragraph,
  - the secondary expanded reply is slightly longer,
  - the collapsed unread child is longer and is created after the read child,
  - the neutral collapsed follow-up thread also carries a second paragraph.
- The goal was to make the accepted scenario feel less like a neat synthetic staircase while keeping the same single-toolbar active-owner contract.

## BLB Dense Live Less-Uniform Distribution Verification
- Live verification:
  - `node scripts/capture_blb_live_scenario.cjs http://127.0.0.1:4197 screenshots/260331-blb-live-scenario`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.png`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.html`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.metrics.json`
- Accepted state:
  - `expandedReplyCount = 2`
  - `visibleToolbarCount = 1`
  - `collapsedUnreadHasUnreadIcon = true`
  - `collapsedReadVisible = true`
  - `domBlipCount = 6`
- Updated perf snapshot:
  - `initialLoadMs = 348`
  - `inlineExpandMs = 416`
  - `inlineActivateMs = 246`
  - `primaryExpandMs = 81`
  - `secondaryExpandMs = 120`
  - `primaryActivateMs = 42`
  - `totalScenarioMs = 5227`
- Visual judgment:
  - the dense topic now reads less like a perfectly staged test fixture
  - the heavier primary reply still stays readable and the single-toolbar contract remains intact

## BLB Dense Live Messier Top-level Distribution Pass
- Extended `scripts/capture_blb_live_scenario.cjs` with a neutral collapsed middle follow-up thread positioned between the two expanded top-level replies.
- The accepted dense scenario now reads less like a stacked demo ladder and more like a messy real thread with mixed active and inactive follow-ups interleaved.

## BLB Dense Live Messier Top-level Distribution Verification
- Live verification:
  - `node scripts/capture_blb_live_scenario.cjs http://127.0.0.1:4197 screenshots/260331-blb-live-scenario`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.png`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.html`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.metrics.json`
- Accepted state:
  - `expandedReplyCount = 2`
  - `visibleToolbarCount = 1`
  - `midCollapsedVisible = true`
  - `collapsedUnreadHasUnreadIcon = true`
  - `collapsedReadVisible = true`
  - `domBlipCount = 7`
- Updated perf snapshot:
  - `initialLoadMs = 410`
  - `inlineExpandMs = 360`
  - `inlineActivateMs = 425`
  - `primaryExpandMs = 60`
  - `secondaryExpandMs = 103`
  - `primaryActivateMs = 43`
  - `totalScenarioMs = 5432`
- Visual judgment:
  - the middle collapsed row breaks the top-level rhythm in a believable way
  - the two expanded replies still carry the visual focus, and the single-toolbar contract remains intact

## BLB Dense Live Hierarchy Correction Pass
- Re-read `docs/BLB_LOGIC_AND_PHILOSOPHY.md` and the original topic/blip references after the user correctly flagged that the dense live scenario had drifted away from the documented topic = meta-blip model.
- Corrected `scripts/capture_blb_live_scenario.cjs` so the topic remains the root/meta-blip, the main discussion sits in one real top-level thread under that topic, the previously “indented” rows are now actual child replies under that discussion thread, and a separate root-level follow-up remains as a true sibling to make the topic-vs-child distinction visible.
- Updated the dense live scenario probe selectors so nested collapsed children are driven through `.child-blip-wrapper` instead of pretending they are root-level `.rizzoma-blip` rows.
- Hardened `src/client/components/blip/RizzomaBlip.tsx` so ancestor blips do not activate when a nested descendant blip is clicked; this reduced one real active-owner leak, although the dense live scenario still shows a remaining multi-toolbar issue for the refactored tree.

## BLB Dense Live Hierarchy Correction Verification
- Live verification:
  - `node scripts/capture_blb_live_scenario.cjs http://127.0.0.1:4196 screenshots/260331-blb-live-scenario`
  - result: structural pass, toolbar-focus follow-up still open
- Current artifacts:
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.png`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.html`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.metrics.json`
- Current structural state:
  - `mainThreadExpandedVisible = true`
  - `primaryExpandedVisible = true`
  - `secondaryExpandedVisible = true`
  - `midCollapsedVisible = true`
  - `collapsedUnreadVisible = true`
  - `collapsedReadVisible = true`
  - `rootFollowUpVisible = true`
- Current follow-up still open:
  - `expandedReplyCount = 4`
  - `visibleToolbarCount = 3`
- Updated timing snapshot:
  - `initialLoadMs = 385`
  - `inlineExpandMs = 444`
  - `inlineActivateMs = 2222`
  - `mainThreadExpandMs = 84`
  - `primaryExpandMs = 146`
  - `secondaryExpandMs = 350`
  - `primaryActivateMs = 1556`
  - `totalScenarioMs = 9414`
- Visual judgment:
  - the topic now reads according to the documented hierarchy, with a real top-level discussion thread and genuinely nested replies underneath it
  - the remaining issue is toolbar ownership on the denser nested tree, not indentation or topic/meta-blip structure

## BLB Dense Live Toolbar Recovery On Corrected Tree
- Traced the remaining multi-toolbar leak on the hierarchy-corrected tree to a combination of stale dev-client state and nested child expansion not handing off active ownership consistently.
- `RizzomaBlip.tsx` now assigns active ownership when a collapsed child reply expands, and a fresh Vite client run was forced on `http://127.0.0.1:4198` to validate the behavior against current code rather than stale HMR state.

## BLB Dense Live Toolbar Recovery Verification
- Live verification:
  - `node scripts/capture_blb_live_scenario.cjs http://127.0.0.1:4198 screenshots/260331-blb-live-scenario`
  - result: pass
- Accepted artifacts:
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.png`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.html`
  - `screenshots/260331-blb-live-scenario/blb-live-scenario-v3.metrics.json`
- Accepted state:
  - `expandedReplyCount = 3`
  - `visibleToolbarCount = 1`
  - `primaryExpandedIsActive = true`
  - `mainThreadExpandedVisible = true`
  - `primaryExpandedVisible = true`
  - `secondaryExpandedVisible = true`
  - `midCollapsedVisible = true`
  - `collapsedUnreadVisible = true`
  - `collapsedUnreadHasUnreadIcon = true`
  - `collapsedReadVisible = true`
  - `rootFollowUpVisible = true`
- Updated timing snapshot:
  - `initialLoadMs = 955`
  - `inlineExpandMs = 833`
  - `inlineActivateMs = 479`
  - `mainThreadExpandMs = 797`
  - `primaryExpandMs = 123`
  - `secondaryExpandMs = 90`
  - `primaryActivateMs = 89`
  - `totalScenarioMs = 28354`
- Visual judgment:
  - the topic now reads according to the documented root/meta-blip structure
  - one top-level discussion thread contains the nested business replies
  - the single-toolbar contract is restored on that corrected tree

## Live Workflow Exploration
- Ran a direct Playwright smoke against the live app to test the user's claim that "pretty much nothing works" via the normal topic path instead of a seeded parity fixture.
- Added `scripts/explore_live_blip_workflow.cjs` to:
  - create a fresh topic through `/api/topics`
  - create a root reply via the topic `Write a reply...` input
  - expand that reply
  - open the nested reply form and submit a child reply
  - enter topic edit mode
  - open the gadget palette from the right tools rail
- Live verification:
  - `node scripts/explore_live_blip_workflow.cjs screenshots/260331-workflow-exploration/workflow-v1.png screenshots/260331-workflow-exploration/workflow-v1.html screenshots/260331-workflow-exploration/workflow-v1.json http://127.0.0.1:4198`
  - result: pass
- Artifacts:
  - `screenshots/260331-workflow-exploration/workflow-v1.png`
  - `screenshots/260331-workflow-exploration/workflow-v1.html`
  - `screenshots/260331-workflow-exploration/workflow-v1.json`
- Verified steps:
  - `create_root_reply = ok`
  - `expand_root_reply = ok`
  - `open_nested_reply_form = ok`
  - `create_nested_reply = ok`
  - `enter_topic_edit_mode = ok`
  - `open_gadget_palette = ok`
- Honest interpretation:
  - the basic create/edit/reply/gadget path is working on `master`
  - the build still feels structurally inconsistent and too easy to misunderstand, but the narrow “create a blip and use a gadget the old way” workflow is not dead

## Complex Live Workflow Audit vs Legacy Screenshots
- Added `scripts/capture_complex_live_workflow.cjs` to run a larger real UI flow and save numbered screenshots for every state transition instead of relying on one final frame.
- Live verification:
  - `node scripts/capture_complex_live_workflow.cjs screenshots/260331-complex-workflow http://127.0.0.1:4198`
  - result: pass
- Generated step pack:
  - `screenshots/260331-complex-workflow/01-topic-loaded.png`
  - `screenshots/260331-complex-workflow/02-root-reply-a-created.png`
  - `screenshots/260331-complex-workflow/03-root-reply-b-created.png`
  - `screenshots/260331-complex-workflow/04-root-reply-a-expanded.png`
  - `screenshots/260331-complex-workflow/05-nested-reply-form-open.png`
  - `screenshots/260331-complex-workflow/06-nested-reply-created.png`
  - `screenshots/260331-complex-workflow/07-nested-reply-expanded.png`
  - `screenshots/260331-complex-workflow/08-topic-edit-mode.png`
  - `screenshots/260331-complex-workflow/09-gadget-palette-open.png`
  - `screenshots/260331-complex-workflow/10-poll-inserted.png`
  - `screenshots/260331-complex-workflow/11-done-mode-after-poll.png`
  - `screenshots/260331-complex-workflow/final.html`
  - `screenshots/260331-complex-workflow/summary.json`
- Compared directly against the legacy screenshot set:
  - `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-main.png`
  - `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-blip-view.png`
  - `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-blip-edit.png`
  - `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-blips-nested.png`
  - `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-replies-expanded.png`
  - `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-toolbar.png`
- Wrote the full comparison to:
  - `screenshots/260331-complex-workflow/ANALYSIS.md`
- Honest result:
  - the basic live workflow still functions
  - visual and interaction parity are still clearly worse than the original
  - biggest regressions are anaemic topic-pane hierarchy, weak nested-thread legibility, under-signaled active toolbar state, detached-feeling gadget insertion, and confidence-damaging edit-surface warning banners

## Complex Workflow Repair Pass
- Targeted the worst failures exposed by the complex workflow audit:
  - edit-mode overlap and washed-out composition
  - intrusive inline-comment degraded-state banner placement
  - detached gadget palette anchoring
  - topic root edit bootstrap blanking the entire meta-blip body
- UI/style changes:
  - `src/client/components/blip/BlipMenu.css`
  - `src/client/components/blip/RizzomaBlip.css`
  - `src/client/components/RizzomaTopicDetail.css`
  - `src/client/components/GadgetPalette.css`
  - `src/client/components/editor/BlipEditor.css`
  - `src/client/components/editor/extensions/PollGadgetView.tsx`
  - `src/client/components/editor/InlineComments.tsx`
- Topic-root bootstrap hardening:
  - `src/client/components/RizzomaTopicDetail.tsx`
  - root topic editing now seeds from the visible read-mode DOM when available
  - root topic editing no longer depends on the unstable topic-root collab bootstrap path
  - fresh-client verification confirms the topic editor is editable and carries the full title + body list again
- Fresh accepted workflow pack:
  - `node scripts/capture_complex_live_workflow.cjs screenshots/260331-complex-workflow-pass14 http://127.0.0.1:4197`
  - artifacts:
    - `screenshots/260331-complex-workflow-pass14/08-topic-edit-mode.png`
    - `screenshots/260331-complex-workflow-pass14/09-gadget-palette-open.png`
    - `screenshots/260331-complex-workflow-pass14/10-poll-inserted.png`
    - `screenshots/260331-complex-workflow-pass14/11-done-mode-after-poll.png`
    - `screenshots/260331-complex-workflow-pass14/final.html`
    - `screenshots/260331-complex-workflow-pass14/summary.json`
- Accepted result on the fresh `:4197` client:
  - step 8 topic edit mode keeps the topic body instead of collapsing to an empty paragraph
  - step 9 gadget palette opens against the correct active topic editor
  - step 10 inserts the poll into the topic body without erasing the original bullets
  - step 11 done mode persists the poll while preserving the topic title + body content
- Honest status after the repair:
  - the most embarrassing root-topic regression is fixed
  - the UI is still not yet equal to the legacy Rizzoma screenshots, but it is no longer blanking the topic editor or destroying the topic body during a normal workflow

## Complex Workflow Visual Polish Follow-up
- Accepted a second fresh workflow pack after tightening the remaining edit-band surfaces:
  - `src/client/components/RizzomaTopicDetail.css`
  - `src/client/components/blip/BlipMenu.css`
  - `src/client/components/GadgetPalette.css`
- Focus of this slice:
  - stronger topic toolbar salience
  - clearer separation between toolbar strip and topic edit surface
  - gadget palette anchored more convincingly to the right tools rail instead of floating like a detached modal
- Fresh accepted verification:
  - `node scripts/capture_complex_live_workflow.cjs screenshots/260331-complex-workflow-pass15 http://127.0.0.1:4197`
  - accepted artifacts:
    - `screenshots/260331-complex-workflow-pass15/09-gadget-palette-open.png`
    - `screenshots/260331-complex-workflow-pass15/10-poll-inserted.png`
    - `screenshots/260331-complex-workflow-pass15/11-done-mode-after-poll.png`
- Accepted result:
  - the topic body still survives edit mode + poll insertion + done mode
  - the gadget palette now reads as a right-rail utility flyout
  - the toolbar strip is clearer and less visually lost against the edit surface

## Complex Workflow Nested Readability Pass
- Continued iterating on the same complex live workflow instead of introducing a new synthetic probe.
- Tightened nested reply readability and dense gadget rendering in:
  - `src/client/components/blip/RizzomaBlip.css`
  - `src/client/components/blip/BlipMenu.css`
  - `src/client/components/editor/InlineComments.css`
  - `src/client/components/editor/extensions/PollGadgetView.tsx`
- What changed:
  - nested reply cards are tighter, less ballooned, and less washed out
  - active expanded blips use a narrower, calmer highlight treatment
  - collapsed child rows and child-thread rails are denser and easier to scan
  - the inline-comments degraded-state banner is demoted to a much smaller status chip
  - the poll gadget is more compact inside nested replies so it stops dominating the thread
- Important verification note:
  - stale dev bundles on `:4197` initially masked the CSS changes
  - restarted a fresh forced Vite client and re-verified against `http://127.0.0.1:4198`
- Fresh accepted verification:
  - `node scripts/capture_complex_live_workflow.cjs screenshots/260331-complex-workflow-pass19 http://127.0.0.1:4198`
  - accepted artifacts:
    - `screenshots/260331-complex-workflow-pass19/10-poll-inserted.png`
    - `screenshots/260331-complex-workflow-pass19/11-done-mode-after-poll.png`
    - `screenshots/260331-complex-workflow-pass19/final.html`
    - `screenshots/260331-complex-workflow-pass19/summary.json`
- Accepted result:
  - the repaired root-topic workflow still holds end to end on the fresh client
  - nested replies read more compactly and less like stacked frosted cards
  - the inline-comments unavailable warning is still present, but is less visually dominant than in the earlier audit/repair passes
  - the UI still remains below legacy Rizzoma parity, but the specific nested-thread readability debt is lower than in `pass15`

## Hard Structural Gap Audit
- Stopped treating the remaining issues as ordinary polish debt after re-reading the docs and original references.
- Re-read:
  - `docs/BLB_LOGIC_AND_PHILOSOPHY.md`
  - `docs/TOPIC_RENDER_UNIFICATION.md`
  - `docs/EDITOR_TOOLBAR_PARITY.md`
  - original legacy references under `original-rizzoma/` and `original-rizzoma-src/`
- Wrote a dedicated strict audit:
  - `docs/RIZZOMA_HARD_GAP_LIST_260331.md`
- Key conclusion:
  - the remaining failures are not “small parity gaps”
  - they are structural mismatches with the documented/original Rizzoma model
- Most important findings:
  - detached title/body behavior must be removed
  - the inline-comments navigation/filter product surface (`All / Open / Resolved`) must be removed from the main workflow
  - inline comments must be reimplemented as a real first-class anchored interaction again
  - active-blip gadget insertion must only be judged after topic/meta-blip and inline-comment semantics are restored

## Hard Gap Execution 1: Remove Alien Inline-Comments Surface
- Started executing the hard-gap list instead of continuing generic visual polish.
- Removed the non-Rizzoma inline-comments navigation/filter panel from the live workflow in:
  - `src/client/components/editor/InlineComments.tsx`
- What changed:
  - deleted the visible `Inline comments` side panel
  - deleted the `All / Open / Resolved` filter UI
  - deleted the Alt+arrow navigation behavior tied to that panel
  - left only the anchored inline-comment affordances in place:
    - selection comment button
    - comment form
    - anchored popover on highlighted comment ranges
- Verification discipline:
  - `npm run lint:branch-context`
  - initially re-ran the complex workflow on stale clients (`:4198`) and got misleading results
  - forced a fresh Vite client, which landed on `http://127.0.0.1:4199`
  - then re-ran:
    - `node scripts/capture_complex_live_workflow.cjs screenshots/260331-complex-workflow-pass23 http://127.0.0.1:4199`
- Fresh trusted artifacts:
  - `screenshots/260331-complex-workflow-pass23/08-topic-edit-mode.png`
  - `screenshots/260331-complex-workflow-pass23/09-gadget-palette-open.png`
  - `screenshots/260331-complex-workflow-pass23/10-poll-inserted.png`
  - `screenshots/260331-complex-workflow-pass23/11-done-mode-after-poll.png`
  - `screenshots/260331-complex-workflow-pass23/final.html`
  - `screenshots/260331-complex-workflow-pass23/summary.json`
- Accepted result for this sub-fix:
  - the alien inline-comments side panel is gone from the actual live workflow surface
  - the edit/poll frames are visibly cleaner and no longer polluted by `Inline comments / All / Open / Resolved`
  - this is only the first hard-gap execution step, not a full inline-comments restoration

## Hard Gap Execution 2: Restore Anchored Inline-Comment Path
- Removed the competing annotation/comment UI from the live blip/topic editing surfaces instead of continuing to mix two incompatible models.
- Code changes:
  - `src/client/components/blip/RizzomaBlip.tsx`
  - `src/client/components/editor/BlipEditor.tsx`
  - `src/client/components/editor/extensions/BlipThreadNode.tsx`
  - `scripts/capture_live_inline_comment_flow.cjs`
- What changed:
  - removed the selection-based floating `💬 Comment` path from `RizzomaBlip`
  - removed the `InlineComments` annotation mount from both `BlipEditor` and live `RizzomaBlip` edit mode
  - kept `Ctrl+Enter` as the only inline-comment creation path in the live workflow
  - changed `[+]` marker clicks to navigate into the anchored subblip URL instead of toggling a separate inline annotation UI
- Fresh trusted verification on a clean client:
  - dev client: `http://127.0.0.1:4200`
  - focused audit:
    - `node scripts/capture_live_inline_comment_flow.cjs screenshots/260331-inline-comment-audit-pass3 http://127.0.0.1:4200`
  - broad workflow regression:
    - `node scripts/capture_complex_live_workflow.cjs screenshots/260331-complex-workflow-pass24 http://127.0.0.1:4200`
- Key artifacts:
  - `screenshots/260331-inline-comment-audit-pass3/03-after-ctrl-enter.png`
  - `screenshots/260331-inline-comment-audit-pass3/04-done-mode.png`
  - `screenshots/260331-inline-comment-audit-pass3/05-after-marker-click.png`
  - `screenshots/260331-inline-comment-audit-pass3/summary.json`
  - `screenshots/260331-complex-workflow-pass24/08-topic-edit-mode.png`
  - `screenshots/260331-complex-workflow-pass24/10-poll-inserted.png`
  - `screenshots/260331-complex-workflow-pass24/11-done-mode-after-poll.png`
- Accepted result for this step:
  - `Ctrl+Enter` now inserts only the anchored `[+]` marker in topic content
  - no `Inline comments / All / Open / Resolved` style UI remains in the live editing surface
  - clicking the marker now changes the URL into the subblip path (`#/topic/<waveId>/<blipPath>/`)
- Honest boundary:
  - the resulting subblip view is still visually underpowered and not legacy-quality yet
  - but the product is now back on one inline-comment model instead of two competing ones

## Hard Gap Execution 3: Inline-Comment Round Trip Restored
- Restored the full anchored inline-comment round trip in the live app on a fresh client.
- Code changes:
  - `src/client/components/RizzomaTopicDetail.tsx`
  - `scripts/capture_live_inline_comment_flow.cjs`
- What changed:
  - topic-root read mode now injects anchored `[+]` markers from inline child blips
  - the subblip `Hide` return path now preserves the parent marker and allows reopening the subblip
  - the focused verifier now captures the exact post-`Hide` state and validates the full route cycle instead of assuming the parent must return in read mode immediately
- Fresh trusted verification:
  - dev client: `http://127.0.0.1:4201`
  - command:
    - `node scripts/capture_live_inline_comment_flow.cjs screenshots/260401-inline-comment-audit-pass25 http://127.0.0.1:4201`
  - artifacts:
    - `screenshots/260401-inline-comment-audit-pass25/03-after-ctrl-enter.png`
    - `screenshots/260401-inline-comment-audit-pass25/04-subblip-done-mode.png`
    - `screenshots/260401-inline-comment-audit-pass25/05-after-hide-click.png`
    - `screenshots/260401-inline-comment-audit-pass25/06-returned-to-topic.png`
    - `screenshots/260401-inline-comment-audit-pass25/07-after-marker-click.png`
    - `screenshots/260401-inline-comment-audit-pass25/summary.json`
- Accepted result:
  - `Ctrl+Enter` creates an anchored child marker
  - the subblip opens directly on its own route
  - `Done` reaches subblip read mode
  - `Hide` returns to the parent topic with the marker still present
  - clicking the parent marker reopens the subblip route
- Honest boundary:
  - the parent topic currently returns in topic edit mode after `Hide`, with the marker preserved inside the editor DOM
  - the round trip is structurally working again, but the subblip and parent-return presentation are still visually weaker than legacy Rizzoma

## Hard Gap Execution 4: Parent Return Cleanup Accepted
- Cleaned up the anchored inline-comment parent return on a truly fresh client after stale-port confusion had masked the current behavior.
- Code changes:
  - `src/client/components/RizzomaTopicDetail.tsx`
  - `scripts/capture_live_inline_comment_flow.cjs`
- Fresh trusted verification:
  - dev client: `http://127.0.0.1:4202`
  - command:
    - `node scripts/capture_live_inline_comment_flow.cjs screenshots/260401-inline-comment-audit-pass40 http://127.0.0.1:4202`
  - artifacts:
    - `screenshots/260401-inline-comment-audit-pass40/04-subblip-done-mode.png`
    - `screenshots/260401-inline-comment-audit-pass40/05-after-hide-click.png`
    - `screenshots/260401-inline-comment-audit-pass40/06-returned-to-topic.png`
    - `screenshots/260401-inline-comment-audit-pass40/07-after-marker-click.png`
    - `screenshots/260401-inline-comment-audit-pass40/summary.json`
- Accepted result:
  - `Ctrl+Enter` still creates the anchored `[+]` marker
  - the subblip route opens directly
  - `Hide` now returns to the parent topic in read mode
  - the parent topic shows `Edit`, not `Done`
  - one `[+]` marker remains visible in topic view
  - clicking that marker reopens the anchored subblip route
- Honest boundary:
  - the subblip route itself is still visually weaker than original Rizzoma
  - but the parent-return presentation is no longer stuck in the topic editor shell

## Hard Gap Execution 5: Subblip Round Trip Reverified With Real Typed Content
- Reverified the anchored inline-comment route on a fresh client with a hardened focused audit that types into the actual editable subblip surface before clicking `Done`.
- Code changes:
  - `src/client/components/blip/RizzomaBlip.tsx`
  - `scripts/capture_live_inline_comment_flow.cjs`
- Fresh trusted verification:
  - dev client: `http://127.0.0.1:4203`
  - command:
    - `node scripts/capture_live_inline_comment_flow.cjs screenshots/260401-inline-comment-audit-pass44 http://127.0.0.1:4203`
  - artifacts:
    - `screenshots/260401-inline-comment-audit-pass44/04-subblip-done-mode.png`
    - `screenshots/260401-inline-comment-audit-pass44/06-returned-to-topic.png`
    - `screenshots/260401-inline-comment-audit-pass44/07-after-marker-click.png`
    - `screenshots/260401-inline-comment-audit-pass44/summary.json`
- Accepted result:
  - `Ctrl+Enter` creates the anchored `[+]` marker
  - the subblip route opens directly
  - typed subblip content survives into read mode after `Done`
  - `Hide` returns to the parent topic in read mode with the marker preserved
  - clicking the marker reopens the subblip route
- Honest boundary:
  - the structure and round trip are now solid again
  - the remaining hard gap is mostly visual parity of the subblip page itself versus original Rizzoma
