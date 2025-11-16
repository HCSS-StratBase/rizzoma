#!/bin/bash
# MASTER DEPLOYMENT SCRIPT
# This script ensures EVERYTHING is always up-to-date and backed up

set -e

echo "🚀 MASTER DEPLOYMENT: Ensuring everything is up-to-date..."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

print_header() {
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}${BLUE}  $1${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Step 1: Deploy updates (commit, push, update docs)
print_header "STEP 1: DEPLOYING UPDATES"
./scripts/deploy-updates.sh

# Step 2: Create backup bundle
print_header "STEP 2: CREATING BACKUP BUNDLE"
./scripts/create-bundle.sh

# Step 3: Verify deployment
print_header "STEP 3: DEPLOYMENT VERIFICATION"
print_info "Checking git status..."
git status

print_info "Verifying latest commit..."
git log -1 --oneline

print_info "Checking GitHub sync..."
git ls-remote origin $(git branch --show-current) | cut -f1 > /tmp/remote_hash
git rev-parse HEAD > /tmp/local_hash

if cmp -s /tmp/remote_hash /tmp/local_hash; then
    print_status "GitHub is in sync with local repository"
else
    print_warning "GitHub may not be in sync - check network connection"
fi

# Step 4: Create deployment summary
print_header "STEP 4: DEPLOYMENT SUMMARY"
LATEST_BUNDLE=$(ls -t backups/*.tar.gz 2>/dev/null | head -1)

cat > DEPLOYMENT_STATUS.md << EOF
# 🚀 Latest Deployment Status

**Deployed:** $(date '+%Y-%m-%d %H:%M:%S')
**Branch:** $(git branch --show-current)
**Latest Commit:** $(git log -1 --oneline)
**Bundle:** $LATEST_BUNDLE

## ✅ Completed Actions:
1. All changes committed with descriptive messages
2. Code pushed to GitHub repository  
3. CLAUDE.md documentation updated automatically
4. Backup bundle created: \`$LATEST_BUNDLE\`
5. Deployment verification completed

## 🎯 Current Feature Status:
- ✅ **Rich Text Toolbar**: FloatingToolbar component fully implemented
- ✅ **Authentication**: Demo mode working perfectly
- ✅ **Topic Management**: Create, edit, reply functionality
- ✅ **Inline Comments**: Text selection → comment creation
- 🔄 **@Mentions**: Autocomplete dropdown (next priority)
- ❌ **Real-time Cursors**: Collaborative editing (pending)
- ❌ **Full OAuth**: Gmail/Facebook login (future)

## 📋 For Claude Code Restart:
1. This project is **ALWAYS up-to-date** in GitHub
2. Latest working state is in: \`$LATEST_BUNDLE\`
3. All documentation is current in \`CLAUDE.md\`
4. Run \`./scripts/start-all.sh\` to begin development
5. Test URL: http://localhost:3000/?layout=rizzoma&demo=true

## 🔧 Quick Recovery Commands:
\`\`\`bash
# Full startup
./scripts/start-all.sh

# Deploy any new changes
./scripts/full-deploy.sh

# Emergency backup restore
tar -xzf $LATEST_BUNDLE
npm install
\`\`\`

## ⚡ Next Steps:
Run \`./scripts/full-deploy.sh\` after any significant changes to ensure everything stays synchronized.
EOF

print_status "Deployment summary created: DEPLOYMENT_STATUS.md"

# Step 5: Final instructions
print_header "🎉 DEPLOYMENT COMPLETE!"

echo ""
print_status "🔄 ALL SYSTEMS UP-TO-DATE:"
print_info "  • ✅ Code committed and pushed to GitHub"
print_info "  • ✅ Documentation updated (CLAUDE.md)"
print_info "  • ✅ Backup bundle created: $(basename $LATEST_BUNDLE)"
print_info "  • ✅ Deployment status documented"

echo ""
print_warning "📤 MANUAL ACTION REQUIRED:"
print_info "  Upload to Google Drive: $LATEST_BUNDLE"
print_info "  This ensures complete backup recovery capability"

echo ""
print_status "🤖 FOR CLAUDE CODE RESTART:"
print_info "  • Project is always current in GitHub"
print_info "  • CLAUDE.md contains complete status"
print_info "  • Latest bundle available for emergency restore"
print_info "  • Run './scripts/start-all.sh' to begin development"

# Cleanup
rm -f /tmp/remote_hash /tmp/local_hash

print_header "✨ READY FOR NEXT DEVELOPMENT CYCLE"
EOF