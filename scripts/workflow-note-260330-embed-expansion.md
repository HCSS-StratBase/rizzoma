## Session Update — 2026-03-30 (trusted embed expansion)

- Extended the trusted-embed baseline beyond YouTube so the same registry/adapter/node path now works for:
  - `Sheet`
  - `iFrame`
  - `Image`
- Updated `scripts/capture_live_topic_gadget_url.cjs` so each gadget waits for the correct in-topic result before capture.
- Tightened in-topic styling in `src/client/components/editor/BlipEditor.css` so embed blocks and remote images read as intentional objects instead of raw transport surfaces.
- Re-ran `npm test -- --run src/tests/client.gadgets.embedAdapters.test.ts`; it now passes with 6 focused adapter cases.
- Accepted fresh live artifacts from `http://127.0.0.1:4180`:
  - `screenshots/260330-embed-adapters/live-topic-sheet-v1.png`
  - `screenshots/260330-embed-adapters/live-topic-sheet-v1.html`
  - `screenshots/260330-embed-adapters/live-topic-iframe-v1.png`
  - `screenshots/260330-embed-adapters/live-topic-iframe-v1.html`
  - `screenshots/260330-embed-adapters/live-topic-image-v1.png`
  - `screenshots/260330-embed-adapters/live-topic-image-v1.html`
- Next Rizzoma step: move from “working trusted embeds” into the installable-app/runtime boundary and host API so future downloadable gadgets are controlled platform modules rather than more raw embed special cases.
