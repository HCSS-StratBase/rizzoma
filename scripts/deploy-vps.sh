#!/usr/bin/env bash
# One-shot deploy to the VPS at 138.201.62.161:8200.
#
# Pulls latest master, preserves VPS-local docker-compose overrides
# (ports, persistent volumes, ALLOWED_ORIGINS for the public IP),
# rebuilds the app container, waits for health, and reports.
#
# Usage:
#   bash scripts/deploy-vps.sh
#   bash scripts/deploy-vps.sh --profile prod  # switch to production target
#
# Requires: ssh root@138.201.62.161 key auth (already set up).
#
# Exit codes:
#   0   success
#   1   ssh failed
#   2   pull failed / merge conflict could not auto-resolve
#   3   build failed
#   4   post-deploy health check failed

set -euo pipefail

VPS="root@138.201.62.161"
REPO="/data/large-projects/stephan/rizzoma"
HEALTH_URL="http://localhost:8200/api/health"
PROFILE="${1:-}"

log() { echo "[deploy-vps] $*"; }

log "SSH reachable check..."
ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$VPS" 'echo ok' >/dev/null || {
  log "ERROR: ssh to $VPS failed"
  exit 1
}

log "Pulling latest master (preserving VPS-local docker-compose.yml overrides)..."
ssh "$VPS" "set -euo pipefail
  cd '$REPO'

  # If docker-compose.yml has local changes, back up + stash + pull + reapply
  if ! git diff --quiet docker-compose.yml; then
    cp docker-compose.yml /tmp/vps-compose-backup.yml
    echo '[deploy-vps] stashing docker-compose.yml with VPS overrides'
    git stash push docker-compose.yml -m 'vps-overrides-auto-\$(date +%Y%m%d-%H%M)' >/dev/null
  fi

  # Handle any prior unresolved merge state
  if [ -f .git/MERGE_HEAD ] || git status --short docker-compose.yml | grep -q '^UU'; then
    echo '[deploy-vps] prior merge state detected, resolving in favour of origin'
    git checkout origin/master -- docker-compose.yml 2>/dev/null || true
    git add docker-compose.yml 2>/dev/null || true
    git commit -m 'deploy: resolve prior merge by taking upstream docker-compose' --quiet 2>/dev/null || true
  fi

  git pull --ff-only origin master
  git log --oneline -1

  # If we stashed earlier, try to restore — if conflict, re-apply known VPS overrides
  if [ -f /tmp/vps-compose-backup.yml ]; then
    cp /tmp/vps-compose-backup.yml docker-compose.yml
    echo '[deploy-vps] restored VPS-local docker-compose overrides from /tmp backup'
  fi

  # Drop any leftover stashes to avoid pollution across runs
  git stash list | grep 'vps-overrides-auto-' | head -5 | awk -F: '{print \$1}' | while read -r s; do
    git stash drop \"\$s\" >/dev/null 2>&1 || true
  done
" || {
  log "ERROR: git pull / merge failed on VPS. Fix manually: ssh $VPS 'cd $REPO && git status'"
  exit 2
}

log "Rebuilding app container..."
if [ "$PROFILE" = "--profile" ] || [ "$PROFILE" = "prod" ]; then
  ssh "$VPS" "cd '$REPO' && docker compose --profile prod up -d --build app-prod" || {
    log "ERROR: docker compose build (prod profile) failed"; exit 3
  }
else
  ssh "$VPS" "cd '$REPO' && docker compose up -d --build app" || {
    log "ERROR: docker compose build failed"; exit 3
  }
fi

log "Waiting up to 30s for health check..."
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  sleep 2
  CODE=$(ssh "$VPS" "curl -s -o /dev/null -w '%{http_code}' '$HEALTH_URL'" 2>/dev/null || echo 000)
  if [ "$CODE" = "200" ]; then
    log "healthy after ${i}x2s"
    ssh "$VPS" "curl -s '$HEALTH_URL'" | head -c 500; echo
    log "DONE — deploy successful"
    exit 0
  fi
done

log "ERROR: health check never returned 200 after 30s"
ssh "$VPS" "docker logs --tail 20 rizzoma-app" | head -30
exit 4
