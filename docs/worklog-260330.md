## Worklog — 2026-03-30 (`master`)

### PollGadget contract repair
- Reproduced the dirty-batch `PollGadget` mismatch in the real serialization path instead of relying on the shallow unit test.
- Updated `src/client/components/editor/extensions/GadgetNodes.ts` so `PollGadget`:
  - parses `data-poll-options` back into structured option objects,
  - renders `data-poll-question` / `data-poll-options` / `data-poll-allow-multiple`,
  - suppresses raw attribute leakage in the serializer by marking node attrs `rendered: false`,
  - reads poll payload from `node.attrs` during `renderHTML()` while still supporting direct unit invocation fallback.

### Verification
- Hardened `src/tests/client.editor.GadgetNodes.test.ts` with a real `editor.getHTML()` assertion so the spec now covers the same serializer path exposed in the browser.
- Verified focused Vitest is green:
  - `npm test -- --run src/tests/client.editor.GadgetNodes.test.ts`
- Reworked `scripts/capture_test_editor_poll.cjs` to accept an optional target URL for fresh-client captures.
- Captured Playwright artifacts against a clean feature-flagged Vite client (`FEAT_ALL=1 EDITOR_ENABLE=1`) on `http://127.0.0.1:4174/test-editor.html`:
  - `screenshots/260330-poll-fix/test-editor-poll-4174.png`
  - `screenshots/260330-poll-fix/test-editor-poll-4174.html`
- Confirmed the page’s own `Content HTML` panel now shows:
  - `data-poll-question="Vote"`
  - `data-poll-allow-multiple="false"`
  - no raw `question=` or `allowmultiple=` attrs

### Notes
- The long-lived shared `:3000` dev server was serving stale poll serialization because multiple old dev processes were still running. The clean validation came from the isolated feature-flagged Vite instance on `:4174`.

### Visual iteration
- Treated the first repaired poll page as failing despite the contract fix because it still looked like a component dump.
- Iterated on:
  - `src/client/test-editor.html` to create a believable topic/blip shell, reserve space for the inline-comment rail, add real editorial context, and compress the serializer snapshot into a compact developer footer instead of a giant debug slab.
  - `src/client/components/editor/extensions/PollGadgetView.tsx` to improve hierarchy, proportions, card styling, and CTA treatment.
  - `scripts/capture_test_editor_poll.cjs` so the capture helper can target fresh client URLs and the revised CTA label.
- Fresh acceptable visual artifact:
  - `screenshots/260330-poll-fix/test-editor-poll-4174-v4.png`
  - `screenshots/260330-poll-fix/test-editor-poll-4174-v4.html`

### Current next step
- Move from the isolated poll test page back into the authenticated live app and validate the gadget/topic flow in a real topic/blip context.
- Then continue the larger UI cleanup/parity pass, especially around the gadget host UI and navigation shell.

### Live UI visual pass
- Continued the new mandatory visual QA loop in the authenticated live app instead of the isolated gadget harness.
- Used the richer `BLB Study - Local Parity Test` topic as the target surface because the earlier exhaustive topic was too skeletal to judge honestly.
- Refined the actual app shell across:
  - `src/client/RizzomaApp.css`
  - `src/client/components/RizzomaLayout.css`
  - `src/client/components/NavigationPanel.css`
  - `src/client/components/RizzomaTopicsList.css`
  - `src/client/components/RightToolsPanel.css`
  - `src/client/components/RizzomaTopicDetail.css`
- Main improvements:
  - unified the left nav / topic list / right rail into the same visual language,
  - modernized cards, controls, active states, gradients, and spacing,
  - constrained the topic meta-blip so sparse topics stop reading like broken full-height documents,
  - improved the notification strip and topic list density so the screen no longer looks like an unstyled legacy capture.

### Live UI verification
- Forced a clean feature-flagged Vite client because earlier `:3000` / `:4174` captures were polluted by stale long-running dev processes.
- Fresh trustworthy client:
  - `http://127.0.0.1:4175`
