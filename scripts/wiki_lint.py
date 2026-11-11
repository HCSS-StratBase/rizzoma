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

if __name__ == "__main__":
    cmd = [sys.executable, str(CANONICAL_TOOL), "--repo", str(REPO_ROOT), *sys.argv[1:]]
    rc = subprocess.call(cmd)
    cov = subprocess.call([sys.executable, str(REPO_ROOT / "scripts" / "wiki_coverage.py")])
    sys.exit(rc or cov)
