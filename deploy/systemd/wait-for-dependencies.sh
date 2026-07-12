#!/usr/bin/env bash

set -euo pipefail

deadline_seconds="${RIZZOMA_DEPENDENCY_WAIT_SECONDS:-50}"
deadline=$((SECONDS + deadline_seconds))

while ((SECONDS < deadline)); do
  if timeout 2 docker exec rizzoma-redis redis-cli ping >/dev/null 2>&1 \
    && curl --connect-timeout 1 --max-time 2 -fsS -o /dev/null \
      http://127.0.0.1:5984/_up; then
    exit 0
  fi
  sleep 2
done

printf 'Rizzoma dependencies did not become ready within %s seconds\n' "$deadline_seconds" >&2
exit 1