- Live Playwright captures for the BLB topic:
  - `screenshots/260330-live-ui/blb-topic-v3.png`
  - `screenshots/260330-live-ui/blb-topic-v4.png`
  - `screenshots/260330-live-ui/blb-topic-v5.png`
- Final accepted live artifact:
  - `screenshots/260330-live-ui/blb-topic-v5.png`
  - `screenshots/260330-live-ui/blb-topic-v5.html`

### Judgment
- Accepted `blb-topic-v5` as the first live-topic screen in this batch that looks coherent enough to sign off on.
- It is still a sparse-content topic, so the result is intentionally restrained rather than flashy, but it now reads as a product UI instead of a stale prototype.

### Updated next step
- Carry the same live-screen standard into the actual gadget insertion flow inside an authenticated topic/blip, then continue BLB parity cleanup with fresh Playwright artifacts at each stop.

### Live gadget flow
- Validated the repaired `PollGadget` inside the authenticated app instead of only the isolated test surface.
- Added `scripts/capture_live_topic_poll.cjs` to drive the real flow:
  - sign in,
  - open a topic,
  - enter topic edit mode,
  - use the right-rail Gadget palette,
  - insert a Poll,
  - capture screenshot + HTML.
- Fixed live insertion/data issues:
  - exported `createDefaultPollOptions()` from `src/client/components/editor/extensions/GadgetNodes.ts`,
  - updated `RizzomaTopicDetail.tsx` and `blip/RizzomaBlip.tsx` to use the canonical default poll payload instead of the old `JSON.stringify(['Yes','No','Maybe'])` / `votes: '{}'` shape,
  - hardened poll option normalization in both `GadgetNodes.ts` and `PollGadgetView.tsx` so legacy/string-array payloads recover into visible option labels,
  - centered the live poll card within topic content for a less awkward in-context composition.

### Live gadget verification
- Used a fresh feature-flagged Vite client on `http://127.0.0.1:4176` because the older `:4175` client still showed stale behavior during HMR.
- Final accepted live gadget artifact:
  - `screenshots/260330-live-poll/live-topic-poll-v7.png`
  - `screenshots/260330-live-poll/live-topic-poll-v7.html`
- Accepted result:
  - authenticated topic editor inserts a real poll from the right-rail Gadget palette,
  - option labels render correctly (`Yes`, `No`, `Maybe`),
  - the in-app poll view is visually acceptable in context.

### Updated next step
- Continue from this accepted live gadget baseline into broader BLB parity cleanup and any remaining topic/blip interaction mismatches, keeping the same screenshot-driven quality gate.

### App runtime persistence fix
- Continued the app-runtime work by mounting a second preview app (`Calendar Planner`) through the shared sandbox app shell and then debugging why its edited state reverted after clicking `Done`.
- The important narrowing steps were:
  - confirmed the planner iframe state was correct before `Done`,
  - confirmed `finishEditingTopic()` in `src/client/components/RizzomaTopicDetail.tsx` was computing the correct final HTML with the delayed milestone,
  - proved the revert was happening after the correct topic PATCH path, not before it.
- The actual root cause was a second persistence path treating the topic root as a normal editable blip:
  - `RizzomaBlip` was still able to auto-enter generic blip edit/save behavior for the topic root,
  - that produced rogue `PUT /api/blips/:topicId` writes with stale planner payloads,
  - those stale writes overwrote the correct topic save.

### App runtime persistence fix details
- Hardened the topic root so it no longer flows through the generic blip-edit path:
  - `src/client/components/RizzomaTopicDetail.tsx`
  - `src/client/components/blip/RizzomaBlip.tsx`
- Added a server-side guard so the blip update route rejects non-blip documents:
  - `src/server/routes/blips.ts`
- Kept route-level topic PATCH logging in place while debugging:
  - `src/server/routes/topics.ts`
- Expanded the live debugger to capture the full end-to-end persistence story:
  - `src/client/components/editor/extensions/SandboxAppGadgetView.tsx`
  - `scripts/debug_planner_persistence.cjs`

### App runtime persistence verification
- Fresh source-of-truth client for the fixed run:
  - `http://127.0.0.1:4192`
