#!/bin/bash
# Rizzoma Backup Automation Script
# Creates git bundle and optionally copies to Google Drive
#
# Usage:
#   ./scripts/backup.sh                    # Create bundle with timestamp
#   ./scripts/backup.sh --gdrive           # Also copy to GDrive (requires rclone)
#   ./scripts/backup.sh --name mybackup    # Custom bundle name
#
# Prerequisites for GDrive:
#   1. Install rclone: https://rclone.org/install/
#   2. Configure: rclone config (create remote named 'gdrive')
#   3. Test: rclone lsd gdrive:

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_DIR}/backups"
GDRIVE_REMOTE="gdrive"
GDRIVE_PATH="Rizzoma/backups"

# Parse arguments
COPY_TO_GDRIVE=false
CUSTOM_NAME=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --gdrive)
            COPY_TO_GDRIVE=true
            shift
            ;;
        --name)
            CUSTOM_NAME="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--gdrive] [--name <backup-name>]"
            echo ""
            echo "Options:"
            echo "  --gdrive    Copy bundle to Google Drive (requires rclone)"
            echo "  --name      Custom backup name (default: rizzoma-YYYYMMDD-HHMMSS)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Create backup directory if needed
mkdir -p "$BACKUP_DIR"

# Generate bundle name
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
if [[ -n "$CUSTOM_NAME" ]]; then
    BUNDLE_NAME="${CUSTOM_NAME}.bundle"
else
    BUNDLE_NAME="rizzoma-${TIMESTAMP}.bundle"
fi
BUNDLE_PATH="${BACKUP_DIR}/${BUNDLE_NAME}"

echo "=== Rizzoma Backup ==="
echo "Project: $PROJECT_DIR"
echo "Bundle:  $BUNDLE_PATH"
echo ""

# Check git status
cd "$PROJECT_DIR"
if [[ -n "$(git status --porcelain 2>/dev/null)" ]]; then
    echo "⚠️  Warning: Uncommitted changes exist"
    git status --short
    echo ""
fi

# Create git bundle with all branches and tags
echo "Creating git bundle..."
git bundle create "$BUNDLE_PATH" --all

# Get bundle size
BUNDLE_SIZE=$(du -h "$BUNDLE_PATH" | cut -f1)
echo "✓ Bundle created: $BUNDLE_NAME ($BUNDLE_SIZE)"

# Verify bundle
echo "Verifying bundle..."
if git bundle verify "$BUNDLE_PATH" > /dev/null 2>&1; then
    echo "✓ Bundle verified successfully"
else
    echo "✗ Bundle verification failed!"
    exit 1
fi

# List branches in bundle
echo ""
echo "Branches in bundle:"
git bundle list-heads "$BUNDLE_PATH" | head -10
BRANCH_COUNT=$(git bundle list-heads "$BUNDLE_PATH" | wc -l)
if [[ $BRANCH_COUNT -gt 10 ]]; then
    echo "... and $((BRANCH_COUNT - 10)) more"
fi

# Copy to Google Drive if requested
if [[ "$COPY_TO_GDRIVE" == "true" ]]; then
    echo ""
    echo "=== Google Drive Upload ==="

    if ! command -v rclone &> /dev/null; then
        echo "✗ rclone not installed. Install from: https://rclone.org/install/"
        echo "  Then configure: rclone config"
        exit 1
    fi

    if ! rclone listremotes | grep -q "^${GDRIVE_REMOTE}:$"; then
        echo "✗ rclone remote '${GDRIVE_REMOTE}' not configured."
        echo "  Run: rclone config"
        exit 1
    fi

    echo "Uploading to ${GDRIVE_REMOTE}:${GDRIVE_PATH}/${BUNDLE_NAME}..."
    rclone copy "$BUNDLE_PATH" "${GDRIVE_REMOTE}:${GDRIVE_PATH}/" --progress

    echo "✓ Uploaded to Google Drive"

    # List recent backups on GDrive
    echo ""
    echo "Recent backups on Google Drive:"
    rclone ls "${GDRIVE_REMOTE}:${GDRIVE_PATH}/" | tail -5
fi

# Cleanup old local backups (keep last 5)
echo ""
echo "=== Cleanup ==="
LOCAL_BACKUPS=$(ls -1t "$BACKUP_DIR"/*.bundle 2>/dev/null | tail -n +6)
if [[ -n "$LOCAL_BACKUPS" ]]; then
    echo "Removing old local backups (keeping last 5):"
    echo "$LOCAL_BACKUPS" | while read -r old_backup; do
        echo "  Removing: $(basename "$old_backup")"
        rm -f "$old_backup"
    done
else
    echo "No old backups to clean up"
fi

echo ""
echo "=== Backup Complete ==="
echo "Location: $BUNDLE_PATH"
echo "To restore: git clone $BUNDLE_PATH rizzoma-restored"
