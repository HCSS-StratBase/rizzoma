#!/usr/bin/env bash
# PreToolUse on mcp__tana-local__tag — refuse to tag a Rizzoma entry without
# both #Rizzoma (hLM0dWLg34-F) AND #Rizzoma_modernization (-b9KQhkcs8dr) tags.
# MEMORY.md feedback: "Repeat-mistake on 3 separate sessions".
set -uo pipefail
input=$(cat)
# Extract tagIds array as JSON
tag_ids=$(echo "$input" | jq -c '.tool_input.tagIds // []' 2>/dev/null)
action=$(echo "$input" | jq -r '.tool_input.action // "add"' 2>/dev/null)

# Only enforce on add operations
if [ "$action" != "add" ]; then
  echo '{"continue": true}'
  exit 0
fi

has_rizzoma=$(echo "$tag_ids" | jq 'any(. == "hLM0dWLg34-F")')
has_modern=$(echo "$tag_ids" | jq 'any(. == "-b9KQhkcs8dr")')

if [ "$has_rizzoma" = "true" ] && [ "$has_modern" = "true" ]; then
  echo '{"continue": true}'
  exit 0
fi

# Missing one or both — ask for confirmation
missing=()
[ "$has_rizzoma" != "true" ] && missing+=("#Rizzoma (hLM0dWLg34-F)")
[ "$has_modern" != "true" ] && missing+=("#Rizzoma_modernization (-b9KQhkcs8dr)")

reason="Rizzoma Tana entries MUST include both #Rizzoma + #Rizzoma_modernization. Missing: ${missing[*]}. (MEMORY.md: repeat-mistake on 3 separate sessions.)"

jq -nc --arg reason "$reason" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: $reason
  }
}'