- The accepted evidence is:
  - `screenshots/260330-app-runtime/live-topic-planner-debug-saved-topic.json`
  - `screenshots/260330-app-runtime/live-topic-planner-debug-after-done.png`
  - `screenshots/260330-app-runtime/live-topic-planner-debug-after-done.html`
  - `screenshots/260330-app-runtime/live-topic-planner-debug-mutation-traffic.json`
  - `screenshots/260330-app-runtime/topic-patch-log.ndjson`
- Verified final state:
  - the persisted topic content now keeps `Ship preview (delayed)` with `16:30`,
  - the topic route log shows the correct delayed payload being saved,
  - mutation traffic is now empty (`[]`), proving the rogue topic-root blip writes are gone on the fresh client bundle.

### Judgment
- The planner persistence bug is fixed on the fresh `:4192` client path.
- This closes the biggest correctness gap in the first sandboxed-app runtime slice and gives us a stable baseline for additional preview apps and host-API work.
- Added a focused explainer for the bug and fix path:
  - `docs/APP_RUNTIME_PERSISTENCE_EXPLAINED.md`

### Updated next step
- Generalize the shared app shell/host bridge from this fixed planner baseline, then continue broader Rizzoma modernization/parity work from the now-correct topic-root persistence path instead of the old duplicated blip/topic save behavior.

### Shared app shell generalization
- Refactored the sandbox app runtime so app defaults now live in the manifest instead of being duplicated in insertion code:
  - `src/client/gadgets/types.ts`
  - `src/client/gadgets/apps/catalog.ts`
  - `src/client/gadgets/insert.ts`
- Added a shared browser-side app bootstrap:
  - `public/gadgets/apps/app-shell.js`
  - `public/gadgets/apps/shared-styles.css`
- Migrated the existing preview apps onto that shared shell:
  - `public/gadgets/apps/kanban-board/index.html`
  - `public/gadgets/apps/calendar-planner/index.html`
- Added a third preview app on the same shell:
  - `public/gadgets/apps/focus-timer/index.html`
- Extended the runtime summary path so focus-session data now produces a meaningful host summary in `SandboxAppGadgetView.tsx`.

### Runtime harness verification
- The dirty localhost topic-editor path became too unstable for an honest fresh in-topic runtime signoff during this sub-batch, so I added a dedicated browser harness instead of bluffing:
  - `src/client/test-app-runtime.html`
  - `scripts/capture_live_topic_app.cjs` now supports direct harness-page capture in addition to the authenticated topic flow.
- Focused test status:
  - `npm test -- --run src/tests/client.gadgets.appsCatalog.test.ts src/tests/client.gadgets.insert.test.ts`
  - result: pass (7 tests)
- Accepted fresh Playwright harness artifacts:
  - `screenshots/260330-app-runtime/runtime-harness-planner-v1.png`
  - `screenshots/260330-app-runtime/runtime-harness-planner-v1.html`
  - `screenshots/260330-app-runtime/runtime-harness-focus-v1.png`
  - `screenshots/260330-app-runtime/runtime-harness-focus-v1.html`

### Judgment
- Accepted the shared-shell refactor itself:
  - Planner and Focus both render through the same generalized shell with distinct layouts/state models.
  - Planner harness shows delayed-state update.
  - Focus harness shows the updated running session (`Modernization sprint · deep work`) and checklist progression.
- Did **not** claim a fresh live topic-app acceptance for the new shell on the current `localhost:3001` client, because that local topic insertion path was unstable during this pass and does not yet meet the honesty bar.

### Updated next step
- Clean up the local live topic-app verifier/process state so the generalized shell can be re-verified in the real authenticated topic flow, then continue app-runtime/store expansion from that cleaner baseline.

### Gadget registry phase 1
- Started the real gadget-platform cleanup instead of leaving the picker as duplicated switch logic.
- Added a central gadget layer:
  - `src/client/gadgets/types.ts`
  - `src/client/gadgets/defaults.ts`
  - `src/client/gadgets/registry.ts`
  - `src/client/gadgets/insert.ts`
