#!/usr/bin/env bash
# Stop hook (Rizzoma project-scope) — block UI-status handoff when parity
# evidence is missing.
#
# This is intentionally stronger than the old visual-sweep reminder. The
# failure mode it prevents is claiming Rizzoma UI progress after finding only
# programmatic green checks, without first using the legacy screenshot set and
# writing down the actual visual regressions.
set -uo pipefail
cat >/dev/null

git_root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo '{"continue": true}'; exit 0; }
[ "$git_root" = "/mnt/c/Rizzoma" ] || { echo '{"continue": true}'; exit 0; }
cd "$git_root" || { echo '{"continue": true}'; exit 0; }

if npm run -s parity:gate >/tmp/rizzoma-parity-gate.log 2>&1; then
  echo '{"continue": true}'
  exit 0
fi

ctx="RIZZOMA PARITY GATE FAILED — do NOT claim UI/parity work is done.\n\n$(cat /tmp/rizzoma-parity-gate.log)\n\nRequired evidence before handoff:\n- legacy reference set present: screenshots/260224-2343-rizzoma-live-reference/feature/rizzoma-core-features/\n- fresh current sweep: npm run visual:sweep\n- current coverage: npm run visual:coverage\n- saved side-by-side legacy/current comparison PNGs\n- written PARITY_AUDIT.md with measured counts, screenshot gaps, severe failures, and next fixes"

jq -nc --arg ctx "$ctx" '{
  continue: false,
  hookSpecificOutput: {
    hookEventName: "Stop",
    additionalContext: $ctx
  }
}'
