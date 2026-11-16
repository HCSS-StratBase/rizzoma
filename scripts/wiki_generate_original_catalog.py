#!/usr/bin/env python3
"""Generate wiki/reference/original-source-map.md: every .coffee and .js file of the vendored ORIGINAL
Rizzoma (original-rizzoma-src/src, git-ignored, so git ls-files cannot see it). Derived from the filesystem.

    python3 scripts/wiki_generate_original_catalog.py

If the directory is absent (fresh clone, it is not in git) the page is left untouched and the script says so.
"""
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wiki_generate_catalogs as g  # noqa: E402

ROOT = "original-rizzoma-src/src"
base = g.REPO / ROOT
if not base.is_dir():
    print("original-rizzoma-src/src not present; page not regenerated")
    sys.exit(0)

files = sorted(p.relative_to(g.REPO).as_posix() for p in base.rglob("*") if p.is_file() and p.suffix in (".coffee", ".js"))
by = defaultdict(list)
for f in files:
    parts = f[len(ROOT) + 1:].split("/")
    by["/".join(parts[:2]) if len(parts) > 2 else parts[0]].append(f)

out = g.frontmatter("original-source-map", "Original Rizzoma Source Map — every CoffeeScript and JS file (GENERATED)")
out += (
    "# Original Rizzoma Source Map\n\n**¶1** □ GENERATED from the file system, because `original-rizzoma-src/` is git-ignored and "
    "exists only in local checkouts. It is the 2013-era CoffeeScript original that the modern app ports; it is the ground "
    "truth for behaviour questions. Each file appears once with its length and first comment. The modern counterparts "
    "are in [source map](source-map.md); how the two compare is in "
    "[content array vs React hybrid](../architecture/content-array-vs-react-hybrid.md) and "
    "[native render port](../subsystems/native-render-port.md).\n\n"
)
out += g.diagrams(
    ['O["original-rizzoma-src/src"]', 'C["client/"]', 'S["server/"]', 'H["share/"]', "O --> C", "O --> S", "O --> H"],
    ['Q["behaviour question"] --> F["file here"]', 'F --> P["port page"]', 'P --> M["modern code"]'],
)
out += "## Folders\n\n| Folder | Files |\n|---|---:|\n" + "".join(f"| {k} | {len(v)} |\n" for k, v in sorted(by.items())) + "\n"
for k, v in sorted(by.items()):
    out += f"## {k} ({len(v)})\n\n| File | Lines | First comment |\n|---|---:|---|\n"
    for p in v:
        out += f"| {p[len(ROOT) + 1:]} | {g.read(p).count(chr(10)) + 1} | {g.cell(g.header_line(p), 160) or '—'} |\n"
    out += "\n"
g.write("original-source-map.md", out)
print("original files:", len(files))
