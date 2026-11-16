#!/bin/sh
# Copy the tracked git hooks into this clone's .git/hooks (existing hooks there are kept).
ROOT=$(git rev-parse --show-toplevel) || exit 1
cp "$ROOT/scripts/git-hooks/pre-push" "$ROOT/.git/hooks/pre-push" && chmod +x "$ROOT/.git/hooks/pre-push" && echo "installed pre-push"