- Moved the live gadget picker onto the registry in `src/client/components/GadgetPalette.tsx` and removed the fake placeholder entries from the actual picker surface (`bubble`, `pollo`, `googley-like`, `contentz` no longer show up as if they work).
- Refactored the real insertion sites to use the same helper instead of custom switch blocks:
  - `src/client/components/editor/BlipEditor.tsx`
  - `src/client/components/RizzomaTopicDetail.tsx`
  - `src/client/components/blip/RizzomaBlip.tsx`
- Decoupled native gadget registration from the rich-toolbar gate in `src/client/components/editor/EditorConfig.tsx` so `pollGadget` / `chartGadget` / `ImageGadget` are present on fresh feature-flagged clients instead of only some older long-lived sessions.

### Fresh-client verification and regression fix
- Fresh clients on `:4178` and then `:4179` exposed two real regressions that the stale older clients had hidden:
  - topic insert warned `Unknown node type: pollGadget`
  - queued blip insert threw `executeGadgetInsert is not defined`
- Fixed both in the same batch:
  - always register native gadget nodes in `EditorConfig.tsx`
  - hoist `executeGadgetInsert` in `RizzomaBlip.tsx` so the queued post-enter-edit path can reuse it safely
- Extended `scripts/capture_live_topic_poll.cjs` to:
  - capture the palette itself as a separate artifact
  - print browser console/page errors
  - use a more honest poll selector for count/readback

### Accepted artifacts
- The trustworthy accepted client is now `http://127.0.0.1:4179`, not the older stale `:4176`/`:4178` sessions.
- Accepted registry-era gadget picker artifact:
  - `screenshots/260330-live-poll/live-topic-palette-v8.png`
  - `screenshots/260330-live-poll/live-topic-palette-v8.html`
- Accepted fresh live poll artifact:
  - `screenshots/260330-live-poll/live-topic-poll-v15.png`
  - `screenshots/260330-live-poll/live-topic-poll-v15.html`

### Judgment
- Phase 1 is now real enough to build on:
  - one registry-backed picker
  - one insertion helper
  - fake gadgets removed from the live picker
  - fresh-client live topic insertion still works after the refactor
- The next step is to extend this same registry/adapter model to trusted embeds and then the future installable-app runtime, not to reintroduce per-component gadget switch drift.

### Trusted embed adapters
- Added a real trusted-embed adapter layer under `src/client/gadgets/embedAdapters/`:
  - `common.ts`
  - `youtube.ts`
  - `spreadsheet.ts`
  - `iframe.ts`
  - `image.ts`
  - `index.ts`
- The registry/picker now validates URL gadgets before insertion:
  - `GadgetPalette.tsx` resolves URLs via the adapter layer instead of blindly inserting text/html
  - invalid URLs stay in the palette and surface inline error copy
  - registry entries now provide gadget-specific hints (`YouTube`, `Sheet`, `iFrame`, `Image`)
- Added a native `embedFrameGadget` node in `src/client/components/editor/extensions/GadgetNodes.ts` and registered it in `EditorConfig.tsx` so trusted embeds render as real block nodes instead of escaped iframe text.
- Updated `src/client/gadgets/insert.ts` so:
  - `youtube`, `iframe`, and `spreadsheet` insert `embedFrameGadget`
  - `image` inserts the real editor image node
  - URL gadget insertion stays registry-driven instead of reintroducing per-component switch drift.

### Trusted embed verification
- Reworked `scripts/capture_live_topic_gadget_url.cjs` so the live verifier creates a fresh disposable topic per run, opens it directly, inserts the requested URL gadget, and captures either:
  - the focused topic pane (`.wave-container`) for valid inserts, or
  - the palette itself for inline validation errors.
- Accepted clean trusted-embed artifacts from the fresh feature-flagged client at `http://127.0.0.1:4180`:
  - `screenshots/260330-embed-adapters/live-topic-youtube-v4.png`
  - `screenshots/260330-embed-adapters/live-topic-youtube-v4.html`
  - `screenshots/260330-embed-adapters/live-topic-youtube-error-v4.png`
  - `screenshots/260330-embed-adapters/live-topic-youtube-error-v4.html`
