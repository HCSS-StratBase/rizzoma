## Session Update — 2026-03-30 (trusted embed adapters)

- Built the first trusted-embed adapter layer under `src/client/gadgets/embedAdapters/` for `youtube`, `spreadsheet`, `iframe`, and `image`.
- Added palette-side URL validation/hints in `GadgetPalette.tsx`, so invalid URL gadgets now fail inline instead of inserting junk content.
- Added native `embedFrameGadget` support in `src/client/components/editor/extensions/GadgetNodes.ts` and registered it in `EditorConfig.tsx`, so trusted embeds render as real block nodes instead of escaped iframe text.
- Reworked `scripts/capture_live_topic_gadget_url.cjs` to create a fresh disposable topic per verification run and capture either the focused topic pane or the gadget-palette error state.
- Accepted fresh live artifacts from `http://127.0.0.1:4180`:
  - `screenshots/260330-embed-adapters/live-topic-youtube-v4.png`
  - `screenshots/260330-embed-adapters/live-topic-youtube-v4.html`
  - `screenshots/260330-embed-adapters/live-topic-youtube-error-v4.png`
  - `screenshots/260330-embed-adapters/live-topic-youtube-error-v4.html`
- Added `src/tests/client.gadgets.embedAdapters.test.ts`; `npm test -- --run src/tests/client.gadgets.embedAdapters.test.ts` passes.
- `npm test -- --run src/tests/client.editor.GadgetNodes.test.ts` still intermittently hangs after the Vitest `RUN` banner in this environment, so fresh Playwright artifacts remain the acceptance source when that happens.
- Next Rizzoma step: extend the same trusted-adapter/node path to `spreadsheet`, `iframe`, and `image`, then keep moving toward a proper installable-app/runtime boundary without reintroducing raw HTML gadget insertion.
