#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Starting Rizzoma Development Environment"
echo "=========================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Start Docker services
echo -e "\n${YELLOW}📦 Starting Docker services...${NC}"
docker compose up -d redis couchdb rabbitmq sphinx

# Wait for services to be healthy
echo -e "\n${YELLOW}⏳ Waiting for services to be ready...${NC}"

# Wait for Redis
echo -n "  - Redis: "
while ! docker exec rizzoma-redis redis-cli ping &>/dev/null; do
    echo -n "."
    sleep 1
done
echo -e " ${GREEN}✓${NC}"

# Wait for CouchDB
echo -n "  - CouchDB: "
while ! curl -s http://localhost:5984/_up &>/dev/null; do
    echo -n "."
    sleep 1
done
echo -e " ${GREEN}✓${NC}"

# Wait for RabbitMQ
echo -n "  - RabbitMQ: "
while ! docker exec rizzoma-rabbitmq rabbitmq-diagnostics ping &>/dev/null; do
    echo -n "."
    sleep 1
done
echo -e " ${GREEN}✓${NC}"

# Check if Sphinx is ready (it doesn't have a health endpoint, so we just check if container is running)
echo -n "  - Sphinx: "
while [ "$(docker inspect -f '{{.State.Running}}' rizzoma-sphinx 2>/dev/null)" != "true" ]; do
    echo -n "."
    sleep 1
done
echo -e " ${GREEN}✓${NC}"

# Start the application
echo -e "\n${YELLOW}🔧 Starting application servers...${NC}"
# Enable all Rizzoma features for development
export FEAT_ALL=1
npm run dev &

# Wait a bit for servers to start
sleep 3

# Check if app is running
echo -e "\n${YELLOW}🔍 Checking application status...${NC}"
if curl -s http://localhost:8000/api/health | grep -q "ok"; then
    echo -e "  - API Server: ${GREEN}✓${NC} (http://localhost:8000)"
else
    echo -e "  - API Server: ${RED}✗${NC} (not responding)"
fi

if curl -s http://localhost:3000 > /dev/null; then
    echo -e "  - Web UI: ${GREEN}✓${NC} (http://localhost:3000)"
else
    echo -e "  - Web UI: ${RED}✗${NC} (not responding)"
fi

echo -e "\n${GREEN}✅ Rizzoma is ready!${NC}"
echo -e "\n📍 Access points:"
echo "  - Main App: http://localhost:3000"
echo "  - API: http://localhost:8000/api"
echo "  - CouchDB: http://localhost:5984/_utils/ (admin/password)"
echo "  - RabbitMQ: http://localhost:15672 (admin/password)"
echo -e "\n💡 To enable editor features, set: export EDITOR_ENABLE=1"
echo -e "\n${YELLOW}Press Ctrl+C to stop all services${NC}"

# Keep script running and handle shutdown
wait