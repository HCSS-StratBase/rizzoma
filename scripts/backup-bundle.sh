#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
BUNDLE_PATH="${RIZZOMA_BUNDLE_PATH:-$ROOT_DIR/rizzoma.bundle}"
GDRIVE_DIR="${RIZZOMA_GDRIVE_DIR:-G:\\My Drive\\Rizzoma-backup}"

echo "Creating bundle at ${BUNDLE_PATH}"
git -C "$ROOT_DIR" bundle create "$BUNDLE_PATH" --all

if [[ ! -f "$BUNDLE_PATH" ]]; then
  echo "Bundle not found at ${BUNDLE_PATH}"
  exit 1
fi

if [[ "$BUNDLE_PATH" == *:* ]]; then
  WIN_BUNDLE_PATH="$BUNDLE_PATH"
else
  WIN_BUNDLE_PATH="$(wslpath -w "$BUNDLE_PATH")"
fi

if [[ "$GDRIVE_DIR" == *:* ]]; then
  WIN_GDRIVE_DIR="$GDRIVE_DIR"
else
  WIN_GDRIVE_DIR="$(wslpath -w "$GDRIVE_DIR")"
fi

echo "Copying bundle to ${GDRIVE_DIR}"
powershell.exe -NoProfile -Command "New-Item -ItemType Directory -Force -Path '${WIN_GDRIVE_DIR}' | Out-Null; Copy-Item -LiteralPath '${WIN_BUNDLE_PATH}' -Destination '${WIN_GDRIVE_DIR}\\rizzoma.bundle' -Force"

echo "Backup complete."
