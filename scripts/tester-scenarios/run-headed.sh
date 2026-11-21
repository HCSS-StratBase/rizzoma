#!/usr/bin/env bash
# One-shot: run the tester-scenarios suite in a REAL, HEADED Chromium on a PRIVATE virtual display (Xvfb), never on
# the desktop of whoever is working on this machine. Human pace (slowMo, typing delay), Playwright video plus step
# screenshots as evidence. Only one headed run at a time (CPU), serialised with flock.
#
#   npm run test:tester-scenarios:headed                       # everything
#   SUITE_FAMILIES=A,C npm run test:tester-scenarios:headed
#   RIZZOMA_BASE_URL=... COUCHDB_URL=... RIZZOMA_SERVER_LOG=... are passed through.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$here"
command -v xvfb-run >/dev/null || { echo "xvfb-run is not installed; refusing to fall back to a real desktop" >&2; exit 2; }
export SUITE_HEADED=1
export SUITE_SLOWMO="${SUITE_SLOWMO:-120}"
export SUITE_TYPE_DELAY="${SUITE_TYPE_DELAY:-90}"
# the browser must see ONLY the virtual display: no Wayland / WSLg desktop
exec flock -o "${SUITE_LOCK:-/tmp/rizzoma-visible-browser.lock}" \
  env -u WAYLAND_DISPLAY -u DISPLAY \
  xvfb-run -a -s "-screen 0 1600x1000x24 -nolisten tcp" \
  node test-tester-scenarios.mjs "$@"
