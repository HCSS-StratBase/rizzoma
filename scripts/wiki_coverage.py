#!/usr/bin/env python3
"""Fail when the wiki does not mention (by file name) something it must cover.

Checked: every tracked file under src/ (code), scripts/, .claude/hooks/, docs/ (excluding docs/deprecated),
root *.md, every legacy reference image, and every screenshots/ folder. A file counts as covered when its
base name (or, for screenshot folders, the folder name) appears anywhere under wiki/.
Run `python3 scripts/wiki_generate_catalogs.py` to regenerate the mechanical catalogs, then this check.
Exit 1 on any gap.
"""
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FILES = subprocess.run(["git", "-C", str(REPO), "ls-files"], capture_output=True, text=True, encoding="utf-8").stdout.split("\n")
FILES = [f for f in FILES if f]
WIKI = "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in (REPO / "wiki").rglob("*.md"))
CODE_EXT = (".ts", ".tsx", ".js", ".mjs", ".cjs", ".css", ".html", ".py", ".sh", ".json")

must = []
for f in FILES:
    if f.startswith("src/") and f.endswith(CODE_EXT):
        must.append(("src", f))
    elif f.startswith(("scripts/", ".claude/hooks/")):
        must.append(("scripts", f))
    elif f.startswith("docs/") and not f.startswith("docs/deprecated/") and f.endswith(".md"):
        must.append(("docs", f))
    elif "/" not in f and f.endswith(".md"):
        must.append(("root-doc", f))
    elif f.startswith("screenshots/260714-legacy-reference-archive/") and f.lower().endswith(".png"):
        must.append(("legacy-image", f))
dirs = sorted({f.split("/")[1] for f in FILES if f.startswith("screenshots/") and f.count("/") >= 2})
must += [("screenshot-folder", "screenshots/" + d) for d in dirs]

gaps = {}
for kind, f in must:
    key = f.split("/")[-1] if kind != "screenshot-folder" else f.split("/")[1]
    if key not in WIKI:
        gaps.setdefault(kind, []).append(f)

total = len(must)
missing = sum(len(v) for v in gaps.values())
print(f"Wiki coverage: {total - missing}/{total} items mentioned by name; {missing} gaps")
for kind, items in gaps.items():
    print(f"  [{kind}] {len(items)} not in wiki, e.g. " + ", ".join(items[:5]))
sys.exit(1 if missing else 0)
