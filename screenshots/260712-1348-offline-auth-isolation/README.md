# Offline auth isolation UI evidence (2026-07-12)

## Scope

Playwright capture of the production modern shell after the offline/auth
isolation slice. The run exercises four real rendered states at four required
desktop widths (all at 900 px height) plus two mobile viewports:

- guest shell with visible **Sign in** control;
- centered sign-in dialog over the guest-readable shell;
- signed-in profile with one identity surface and a visible **Logout** action.
- authenticated offline shell with a visible **Offline · read-only** boundary.

## Method

`scripts/capture-offline-auth-ui.mjs` ran against the branch-local Vite client
at `http://127.0.0.1:4312/?layout=rizzoma`. Playwright intercepted only API
responses so both guest and signed-in auth states were deterministic; the page
itself was the branch's real compiled React UI. Captures use viewport screenshots
at 1280, 1366, 1440, and 1600 px widths, plus 390x844 and 412x915 mobile captures.

## Visual verdict

- PASS: no clipping, overlap, stacked navigation, or horizontal overflow at any
  required width.
- PASS: guest Sign in and signed-in Logout remain visible in the existing
  right-side identity/tool rail without duplicating the user profile.
- PASS: the sign-in dialog remains centered on desktop and becomes a fully
  visible bottom sheet on mobile.
- PASS: the narrow 1280 px layout retains usable controls and content spacing.
- PASS: the 390x844 and 412x915 layouts expose compact auth controls above the
  safe-area boundary; the mobile sign-in sheet remains fully visible.
- PASS: the read-only boundary remains visible without covering the desktop
  auth rail or the mobile auth dock.

All 24 PNGs were inspected at original resolution. The guest bootstrap
intentionally returns HTTP 401 for `/api/auth/me`; those expected browser
messages are separated in `browser-console-expected.json`. Unexpected console
errors are recorded in `browser-console-errors.json`.
