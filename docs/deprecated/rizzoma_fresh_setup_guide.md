# Rizzoma Fresh Setup Guide

Use this guide to bring up Rizzoma quickly on a fresh machine using Docker.

## Prerequisites
- Docker Desktop (enable WSL integration on Windows)
- Git
- Recommended: 4+ GB RAM and 10+ GB free disk space

## One‑time Setup
1. Clone the repo and change directory:
   ```bash
   git clone <this-repo-url>
   cd rizzoma
   ```
2. Start the full development stack:
   ```bash
   docker compose up -d
   ```
3. Seed CouchDB design docs (first run):
   ```bash
   npm run prep:views
   npm run deploy:views
   ```

## Access
- Client (Vite): http://localhost:3000
- API (Express): http://localhost:8000
- CouchDB Fauxton: http://localhost:5984/_utils/ (admin/password)
- RabbitMQ Management: http://localhost:15672 (admin/password)

## Production Run (optional)
Build and run the production image locally:

```bash
docker build -t rizzoma:prod --target production .
docker run -d --name rizzoma-prod \
  -e COUCHDB_URL=http://admin:password@host.docker.internal:5984 \
  -e COUCHDB_DB=project_rizzoma \
  -p 8000:8000 rizzoma:prod
```

## Editing Code
- Code is volume‑mounted into the app container; changes hot‑reload.
- Alternatively, run locally and keep infra in Docker:
  ```bash
  docker compose up -d couchdb redis rabbitmq sphinx
  npm install
  npm run dev
  ```

## Troubleshooting
- Ports busy: ensure 3000, 8000, 5984, 6379, 5672 are free.
- Reset stack:
  ```bash
  docker compose down -v
  rm -rf node_modules dist
  npm install
  ```

## Auth & CSRF (API testing)
- Sessions use cookies. Fetch a CSRF token via `GET /api/auth/csrf`.
- Send `x-csrf-token` on POST/PATCH/DELETE when invoking the API directly.
