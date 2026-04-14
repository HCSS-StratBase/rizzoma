# Rizzoma — Local Development Setup (Windows / macOS / Linux)

Exhaustive per-platform guide for getting a full Rizzoma stack running on
your own machine. Follow the section that matches your OS, then jump to
[**Common steps (all platforms)**](#common-steps-all-platforms) for the
database seed + first run. If you want colleagues or your phone to reach
your running stack, see [**Remote access (Tailscale Funnel)**](#remote-access-tailscale-funnel)
at the end.

**Shortcuts:**
- [Windows 11 / WSL2](#windows-11--wsl2)
- [macOS 14+ (Apple Silicon or Intel)](#macos-14-apple-silicon-or-intel)
- [Linux (Ubuntu / Fedora / Arch)](#linux-ubuntu--fedora--arch)
- [Common steps (all platforms)](#common-steps-all-platforms)
- [First run](#first-run)
- [Day-to-day loop](#day-to-day-loop)
- [Troubleshooting](#troubleshooting)
- [Remote access (Tailscale Funnel)](#remote-access-tailscale-funnel)

---

## Prerequisites (all platforms)

| Requirement | Version | Why |
|---|---|---|
| Node.js | 20.x LTS | Vite 7, TipTap, Express 5, tsx |
| npm | 10.x (ships with Node 20) | package manager |
| Git | any recent | clone + commit |
| Docker + Docker Compose | latest | CouchDB, Redis, optional ClamAV/MinIO/RabbitMQ |
| Disk space | ~5 GB | `node_modules` + Docker images + CouchDB data |
| RAM | 8 GB recommended | Node + CouchDB + Chromium (Playwright) |

You **do not need** a Google/Microsoft/SAML OAuth app to develop — the
local email/password auth path works out of the box. OAuth only matters
if you want to test the Google-sign-in flow specifically.

---

## Windows 11 / WSL2

Rizzoma is developed on Windows 11 inside WSL2 (Ubuntu). This is the
primary supported environment and every core maintainer runs it.

### 1. Install WSL2 + Ubuntu

Open PowerShell **as Administrator** and run:

```powershell
wsl --install -d Ubuntu-22.04
```

Reboot when prompted. On first launch create a Linux user. Then inside
the Ubuntu shell:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential curl git
```

### 2. Install Node.js 20 (inside WSL2)

Use `nvm` so the Node version stays project-local:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# Close and reopen the shell, or source ~/.bashrc
nvm install 20
nvm use 20
node -v  # should print v20.x.y
```

### 3. Install Docker Desktop for Windows

Download from <https://www.docker.com/products/docker-desktop/>.
During install, **enable WSL 2 integration** for your Ubuntu distro in
Docker Desktop → Settings → Resources → WSL Integration. Verify:

```bash
docker --version
docker compose version
```

### 4. Clone the repo

```bash
# Prefer the Windows filesystem under /mnt/c/ so Windows IDEs + Git GUIs
# can see the files too. The project is developed on /mnt/c/Rizzoma.
cd /mnt/c
git clone <repo-url> Rizzoma
cd Rizzoma
```

### Windows-specific gotchas

- **File watcher load**: WSL2 on `/mnt/c/` has slower inotify than native
  Linux. Vite HMR sometimes misses `.tsx` changes — if you edit a file and
  nothing rebuilds, kill Vite and restart (`^C` then `npm run dev:client`).
  See `CLAUDE.md` → "WSL2 + Vite Gotchas" for the full list.
- **Line endings**: set `git config --global core.autocrlf false` before
  cloning so shell scripts keep LF endings.
- **Windows Firewall**: Docker Desktop creates the rules it needs; you
  should not have to touch the Defender firewall manually.

---

## macOS 14+ (Apple Silicon or Intel)

### 1. Install Homebrew

<https://brew.sh/>

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Install Node.js 20 + Git

```bash
brew install node@20 git
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc   # Apple Silicon
# or: echo 'export PATH="/usr/local/opt/node@20/bin:$PATH"' >> ~/.zshrc  # Intel
source ~/.zshrc
node -v  # should print v20.x.y
```

### 3. Install Docker Desktop for Mac

Download from <https://www.docker.com/products/docker-desktop/>. On
Apple Silicon make sure you pick the **Apple Silicon** build, not the
Intel one. After install:

```bash
docker --version
docker compose version
```

### 4. Clone the repo

```bash
cd ~/code    # or wherever you keep projects
git clone <repo-url> Rizzoma
cd Rizzoma
```

### macOS-specific gotchas

- **File descriptor limit**: Vite + TipTap can open hundreds of files.
  If you see `EMFILE: too many open files`, raise the limit:
  `ulimit -n 65536` in your shell profile.
- **Playwright on Apple Silicon**: the Chromium binary is native arm64 —
  no Rosetta shim needed. If `npm run test:toolbar-inline` reports a
  missing browser, run `npx playwright install chromium`.

---

## Linux (Ubuntu / Fedora / Arch)

### 1. Install Node.js 20

**Ubuntu / Debian** via NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git build-essential
```

**Fedora**:

```bash
sudo dnf install -y nodejs:20 git gcc-c++ make
```

**Arch**:

```bash
sudo pacman -S --needed nodejs-lts-iron npm git base-devel
```

Verify: `node -v` should print `v20.x.y`.

### 2. Install Docker + Docker Compose plugin

**Ubuntu**:

```bash
sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
# log out + back in for the group change to take effect
```

**Fedora**:

```bash
sudo dnf install -y docker docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

**Arch**:

```bash
sudo pacman -S docker docker-compose
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Verify: `docker run hello-world` should succeed without sudo.

### 3. Clone the repo

```bash
cd ~/code
git clone <repo-url> Rizzoma
cd Rizzoma
```

### Linux-specific gotchas

- **inotify watchers**: Vite needs many file watchers. If you see
  `ENOSPC: System limit for number of file watchers reached`:
  ```bash
  echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
  sudo sysctl -p
  ```
- **Rootless Docker**: if you're running rootless Docker, CouchDB's data
  volume needs a host-side directory you own. The default `docker-compose.yml`
  works unmodified with regular Docker; rootless may need volume path tweaks.

---

## Common steps (all platforms)

Once Node 20 + Docker + Git are installed and the repo is cloned, the rest
is identical on every OS.

### 1. Install JS dependencies

```bash
cd Rizzoma
npm install
```

First run takes ~2-3 minutes. Subsequent runs are fast.

### 2. Start the database stack

```bash
docker compose up -d couchdb redis
```

This brings up **CouchDB** (port 5984) and **Redis** (port 6379). Verify
with `docker ps` — you should see `rizzoma-couchdb` and `rizzoma-redis`
as `Up`. You can also open <http://localhost:5984/_utils/> in a browser
and log in with `admin` / `password` to inspect the database via Fauxton.

### 3. Seed the CouchDB indexes (first run only)

```bash
npm run prep:views
npm run deploy:views
```

This creates the Mango indexes for topics, blips, waves, unread tracking,
mentions, tasks, etc. The backend also calls `ensureAllIndexes()` on
startup so subsequent runs are idempotent.

### 4. Copy the example env file (optional)

```bash
cp .env.example .env   # if it exists; otherwise start without one
```

Common environment variables you might want to set in `.env`:

```bash
# Enable every feature flag. Required for parity tests.
FEAT_ALL=1
EDITOR_ENABLE=1

# Session store. Without REDIS_URL the server falls back to an
# in-memory store that resets every time the backend restarts.
REDIS_URL=redis://127.0.0.1:6379

# Optional: custom session secret. Default is "dev-secret" which is
# fine locally but MUST be changed for any internet-exposed deploy.
SESSION_SECRET=replace-me-locally

# Optional: OAuth providers. Only needed if you want to test
# third-party sign-in flows. Local email/password works without any
# of these.
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# MICROSOFT_CLIENT_ID=
# MICROSOFT_CLIENT_SECRET=
```

---

## First run

With Docker services up, start the app:

```bash
FEAT_ALL=1 EDITOR_ENABLE=1 npm run dev
```

This launches three things concurrently via `concurrently`:
- **Vite dev server** on `http://localhost:3000` (the UI you open in a browser)
- **Express backend** on `http://localhost:8788` (the `/api/*` routes — reachable via the Vite proxy)
- A feature-flag stub (prints a reminder and exits)

Open <http://localhost:3000/> in any modern browser. You should see the
Rizzoma auth panel. Click **Sign up**, register an email/password, and
the app mounts. Create your first topic and you're running.

**Verify the backend is healthy** from another terminal:

```bash
curl http://localhost:8788/api/health
```

Expected:

```json
{"status":"ok","uptime":5,"uptimeHuman":"5s","checks":{"couchdb":{"status":"ok","ms":3,"version":"3.5.0"}}}
```

---

## Day-to-day loop

- **Start stack**: `docker compose up -d couchdb redis && FEAT_ALL=1 EDITOR_ENABLE=1 npm run dev`
- **Stop stack**: `^C` in the npm terminal, then `docker compose down` (add `-v` to wipe CouchDB data)
- **Run tests**: `npm run test` (vitest), `npm run test:toolbar-inline` (Playwright), `npm run test:follow-green` (Playwright)
- **Typecheck**: `npm run typecheck`
- **Build production bundle**: `npm run build && npm run preview -- --host --port 3001`
- **Backup bundle**: `bash scripts/backup-bundle.sh <label>` (creates `rizzoma-<date>-<label>.bundle` on GDrive)
- **Hard reset**: `docker compose down -v && rm -rf node_modules && npm install && docker compose up -d couchdb redis`

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Vite: `Port 3000 is already in use` | Stale Vite from a previous run | `ps -ef \| grep vite`, `kill -9 <pid>`, `npm run dev` again |
| Backend: `ECONNREFUSED 127.0.0.1:5984` | CouchDB not running | `docker compose up -d couchdb redis` |
| Backend: `ECONNREFUSED 127.0.0.1:6379` | Redis not running | `docker compose up -d redis` OR unset `REDIS_URL` to fall back to in-memory |
| `tsc` errors after pull | `node_modules` out of sync | `rm -rf node_modules && npm install` |
| Auth page appears but login fails | Session store inconsistent | Stop app, `docker compose restart redis`, restart app |
| Playwright: `browser not found` | Chromium not installed | `npx playwright install chromium` |
| Vite HMR misses `.tsx` changes on WSL2 | inotify event lost on `/mnt/c/` | Kill Vite, restart (`npm run dev:client`). Persistent issue — documented in `CLAUDE.md`. |
| `EMFILE: too many open files` (macOS) | Low `ulimit` | `ulimit -n 65536` in your shell profile |
| `ENOSPC: System limit for number of file watchers reached` (Linux) | Kernel inotify limit | Raise `fs.inotify.max_user_watches` — see Linux section above |
| Blank screen on phone via Tailscale Funnel | WSL2 MTU fragmentation bug | See [Remote access](#remote-access-tailscale-funnel) below |

If none of the above match, tail the logs:

```bash
tail -f logs/rizzoma.log          # Winston file transport (backend)
docker compose logs -f couchdb    # CouchDB
docker compose logs -f redis      # Redis
```

And as a last resort, [open an issue](https://github.com/HCSS-StratBase/rizzoma/issues)
with the full error + the output of `npm run typecheck` + `docker ps`.

---

## Remote access (Tailscale Funnel)

For exposing your locally-running Rizzoma to your phone on LAN, to
yourself on cellular/holiday, or to trusted colleagues over the open
internet — all through one public HTTPS URL with automatic TLS — see
[**docs/HANDOFF.md → "Remote access (Tailscale Funnel)"**](./HANDOFF.md#remote-access-tailscale-funnel).

Quick version: install [Tailscale](https://tailscale.com/download) on
your machine, run:

```bash
tailscale funnel --bg --https=443 http://127.0.0.1:3000
```

and you'll get a stable `https://<host>.<tailnet>.ts.net/` URL. The
HANDOFF doc covers the **known MTU bug on Windows → WSL2** (tailscale
issues [#9228](https://github.com/tailscale/tailscale/issues/9228) and
[#17892](https://github.com/tailscale/tailscale/issues/17892)) and the
production-build fallback that makes the Funnel serve bulletproof.
