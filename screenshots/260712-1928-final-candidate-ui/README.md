# Final candidate local UI evidence — 2026-07-12

This folder records local Playwright verification of the integrated release candidate before publication and VPS cutover. The browser ran against `http://127.0.0.1:4329` with API responses mocked at the network boundary so the screenshots exercise the real candidate UI without changing production data.

## Task lifecycle

`tasks/` covers 1280, 1366, 1440, and 1600-pixel desktop widths plus a 390-pixel mobile viewport. For the authorized owner it captures the server-hydrated checked state, the confirmed unchecked state after a nonqueued toggle, and the same unchecked state after entering the editor. Public readers see the checked state without button role or keyboard focus. The machine-readable observations and console classification are in [`tasks/manifest.json`](tasks/manifest.json).

The mocked local server intentionally has no Socket.IO backend. Its WebSocket handshake failures, plus the anonymous `/api/auth/me` 401 in public mode, are recorded as expected; every capture reports zero unexpected console errors.

## Sharing dialogs

`sharing/` covers the share and invitation dialogs at 1280, 1366, 1440, and 1600 pixels. The modal bounds remain inside every viewport, the public-access control is selectable, and the invitation role is `editor`. Measurements are in [`sharing/manifest.json`](sharing/manifest.json).

These local screenshots are implementation evidence, not production acceptance. Post-cutover evidence must be captured separately from the public URL with the real API, realtime channel, persistence layer, mail path, and malware scanner active.
