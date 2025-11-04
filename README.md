Rizzoma Collaboration Platform
==============================

Rizzoma is a real‑time collaboration platform inspired by Google Wave. It features tree‑structured discussions, gadget extensions and multimedia support for team communication and knowledge management. Watch a short [video](http://youtu.be/77RYX1uDy_Q) or visit [Rizzoma.com](https://rizzoma.com/).

This repository contains:
- Legacy CoffeeScript application under `rizzoma/` (Node 0.10 era)
- A modern TypeScript scaffold with Docker, Vite (frontend) and Express (backend)

Refer to README_MODERNIZATION.md for the migration plan and tips.

## Current Status

- Backend: Express 4.x TypeScript server with session auth (Redis store), CSRF protection, request IDs on every response, CORS allowlist, and standardized JSON errors.
  - Sessions are now applied globally across all API routes (auth, topics, comments).
  - Mutating requests (POST/PATCH/DELETE) require the `x-csrf-token` header; the UI obtains this automatically.
- Frontend: Vite + React client with Auth panel, Topics list (filters, search, pagination with hasMore), Topic detail (edit/delete), Comments (CRUD + pagination), toasts + inline errors, hash‑based state persistence, and realtime refresh via Socket.IO.
- Data: CouchDB via direct HTTP (Mango `_find` + legacy views fallback). Views can be deployed with scripts/deploy-views.js.
- Dev/Infra: Docker Compose stack (app + CouchDB + Redis + RabbitMQ + Sphinx; optional MinIO). Multi‑stage Dockerfile for dev/prod.
- CI: GitHub Actions workflow for typecheck/lint/build and image build present.
  - Jest unit/integration tests for middleware and routes are included; run `npm test`.

See “Deployment Readiness” for what remains to ship a production cut of the new stack.

## Quick Start (Docker)

Requirements: Docker Desktop (with WSL integration on Windows), Node 20+ (host only if you want to run tools locally).

1. Start services and app:
   - `docker compose up -d`
   - This brings up CouchDB, Redis, RabbitMQ, SphinxSearch and the dev app (Vite + TSX watchers).

2. Deploy CouchDB views (once):
   - `npm run prep:views`
   - `npm run deploy:views`

3. Open the app:
- Client (Vite): `http://localhost:3000`
- API (Express): `http://localhost:8000`
- Health check: `http://localhost:3000/api/health`
  - UI includes toasts (success/error) and inline error messages with requestId, pagination controls (topics/comments), and a “My topics” filter.

API endpoints:
- `GET /api/deps` – checks CouchDB.
- `GET /api/topics?limit=20` – lists recent topics (modern `topic` docs or legacy waves fallback).
  - Supports `limit` (1..100), `offset` (0..), and `my=1` to filter to current user's topics.
- `POST /api/topics` – create a topic `{ title: string, content?: string }`.
- `GET /api/topics/:id` – get topic by id.
- `PATCH /api/topics/:id` – update topic `{ title?, content? }` (requires session).
- `DELETE /api/topics/:id` – delete topic (requires session).
 - `GET /api/topics/:id/comments?limit=..&offset=..` – list comments.
 - `POST /api/topics/:id/comments` – create comment `{ content }` (requires session).
 - `PATCH /api/comments/:id` – update comment `{ content }` (requires session, owner).
 - `DELETE /api/comments/:id` – delete comment (requires session, owner).
 - `POST /api/auth/register` – register `{ email, password }` (session cookie).
 - `POST /api/auth/login` – login `{ email, password }` (session cookie).
 - `POST /api/auth/logout` – clear session.
- `GET /api/auth/me` – current user (requires session).

Security notes:
- Sessions are cookie‑based. For browser clients, mutating requests (POST/PATCH/DELETE) must include header `x-csrf-token`.
- Fetch a CSRF token via `GET /api/auth/csrf`. A non‑HttpOnly cookie `XSRF-TOKEN` is also set for convenience.
 - In production, cookies are marked `secure`; configure reverse proxy and set `ALLOWED_ORIGINS` to a strict allowlist (wildcard is ignored in production).

Service consoles:
- CouchDB Fauxton: `http://localhost:5984/_utils/` (admin/password)
- RabbitMQ Management: `http://localhost:15672` (admin/password)

## Configuration

Environment variables (server):
- `PORT` (default: `8000`)
- `COUCHDB_URL` (default: `http://admin:password@localhost:5984`)
- `COUCHDB_DB` (default: `project_rizzoma`)
- `REDIS_URL` (default: `redis://localhost:6379`; compose provides `redis://redis:6379`)
- `SESSION_SECRET` (default: `dev-secret-change-me`)
 - `ALLOWED_ORIGINS` (comma-separated; default: `http://localhost:3000`)

First‑run note: deploy CouchDB design docs via `npm run prep:views && npm run deploy:views` while CouchDB is running.

## Local Development (host)

If you prefer to run outside Docker while still using Docker for infra:

1. Install dependencies:
   - `rm -rf node_modules package-lock.json && npm install`

2. Start infra only:
   - `docker compose up -d couchdb redis rabbitmq sphinx`

3. Start dev servers (Vite + TSX):
   - `npm run dev`

## Production Build

Build production image and run the API + static client:

```bash
docker build -t rizzoma:prod --target production .
# If using Docker Desktop, point COUCHDB_URL to host.docker.internal
docker run -d --name rizzoma-prod \
  -e COUCHDB_URL=http://admin:password@host.docker.internal:5984 \
  -e COUCHDB_DB=project_rizzoma \
  -p 8000:8000 rizzoma:prod

curl -s http://localhost:8000/api/health
```

## Deployment Readiness

What works now:
- End‑to‑end dev flow (Docker) and local build for production image
- Auth + CSRF + basic rate‑limits; request IDs propagate to client for supportability
- Topics + Comments CRUD with pagination; basic search on title/content; realtime refresh
- Unit/integration tests pass for middleware and routes (`npm test`)

Gaps to close before production:
- Replace in‑memory filtering on the topics endpoint with CouchDB Mango queries and/or view queries for search + accurate pagination
- Add tests (middleware, auth, topics/comments routes, and basic client rendering)
- Tighten security defaults (secure cookies behind proxy, production CORS allowlist, CSRF verification across flows)
- Optional: realtime updates (socket.io) for topics/comments

Recommendation: merge the current branch as a Phase‑1 “minimum modern” baseline, then iterate on the above items in short PRs.

## Branch & PR

Active branch: `modernization/phase1`.

- Stage and commit docs/infra changes:
  - `git add README.md README_MODERNIZATION.md MODERNIZATION_STRATEGY.md rizzoma_*_setup_guide.md docker-compose.yml Dockerfile scripts/deploy-views.js`
  - `git commit -m "docs: update modernization status and setup guides; infra: compose tweaks"`
- Push branch and open PR:
  - `git push -u origin modernization/phase1`
  - Create a PR to `master` in GitHub UI

## Modern Project Layout

- `src/server/app.ts` – Express entry (ESM), `/api/health`
- `src/client/*` – Vite + React HTML entries (`index.html`, `mobile.html`, `settings.html`)
- `src/server/couch_views/*` – CouchDB design docs (copied from legacy)
- `scripts/deploy-views.js` – Deploy design docs using HTTP API
- `docker-compose.yml` – Dev orchestration (app + infra)
- Realtime: Socket.IO server emits topic/comment create/update/delete events; client auto‑refreshes lists/details.

## Legacy Code

The original CoffeeScript application lives in `rizzoma/` and targets Node 0.10.x with Express 2.x and Browserify. It is kept for reference during migration. For instructions specific to the legacy app, see `rizzoma/README.md`.

## Contributing

- See README_MODERNIZATION.md for migration steps and guidelines
- Run `npm run typecheck` and `npm run build` before raising PRs
- Keep changes small and focused

## License

```
Copyright 2011-2017 Tekliner, http://tekliner.com/
Copyright 2011-2017 Rizzoma Project, https://rizzoma.com/

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this project files except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
