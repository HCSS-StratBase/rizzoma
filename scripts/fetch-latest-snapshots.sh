#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPO:-HCSS-StratBase/rizzoma}"
ARTIFACT="${1:-browser-smoke-snapshots}"
DEST="${2:-snapshots}"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required to download workflow artifacts." >&2
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
mkdir -p "${DEST}"
echo "Locating latest run with artifact '${ARTIFACT}' on branch '${branch}'..."

find_run_with_artifact() {
  local run_ids=("$@")
  for rid in "${run_ids[@]}"; do
    [ -z "${rid}" ] && continue
    local names
    names="$(gh run view "${rid}" --repo "${REPO}" --json artifacts --jq '.artifacts[].name' 2>/dev/null || true)"
    if echo "${names}" | grep -Fxq "${ARTIFACT}"; then
      echo "${rid}"
      return 0
    fi
  done
  return 1
}

mapfile -t branch_runs < <(gh run list --repo "${REPO}" --branch "${branch}" --status completed --limit 20 --json databaseId --jq '.[].databaseId' 2>/dev/null || true)
run_id="$(find_run_with_artifact "${branch_runs[@]}")" || true

if [ -z "${run_id}" ]; then
  echo "Branch-specific artifact not found; scanning latest completed runs across repo..." >&2
  mapfile -t repo_runs < <(gh run list --repo "${REPO}" --status completed --limit 40 --json databaseId --jq '.[].databaseId' 2>/dev/null || true)
  run_id="$(find_run_with_artifact "${repo_runs[@]}")" || true
fi

if [ -z "${run_id}" ]; then
  echo "No run with artifact '${ARTIFACT}' found." >&2
  exit 1
fi

echo "Downloading artifact from run ${run_id} into ${DEST}"
gh run download "${run_id}" --repo "${REPO}" --name "${ARTIFACT}" --dir "${DEST}"

echo "Snapshots/artifacts placed under ${DEST}"
