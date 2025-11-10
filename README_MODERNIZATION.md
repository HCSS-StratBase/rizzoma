# Rizzoma Modernization Guide

This guide provides step-by-step instructions for modernizing the Rizzoma codebase from its legacy stack to a modern TypeScript-based architecture.

## Prerequisites

- Node.js 20.x or higher
- Docker and Docker Compose
- Git

## Quick Start

1. **Use a compatible Node.js (20.19.0+)**
   - Recommended via `nvm`: `nvm install 20.19.0 && nvm use 20.19.0`
   - If you previously installed deps on an older Node, clear caches: `rm -rf node_modules package-lock.json node_modules/.vite`

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start development environment with Docker:**
   ```bash
   docker compose up -d
   ```

4. **Copy legacy CouchDB views and deploy (recommended for dev; required for legacy fallbacks):**
   ```bash
   npm run prep:views
  npm run deploy:views
  ```

Note:
- These design docs enable legacy CouchDB view fallbacks used by the modern API when there are no modern `topic` documents yet. Skipping this step means the topics list may be empty until you create new topics.
- Ensure CouchDB is running (via `docker compose up -d`) before deploying; otherwise the deploy step will fail.

5. **Run the migration script (dry run first):**
   ```bash
npm run migrate:coffee -- --dry-run
```

## Run Waves UI (dev)

Waves (nested blips) are available in read‑only mode with legacy fallbacks.

1. Ensure services are up: `docker compose up -d couchdb redis`
2. Deploy legacy views (only needs to be done once per DB):
   ```bash
   npm run prep:views && npm run deploy:views
   ```
3. Start dev servers (server first, then client after API is ready):
   ```bash
   npm run dev
   # This runs: tsx watch API on :8000, then vite on :3000 when API is ready
   ```
4. Open http://localhost:3000 and click “Waves”.

API checks (optional):
- List waves (with legacy view fallback): `curl 'http://localhost:8000/api/waves?limit=20'`
- Fetch one wave with nested blips: `curl 'http://localhost:8000/api/waves/<waveId>'`

## Fork Policy & PR Target

Work exclusively on the HCSS fork until the modernized app fully works. Do not open PRs to `rizzoma/rizzoma`.

- Origin remote must point to our fork:
  - Expected: `origin -> https://github.com/HCSS-StratBase/rizzoma`
  - Check: `git remote -v`
- Create PRs explicitly against our fork and base branch `master`:
  - `gh pr create -R HCSS-StratBase/rizzoma -B master -H <branch> -t "Title" -b "Body..."`
- Verify PR targets before submit:
  - `gh pr view <branch> --json url,baseRefName,headRefName`
- Avoid UI “compare” links that may default to upstream; prefer the CLI command above.

## PR Content Requirements (Descriptions)

Every PR must include an ample description covering:
- Summary: one-paragraph overview of the goal and scope.
- Changes: by area (server/client/tests/docs/infra) with key files noted.
- API/Data: new endpoints, params, response shapes, design docs or migrations.
- Risks/Rollback: what could go wrong, and how to revert safely.
- Testing: unit/integration/e2e coverage and manual steps, if any.
- Docs: which MDs were updated and what changed.
- Screenshots/GIF: UI-impacting changes (before/after, or short screencast).

Recommended command to prefill title/body via CLI:
```
gh pr create -R HCSS-StratBase/rizzoma -B master -H <branch> \
  -t "<clear title>" -b "<Summary>\n\n<Changes>\n\n<API/Data>\n\n<Risks/Rollback>\n\n<Testing>\n\n<Docs>\n\n<Screenshots>"
```

## Progress Snapshot

As of now, the modern stack is running end‑to‑end in development:

- TypeScript server (Express 4.x) with session auth (Redis), CSRF, request IDs, CORS allowlist and standardized errors
- Vite + React client with Auth, Topics/Comments CRUD, pagination, search and toasts
- Vite + React client with Auth, Topics/Comments CRUD, pagination, search and toasts; realtime refresh via Socket.IO
- CouchDB integration via direct HTTP (Mango `_find` + legacy views as fallback); views deployable via `scripts/deploy-views.js`
- Server-side paging & search via Mango for topics/comments with cursor (`nextBookmark`) (Phase 2)
- Read‑only Waves + nested Blips endpoints and initial client views (Phase 3 Milestone A)
- Docker Compose dev stack (app + CouchDB + Redis + RabbitMQ + Sphinx; optional MinIO)
- GitHub Actions CI: typecheck, lint and build (and Docker build)