- Accepted result:
  - valid YouTube URLs now insert a real structured embed node (`data-gadget-type="embed-frame"`) with a rendered in-topic iframe
  - invalid YouTube URLs no longer insert junk content and instead show the inline palette error `Use a YouTube or youtu.be URL.`

### Test status
- Added focused adapter coverage in `src/tests/client.gadgets.embedAdapters.test.ts`.
- `npm test -- --run src/tests/client.gadgets.embedAdapters.test.ts` passes (4 tests).
- `npm test -- --run src/tests/client.editor.GadgetNodes.test.ts` still intermittently stalls after the Vitest `RUN` banner in this environment; browser verification remained the trustworthy acceptance signal for this embed batch.

### Updated next step
- Extend the same trusted-adapter flow to the remaining real URL gadgets (`spreadsheet`, `iframe`, `image`) with fresh live artifacts, then start shaping the installable-app/runtime boundary without regressing back to raw HTML insertion.

### Trusted embed expansion
- Extended the same trusted adapter/node/live-verification path across the remaining real URL gadgets:
  - `Sheet`
  - `iFrame`
  - `Image`
- Updated `scripts/capture_live_topic_gadget_url.cjs` so each gadget waits for the correct in-topic result before capturing:
  - image waits for a rendered `<img>`
  - embed-based gadgets wait for the structured `embedFrameGadget` iframe surface
- Tightened in-topic presentation in `src/client/components/editor/BlipEditor.css`:
  - embed blocks now have stronger card treatment
  - remote images now render with consistent radius/border/shadow treatment in the topic editor

### Expanded verification
- Re-ran the focused adapter suite after adding iframe/image normalization coverage:
  - `npm test -- --run src/tests/client.gadgets.embedAdapters.test.ts`
  - result: pass (6 tests)
- Accepted fresh live artifacts from the same clean feature-flagged client at `http://127.0.0.1:4180`:
  - `screenshots/260330-embed-adapters/live-topic-sheet-v1.png`
  - `screenshots/260330-embed-adapters/live-topic-sheet-v1.html`
  - `screenshots/260330-embed-adapters/live-topic-iframe-v1.png`
  - `screenshots/260330-embed-adapters/live-topic-iframe-v1.html`
  - `screenshots/260330-embed-adapters/live-topic-image-v1.png`
  - `screenshots/260330-embed-adapters/live-topic-image-v1.html`

### Judgment
- The trusted URL-gadget baseline is now broad enough to treat as real working product surface in this branch:
  - YouTube works
  - Google Sheets works
  - generic iFrame works
  - remote Image works
- The next step is no longer basic gadget insertion. It is to define the installable-app/runtime boundary and the host API so future “downloadable gadgets” don’t collapse back into raw embeds or per-component switch logic.

### App runtime boundary
- Added the first installable-app/runtime scaffolding:
  - `src/client/gadgets/apps/catalog.ts`
  - `src/client/gadgets/apps/runtime.ts`
- Expanded gadget types in `src/client/gadgets/types.ts` so the registry/store can distinguish:
  - `native`
  - `embed`
  - `app`
  - plus availability states (`built-in`, `trusted`, `preview`, `planned`) and the host-API contract.
- Refactored `src/client/components/StorePanel.tsx` away from the old fake install toggles and onto an honest runtime catalog that now shows:
  - real built-in/trusted gadgets
  - manifest-backed sandboxed app previews
  - runtime/permission framing instead of pretend “Install” buttons
- Restyled `src/client/components/StorePanel.css` so the Store reads as a product/runtime surface rather than a placeholder marketplace.

### App runtime verification
- Added focused runtime tests in `src/tests/client.gadgets.appsCatalog.test.ts`.
- Re-ran the focused gadget-platform specs:
  - `npm test -- --run src/tests/client.gadgets.embedAdapters.test.ts src/tests/client.gadgets.appsCatalog.test.ts`
  - result: pass (9 tests total)
- Added a live Store verifier:
  - `scripts/capture_live_store_panel.cjs`
- First store capture on the older `:4180` client was rejected because it still served stale `StorePanel.css`.
- Accepted fresh live Store artifact from the forced clean client at `http://127.0.0.1:4181`:
  - `screenshots/260330-app-runtime/live-store-panel-v2.png`
  - `screenshots/260330-app-runtime/live-store-panel-v2.html`

