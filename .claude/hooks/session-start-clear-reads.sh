#!/usr/bin/env bash
# SessionStart — clear the session-reads tracker so blb-required-reading-check
# starts each session with a clean slate.
set -uo pipefail
cat >/dev/null
mkdir -p /mnt/c/Rizzoma/.claude/state
: > /mnt/c/Rizzoma/.claude/state/session-reads.txt
echo '{"continue": true}'
