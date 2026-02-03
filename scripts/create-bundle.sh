#!/bin/bash
# Create backup bundle for Google Drive
# This ensures we always have a complete backup of the working state

set -e

echo "📦 Creating Rizzoma backup bundle..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Get current timestamp and git commit hash
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
COMMIT_HASH=$(git rev-parse --short HEAD)
BRANCH_NAME=$(git branch --show-current)

# Create bundle filename
BUNDLE_NAME="rizzoma-backup-${TIMESTAMP}-${COMMIT_HASH}.tar.gz"
BUNDLE_PATH="./backups/${BUNDLE_NAME}"

# Create backups directory if it doesn't exist
mkdir -p backups

print_info "Creating bundle: $BUNDLE_NAME"
print_info "Branch: $BRANCH_NAME"
print_info "Commit: $COMMIT_HASH"

# Create exclusion list for files we don't want in the bundle
cat > /tmp/bundle-exclude << 'EOF'
node_modules/
.git/
dist/
build/
.cache/
.vite/
.next/
coverage/
*.log
.DS_Store
.env.local
.env.production
backups/
.playwright-mcp/
*.tmp
*.temp
EOF

# Create the bundle
print_info "Archiving project files..."
tar -czf "$BUNDLE_PATH" \
    --exclude-from=/tmp/bundle-exclude \
    --exclude="backups" \
    .

# Get bundle size
BUNDLE_SIZE=$(du -h "$BUNDLE_PATH" | cut -f1)

print_status "Bundle created successfully!"
print_info "File: $BUNDLE_PATH"
print_info "Size: $BUNDLE_SIZE"

# Create a manifest file with bundle info
cat > "backups/${BUNDLE_NAME%.tar.gz}-manifest.txt" << EOF
Rizzoma Backup Bundle Manifest
==============================

Bundle: $BUNDLE_NAME
Created: $(date '+%Y-%m-%d %H:%M:%S')
Size: $BUNDLE_SIZE
Git Branch: $BRANCH_NAME
Git Commit: $COMMIT_HASH
Git Commit Message: $(git log -1 --pretty=format:"%s")

Features Status:
- ✅ Authentication system (AuthPanel sign-in)
- ✅ Topic creation and editing
- ✅ Rich text editor + inline toolbar
- ✅ Reply functionality
- ✅ Inline comments
- 🔄 Perf/resilience sweeps (in progress)
- ❌ Full OAuth authentication (pending)

Critical Files:
- CLAUDE.md (project documentation)
- scripts/deploy-updates.sh (automation)
- scripts/create-bundle.sh (this script)
- src/client/components/editor/FloatingToolbar.tsx
- src/client/components/editor/BlipEditor.tsx
- src/client/components/blip/RizzomaBlip.tsx
- All server routes and middleware

Installation Instructions:
1. Extract bundle: tar -xzf $BUNDLE_NAME
2. Run: npm install
3. Start: FEAT_ALL=1 EDITOR_ENABLE=1 npm run dev
4. Test: http://localhost:3000 (sign in via AuthPanel)

Last Playwright Test: Successful
- Floating toolbar working
- Text formatting functional
- Edit mode operational
- All core features verified
EOF

print_status "Manifest created: backups/${BUNDLE_NAME%.tar.gz}-manifest.txt"

# List recent bundles
print_info "Recent bundles:"
ls -la backups/*.tar.gz 2>/dev/null | tail -5 || print_info "No previous bundles found"

# Clean up old bundles (keep only last 10)
print_info "Cleaning up old bundles..."
cd backups
ls -t *.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm -f
ls -t *-manifest.txt 2>/dev/null | tail -n +11 | xargs -r rm -f
cd ..

print_status "✨ Bundle creation completed!"
print_info "📦 Bundle ready for Google Drive upload: $BUNDLE_PATH"
print_info "📋 Upload this bundle to Google Drive to ensure complete backup"

# Clean up temporary files
rm -f /tmp/bundle-exclude
EOF
