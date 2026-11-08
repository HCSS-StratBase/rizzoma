#!/usr/bin/env bash
# Installation and reconciliation of the managed blue/green service template.
# This script intentionally does not create or copy production secrets.

set -euo pipefail

VPS="${RIZZOMA_VPS:-root@138.201.62.161}"
UNIT_SOURCE="deploy/systemd/rizzoma@.service"

usage() {
  printf '%s\n' \
    'Usage: scripts/install-vps-systemd.sh' \
    '' \
    'Installs or repairs the managed Rizzoma service prerequisites on the VPS.' \
    'Production secrets are never created or copied by this script.'
}

if (($#)); then
  if [[ "$#" = 1 && ( "$1" = "-h" || "$1" = "--help" ) ]]; then
    usage
    exit 0
  fi
  printf 'Unexpected argument: %s\n' "$1" >&2
  usage >&2
  exit 2
fi

test -f "$UNIT_SOURCE"

REMOTE_UNIT="$(ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
  "$VPS" 'mktemp /tmp/rizzoma@.service.XXXXXXXX')"
cleanup_remote_unit() {
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$VPS" \
    "rm -f -- '$REMOTE_UNIT'" >/dev/null 2>&1 || true
}
trap cleanup_remote_unit EXIT INT TERM
scp -q "$UNIT_SOURCE" "$VPS:$REMOTE_UNIT"
ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$VPS" \
  bash -s -- "$REMOTE_UNIT" <<'REMOTE'
set -euo pipefail
REMOTE_UNIT="$1"
case "$REMOTE_UNIT" in
  /tmp/rizzoma@.service.*) ;;
  *) printf 'Unsafe remote unit staging path\n' >&2; exit 2 ;;
esac

# A byte-identical main unit is not authoritative when an instance/template
# drop-in overrides ExecStart, Environment, or WorkingDirectory. Refuse all
# effective drop-ins rather than silently deleting operator configuration.
assert_no_managed_dropins() {
  local managed_unit dropins
  for managed_unit in rizzoma@blue.service rizzoma@green.service; do
    if systemctl cat "$managed_unit" >/dev/null 2>&1; then
      dropins="$(systemctl show "$managed_unit" --property=DropInPaths --value)"
      if [[ -n "$dropins" ]]; then
        printf 'Refusing managed install: %s has effective drop-ins: %s\n' "$managed_unit" "$dropins" >&2
        return 3
      fi
    fi
  done
}
assert_no_managed_dropins

if ! id rizzoma >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/rizzoma --shell /usr/sbin/nologin rizzoma
fi

install -d -m 0755 /etc/rizzoma /srv/rizzoma/releases /srv/rizzoma/lanes
install -d -o rizzoma -g rizzoma -m 0750 /var/lib/rizzoma /var/lib/rizzoma/uploads
install -o root -g root -m 0644 "$REMOTE_UNIT" /etc/systemd/system/rizzoma@.service
rm -f "$REMOTE_UNIT"

printf 'PORT=8101\n' > /etc/rizzoma/blue.env
printf 'PORT=8102\n' > /etc/rizzoma/green.env
chown root:root /etc/rizzoma/blue.env /etc/rizzoma/green.env
chmod 0600 /etc/rizzoma/blue.env /etc/rizzoma/green.env

docker update --restart unless-stopped rizzoma-redis rizzoma-couchdb >/dev/null

# Upload admission is fail-closed in production, so ClamAV is a managed
# dependency rather than an optional sidecar. Publish clamd only on loopback;
# its signature database persists across container replacement. An existing
# container is adopted only when its security-sensitive topology is exact.
docker volume create rizzoma-clamav-db >/dev/null
clamav_expected='{"3310/tcp":[{"HostIp":"127.0.0.1","HostPort":"3310"}]}|volume:rizzoma-clamav-db:/var/lib/clamav:true;|clamav/clamav:stable|healthcheck-present'
clamav_actual=''
if docker container inspect rizzoma-clamav >/dev/null 2>&1; then
  clamav_actual="$(docker inspect rizzoma-clamav --format '{{json .HostConfig.PortBindings}}|{{range .Mounts}}{{.Type}}:{{.Name}}:{{.Destination}}:{{.RW}};{{end}}|{{.Config.Image}}|{{if .Config.Healthcheck}}healthcheck-present{{else}}healthcheck-missing{{end}}')"
fi
if [[ "$clamav_actual" != "$clamav_expected" ]]; then
  if docker container inspect rizzoma-clamav >/dev/null 2>&1; then
    printf 'Replacing rizzoma-clamav because its image, loopback binding, or persistent mount drifted.\n'
    docker rm -f rizzoma-clamav >/dev/null
  fi
  docker run -d \
    --name rizzoma-clamav \
    --restart unless-stopped \
    --memory 4g \
    -p 127.0.0.1:3310:3310 \
    -v rizzoma-clamav-db:/var/lib/clamav \
    clamav/clamav:stable >/dev/null
