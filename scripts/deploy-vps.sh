#!/usr/bin/env bash
# Build an immutable compiled Rizzoma release on the VPS and start it in an
# inactive managed lane. Public nginx is deliberately not changed here:
# candidate acceptance remains a separate, reversible gate.

set -euo pipefail

VPS="${RIZZOMA_VPS:-root@138.201.62.161}"
SOURCE_REPO="${RIZZOMA_VPS_SOURCE:-/data/large-projects/stephan/rizzoma_merge}"
LANE="blue"
SHA=""
ALLOW_ACTIVE_LANE=0

usage() {
  printf '%s\n' \
    'Usage: scripts/deploy-vps.sh [--sha <full-commit>] [--lane blue|green]' \
    '                             [--allow-active-lane]' \
    '' \
    'Defaults:' \
    '  --sha   current local HEAD (must be merged into remote master)' \
    '  --lane  blue (port 8101; green uses 8102)' \
    '' \
    '--allow-active-lane is an emergency override. Without it, the script' \
    'refuses to restart whichever lane public nginx currently serves.' \
    '' \
    'Prerequisite: scripts/install-vps-systemd.sh and a root-only' \
    '/etc/rizzoma/production.env must already exist on the VPS.'
}

while (($#)); do
  case "$1" in
    --sha)
      SHA="${2:-}"
      shift 2
      ;;
    --lane)
      LANE="${2:-}"
      shift 2
      ;;
    --allow-active-lane)
      ALLOW_ACTIVE_LANE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "$LANE" in
  blue) PORT=8101 ;;
  green) PORT=8102 ;;
  *)
    printf 'Lane must be blue or green, got: %s\n' "$LANE" >&2
    exit 2
    ;;
esac

if [[ -z "$SHA" ]]; then
  SHA="$(git rev-parse HEAD)"
fi
if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'A full 40-character commit SHA is required, got: %s\n' "$SHA" >&2
  exit 2
fi

printf '[deploy-vps] candidate=%s lane=%s port=%s\n' "$SHA" "$LANE" "$PORT"
ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$VPS" \
  bash -s -- "$SOURCE_REPO" "$SHA" "$LANE" "$PORT" "$ALLOW_ACTIVE_LANE" <<'REMOTE'
set -euo pipefail

SOURCE_REPO="$1"
SHA="$2"
LANE="$3"
PORT="$4"
ALLOW_ACTIVE_LANE="$5"
RELEASE="/srv/rizzoma/releases/$SHA"
STAGING_ROOT="/srv/rizzoma/.staging"
STAGE="$STAGING_ROOT/$SHA.$$"
LANE_LINK="/srv/rizzoma/lanes/$LANE"
PUBLIC_NGINX="/etc/nginx/sites-available/rizzoma.conf"
PREVIOUS_TARGET=""
HAD_PREVIOUS_LINK=0
LANE_PUBLISHED=0

cleanup_stage() {
  if [[ -n "$STAGE" && -e "$STAGE" ]]; then
    chmod -R u+w "$STAGE" 2>/dev/null || true
    git -C "$SOURCE_REPO" worktree remove --force "$STAGE" 2>/dev/null || rm -rf "$STAGE"
  fi
}

rollback_lane() {
  if [[ "$LANE_PUBLISHED" != 1 ]]; then return; fi
  if [[ "$HAD_PREVIOUS_LINK" = 1 ]]; then
    ln -sfn "$PREVIOUS_TARGET" "$LANE_LINK"
    systemctl restart "rizzoma@$LANE.service" || true
  else
    rm -f "$LANE_LINK"
    systemctl stop "rizzoma@$LANE.service" || true
  fi
}

on_error() {
  status=$?
  trap - ERR INT TERM
  cleanup_stage
  rollback_lane
  printf '[deploy-vps] candidate failed; previous lane target restored\n' >&2
  exit "$status"
}
trap on_error ERR INT TERM

test -f /etc/rizzoma/production.env
test "$(stat -c '%a' /etc/rizzoma/production.env)" = "600"
test -f "/etc/rizzoma/$LANE.env"
grep -qx "PORT=$PORT" "/etc/rizzoma/$LANE.env"
test -f /etc/systemd/system/rizzoma@.service
test -d "$SOURCE_REPO/.git"
test -f "$PUBLIC_NGINX"

