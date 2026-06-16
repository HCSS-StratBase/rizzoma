#!/usr/bin/env bash
# PreToolUse on Bash — gate POST to Hetzner Robot firewall API.
# MEMORY.md / SYSTEM_INSTRUCTIONS.md: POST replaces ENTIRE ruleset (not
# append). 2026-04-23 incident took SSH + postgres + apps offline for
# ~3 minutes when only one rule was sent.
set -uo pipefail
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // ""' 2>/dev/null)

# Match POST-to-firewall variants:
#   curl ... -X POST ... robot-ws.your-server.de/firewall/...
#   curl ... robot-ws.your-server.de/firewall/... -d ...  (curl POSTs when -d is present)
if ! echo "$cmd" | grep -qE 'robot-ws\.your-server\.de/firewall/'; then
  echo '{"continue": true}'; exit 0
fi
# GET is fine; only intercept POST patterns
is_post=0
echo "$cmd" | grep -qE -- '-X[[:space:]]+POST' && is_post=1
echo "$cmd" | grep -qE -- '(^|[[:space:]])-d[[:space:]]' && is_post=1
echo "$cmd" | grep -qE -- '(^|[[:space:]])--data' && is_post=1
if [ "$is_post" = "0" ]; then
  echo '{"continue": true}'; exit 0
fi

reason="HETZNER FIREWALL POST: this REPLACES the entire ruleset (not append). Hard limit 10 rules. The 2026-04-23 lockout cost 3 min of SSH/postgres/apps offline. Confirm: (1) you GET'd current rules first, (2) the POST body is the FULL desired ruleset including SSH (port 22 from your IP), HTTPS (443), apps-and-ephemeral (8000-65535), postgres (5432), (3) you're not at 10 rules already. See Hetzner SSH saga doc."

jq -nc --arg reason "$reason" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: $reason
  }
}'
