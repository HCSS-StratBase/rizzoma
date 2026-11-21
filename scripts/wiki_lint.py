#!/usr/bin/env python3
"""
 Thin wrapper in /mnt/c/Rizzoma/scripts/wiki_lint.py that invokes the canonical
 cross-project LLM Wiki + BFO + Secure-Agents auditor on /mnt/c/Rizzoma.
"""
import os
import subprocess
import sys
from pathlib import Path

_CANDIDATES = [
    Path("/mnt/g/My Drive/claude-hooks/tools/wiki_and_security_audit.py"),  # WSL
    Path("G:/My Drive/claude-hooks/tools/wiki_and_security_audit.py"),      # Windows
]
CANONICAL_TOOL = next((c for c in _CANDIDATES if c.exists()), _CANDIDATES[0])
REPO_ROOT = Path(__file__).resolve().parent.parent

# The wiki cites files of the original Rizzoma source under original-rizzoma-src/ (a git-ignored local reference that
# lives in the main checkout only). In any other checkout or worktree, link it for the duration of the run so the
# citations can be verified instead of reported as missing.
_ORIG = REPO_ROOT / "original-rizzoma-src"
_ORIG_HOMES = [Path("/mnt/c/Rizzoma/original-rizzoma-src"), Path("C:/Rizzoma/original-rizzoma-src")]


def _link_original():
    if _ORIG.exists():
        return False
    home = next((h for h in _ORIG_HOMES if h.exists()), None)
    if home is None:
        return False
    try:
        _ORIG.symlink_to(home, target_is_directory=True)
        return True
    except OSError:
        return False


if __name__ == "__main__":
    linked = _link_original()
    cmd = [sys.executable, str(CANONICAL_TOOL), "--repo", str(REPO_ROOT), *sys.argv[1:]]
    try:
        rc = subprocess.call(cmd)
    finally:
        if linked:
            _ORIG.unlink()
    cov = subprocess.call([sys.executable, str(REPO_ROOT / "scripts" / "wiki_coverage.py")])
    sys.exit(rc or cov)