### Topics vs. Waves (current state)

- Topics: legacy top‑level discussions used by the old UI. We expose list/search/paging using Mango with view fallbacks for compatibility.
- Waves: modernized representation focused on nested blips (threaded tree). Current Milestone A is read‑only (list/detail), with legacy fallbacks so you can browse existing data now.

Note: As we progress, Waves will become the primary UX; Topics remain for migration and compatibility until editor + migration are complete.

### Links & Reparenting (Milestone B+)

- See `docs/LINKS_REPARENT.md` for API and UI details.

### Editor (Milestone B, behind flag)

- See `docs/EDITOR.md` for enablement, snapshot flow, and roadmap.
Remaining Phase‑1 items before a production cut:

- Replace in‑memory filtering for topics search/pagination with CouchDB Mango/view queries
- Add tests: middleware (requestId/csrf/error), routes (auth/topics/comments), and basic client rendering
- Harden security defaults (secure cookies behind proxy, production CORS allowlist)
- Optional: realtime updates via socket.io
  - Implemented: server emits topic/comment events; client refreshes affected views

## Migration Steps

### 1. Environment Setup

First, ensure all services are running:

```bash
docker compose up -d
```

This starts:
- Redis (port 6379)
- CouchDB (port 5984, admin/password)
- RabbitMQ (port 5672, admin/password)
- SphinxSearch (port 9312)
- MinIO for S3 compatibility (port 9000)

### Configuration

Server environment variables:
- `PORT` (default `8000`)
- `COUCHDB_URL` (default `http://admin:password@localhost:5984`)
- `COUCHDB_DB` (default `project_rizzoma`)
- `REDIS_URL` (default `redis://localhost:6379`; compose provides `redis://redis:6379`)
- `SESSION_SECRET` (default dev value; set in production)
 - `ALLOWED_ORIGINS` (comma-separated allowlist for CORS; default `http://localhost:3000`)

### 2. Database Migration

Before starting the code migration, ensure your CouchDB views are set up:

```bash
// Copy existing CouchDB views
npm run prep:views

// Deploy views to CouchDB (requires CouchDB running)
COUCHDB_URL=http://admin:password@localhost:5984 \
COUCHDB_DB=project_rizzoma \
npm run deploy:views
```

### 3. CoffeeScript to TypeScript Migration

The migration script helps convert CoffeeScript files to TypeScript:

```bash
# Convert a single file
npm run migrate:coffee -- --file=rizzoma/src/server/app.coffee

# Convert all files (dry run)
npm run migrate:coffee -- --dry-run

# Convert all files
npm run migrate:coffee
```

### 4. Manual Migration Tasks

After automated conversion, you'll need to:

1. **Update imports/exports** to ES6 modules
2. **Add type annotations** (look for TODO comments)
3. **Update Express middleware** for v4 compatibility
4. **Replace deprecated libraries**

### 5. Testing

Run tests to ensure everything works:

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Type checking
npm run typecheck

# Linting
npm run lint
```

## Key Changes

### Express 2.x → 4.x Migration

```typescript
// Old (Express 2.x)
app.use(express.bodyParser());
app.use(express.cookieParser());

// New (Express 4.x)
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
```

### Authentication Updates

```typescript
// Old (Passport 0.1.x)
passport.use(new GoogleStrategy({...}));

// New (Passport 0.7.x with Google OAuth 2.0)
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
passport.use(new GoogleStrategy({...}));
```

### Real-time Communication

```typescript
// Old (SockJS)
const sockjs = require('sockjs');
const echo = sockjs.createServer();

// New (Socket.io)
import { Server } from 'socket.io';
const io = new Server(server, {
  cors: { origin: '*' }
});
```

### Database Access

```typescript
// Old (Cradle)
const cradle = require('cradle');
const db = new (cradle.Connection)().database('rizzoma');

