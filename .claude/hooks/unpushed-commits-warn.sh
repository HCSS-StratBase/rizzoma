#!/usr/bin/env bash
# Stop hook — standalone unpushed-commits warning (post-work-checklist
# also checks this, but this one is cheap and isolated so it remains
# active even if the bigger checklist is disabled).
set -uo pipefail
cd /mnt/c/Rizzoma 2>/dev/null || exit 0
cat >/dev/null
ahead=$(git rev-list "@{u}..@" --count 2>/dev/null || echo 0)
if [ -z "$ahead" ] || [ "$ahead" = "0" ]; then
  echo '{"continue": true}'
  exit 0
fi
branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
ctx="UNPUSHED: $ahead commit(s) on \`$branch\` not yet pushed to origin. Run \`git push origin $branch\`."
jq -nc --arg ctx "$ctx" '{
  hookSpecificOutput: {
    hookEventName: "Stop",
    additionalContext: $ctx
  }
}'
