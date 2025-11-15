# 🚀 Rizzoma Quick Start Guide

This guide will help you get Rizzoma up and running quickly and reliably.

## Prerequisites

- Node.js 20.x (use `nvm install 20` if needed)
- Docker and Docker Compose
- Git

## 🎯 One-Command Start

```bash
npm run start:all
```

This single command will:
1. ✅ Start all Docker services (Redis, CouchDB, RabbitMQ, Sphinx)
2. ✅ Wait for services to be healthy
3. ✅ Start the application servers (API + UI)
4. ✅ Show you the status and access URLs

## 📋 Available Commands

### Core Commands
- `npm run start:all` - Start everything (recommended)
- `npm run stop:all` - Stop all services cleanly
- `npm run restart:all` - Restart everything
- `npm run status` - Check service status

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
```bash
export EDITOR_ENABLE=1
npm run restart:all
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
npm run stop:all
docker compose down
npm run start:all
```

### Can't connect to database?
```bash
# Check CouchDB is healthy
curl http://localhost:5984/_up

# Recreate database
docker compose down -v  # Warning: removes data!
npm run start:all
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
npm run stop:all
```

This will gracefully:
- Stop all Node.js processes
- Stop all Docker containers
- Preserve your data (volumes remain)

## 💡 Tips

1. **First Time Setup**: The first start might take longer as Docker pulls images
2. **Data Persistence**: Data is stored in Docker volumes and persists between restarts
3. **Clean Slate**: To completely reset: `docker compose down -v` (removes all data!)
4. **Performance**: For better performance, allocate more memory to Docker
5. **Windows Users**: Use WSL2 for best performance

## 📚 Next Steps

- Create your first topic at http://localhost:3000
- Explore the API at http://localhost:8000/api/topics
- Check out the [full documentation](./README.md)
- Enable editor features for rich text editing

---

Having issues? Check the logs with `npm run logs` or `npm run status`