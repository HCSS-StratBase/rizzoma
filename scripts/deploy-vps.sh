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
LANE_LINK="/srv/rizzoma/lanes/$LANE"
PREVIOUS_TARGET=""
HAD_PREVIOUS_LINK=0
LANE_WAS_ACTIVE=0
LANE_WAS_ENABLED=0
LANE_PUBLISHED=0
ROLLBACK_RESTORED=1
NEW_RELEASE=0
STAGE=""
LANE_TEMP_LINK=""
TEMP_FILES=()

exec 9>/run/lock/rizzoma-deploy.lock
if ! flock -n 9; then
  printf '[deploy-vps] REFUSED: another Rizzoma deployment is running\n' >&2
  exit 3
fi

cleanup_temporary_files() {
  if [[ -n "$LANE_TEMP_LINK" ]]; then
    rm -f "$LANE_TEMP_LINK"
    LANE_TEMP_LINK=""
  fi
  if ((${#TEMP_FILES[@]})); then
    rm -f "${TEMP_FILES[@]}"
    TEMP_FILES=()
  fi
}

cleanup_stage() {
  if [[ -n "$STAGE" && -e "$STAGE" ]]; then
    chmod -R u+w "$STAGE" 2>/dev/null || true
    git -C "$SOURCE_REPO" worktree remove --force "$STAGE" 2>/dev/null || rm -rf "$STAGE"
  fi
}

publish_lane_link() {
  local target="$1"
  LANE_TEMP_LINK="$(mktemp "${LANE_LINK}.next.XXXXXXXX")" || return 1
  rm -f "$LANE_TEMP_LINK" || return 1
  ln -s "$target" "$LANE_TEMP_LINK" || return 1
  mv -Tf "$LANE_TEMP_LINK" "$LANE_LINK" || return 1
  LANE_TEMP_LINK=""
  return 0
}

restore_service_state() {
  if [[ "$LANE_WAS_ENABLED" = 1 ]]; then
    systemctl enable "rizzoma@$LANE.service" >/dev/null 2>&1 || return 1
  else
    systemctl disable "rizzoma@$LANE.service" >/dev/null 2>&1 || return 1
  fi
  if [[ "$LANE_WAS_ACTIVE" = 1 && "$HAD_PREVIOUS_LINK" = 1 ]]; then
    systemctl restart "rizzoma@$LANE.service" || return 1
  else
    systemctl stop "rizzoma@$LANE.service" || return 1
  fi
  if [[ "$LANE_WAS_ENABLED" = 1 ]]; then
    systemctl is-enabled --quiet "rizzoma@$LANE.service" || return 1
  elif systemctl is-enabled --quiet "rizzoma@$LANE.service"; then
    return 1
  fi
  if [[ "$LANE_WAS_ACTIVE" = 1 && "$HAD_PREVIOUS_LINK" = 1 ]]; then
    systemctl is-active --quiet "rizzoma@$LANE.service" || return 1
  elif systemctl is-active --quiet "rizzoma@$LANE.service"; then
    return 1
  fi
  return 0
}

rollback_lane() {
  if [[ "$LANE_PUBLISHED" != 1 ]]; then return; fi
  if [[ "$HAD_PREVIOUS_LINK" = 1 ]]; then
    if ! publish_lane_link "$PREVIOUS_TARGET"; then
      ROLLBACK_RESTORED=0
      systemctl stop "rizzoma@$LANE.service" || true
      return
    fi
  else
    if ! rm -f "$LANE_LINK"; then
      ROLLBACK_RESTORED=0
      systemctl stop "rizzoma@$LANE.service" || true
      return
    fi
  fi
  if ! systemctl daemon-reload || ! restore_service_state; then
    ROLLBACK_RESTORED=0
    systemctl stop "rizzoma@$LANE.service" || true
    return
  fi
}

cleanup_new_release() {
  if [[ "$NEW_RELEASE" != 1 || "$ROLLBACK_RESTORED" != 1 || ! -d "$RELEASE" ]]; then
    return
  fi
  chmod -R u+w "$RELEASE" 2>/dev/null || true
  git -C "$SOURCE_REPO" worktree remove --force "$RELEASE" 2>/dev/null || rm -rf "$RELEASE"
}

on_error() {
  trapped_status=$?
  status="${1:-$trapped_status}"
  trap - ERR INT TERM
  cleanup_stage
  rollback_lane
  cleanup_new_release
  cleanup_temporary_files
  if [[ "$LANE_PUBLISHED" != 1 ]]; then
    printf '[deploy-vps] candidate failed before lane publication; no lane state changed\n' >&2
  elif [[ "$ROLLBACK_RESTORED" = 1 ]]; then
    printf '[deploy-vps] candidate failed; previous lane target and service state restored\n' >&2
  else
    printf '[deploy-vps] candidate failed; lane was stopped because its previous target could not be restored\n' >&2
  fi
  exit "$status"
}
trap on_error ERR INT TERM

test -f /etc/rizzoma/production.env
test "$(stat -c '%U:%G:%a' /etc/rizzoma/production.env)" = "root:root:600"
require_env_value() {
  local key="$1" expected="$2" count exact_count
  count="$(grep -Ec "^[[:space:]]*(export[[:space:]]+)?${key}=" /etc/rizzoma/production.env || true)"
  exact_count="$(grep -Fxc "${key}=${expected}" /etc/rizzoma/production.env || true)"
  if [[ "$count" != 1 || "$exact_count" != 1 ]]; then
    printf '[deploy-vps] REFUSED: production.env must contain exactly one %s=%s\n' "$key" "$expected" >&2
    exit 3
  fi
}
require_env_value NODE_ENV production
require_env_value HOST 127.0.0.1
require_env_value UPLOADS_STORAGE local
require_env_value CLAMAV_HOST 127.0.0.1
require_env_value CLAMAV_PORT 3310
test -f "/etc/rizzoma/$LANE.env"
test "$(stat -c '%U:%G:%a' "/etc/rizzoma/$LANE.env")" = "root:root:600"
grep -qx "PORT=$PORT" "/etc/rizzoma/$LANE.env"
test -f /etc/systemd/system/rizzoma@.service
test "$(stat -c '%U:%G:%a' /etc/systemd/system/rizzoma@.service)" = "root:root:644"
dropins="$(systemctl show "rizzoma@$LANE.service" --property=DropInPaths --value)"
if [[ -n "$dropins" ]]; then
  printf '[deploy-vps] REFUSED: rizzoma@%s.service has effective drop-ins: %s\n' "$LANE" "$dropins" >&2
  exit 3
fi
fragment_path="$(systemctl show "rizzoma@$LANE.service" --property=FragmentPath --value)"
if [[ "$fragment_path" != "/etc/systemd/system/rizzoma@.service" ]]; then
  printf '[deploy-vps] REFUSED: effective unit fragment is %s\n' "$fragment_path" >&2
  exit 3
fi
git -C "$SOURCE_REPO" rev-parse --git-dir >/dev/null

assert_lane_not_public() {
  local nginx_effective
  nginx -t >/dev/null 2>&1
  nginx_effective="$(nginx -T 2>/dev/null)"
  if ! grep -Eq "(127\\.0\\.0\\.1|localhost):${PORT}([/;[:space:]]|$)" <<<"$nginx_effective"; then
    return
  fi
  if [[ "$ALLOW_ACTIVE_LANE" != 1 ]]; then
    printf '[deploy-vps] REFUSED: public nginx currently serves lane %s on port %s\n' "$LANE" "$PORT" >&2
    printf '[deploy-vps] choose the inactive lane; use --allow-active-lane only for an explicit emergency\n' >&2
    return 3
  fi
  printf '[deploy-vps] WARNING: emergency override permits restart of the public lane\n' >&2
}
assert_lane_not_public

git -C "$SOURCE_REPO" fetch --quiet origin master:refs/remotes/origin/master
git -C "$SOURCE_REPO" cat-file -e "$SHA^{commit}"
if ! git -C "$SOURCE_REPO" merge-base --is-ancestor "$SHA" origin/master; then
  printf '[deploy-vps] REFUSED: candidate %s is not merged into origin/master\n' "$SHA" >&2
  exit 3
fi
if ! git -C "$SOURCE_REPO" show "$SHA:deploy/systemd/rizzoma@.service" | \
    cmp -s - /etc/systemd/system/rizzoma@.service; then
  printf '[deploy-vps] REFUSED: installed rizzoma@.service does not match candidate %s\n' "$SHA" >&2
  printf '[deploy-vps] run scripts/install-vps-systemd.sh from the exact candidate checkout first\n' >&2
  exit 3
fi

install -d -m 0755 /srv/rizzoma/releases /srv/rizzoma/lanes
install -d -m 0700 "$STAGING_ROOT"
install -d -o rizzoma -g rizzoma -m 0750 /var/lib/rizzoma/uploads

verify_release() {
  test "$(git -C "$RELEASE" rev-parse HEAD)" = "$SHA" || return 1
  git -C "$RELEASE" diff --quiet || return 1
  git -C "$RELEASE" diff --cached --quiet || return 1
  test -L "$RELEASE/data/uploads" || return 1
  test "$(readlink "$RELEASE/data/uploads")" = "/var/lib/rizzoma/uploads" || return 1
  if find "$RELEASE" -xdev \( ! -user root -o ! -group root \) -print -quit | grep -q .; then
    return 1
  fi
  if find "$RELEASE" -xdev \( -type f -o -type d \) -perm /0222 -print -quit | grep -q .; then
    return 1
  fi
  return 0
}

if [[ ! -d "$RELEASE" ]]; then
  STAGE="$(mktemp -d "$STAGING_ROOT/$SHA.XXXXXXXX")"
  rmdir "$STAGE"
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
  NEW_RELEASE=1
  printf '%s\n' "$SHA" > "$RELEASE/RELEASE_SHA"
  chown -R root:root "$RELEASE"
  chmod -R a-w "$RELEASE"
else
  test -f "$RELEASE/RELEASE_SHA"
  test "$(cat "$RELEASE/RELEASE_SHA")" = "$SHA"
  test -f "$RELEASE/dist/client/index.html"
  test -f "$RELEASE/dist/server/server/app.js"
fi
if ! verify_release; then
  printf '[deploy-vps] REFUSED: release %s failed immutable-tree validation\n' "$RELEASE" >&2
  on_error 3
fi

if [[ -e "$LANE_LINK" && ! -L "$LANE_LINK" ]]; then
  printf '[deploy-vps] REFUSED: lane path %s is not a release symlink\n' "$LANE_LINK" >&2
  on_error 3
fi
if [[ -L "$LANE_LINK" ]]; then
  HAD_PREVIOUS_LINK=1
  PREVIOUS_TARGET="$(readlink "$LANE_LINK")"
fi
if systemctl is-active --quiet "rizzoma@$LANE.service"; then
  LANE_WAS_ACTIVE=1
fi
if systemctl is-enabled --quiet "rizzoma@$LANE.service"; then
  LANE_WAS_ENABLED=1
fi
if [[ "$LANE_WAS_ACTIVE" = 1 && "$HAD_PREVIOUS_LINK" != 1 ]]; then
  printf '[deploy-vps] REFUSED: lane %s is active without a release symlink\n' "$LANE" >&2
  on_error 3
fi
if [[ "$HAD_PREVIOUS_LINK" = 1 && ! -d "$LANE_LINK" ]]; then
  printf '[deploy-vps] REFUSED: lane %s has a broken release symlink\n' "$LANE" >&2
  on_error 3
fi
# Re-evaluate all loaded nginx config immediately before publication because a
# long dependency install/build leaves time for an operator-side cutover.
assert_lane_not_public
publish_lane_link "$RELEASE"
LANE_PUBLISHED=1
systemctl daemon-reload
systemctl enable "rizzoma@$LANE.service" >/dev/null
systemctl restart "rizzoma@$LANE.service"

HEALTH_FILE="$(mktemp "/tmp/rizzoma-$LANE-candidate-health.XXXXXXXX.json")"
TEMP_FILES+=("$HEALTH_FILE")
for attempt in $(seq 1 30); do
  if curl --connect-timeout 2 --max-time 5 -fsS \
      "http://127.0.0.1:$PORT/api/health" > "$HEALTH_FILE"; then
    break
  fi
  if [[ "$attempt" = 30 ]]; then
    journalctl -u "rizzoma@$LANE.service" -n 80 --no-pager
    on_error 4
  fi
  sleep 2
done

python3 - "$HEALTH_FILE" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    health = json.load(handle)
if health.get("status") != "ok":
    raise SystemExit(f"candidate health is not ok: {health.get('status')!r}")
checks = health.get("checks") or {}
for required in ("couchdb", "sessions", "clamav"):
    if (checks.get(required) or {}).get("status") != "ok":
        raise SystemExit(f"candidate {required} readiness is not ok")
PY
INDEX_FILE="$(mktemp "/tmp/rizzoma-$LANE-candidate-index.XXXXXXXX.html")"
TEMP_FILES+=("$INDEX_FILE")
curl --connect-timeout 2 --max-time 5 -fsS \
  "http://127.0.0.1:$PORT/" > "$INDEX_FILE"
grep -Eq '/assets/[^" ]+\.(js|css)' "$INDEX_FILE"
if grep -q '/@vite/client' "$INDEX_FILE"; then
  printf 'Candidate is still serving the Vite development client\n' >&2
  on_error 4
fi

systemctl is-active --quiet "rizzoma@$LANE.service"
trap - ERR INT TERM
cleanup_stage
cleanup_temporary_files
printf '[deploy-vps] managed candidate healthy: lane=%s port=%s sha=%s\n' "$LANE" "$PORT" "$SHA"
REMOTE

printf '%s\n' \
  '[deploy-vps] Candidate is ready, but public traffic was not changed.' \
  '[deploy-vps] Follow the direct preflight, zero-overlap maintenance drain,' \
  '[deploy-vps] both-vhost cutover, and public acceptance gates in' \
  '[deploy-vps] deploy/systemd/README.md.'
