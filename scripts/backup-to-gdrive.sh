#!/usr/bin/env bash
set -euo pipefail

REPO_DIR=${1:-/mnt/c/Rizzoma}
GDRIVE_DIR=${2:-/mnt/g/My Drive/Rizzoma-backup}

echo "Creating git bundle from $REPO_DIR"
git -C "$REPO_DIR" bundle create "$REPO_DIR/rizzoma.bundle" --all

echo "Copying bundle to GDrive via PowerShell to handle spaces..."
powershell.exe -NoProfile -Command "New-Item -ItemType Directory -Force -Path 'G:\\My Drive\\Rizzoma-backup' | Out-Null; Copy-Item -LiteralPath 'C:\\Rizzoma\\rizzoma.bundle' -Destination 'G:\\My Drive\\Rizzoma-backup\\rizzoma.bundle' -Force"

echo "Done. Backup at G:\\My Drive\\Rizzoma-backup\\rizzoma.bundle"

