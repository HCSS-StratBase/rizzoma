#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🛑 Stopping Rizzoma Development Environment"
echo "=========================================="

# Stop Node.js processes
echo -e "\n${YELLOW}🔧 Stopping application servers...${NC}"
# Kill all node processes related to this project
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "tsx watch" 2>/dev/null || true
pkill -f "concurrently" 2>/dev/null || true

echo -e "  - Application servers: ${GREEN}stopped${NC}"

# Stop Docker services
echo -e "\n${YELLOW}📦 Stopping Docker services...${NC}"
docker compose stop

# Optional: Remove containers (uncomment if you want to clean up completely)
# docker compose down

echo -e "\n${GREEN}✅ All services stopped!${NC}"
echo -e "\n💡 To restart, run: ${YELLOW}npm run start:all${NC}"