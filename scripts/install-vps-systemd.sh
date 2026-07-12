#!/usr/bin/env bash
# One-time installation of the managed Rizzoma blue/green service template.
# This script intentionally does not create or copy production secrets.

set -euo pipefail

VPS="${RIZZOMA_VPS:-root@138.201.62.161}"
UNIT_SOURCE="deploy/systemd/rizzoma@.service"

test -f "$UNIT_SOURCE"

scp -q "$UNIT_SOURCE" "$VPS:/tmp/rizzoma@.service"
ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$VPS" bash -s <<'REMOTE'
set -euo pipefail

if ! id rizzoma >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/rizzoma --shell /usr/sbin/nologin rizzoma
fi

install -d -m 0755 /etc/rizzoma /srv/rizzoma/releases /srv/rizzoma/lanes
install -d -o rizzoma -g rizzoma -m 0750 /var/lib/rizzoma /var/lib/rizzoma/uploads
install -o root -g root -m 0644 /tmp/rizzoma@.service /etc/systemd/system/rizzoma@.service
rm -f /tmp/rizzoma@.service

printf 'PORT=8101\n' > /etc/rizzoma/blue.env
printf 'PORT=8102\n' > /etc/rizzoma/green.env
chmod 0600 /etc/rizzoma/blue.env /etc/rizzoma/green.env

docker update --restart unless-stopped rizzoma-redis rizzoma-couchdb >/dev/null

# Docker currently publishes CouchDB and Redis on all interfaces. Keep local
# application access intact while deterministically blocking those ports on
# the public interface. The rule is idempotent and deliberately narrower than
# changing the shared Hetzner Robot firewall ruleset.
public_iface="$(ip route get 1.1.1.1 | awk '{for (i=1; i<=NF; i++) if ($i == "dev") {print $(i+1); exit}}')"
test -n "$public_iface"
dependency_rule=(-i "$public_iface" -p tcp -m multiport --dports 5984,6379 -j DROP)
if ! iptables -C DOCKER-USER "${dependency_rule[@]}" 2>/dev/null; then
  iptables -I DOCKER-USER 1 "${dependency_rule[@]}"
fi
if command -v netfilter-persistent >/dev/null 2>&1; then
  netfilter-persistent save >/dev/null
else
  printf 'netfilter-persistent is required to preserve the database exposure rule\n' >&2
  exit 1
fi

systemctl daemon-reload

if [[ ! -f /etc/rizzoma/production.env ]]; then
  printf '%s\n' \
    'Installed the service template, but /etc/rizzoma/production.env is absent.' \
    'Create it as root:root mode 0600 from deploy/systemd/production.env.example.'
else
  chown root:root /etc/rizzoma/production.env
  chmod 0600 /etc/rizzoma/production.env
  printf 'Managed Rizzoma service prerequisites are installed.\n'
fi
REMOTE
