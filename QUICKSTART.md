# 🚀 Rizzoma Quick Start Guide

This guide will help you get Rizzoma up and running quickly and reliably.

## Prerequisites

- Node.js 20.x (use `nvm install 20` if needed)
- Docker and Docker Compose
- Git

## 🎯 Start the Stack (current branch flow)

```bash
docker compose up -d couchdb redis
npm run dev
```

This brings up CouchDB/Redis, then runs the API + UI locally (Vite + TSX). Use real authentication via the AuthPanel; demo/query-string logins are not supported on this branch.

## 🧭 App Run Modes (Important)

There are two supported ways to run the app itself:

1. Local app process (recommended for day-to-day development)
```bash
docker compose up -d couchdb redis
FEAT_ALL=1 EDITOR_ENABLE=1 npm run dev
```
- App runs on the host (`:3000` + `:8000`)
- Fastest edit/debug loop

2. Containerized app process (`rizzoma-app`)
```bash
docker compose up -d app couchdb redis rabbitmq sphinx minio clamav
```
- App runs inside Docker container `rizzoma-app`
- Better container parity checks
- Use this when you explicitly want full compose/container mode

The app is always required. The only choice is whether it runs locally (`npm run dev`) or in the `app` container.

## 🌿 Branching Mode (Private Repo)

For this private/solo repo, working directly on `master` is acceptable.
- Keep small, frequent commits on `master`.
- Keep a rollback anchor branch (`master-archive-2026-02-24`) before major branch-pointer changes.
- Use temporary feature branches only for risky or long-running experiments.

You can also run the all-in-one script, which will start services, wait for health checks, and launch the app:
```bash
./scripts/start-all.sh
```
If the optional `sphinx` service is not present (or is slow to boot), the script now warns and continues after a short timeout.

## 📋 Available Commands

### Core Commands
- `docker compose up -d couchdb redis` - Start required services
- `docker compose down` - Stop services (add `-v` to wipe volumes)
- `npm run dev` - Start the app servers (assumes services running)

### Development
- `npm run dev` - Start only the app servers (assumes Docker services are running)
- `npm run test` - Run all tests
- `npm run typecheck` - Check TypeScript types
- `npm run lint` - Run linting

### Logs & Debugging
- `npm run logs` - View all Docker service logs
- `npm run logs:app` - View only app container logs
- `docker logs rizzoma-couchdb` - View specific service logs

## 🌐 Access Points

Once running, you can access:

| Service | URL | Credentials |
|---------|-----|-------------|
| **Main App** | http://localhost:3000 | Register/login in UI |
| **API** | http://localhost:8000/api | - |
| **CouchDB Admin** | http://localhost:5984/_utils/ | admin/password |
| **RabbitMQ Admin** | http://localhost:15672 | admin/password |

## 🔧 Configuration

### Enable Editor Features
Set before starting `npm run dev`:
```bash
export EDITOR_ENABLE=1
npm run dev
```

For parity checks and Playwright smokes, also set:
```bash
export FEAT_ALL=1
```

### Environment Variables
Create a `.env` file for custom settings:
```bash
EDITOR_ENABLE=1
SESSION_SECRET=your-secret-here
NODE_ENV=development
```

## 🚨 Troubleshooting

### Services won't start?
```bash
# Check Docker is running
docker info

# Check port conflicts
lsof -i :3000
lsof -i :8000
lsof -i :5984

# Clean restart
docker compose down
docker compose up -d couchdb redis
npm run dev
```

### Can't connect to database?
```bash
# Check CouchDB is healthy
curl http://localhost:5984/_up

# Recreate database
docker compose down -v  # Warning: removes data!
docker compose up -d couchdb redis
npm run dev
```

### Application errors?
```bash
# Check logs
npm run logs

# Check API health
curl http://localhost:8000/api/health

# Check dependencies
curl http://localhost:8000/api/deps
```

## 🛑 Stopping Everything

```bash
docker compose down
```

## 💡 Tips

1. **First Time Setup**: The first start might take longer as Docker pulls images
2. **Data Persistence**: Data is stored in Docker volumes and persists between restarts
3. **Clean Slate**: To completely reset: `docker compose down -v` (removes all data!)
4. **Performance**: For better performance, allocate more memory to Docker
5. **Windows Users**: Use WSL2 for best performance

## 📚 Next Steps

- Create your first topic at http://localhost:3000
- Explore the API at http://localhost:8000/api/topics
- Check out `docs/HANDOFF.md` and `docs/RESTART.md` for the active branch status and restart checklist
- Enable editor features for rich text editing

---

Having issues? Check the logs with `npm run logs` or `npm run status`
