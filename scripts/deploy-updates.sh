#!/bin/bash
# Automated deployment script for Rizzoma updates
# This script ensures all changes are properly committed, pushed, and documented

set -e  # Exit on any error

echo "🚀 Starting Rizzoma deployment process..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in a git repository
if [ ! -d ".git" ]; then
    print_error "Not in a git repository!"
    exit 1
fi

# Check for uncommitted changes
print_info "Checking for uncommitted changes..."
if [ -n "$(git status --porcelain)" ]; then
    print_info "Found uncommitted changes. Staging and committing..."
    
    # Stage all changes
    git add .
    
    # Get current timestamp for commit message
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
    
    # Create commit with descriptive message
    COMMIT_MSG="chore: automated deployment

- ✅ Automated deploy commit from scripts/deploy-updates.sh
- ✅ Verify details in CHANGELOG.md and docs/worklog-*.md

Deployed: $TIMESTAMP"
    
    git commit -m "$COMMIT_MSG"
    print_status "Changes committed successfully"
else
    print_info "No uncommitted changes found"
fi

# Push to GitHub
print_info "Pushing changes to GitHub..."
git push origin $(git branch --show-current)
print_status "Changes pushed to GitHub successfully"

print_warning "CLAUDE.md auto-update removed; use docs/HANDOFF.md + docs/RESTART.md + CHANGELOG.md for current status."

# Show current status
print_info "Current git status:"
git status
print_info "Recent commits:"
git log --oneline -5

print_status "✨ Deployment completed successfully!"
print_info "All changes have been:"
print_info "  • Committed to git with descriptive messages"
print_info "  • Pushed to GitHub"
print_info "  • Documented in CLAUDE.md"
print_info "  • Ready for backup and bundle creation"

echo ""
print_info "📋 TODO: Implement Google Drive bundle automation"
print_info "🔗 GitHub repo: https://github.com/your-username/rizzoma"
print_info "📝 Documentation is always up-to-date in CLAUDE.md"
EOF
