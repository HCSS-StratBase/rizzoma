# Rizzoma Modernization Guide

This guide provides step-by-step instructions for modernizing the Rizzoma codebase from its legacy stack to a modern TypeScript-based architecture.

## Prerequisites

- Node.js 20.x or higher
- Docker and Docker Compose
- Git

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development environment with Docker:**
   ```bash
   docker compose up -d
   ```

3. **Copy legacy CouchDB views and deploy (optional, requires CouchDB):**
   ```bash
   npm run prep:views
   npm run deploy:views
   ```

4. **Run the migration script (dry run first):**
   ```bash
   npm run migrate:coffee -- --dry-run
   ```

## Progress Snapshot

As of now, the modern stack is running end‑to‑end in development:

- TypeScript server (Express 4.x) with session auth (Redis), CSRF, request IDs, CORS allowlist and standardized errors
- Vite + React client with Auth, Topics/Comments CRUD, pagination, search and toasts
- Vite + React client with Auth, Topics/Comments CRUD, pagination, search and toasts; realtime refresh via Socket.IO
- CouchDB integration via direct HTTP (Mango `_find` + legacy views as fallback); views deployable via `scripts/deploy-views.js`
- Docker Compose dev stack (app + CouchDB + Redis + RabbitMQ + Sphinx; optional MinIO)
- GitHub Actions CI: typecheck, lint and build (and Docker build)

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

After Phase‑1 stabilization:

1. Add monitoring/telemetry (OpenTelemetry) and structured logs export
2. Improve search by indexing and view optimizations
3. Tighten security (Cookie settings, CSP, helmet hardening)
4. Add realtime updates for collaborative UX
5. Consider service boundaries only after functionality parity is reached

## Resources

- [TypeScript Migration Guide](https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html)
- [Express Migration Guide](https://expressjs.com/en/guide/migrating-4.html)
- [Socket.io Documentation](https://socket.io/docs/v4/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