// New (Direct HTTP + Mango / Views)
// We avoid a heavyweight client and call CouchDB’s HTTP API directly.
// See src/server/lib/couch.ts for helpers using fetch() with Basic auth when needed.
```

## Development Workflow

1. **Start development servers:**
   ```bash
   npm run dev
   ```
   This runs both Vite (frontend) and TSX (backend) in watch mode.

   Note: On Windows/WSL, ensure Docker Desktop WSL integration is enabled if you plan to use `docker compose`.

2. **Make changes** to TypeScript files
3. **Check types:** `npm run typecheck`
4. **Run tests:** `npm test`
5. **Format code:** `npm run format`

## Troubleshooting Dev

- Vite optimize deps errors (missing `node_modules/.vite/deps/chunk-*`):
  - Fix: `rm -rf node_modules/.vite && npm run dev` (we also set `optimizeDeps.force=true`).
- `Error: connect ECONNREFUSED 127.0.0.1:8000` from Vite proxy:
  - Means API isn’t up yet or crashed. Run `npm run dev` (our script waits for `http://localhost:8000` before starting Vite). Check server logs.
- Port already in use (`EADDRINUSE: :8000`):
  - Kill the old process: `fuser -k 8000/tcp` (WSL) or `kill -9 $(lsof -ti:8000)`.
- `connect-redis` ESM import error (default export not found):
  - We use `import { RedisStore } from 'connect-redis'` (v9+). Ensure you’re on Node ≥ 20.19.0 and reinstalled deps.
- Native `bcrypt` build issues (`node-pre-gyp: not found`):
  - We include `bcrypt` as optional and fall back to `bcryptjs`. Just run `npm install` on Node 20.19.0+; no manual build required.

## GDrive Backup (Repo Bundle)

We maintain a Git bundle on G:\\My Drive\\Rizzoma-backup for redundancy.

CLI (WSL/PowerShell hybrid):

```
# Create/refresh bundle from C:\\Rizzoma
git -C /mnt/c/Rizzoma bundle create /mnt/c/Rizzoma/rizzoma.bundle --all

# Copy to GDrive
powershell.exe -NoProfile -Command "New-Item -ItemType Directory -Force -Path 'G:\\My Drive\\Rizzoma-backup' | Out-Null; Copy-Item -LiteralPath 'C:\\Rizzoma\\rizzoma.bundle' -Destination 'G:\\My Drive\\Rizzoma-backup\\rizzoma.bundle' -Force"
```
### Production Build

Build and run the production image (serves API + built client):

```bash
docker build -t rizzoma:prod --target production .

# Point to your CouchDB (Docker Desktop example)
docker run -d --name rizzoma-prod \
  -e COUCHDB_URL=http://admin:password@host.docker.internal:5984 \
  -e COUCHDB_DB=project_rizzoma \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e SESSION_SECRET=change-me \
  -p 8000:8000 rizzoma:prod
```

### Compose production profile

Bring up a production-like stack with Docker Compose profiles:

```bash
docker compose --profile prod up -d app-prod couchdb redis
docker compose ps
```

The production image runs as a non-root `node` user and declares a HEALTHCHECK at `/api/health`. Configure `SESSION_SECRET`, `COUCHDB_URL`, `COUCHDB_DB`, `REDIS_URL`, and `ALLOWED_ORIGINS` for your environment.

## API Notes (Paging/Search)

- Topics: `GET /api/topics?limit=&offset=&q=&my=1&bookmark=` → `{ topics, hasMore, nextBookmark }`
- Comments: `GET /api/topics/:id/comments?limit=&offset=&bookmark=` → `{ comments, hasMore, nextBookmark }`
- Waves: `GET /api/waves?limit=&offset=&q=` → `{ waves, hasMore }`; `GET /api/waves/:id` → `{ id, title, createdAt, blips: [...] }`
- Waves list counts: `GET /api/waves/unread_counts?ids=w1,w2` → `{ counts: [{ waveId, total, unread, read }] }`

### Waves Unread/Next (Milestone A)

- `GET /api/waves/:id/unread` → `{ unread: string[], total: number, read: number }`
- `GET /api/waves/:id/next?after=<blipId>` → `{ next: string | null }`
- `GET /api/waves/:id/prev?before=<blipId>` → `{ prev: string | null }`
- `POST /api/waves/:waveId/blips/:blipId/read` → `{ ok: true, id, rev }`

Client navigation parameters:
- `#/wave/:id?goto=first|last` — auto-jumps to first/last unread and scrolls into view
- `#/wave/:id?focus=<blipId>` — highlights and scrolls to a specific blip

Notes:
- Read state stored as docs of type `read` (`userId`, `waveId`, `blipId`, `readAt`), indexed on `['type','userId','waveId']`.
- Client highlights unread and supports a “Next” button; keyboard `j`/`k` jumps next/previous unread.

