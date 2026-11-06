#!/usr/bin/env python3
"""
 Thin wrapper in /mnt/c/Rizzoma/scripts/wiki_lint.py that invokes the canonical
 cross-project LLM Wiki + BFO + Secure-Agents auditor on /mnt/c/Rizzoma.
"""
import os
import subprocess
import sys
from pathlib import Path

CANONICAL_TOOL = Path("/mnt/g/My Drive/claude-hooks/tools/wiki_and_security_audit.py")
REPO_ROOT = Path(__file__).resolve().parent.parent

if __name__ == "__main__":
    cmd = [sys.executable, str(CANONICAL_TOOL), "--repo", str(REPO_ROOT), *sys.argv[1:]]
    sys.exit(subprocess.call(cmd))