if grep -Eq "proxy_pass[[:space:]]+http://(127\\.0\\.0\\.1|localhost):$PORT;" "$PUBLIC_NGINX"; then
  if [[ "$ALLOW_ACTIVE_LANE" != 1 ]]; then
    printf '[deploy-vps] REFUSED: public nginx currently serves lane %s on port %s\n' "$LANE" "$PORT" >&2
    printf '[deploy-vps] choose the inactive lane; use --allow-active-lane only for an explicit emergency\n' >&2
    exit 3
  fi
  printf '[deploy-vps] WARNING: emergency override permits restart of the public lane\n' >&2
fi

git -C "$SOURCE_REPO" fetch --quiet origin master:refs/remotes/origin/master
git -C "$SOURCE_REPO" cat-file -e "$SHA^{commit}"
if ! git -C "$SOURCE_REPO" merge-base --is-ancestor "$SHA" origin/master; then
  printf '[deploy-vps] REFUSED: candidate %s is not merged into origin/master\n' "$SHA" >&2
  exit 3
fi

install -d -m 0755 /srv/rizzoma/releases /srv/rizzoma/lanes "$STAGING_ROOT" /var/lib/rizzoma/uploads

if [[ ! -d "$RELEASE" ]]; then
  git -C "$SOURCE_REPO" worktree add --detach "$STAGE" "$SHA"
  cd "$STAGE"
  CYPRESS_INSTALL_BINARY=0 npm ci --no-audit --no-fund --legacy-peer-deps
  FEAT_ALL=1 \
    FEAT_RIZZOMA_PARITY_RENDER=1 \
    FEAT_RIZZOMA_NATIVE_RENDER= \
    npm run build
  test -f dist/client/index.html
  test -f dist/server/server/app.js
  CYPRESS_INSTALL_BINARY=0 npm prune --omit=dev --no-audit --no-fund --legacy-peer-deps
  install -d -m 0755 data
  rm -rf data/uploads
  ln -s /var/lib/rizzoma/uploads data/uploads
  git -C "$SOURCE_REPO" worktree move "$STAGE" "$RELEASE"
  STAGE=""
  printf '%s\n' "$SHA" > "$RELEASE/RELEASE_SHA"
  chown -R root:root "$RELEASE"
  chmod -R a-w "$RELEASE"
else
  test -f "$RELEASE/RELEASE_SHA"
  test "$(cat "$RELEASE/RELEASE_SHA")" = "$SHA"
  test -f "$RELEASE/dist/client/index.html"
  test -f "$RELEASE/dist/server/server/app.js"
fi

if [[ -L "$LANE_LINK" ]]; then
  HAD_PREVIOUS_LINK=1
  PREVIOUS_TARGET="$(readlink "$LANE_LINK")"
fi
ln -sfn "$RELEASE" "$LANE_LINK"
LANE_PUBLISHED=1
systemctl daemon-reload
systemctl enable "rizzoma@$LANE.service" >/dev/null
systemctl restart "rizzoma@$LANE.service"

HEALTH_FILE="/tmp/rizzoma-$LANE-candidate-health.json"
for attempt in $(seq 1 30); do
  if curl --connect-timeout 2 --max-time 5 -fsS \
      "http://127.0.0.1:$PORT/api/health" > "$HEALTH_FILE"; then
    break
  fi
  if [[ "$attempt" = 30 ]]; then
    journalctl -u "rizzoma@$LANE.service" -n 80 --no-pager
    exit 4
  fi
  sleep 2
done

grep -q '"status":"ok"' "$HEALTH_FILE"
INDEX_FILE="/tmp/rizzoma-$LANE-candidate-index.html"
curl --connect-timeout 2 --max-time 5 -fsS \
  "http://127.0.0.1:$PORT/" > "$INDEX_FILE"
grep -Eq '/assets/[^" ]+\.(js|css)' "$INDEX_FILE"
if grep -q '/@vite/client' "$INDEX_FILE"; then
  printf 'Candidate is still serving the Vite development client\n' >&2
  exit 4
fi

systemctl is-active --quiet "rizzoma@$LANE.service"
trap - ERR INT TERM
printf '[deploy-vps] managed candidate healthy: lane=%s port=%s sha=%s\n' "$LANE" "$PORT" "$SHA"
REMOTE

printf '%s\n' \
  '[deploy-vps] Candidate is ready, but public traffic was not changed.' \
  '[deploy-vps] Follow the HTTPS canary, browser acceptance, and atomic nginx' \
  '[deploy-vps] cutover gates in deploy/systemd/README.md.'
