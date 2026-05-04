#!/usr/bin/env bash
# Stop hook (Rizzoma project-scope) — enforce the 161-row visual sweep gate.
#
# If today's commits touch any BLB / editor / mobile UI surface, the visual
# sweep folder MUST be regenerated. Otherwise the BUILD_QUALITY_VERDICT.md
# from the previous baseline (260424-025320, 161 green / 0 orange / 0 red)
# is silently stale.
#
# Per docs/VISUAL_SCREENSHOT_SWEEP.md the gate is:
#   RIZZOMA_BASE_URL=<url> RIZZOMA_SWEEP_STAMP=<YYMMDD-HHMMSS> npm run visual:sweep
#   RIZZOMA_SWEEP_DIR=<sweep-folder> npm run visual:coverage
#
# This hook only WARNS; it doesn't run the sweep itself (Playwright +
# 161-row capture takes minutes).
set -uo pipefail
cat >/dev/null

git_root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo '{"continue": true}'; exit 0; }
[ "$git_root" = "/mnt/c/Rizzoma" ] || { echo '{"continue": true}'; exit 0; }
cd "$git_root" || { echo '{"continue": true}'; exit 0; }

# Did today's commits touch any BLB / editor / mobile UI surface?
ui_touched=$(git log --since=midnight --name-only --pretty=format: 2>/dev/null \
  | grep -cE '^(src/client/components/(blip|editor|RizzomaTopicDetail|RizzomaLayout|BlipMenu|RightToolsPanel)|src/client/components/.*/(BLB|Inline|Marker)|src/client/.*\.css)' \
  || echo 0)

# Also catch direct edits to BLB extension files
ui_touched_alt=$(git log --since=midnight --name-only --pretty=format: 2>/dev/null \
  | grep -cE 'BlipThreadNode|RizzomaBlip|BlipMenu|inlineMarkers|EditorConfig|RizzomaTopicDetail' \
  || echo 0)

ui_total=$((ui_touched + ui_touched_alt))
if [ "$ui_total" = "0" ]; then
  echo '{"continue": true}'
  exit 0
fi

# Find the latest sweep folder
latest_sweep=$(ls -1d screenshots/*-feature-sweep 2>/dev/null | sort | tail -1)
if [ -z "$latest_sweep" ]; then
  ctx="VISUAL SWEEP GATE: BLB/editor UI was touched in today's commits but no \`screenshots/*-feature-sweep/\` folder exists. Per docs/VISUAL_SCREENSHOT_SWEEP.md the gate is:\n  RIZZOMA_BASE_URL=https://dev.138-201-62-161.nip.io RIZZOMA_SWEEP_STAMP=\$(date -u +%y%m%d-%H%M%S) npm run visual:sweep\n  RIZZOMA_SWEEP_DIR=<sweep-folder> npm run visual:coverage\nBaseline: 260424-025320 = 161 green / 0 orange / 0 red. Re-run before claiming done."
  jq -nc --arg ctx "$ctx" '{hookSpecificOutput:{hookEventName:"Stop",additionalContext:$ctx}}'
  exit 0
fi

# Compare sweep mtime against latest UI-touching commit's commit time
latest_ui_commit_time=$(git log --since=midnight --name-only --pretty=format:'%ct' 2>/dev/null \
  | awk 'BEGIN{ts=0} /^[0-9]{10}/{ts=$0} /BlipThreadNode|RizzomaBlip|BlipMenu|inlineMarkers|EditorConfig|RizzomaTopicDetail|src\/client\/.*\.css/{if(ts>max){max=ts}} END{print max+0}')
sweep_mtime=$(stat -c %Y "$latest_sweep" 2>/dev/null || echo 0)

if [ "$sweep_mtime" -lt "$latest_ui_commit_time" ]; then
  sweep_when=$(date -d @"$sweep_mtime" '+%Y-%m-%d %H:%M' 2>/dev/null || echo "?")
  commit_when=$(date -d @"$latest_ui_commit_time" '+%Y-%m-%d %H:%M' 2>/dev/null || echo "?")
  ctx="VISUAL SWEEP GATE: BLB/editor UI was touched in today's commits (latest at $commit_when) but the latest sweep folder \`$latest_sweep\` is from $sweep_when — STALE.\n\nThe 161-row systematic comparison gate has NOT been re-passed for tonight's changes. Baseline: 260424-025320 = 161 green / 0 orange / 0 red.\n\nRe-run before claiming done:\n  RIZZOMA_BASE_URL=https://dev.138-201-62-161.nip.io RIZZOMA_SWEEP_STAMP=\$(date -u +%y%m%d-%H%M%S) npm run visual:sweep\n  RIZZOMA_SWEEP_DIR=<new-folder> npm run visual:coverage\nThen check the new BUILD_QUALITY_VERDICT.md vs the baseline."
  jq -nc --arg ctx "$ctx" '{hookSpecificOutput:{hookEventName:"Stop",additionalContext:$ctx}}'
else
  echo '{"continue": true}'
fi
