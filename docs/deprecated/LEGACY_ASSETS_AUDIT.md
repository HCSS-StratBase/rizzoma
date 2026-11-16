# Legacy Assets Audit (Reference vs Active)

Branch: `master`
Last refreshed: **2026-04-13** (Hard Gap #28 — decision landed)

## Summary

The active `src/` tree no longer contains CoffeeScript or legacy static assets. Remaining legacy material is confined to two read-only reference folders that are **gitignored and not tracked in the repo** — they exist only on local disks that were cloned from the original Rizzoma source for BLB parity comparisons.

## Inventory

| Path | Size (WSL) | Tracked in git? | Purpose |
|---|---|---|---|
| `original-rizzoma/` | ~128 MB | No (gitignored) | Legacy runtime dependencies, vendored `node_modules`, and binary assets from the original Rizzoma checkout. Historical reference only. |
| `original-rizzoma-src/` | ~142 MB | No (gitignored) | CoffeeScript sources + legacy tests from the original Rizzoma checkout. Used during BLB parity work as the side-by-side reference for how legacy Rizzoma rendered topics/blips/inline comments. Not part of the active build. |
| `screenshots/rizzoma-live/feature/rizzoma-core-features/` | ~3 MB | Yes (tracked) | Legacy UI reference captures used for parity comparison. Required — leave in repo. |

Both `original-rizzoma/` and `original-rizzoma-src/` are listed in `.gitignore`:

```
# Other repositories
...
original-rizzoma/
original-rizzoma-src/
```

`git ls-files | grep '^original-rizzoma'` returns zero lines, confirming neither is tracked.

## Decision (2026-04-13)

**Keep both reference trees on disk as-is, gitignored, no archival.**

Rationale:
1. The 5 P0 hard gaps from `docs/RIZZOMA_HARD_GAP_LIST_260331.md` are **all closed** as of today (#9 #10 #11 #12 #13 — see the session sweep in `docs/worklog-260413.md` once the Tana pending file is flushed). The BLB + toolbar + inline-comment parity work that originally justified keeping the reference trees has landed. However, the remaining P1/P2/P3/P4 backlog still occasionally benefits from looking at the legacy source for edge cases (list-thread behavior, gadget node schemas, auth flows) so the reference is still useful.
2. Neither tree is in the git repo, so they don't inflate the repository size, slow down `git clone`, or affect CI. They're purely local scratch.
3. Archival to external storage would add retrieval friction without any benefit — the trees can be re-cloned from the original Rizzoma source at `https://github.com/rizzoma/rizzoma.git` if a local disk ever needs reclaiming.
4. The gitignore entries prevent any accidental re-tracking.

## If the local WSL disk fills up

Safe to delete either tree:

```bash
rm -rf /mnt/c/Rizzoma/original-rizzoma
rm -rf /mnt/c/Rizzoma/original-rizzoma-src
```

Neither deletion affects the active build, the tests, the verifiers, or the CI job. They only lose the local parity-reference material. To restore:

```bash
cd /mnt/c/Rizzoma
git clone https://github.com/rizzoma/rizzoma.git original-rizzoma-src
# (the original-rizzoma/ tree with vendored node_modules can be re-created
#  by running the legacy install; most of the time the src tree alone is
#  enough for parity reference.)
```

## Active rules

1. **Do not reintroduce CoffeeScript** into `src/`. Prefer TS/ESM.
2. **Do not re-track** `original-rizzoma*` under git. The gitignore entries are intentional.
3. Screenshot references under `screenshots/rizzoma-live/feature/rizzoma-core-features/` are tracked and required — leave alone.
4. Gadget source references (`rizzoma-gadgets` fork, etc) remain external — do not vendor into the repo.
