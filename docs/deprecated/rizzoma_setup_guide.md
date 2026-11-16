# Rizzoma Setup Guide

This guide replaces the old Vagrant‑based workflow with a Docker‑based setup and modern TypeScript dev experience. The legacy CoffeeScript app remains under `rizzoma/` for reference.

## Recommended (Docker + Modern Dev)

1. Install Docker Desktop (enable WSL integration on Windows) and Git.
2. Start the stack:
   ```bash
   docker compose up -d
   ```
3. Seed CouchDB design docs:
   ```bash
   npm run prep:views
   npm run deploy:views
   ```
4. Develop:
   ```bash
   npm install
   npm run dev
   ```
   - Client: http://localhost:3000
   - API: http://localhost:8000

### Production build (optional)

```bash
docker build -t rizzoma:prod --target production .
docker run -d --name rizzoma-prod \
  -e COUCHDB_URL=http://admin:password@host.docker.internal:5984 \
  -e COUCHDB_DB=project_rizzoma \
  -p 8000:8000 rizzoma:prod
```

## Legacy (Vagrant/VM) — Not Recommended

The historical VM approach using Vagrant/VirtualBox and Node 0.10 is deprecated and fragile on modern systems (especially under WSL). If you must use it, consult the original instructions in the archived skeleton repository. Prefer Docker for consistency and portability.

## Troubleshooting
- Ports: free 3000, 8000, 5984, 6379, 5672
- Reset:
  ```bash
  docker compose down -v
  rm -rf node_modules dist
  npm install
  ```

## Auth & CSRF (API testing)
- Sessions are cookie‑based. When testing with tools like curl/Postman, first call `GET /api/auth/csrf` to receive a CSRF token cookie.
- Include header `x-csrf-token: <token>` on any mutating request (POST/PATCH/DELETE).
- Browser clients receive `XSRF-TOKEN` and set the header automatically via the client code.
