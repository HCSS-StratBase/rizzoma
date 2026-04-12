# Screenshot Archive Index (260225)

Sources consolidated under this folder using RIZZOMA_FULL_COMPARISON.md as master reference.

## Included corpora
- live-reference: canonical live parity set (PNG + notes)
  - PNG: 24
  - MD notes: 24
- old-local: historical local captures from .playwright-mcp/screenshots
  - files: 49
- old-local-comparison: historical comparison snapshots from .playwright-mcp/snapshots/comparison
  - files: 5
- current-captures: latest generated current-state captures/parity artifacts
  - files: 80
- ui-exhaustive-1771980819549: first exhaustive profile run
  - images: 105
  - notes: 105
- ui-exhaustive-1771981300160: expanded exhaustive profile run
  - images: 175
  - notes: 175

## Rollups
- `COMPARISON_EXHAUSTIVE_260225.md`: consolidated findings across live refs, historical local captures, prior parity report, and exhaustive run.
- `docs/UI_ELEMENTS_EXHAUSTIVE.md`: exhaustive clickable/interactable UI element inventory (separate from functionality docs).

## Full Comparison scope vs screenshot reality
- RIZZOMA_FULL_COMPARISON.md defines 18 top-level functionality domains.
- Current canonical live screenshot pack is UI-focused and does not yet provide one screenshot per every deep subsection (API/security/storage/perf/devops internals).
- Use this folder as the central screenshot corpus for parity review; add new captures here going forward.
