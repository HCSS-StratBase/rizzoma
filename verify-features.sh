#!/bin/bash

echo "🔍 Verifying Rizzoma Features Status"
echo "==================================="
echo ""

# Check if server is running
echo "1. Checking server status..."
if curl -s http://localhost:3000/api/health | grep -q '"status":"ok"'; then
    echo "   ✅ Server is running on port 3000"
else
    echo "   ❌ Server is not responding"
    exit 1
fi

# Check environment variable
echo ""
echo "2. Checking feature flags..."
if [ "$FEAT_ALL" = "1" ]; then
    echo "   ✅ FEAT_ALL=1 is set"
else
    echo "   ⚠️  FEAT_ALL is not set. Run: export FEAT_ALL=1"
fi

# Check Docker services
echo ""
echo "3. Checking required services..."
services=("redis" "couchdb" "rabbitmq")
all_good=true

for service in "${services[@]}"; do
    if docker ps | grep -q "rizzoma-$service"; then
        echo "   ✅ $service is running"
    else
        echo "   ❌ $service is not running"
        all_good=false
    fi
done

echo ""
echo "4. Feature Testing URLs:"
echo "   📍 Main App: http://localhost:3000"
echo "   📍 Topics: http://localhost:3000#/topics"
echo "   📍 Waves: http://localhost:3000#/waves"
echo "   📍 Editor Search: http://localhost:3000#/editor/search"

echo ""
echo "5. Quick Feature Test Commands (run in browser console):"
echo "   - Check features: window.FEATURES"
echo "   - Check socket: window.socket && window.socket.connected"

echo ""
echo "===================================="
echo "📋 Ready for manual testing!"
echo "📖 See MANUAL_TEST_CHECKLIST.md for detailed test steps"
echo ""
echo "To open browser: ./open-browser-test.sh"