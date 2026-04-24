# Screenshot Artifact Layout

Screenshot sweeps and related visual artifacts live in datetime-stamped purpose folders:

`YYMMDD-HHMM[-SS]-purpose-label/`

Rules:

- Use one top-level folder per sweep, smoke, device run, or reference set.
- Include a short purpose label after the timestamp, for example `feature-sweep`, `prod-perf-baseline`, or `real-device-pixel9proxl-public`.
- Keep screenshots, HTML dumps, manifests, health JSON, and run notes inside the same run folder.
- Do not leave loose screenshot artifacts at `screenshots/` root.
- When historical capture time is not fully known, use the best available file/folder timestamp and make the label explicit.

Current root folders were normalized on 2026-04-25. Notable groups:

- `260224-2343-rizzoma-live-reference/` - legacy/live UI reference screenshots for parity checks.
- `260424-025320-feature-sweep/` - latest full public-prod feature sweep and quality verdict.
- `260424-0010-prod-perf-baseline/` - public-prod full-render perf baseline artifacts.
- `260424-0010-prod-toolbar-scoped/` - public-prod toolbar smoke artifact.
- `260424-2319-real-device-pixel9proxl-local/` - local branch physical Pixel 9 Pro XL validation.
- `260424-2350-real-device-pixel9proxl-public/` - public VPS physical Pixel 9 Pro XL validation.
