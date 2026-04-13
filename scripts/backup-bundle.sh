#!/usr/bin/env bash
# Hard Gap #23 (2026-04-13): one-shot bundle + GDrive copy script.
#
# Replaces the older "create at project root + copy as rizzoma.bundle"
# pattern with the full manual flow that's been used in every commit batch
# this session:
#
#   1. Create the bundle in /tmp/ (Linux-native FS — avoids WSL2 EIO errors
#      on /mnt/c/ that bite the project-root path).
#   2. Verify the bundle's integrity with `git bundle verify` before copying.
#   3. Copy to the project root with the DATED filename
#      (rizzoma-YYMMDD-<label>.bundle) so future commits get a regular
#      pruneable history.
#   4. Copy to GDrive twice: once as the dated filename and once overwriting
#      the rizzoma.bundle pointer (the "latest" alias).
#   5. Print the final GDrive folder listing so you can see what's there.
#
# Usage:
#   bash scripts/backup-bundle.sh <label>
#
# Example:
#   bash scripts/backup-bundle.sh edit-determinism
#   → /tmp/rizzoma-260413-edit-determinism.bundle
#   → C:\Rizzoma\rizzoma-260413-edit-determinism.bundle
#   → G:\My Drive\Rizzoma-backup\rizzoma-260413-edit-determinism.bundle
#   → G:\My Drive\Rizzoma-backup\rizzoma.bundle (overwritten)
#
# Environment overrides:
#   RIZZOMA_GDRIVE_DIR  default: G:\My Drive\Rizzoma-backup
#                       override if your GDrive backup folder is elsewhere

set -euo pipefail

LABEL="${1:-}"
if [[ -z "$LABEL" ]]; then
  echo "Usage: bash scripts/backup-bundle.sh <label>" >&2
  echo "Example: bash scripts/backup-bundle.sh edit-determinism" >&2
  exit 2
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
DATE_STAMP="$(date +%y%m%d)"
BUNDLE_NAME="rizzoma-${DATE_STAMP}-${LABEL}.bundle"
TMP_BUNDLE="/tmp/${BUNDLE_NAME}"
PROJECT_BUNDLE="${ROOT_DIR}/${BUNDLE_NAME}"
GDRIVE_DIR="${RIZZOMA_GDRIVE_DIR:-G:\\My Drive\\Rizzoma-backup}"

echo "==> Creating bundle at ${TMP_BUNDLE}"
git -C "$ROOT_DIR" bundle create "$TMP_BUNDLE" --all

if [[ ! -f "$TMP_BUNDLE" ]]; then
  echo "ERROR: Bundle not created at ${TMP_BUNDLE}" >&2
  exit 1
fi

BUNDLE_SIZE=$(du -h "$TMP_BUNDLE" | cut -f1)
echo "    Bundle size: ${BUNDLE_SIZE}"

echo "==> Verifying bundle integrity"
if ! git -C "$ROOT_DIR" bundle verify "$TMP_BUNDLE" >/dev/null 2>&1; then
  echo "ERROR: Bundle verify failed for ${TMP_BUNDLE}" >&2
  exit 1
fi
HEAD_SHA=$(git -C "$ROOT_DIR" bundle list-heads "$TMP_BUNDLE" 2>/dev/null | grep -E '^[0-9a-f]+ HEAD$' | awk '{print $1}' | head -1)
echo "    HEAD: ${HEAD_SHA:-unknown}"

echo "==> Copying bundle to project root: ${PROJECT_BUNDLE}"
cp "$TMP_BUNDLE" "$PROJECT_BUNDLE"

# Resolve paths for the powershell.exe call. The dated filename comes from
# /mnt/c/Rizzoma/, so we can wslpath it. The GDrive dir is already a Windows
# path with a drive letter so we use it verbatim.
WIN_PROJECT_BUNDLE="$(wslpath -w "$PROJECT_BUNDLE")"
WIN_DATED_DEST="${GDRIVE_DIR}\\${BUNDLE_NAME}"
WIN_LATEST_DEST="${GDRIVE_DIR}\\rizzoma.bundle"

echo "==> Copying bundle to GDrive (dated + latest pointer)"
powershell.exe -NoProfile -Command "
  New-Item -ItemType Directory -Force -Path '${GDRIVE_DIR}' | Out-Null;
  Copy-Item -LiteralPath '${WIN_PROJECT_BUNDLE}' -Destination '${WIN_DATED_DEST}' -Force;
  Copy-Item -LiteralPath '${WIN_PROJECT_BUNDLE}' -Destination '${WIN_LATEST_DEST}' -Force
"

echo "==> Final GDrive listing"
powershell.exe -NoProfile -Command "Get-ChildItem '${GDRIVE_DIR}' | Sort-Object LastWriteTime -Descending | Select-Object -First 8 Name,Length,LastWriteTime | Format-Table"

echo
echo "Backup complete:"
echo "  /tmp staging:  ${TMP_BUNDLE}"
echo "  Project copy:  ${PROJECT_BUNDLE}"
echo "  GDrive dated:  ${GDRIVE_DIR}\\${BUNDLE_NAME}"
echo "  GDrive latest: ${GDRIVE_DIR}\\rizzoma.bundle"
