# VPS Deployment — Rizzoma on 138.201.62.161

**Last updated**: 2026-04-17

## Server details

| Field | Value |
|---|---|
| **IP** | `138.201.62.161` |
| **Port** | `8200` (Rizzoma app) |
| **URL** | `http://138.201.62.161:8200/` |
| **SSH** | `root@138.201.62.161` (key auth) |
| **Operator** | Hryhorii (deployed 2026-04-17) |
| **Auth account** | `hp@rizzoma.com` / `stratbase2026` |
| **Repo** | `HCSS-StratBase/rizzoma` on GitHub |

## What's running

Hryhorii deployed our modernized Rizzoma codebase to the same VPS that hosts the war_datasets PostgreSQL. This is a **live instance** that team members (Hryhorii, Liliia) are actively using.

## How to update

SSH in and pull the latest code:

```bash
ssh root@138.201.62.161
cd /path/to/rizzoma  # TBD — ask Hryhorii for exact path
git pull origin master
npm install
npm run build
# Restart the server (pm2, systemd, or manual)
```

**NOTE**: The exact deployment path, process manager, and startup command need to be confirmed with Hryhorii. He set this up independently.

## Known issues on VPS

1. **BUG #40 (sub-blip nesting)**: Fixed in commit `222efc97`. The VPS needs `git pull` to pick up the fix. The bug was a 10s `SOCKET_COOLDOWN_MS` that silently skipped topic reloads after creating grandchild blips.

2. **Port 8200**: Non-standard port. Confirm whether a reverse proxy (nginx) sits in front.

3. **CouchDB**: Needs to be running on the VPS for the app to work. Check with `curl http://localhost:5984/`.

4. **Redis**: Session store. Check with `redis-cli ping`.

## Relationship to other environments

| Environment | URL | Purpose |
|---|---|---|
| **Localhost (dev)** | `http://localhost:3000` | Development + testing (Stephan's WSL) |
| **VPS** | `http://138.201.62.161:8200` | Shared team instance (Hryhorii, Liliia) |
| **Original Rizzoma** | `https://rizzoma.com` | Legacy platform (still running, read-only reference) |
| **Tailscale tunnel** | `tail4ee..ts.net` | Hryhorii's earlier tunnel (may be deprecated now that VPS is running) |

## Action items

- [ ] Confirm exact deployment path on VPS with Hryhorii
- [ ] Pull latest code including BUG #40 fix
- [ ] Verify nested blips work on the VPS after pull
- [ ] Set up a deploy script or CI/CD for the VPS
- [ ] Confirm CouchDB + Redis are running and accessible