else
  docker update --restart unless-stopped --memory 4g rizzoma-clamav >/dev/null
fi

# Docker currently publishes CouchDB and Redis on all interfaces. Keep local
# application access intact while deterministically blocking those ports on
# the public interface. The rule is idempotent and deliberately narrower than
# changing the shared Hetzner Robot firewall ruleset.
public_iface="$(ip route get 1.1.1.1 | awk '{for (i=1; i<=NF; i++) if ($i == "dev") {print $(i+1); exit}}')"
test -n "$public_iface"
dependency_rule=(-i "$public_iface" -p tcp -m multiport --dports 5984,6379 -j DROP)
rizzoma_internal_rule=(-i "$public_iface" -p tcp -m multiport --dports 3000:3001,3100,8000,8100:8102,8200:8202,8788 -j DROP)
clamav_rule=(-i "$public_iface" -p tcp --dport 3310 -j DROP)
if ! command -v netfilter-persistent >/dev/null 2>&1; then
  printf 'netfilter-persistent is required to preserve dependency exposure rules\n' >&2
  exit 1
fi
# Validate both families and Docker chains before mutating either one, avoiding
# a half-applied IPv4 ruleset when IPv6 Docker filtering is unavailable.
for firewall_cmd in iptables ip6tables; do
  command -v "$firewall_cmd" >/dev/null 2>&1
  "$firewall_cmd" -nL INPUT >/dev/null
  "$firewall_cmd" -nL DOCKER-USER >/dev/null
done
for firewall_cmd in iptables ip6tables; do
  if ! "$firewall_cmd" -C DOCKER-USER "${dependency_rule[@]}" 2>/dev/null; then
    "$firewall_cmd" -I DOCKER-USER 1 "${dependency_rule[@]}"
  fi
  if ! "$firewall_cmd" -C INPUT "${rizzoma_internal_rule[@]}" 2>/dev/null; then
    "$firewall_cmd" -I INPUT 1 "${rizzoma_internal_rule[@]}"
  fi
  # Docker DNAT can bypass INPUT. Keep the same public-interface app-port
  # closure in DOCKER-USER for legacy/current containers.
  if ! "$firewall_cmd" -C DOCKER-USER "${rizzoma_internal_rule[@]}" 2>/dev/null; then
    "$firewall_cmd" -I DOCKER-USER 1 "${rizzoma_internal_rule[@]}"
  fi
  if ! "$firewall_cmd" -C DOCKER-USER "${clamav_rule[@]}" 2>/dev/null; then
    "$firewall_cmd" -I DOCKER-USER 1 "${clamav_rule[@]}"
  fi
  # Remove the exact obsolete INPUT-chain rule from the first implementation;
  # Docker-published traffic is filtered in DOCKER-USER instead.
  while "$firewall_cmd" -C INPUT "${clamav_rule[@]}" 2>/dev/null; do
    "$firewall_cmd" -D INPUT "${clamav_rule[@]}"
  done
done
netfilter-persistent save >/dev/null

systemctl daemon-reload
assert_no_managed_dropins

if [[ ! -f /etc/rizzoma/production.env ]]; then
  printf '%s\n' \
    'Installed the service template, but /etc/rizzoma/production.env is absent.' \
    'Create it as root:root mode 0600 from deploy/systemd/production.env.example.'
else
  ensure_env_value() {
    local file="$1" assignment="$2" key tmp
    key="${assignment%%=*}"
    tmp="$(mktemp /etc/rizzoma/.production.env.XXXXXXXX)"
    awk -v key="$key" -v assignment="$assignment" '
      BEGIN { written = 0 }
      $0 ~ "^[[:space:]]*(export[[:space:]]+)?" key "=" {
        if (!written) print assignment
        written = 1
        next
      }
      { print }
      END { if (!written) print assignment }
    ' "$file" > "$tmp"
    install -o root -g root -m 0600 "$tmp" "$file"
    rm -f "$tmp"
  }
  for required_setting in \
    NODE_ENV=production \
    HOST=127.0.0.1 \
    UPLOADS_STORAGE=local \
    CLAMAV_HOST=127.0.0.1 \
    CLAMAV_PORT=3310; do
    ensure_env_value /etc/rizzoma/production.env "$required_setting"
  done
  printf 'Managed Rizzoma service prerequisites are installed.\n'
fi
REMOTE
trap - EXIT INT TERM
