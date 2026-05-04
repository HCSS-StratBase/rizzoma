#!/usr/bin/env bash
# PreToolUse on Write/Bash — verify screenshots/ filenames follow the
# convention `<func>_<new|old>-YYMMDD-hhmm.png` per MEMORY.md.
# Datetime is a SUFFIX, NOT a prefix.
set -uo pipefail
input=$(cat)
tool=$(echo "$input" | jq -r '.tool_name // ""' 2>/dev/null)

# Collect candidate paths from either Write.file_path or Bash.command
paths=()
if [ "$tool" = "Write" ] || [ "$tool" = "Edit" ]; then
  fp=$(echo "$input" | jq -r '.tool_input.file_path // ""' 2>/dev/null)
  paths+=("$fp")
elif [ "$tool" = "Bash" ]; then
  cmd=$(echo "$input" | jq -r '.tool_input.command // ""' 2>/dev/null)
  # Pull out anything that looks like a screenshots/ path ending .png
  while read -r p; do
    [ -n "$p" ] && paths+=("$p")
  done < <(echo "$cmd" | grep -oE '[A-Za-z0-9_./-]*screenshots/[A-Za-z0-9_./-]+\.png' | sort -u)
fi

bad=()
for p in "${paths[@]}"; do
  [ -z "$p" ] && continue
  case "$p" in
    *screenshots/*.png) ;;
    *) continue ;;
  esac
  base=$(basename "$p")
  # Allowed: <name>_<new|old>-YYMMDD-hhmm.png with leading char/digit, no leading datetime
  if echo "$base" | grep -qE '^[A-Za-z][A-Za-z0-9_-]*_(new|old)-[0-9]{6}-[0-9]{4}\.png$'; then
    continue
  fi
  bad+=("$base")
done

if [ ${#bad[@]} -eq 0 ]; then
  echo '{"continue": true}'
  exit 0
fi

reason="Screenshot naming: ${bad[*]} doesn't match \`<functionality>_<new|old>-YYMMDD-hhmm.png\` (datetime is a SUFFIX, not a prefix). Screenshots go in screenshots/<run-folder>/, not loose at screenshots/ root. See ~/.claude/projects/-mnt-c-Rizzoma/memory/MEMORY.md."

jq -nc --arg reason "$reason" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: $reason
  }
}'
