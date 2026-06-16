#!/usr/bin/env bash
# PreToolUse on Edit/Write/mcp__playwright__* — non-blocking reminder if
# BLB_LOGIC_AND_PHILOSOPHY.md hasn't been Read this session.
set -uo pipefail
input=$(cat)
tool=$(echo "$input" | jq -r '.tool_name // ""' 2>/dev/null)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
url=$(echo "$input" | jq -r '.tool_input.url // ""' 2>/dev/null)

# Only fire on BLB-relevant operations
relevant=0
if echo "$file_path" | grep -qE 'BLB_LOGIC_AND_PHILOSOPHY|RizzomaBlip|BlipThreadNode|inlineMarkers'; then
  relevant=1
fi
if echo "$url" | grep -qE 'rizzoma\.com/topic|/(#/)?topic/'; then
  relevant=1
fi
if [ "$relevant" = "0" ]; then
  echo '{"continue": true}'
  exit 0
fi

# Check session-reads marker
reads_file=/mnt/c/Rizzoma/.claude/state/session-reads.txt
if [ -f "$reads_file" ] && grep -q 'BLB_LOGIC_AND_PHILOSOPHY' "$reads_file"; then
  echo '{"continue": true}'
  exit 0
fi

ctx="REMINDER: about to touch BLB-related code/topic without having Read \`docs/BLB_LOGIC_AND_PHILOSOPHY.md\` this session. The 5-row pre-commit checklist (§19) and the M1-M11 mechanics (§20+) MUST be followed for any BLB-shaped writeup. Read the doc first."

jq -nc --arg ctx "$ctx" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    additionalContext: $ctx
  }
}'
