# Production database exposure closure

Measured and corrected on the Rizzoma VPS on 2026-07-12 at 12:03 CEST.

## Before

- Docker published CouchDB `5984` and Redis `6379` on all host interfaces.
- The Hetzner Robot firewall accepts range `5432-6543`, which includes both
  ports.
- External verification returned CouchDB HTTP `200` and unauthenticated Redis
  `PONG`.

## Change

Inserted and persisted equivalent IPv4 and IPv6 host rules ahead of Docker
forwarding:

```text
-A DOCKER-USER -i enp0s31f6 -p tcp -m multiport --dports 5984,6379 -j DROP
```

The rule is stored through `netfilter-persistent`; no Hetzner Robot firewall
POST was made and no other firewall rule changed.

## After

- External CouchDB probe: HTTP `000` / connection timeout.
- External Redis probe: connection closed.
- Host-local CouchDB `_up`: healthy.
- Container-local Redis `PING`: `PONG`.
- Public Rizzoma `/api/health`: HTTP `200`.

Boundary: Docker still declares all-interface port publications. The persistent
host rule closes external access now; loopback-only Docker publication remains
the cleaner configuration to adopt during a planned dependency recreation.

The subsequent [incident-response audit](../260712-1218-redis-incident-response/README.md)
confirmed active Redis manipulation, flushed all untrusted data, recreated the
container, and added dual-stack host-input drops for direct Rizzoma ports.
