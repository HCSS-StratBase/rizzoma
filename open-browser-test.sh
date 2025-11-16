#!/bin/bash

echo "🚀 Opening Rizzoma for Manual Testing"
echo "=================================="
echo ""
echo "Opening browser at http://localhost:3000"
echo ""
echo "📋 Please follow the MANUAL_TEST_CHECKLIST.md for testing steps!"
echo ""
echo "Key features to test:"
echo "1. ✏️  Rich text editor toolbar (Bold, Italic, Headings, Lists)"
echo "2. 👤  @mentions (type @ in editor)"
echo "3. 💬  Inline comments (select text, click yellow button)"
echo "4. 🟢  Follow the Green navigation (bottom right button)"
echo "5. 👥  Real-time collaboration (open in two tabs)"
echo ""
echo "Opening browser now..."

# Try different browsers
if command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000
elif command -v open &> /dev/null; then
    open http://localhost:3000
elif command -v wslview &> /dev/null; then
    wslview http://localhost:3000
else
    echo "❌ Could not find a browser command"
    echo "Please manually open: http://localhost:3000"
fi

echo ""
echo "✅ Browser should be opening..."
echo "📖 Refer to MANUAL_TEST_CHECKLIST.md for detailed test steps"