#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
BUNDLE_PATH="${RIZZOMA_BUNDLE_PATH:-$ROOT_DIR/rizzoma.bundle}"
GDRIVE_DIR="${RIZZOMA_GDRIVE_DIR:-G:\\My Drive\\Rizzoma-backup}"

echo "Creating bundle at ${BUNDLE_PATH}"
git -C "$ROOT_DIR" bundle create "$BUNDLE_PATH" --all

echo "Copying bundle to ${GDRIVE_DIR}"
powershell.exe -NoProfile -Command "New-Item -ItemType Directory -Force -Path '${GDRIVE_DIR}' | Out-Null; Copy-Item -LiteralPath '${BUNDLE_PATH}' -Destination '${GDRIVE_DIR}\\rizzoma.bundle' -Force"

echo "Backup complete."
