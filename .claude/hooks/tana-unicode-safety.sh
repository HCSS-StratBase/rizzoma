#!/usr/bin/env bash
# PreToolUse on mcp__tana-local__import_tana_paste — refuse content with
# literal \uXXXX escapes that would render as 6-character text in Tana.
# MEMORY.md: 2026-04-22 incident corrupted 18 nodes across 13 entries.
set -uo pipefail
input=$(cat)
content=$(echo "$input" | jq -r '.tool_input.content // ""' 2>/dev/null)

# Look for literal `\uXXXX` (backslash, lowercase u, four hex chars).
# In bash, `[\\]u` matches a backslash. The content variable holds the
# literal string AS RECEIVED by the MCP server — the backslash is real.
if echo "$content" | grep -qE '\\u[0-9a-fA-F]{4}'; then
  reason="Tana import_tana_paste content contains a literal \\\\uXXXX escape sequence. This will render as 6-character text in Tana (e.g. \\\\u2014 instead of em-dash —). Build content as a Python raw-string or use json.dumps(..., ensure_ascii=False). See MEMORY.md unicode-safety section."
  jq -nc --arg reason "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
else
  echo '{"continue": true}'
fi
