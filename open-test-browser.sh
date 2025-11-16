#!/bin/bash

echo "🚀 Opening Rizzoma in your default browser..."
echo ""
echo "📋 Feature Testing Checklist:"
echo ""
echo "1. 🎨 Rich Text Editor:"
echo "   - Create/edit a topic"
echo "   - Look for the formatting toolbar"
echo "   - Try Bold, Italic, Headers, Lists"
echo ""
echo "2. 👤 @Mentions:"
echo "   - Type @ in the editor"
echo "   - You should see a dropdown with users"
echo ""
echo "3. 💬 Inline Comments:"
echo "   - Select any text in the editor"
echo "   - Click the yellow comment button"
echo "   - Add and resolve comments"
echo ""
echo "4. 🟢 Follow the Green:"
echo "   - Make some edits"
echo "   - Look for green indicators"
echo "   - Find the 'Follow the Green' button (bottom right)"
echo ""
echo "5. 👥 Live Collaboration:"
echo "   - Open the same page in two tabs"
echo "   - Type in one tab"
echo "   - See colored cursors in the other"
echo ""
echo "Opening http://localhost:3000 now..."

# Try different commands to open browser
if command -v xdg-open > /dev/null; then
    xdg-open http://localhost:3000
elif command -v open > /dev/null; then
    open http://localhost:3000
elif command -v start > /dev/null; then
    start http://localhost:3000
elif command -v explorer.exe > /dev/null; then
    explorer.exe http://localhost:3000
else
    echo "Please manually open: http://localhost:3000"
fi

echo ""
echo "✅ Browser should be opening now!"
echo "🔍 Check the console in DevTools (F12) for feature flags"
echo "💡 Run: console.log(window.FEATURES) to verify all features are enabled"