### Dev-only Materialization (Milestone A)

During migration, a dev-only endpoint helps create minimal `wave` docs for legacy wave IDs:

```
POST /api/waves/materialize/:id
```

- Only available when `NODE_ENV !== 'production'`.
- Derives `createdAt` from earliest blip `createdAt`/`contentTimestamp`.
- Sets a placeholder `title` (`Wave <id-prefix>`). You can adjust titles later via the UI/API.

Bulk materialize the most recent legacy waves (dev-only):

```
POST /api/waves/materialize?limit=50
```

### Dev-only Sample Wave Seeder (Milestone A)

If your CouchDB lacks legacy blips, create a demo wave with nested blips:

```
POST /api/waves/seed_sample?depth=2&breadth=2
```

- Only available when `NODE_ENV !== 'production'`.
- Creates a wave `demo:<timestamp>` and a small blip tree for immediate UI testing.

### Waves Unread/Next (Milestone A)

- `GET /api/waves/:id/unread` → `{ unread: string[], total: number, read: number }`
- `GET /api/waves/:id/next?after=<blipId>` → `{ next: string | null }`
- `GET /api/waves/:id/prev?before=<blipId>` → `{ prev: string | null }`
- `POST /api/waves/:waveId/blips/:blipId/read` → `{ ok: true, id, rev }`

Notes:
- Read state stored as docs of type `read` (`userId`, `waveId`, `blipId`, `readAt`), indexed on `['type','userId','waveId']`.
- Client highlights unread and supports a “Next” button; keyboard `j`/`k` jumps next/previous unread.

### Dev-only Materialization (Milestone A)

During migration, a dev-only endpoint helps create minimal `wave` docs for legacy wave IDs:

```
POST /api/waves/materialize/:id
```

- Only available when `NODE_ENV !== 'production'`.
- Derives `createdAt` from earliest blip `createdAt`/`contentTimestamp`.
- Sets a placeholder `title` (`Wave <id-prefix>`). You can adjust titles later via the UI/API.

Bulk materialize the most recent legacy waves (dev-only):

```
POST /api/waves/materialize?limit=50
```

## Troubleshooting

### Common Issues

1. **Port conflicts:** Ensure ports 3000, 8000, 5984, 6379, 5672 are free
2. **Docker permissions:** Run `docker compose down -v` and restart
3. **TypeScript errors:** Check for missing type definitions
4. **Module resolution:** Ensure path aliases are configured correctly

### Useful Commands

```bash
# View logs
docker compose logs -f app

# Reset everything
docker compose down -v
rm -rf node_modules dist
npm install

# Check service health
docker compose ps
```

## Next Steps

After Milestone A (Waves read‑only):

Milestone B — Editor (CRDT)
- Feature-flagged editor scaffold (server + client). Enable with `EDITOR_ENABLE=1`.
- Server endpoints (dev):
  - `GET /api/editor/:waveId/snapshot` → `{ snapshotB64, nextSeq }`
  - `POST /api/editor/:waveId/snapshot { snapshotB64 }`
  - `POST /api/editor/:waveId/updates { seq, updateB64 }`
  - Stored as docs: `yjs_snapshot` and `yjs_update` (base64 payloads), Mango indexes added.
- Client: dynamic import of TipTap + Yjs if installed; otherwise shows read‑only placeholder.

Two‑Way Linking + Stable Reparenting
- Data: `link` docs with deterministic `_id` `link:<from>:<to>`; indexes by `fromBlipId` and `toBlipId`.
- APIs:
  - `POST /api/links { fromBlipId, toBlipId, waveId }`
  - `DELETE /api/links/:from/:to`
  - `GET /api/blips/:id/links` → `{ out, in }`
- Reparenting (planned): `PATCH /api/blips/:id/reparent { parentId }` updates only parentId; links stay intact.

Operational hardening (ongoing):
- Monitoring/telemetry (OpenTelemetry) and structured logs export
- Search improvements (indexes, views)
- Security tightening (cookies, CSP, helmet)
- Realtime collaboration UI polish

## Resources

- [TypeScript Migration Guide](https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html)
- [Express Migration Guide](https://expressjs.com/en/guide/migrating-4.html)
- [Socket.io Documentation](https://socket.io/docs/v4/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
