#!/usr/bin/env bash
# Stop hook — checks the post-work checklist documented in MEMORY.md.
# Non-blocking: emits additionalContext so the next turn sees what's missing.
set -uo pipefail
cd /mnt/c/Rizzoma 2>/dev/null || exit 0
# Drain stdin (we don't need the JSON, but the runtime expects us to consume it)
cat >/dev/null

failures=()

# Uncommitted changes (excluding untracked artifacts the user may not want in repo)
if [ -n "$(git status --porcelain --untracked-files=no 2>/dev/null)" ]; then
  failures+=("uncommitted tracked changes (\`git status\`)")
fi

# Unpushed commits on the current branch
ahead=$(git rev-list "@{u}..@" --count 2>/dev/null || echo 0)
if [ "$ahead" != "0" ] && [ -n "$ahead" ]; then
  failures+=("$ahead unpushed commits on \`$(git rev-parse --abbrev-ref HEAD 2>/dev/null)\`")
fi

# Today's worklog
today_utc=$(date -u +%y%m%d)
worklog="docs/worklog-${today_utc}.md"
if [ -n "$(git log --since=midnight --oneline 2>/dev/null)" ] && [ ! -f "$worklog" ]; then
  failures+=("no \`$worklog\` for today's commits")
fi

# Tana check — uses .claude/state/last-tana-post-commit as a marker, BUT only
# trusts it if updated AFTER the latest commit's timestamp. This catches the
# foot-gun where the marker is updated before the Tana entry covering the
# current commit is actually posted. (See Tana entry follow-up #2 2026-05-04
# for the meta-bug that triggered this guard.)
head_sha=$(git rev-parse HEAD 2>/dev/null)
last_tana=$(cat .claude/state/last-tana-post-commit 2>/dev/null || echo "")
marker_mtime=$(stat -c %Y .claude/state/last-tana-post-commit 2>/dev/null || echo 0)
head_time=$(git log -1 --format=%ct HEAD 2>/dev/null || echo 0)

if [ -n "$head_sha" ] && [ -n "$(git log --since=midnight --oneline 2>/dev/null)" ]; then
  if [ "$head_sha" != "$last_tana" ]; then
    failures+=("Tana entry not posted for HEAD ($head_sha — last posted: ${last_tana:-none})")
  elif [ "$marker_mtime" -lt "$head_time" ]; then
    failures+=("Tana marker matches HEAD but is OLDER than the commit (marker may have been updated before the actual Tana post — re-verify the Tana entry actually mentions $head_sha)")
  fi
fi

# Bundle check (label == "rizzoma-YYMMDD-*.bundle" on GDrive newer than HEAD commit)
gdrive_dir="/mnt/g/My Drive/Rizzoma-backup"
if [ -d "$gdrive_dir" ] && [ -n "$(git log --since=midnight --oneline 2>/dev/null)" ]; then
  newest_bundle=$(ls -t "$gdrive_dir"/rizzoma-*.bundle 2>/dev/null | head -1)
  if [ -n "$newest_bundle" ]; then
    bundle_mtime=$(stat -c %Y "$newest_bundle" 2>/dev/null || echo 0)
    if [ "$bundle_mtime" -lt "$head_time" ]; then
      failures+=("GDrive bundle is older than HEAD (run \`bash scripts/backup-bundle.sh\`)")
    fi
  fi
fi

if [ ${#failures[@]} -eq 0 ]; then
  echo '{"continue": true}'
  exit 0
fi

# Build additionalContext as a multi-line bullet list
ctx="POST-WORK CHECKLIST GAPS (per ~/.claude/projects/-mnt-c-Rizzoma/memory/MEMORY.md):"
for f in "${failures[@]}"; do
  ctx+=$'\n- '"$f"
done
ctx+=$'\n\nDo NOT say done until: (a) commit pushed, (b) bundle on GDrive newer than HEAD, (c) Tana entry actually mentions HEAD (post first, THEN update marker).'

# Use jq to safely emit JSON
jq -nc --arg ctx "$ctx" '{
  hookSpecificOutput: {
    hookEventName: "Stop",
    additionalContext: $ctx
  }
}'
