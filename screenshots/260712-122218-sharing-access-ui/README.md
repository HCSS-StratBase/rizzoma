# Sharing access UI verification — 2026-07-12

Playwright rendered the real Vite client with deterministic intercepted API responses. This is local branch UI evidence, not production evidence.

- Viewports: 1280, 1366, 1440, and 1600 × 900.
- Share modal: persisted `Public` policy rendered selected, `Allow comments` rendered checked, save remained enabled for the owner, and every modal stayed fully inside the viewport.
- Invite modal: the new access-role selector rendered with `Editor — can edit content`; email, message, link, and footer controls remained unclipped.
- Measured bounds were stable: share modal 500 × 763.4 pixels; invite modal 500 × 679.5 pixels. The horizontal centering moved correctly at every width.
- No overlap, clipping, truncated labels, or viewport-specific collapse was visible in the eight inspected PNGs.

The exact bounds and control-state assertions are recorded in [`manifest.json`](manifest.json). Reproduce with `node scripts/verify-sharing-ui.mjs` while Vite serves `http://127.0.0.1:4174`.
