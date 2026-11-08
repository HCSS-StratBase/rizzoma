## Session Update — 2026-03-30 (app runtime boundary)

- Added the first installable-app/runtime scaffolding under `src/client/gadgets/apps/`:
  - `catalog.ts`
  - `runtime.ts`
- Expanded gadget typing with `kind`, `availability`, app manifest metadata, and the host-API contract.
- Replaced the old fake-install Store panel with a runtime catalog that honestly distinguishes:
  - built-in gadgets
  - trusted embeds
  - sandboxed app previews
  - planned manifests
- Added `src/tests/client.gadgets.appsCatalog.test.ts`.
- Focused gadget-platform verification now passes:
  - `npm test -- --run src/tests/client.gadgets.embedAdapters.test.ts src/tests/client.gadgets.appsCatalog.test.ts`
  - result: 9 tests passed
- Accepted fresh live Store/runtime artifacts from `http://127.0.0.1:4181`:
  - `screenshots/260330-app-runtime/live-store-panel-v2.png`
  - `screenshots/260330-app-runtime/live-store-panel-v2.html`
- Next Rizzoma step: mount the first real sandboxed app preview inside a topic using the new manifest + host-API boundary instead of stopping at the Store/runtime catalog.