### Judgment
- This is the first honest “app-like” continuation step:
  - runtime/catalog vocabulary exists,
  - the Store no longer lies about fake installs,
  - the host-API/sandbox boundary is explicit enough to build against.
- Next step: carry that boundary into a real app-gadget manifest + iframe host shell so one sandboxed preview app can actually mount inside a topic without bypassing the new contract.

### First sandboxed app preview
- Added the first real manifest-backed app gadget to the live picker:
  - new gadget type `kanbanApp`
  - insert path in `src/client/gadgets/insert.ts`
  - app manifest in `src/client/gadgets/apps/catalog.ts`
- Added the real topic app node + node view:
  - `AppFrameGadget` in `src/client/components/editor/extensions/GadgetNodes.ts`
  - `SandboxAppGadgetView.tsx`
- Added the first actual sandboxed preview app at:
  - `public/gadgets/apps/kanban-board/index.html`
- The new app preview is not just an iframe mount; it now exercises a minimal host bridge over `postMessage`:
  - `host.getNodeData`
  - `host.getUserContext`
  - `host.resize`
  - `host.updateNodeData`
- Added a focused insert-path regression in `src/tests/client.gadgets.insert.test.ts`.

### First app preview verification
- Focused app-platform tests:
  - `npm test -- --run src/tests/client.gadgets.appsCatalog.test.ts src/tests/client.gadgets.insert.test.ts`
  - result: pass (4 tests)
- Strengthened the live app verifier in `scripts/capture_live_topic_app.cjs` so it now:
  - creates a fresh disposable topic
  - inserts the Kanban app from the live gadget palette
  - waits for the iframe app shell to load
  - clicks the in-app `Add sample card` control
  - waits for the bridge-driven update before capture
- Accepted live artifact from the fresh forced client at `http://127.0.0.1:4182`:
  - `screenshots/260330-app-runtime/live-topic-kanban-v3.png`
  - `screenshots/260330-app-runtime/live-topic-kanban-v3.html`

### Judgment
- This is the first real topic-mounted sandboxed gadget in the branch:
  - manifest-backed
  - sandboxed iframe
  - live host bridge
  - verified in-topic with a real app-side action
- The next step is to generalize the host bridge and app-frame shell so more than one preview app can mount cleanly without duplicating per-app plumbing.

### Live planner/runtime closeout
- Fixed the remaining topic-root app runtime regressions on `master`:
  - topic title no longer gets polluted by app-frame content during topic edits
  - planner app state now persists after `Done`
  - the read-mode iframe now boots from saved `data-app-data` without a live editor bridge
- Key code changes:
  - `src/client/components/RizzomaTopicDetail.tsx`
  - `src/client/components/blip/RizzomaBlip.tsx`
  - `src/client/components/editor/extensions/GadgetNodes.ts`
  - `public/gadgets/apps/runtime-host.js`
  - `scripts/probe_live_planner_iframe.cjs`
  - `scripts/capture_live_topic_app.cjs`
- Focused verification:
  - `node scripts/probe_live_planner_iframe.cjs http://127.0.0.1:4193`
    - persisted topic title stayed `Planner probe …`
    - persisted content kept `Ship preview (delayed)` at `16:30`
    - post-save iframe rendered the delayed milestone in read mode
  - `npm test -- --run src/tests/client.gadgets.appsCatalog.test.ts src/tests/client.gadgets.insert.test.ts`
    - result: pass (7 tests)
  - accepted live artifact:
    - `screenshots/260330-app-runtime/live-topic-planner-vfinal.png`
    - `screenshots/260330-app-runtime/live-topic-planner-vfinal.html`

### Current judgment
- The planner sandbox app path is now acceptable in the real authenticated topic flow:
  - clean topic title
  - delayed milestone survives save
  - read-mode iframe hydrates from persisted data
- Next step: carry the same cleaned app-frame persistence/bootstrap path to the remaining preview apps and keep reducing duplicate runtime plumbing.
