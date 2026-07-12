#!/usr/bin/env bash
# PostToolUse on Read — append the file path to .claude/state/session-reads.txt
# so other hooks (blb-required-reading-check) can ask "was X read this session?".
set -uo pipefail
input=$(cat)
fp=$(echo "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
if [ -n "$fp" ]; then
  mkdir -p /mnt/c/Rizzoma/.claude/state
  echo "$fp" >> /mnt/c/Rizzoma/.claude/state/session-reads.txt
fi
echo '{"continue": true}'
