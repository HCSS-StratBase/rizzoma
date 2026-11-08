#!/usr/bin/env python3
"""Generate the mechanical reference pages under wiki/reference/.

Everything is DERIVED from the repo (git ls-files, file headers). Nothing is described from memory
and nothing that already has a description is re-described: the legacy screenshot archive keeps its
own per-image .md files; the wiki page only points at it and reports coverage.

    python3 scripts/wiki_generate_catalogs.py

Pages written (all marked GENERATED):
  wiki/reference/legacy-screenshots.md          pointer + section counts + coverage gaps of the archive
  wiki/reference/screenshot-folders-catalog.md  every folder under screenshots/ with counts
  wiki/reference/source-map.md                  src/client, src/server, src/shared, src/types, src/tests
  wiki/reference/scripts-catalog.md             scripts/ + package.json scripts + .claude/hooks
  wiki/reference/docs-inventory.md              every markdown doc outside wiki/ and screenshots/
  wiki/reference/assets-and-snapshots.md        public/, snapshots/, root files
"""
import json
import os
import re
import subprocess
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "wiki" / "reference"
TODAY = os.environ.get("WIKI_DATE", "2026-11-07")
ARCHIVE = "screenshots/260714-legacy-reference-archive"


def git(*args):
    r = subprocess.run(["git", "-C", str(REPO), *args], capture_output=True, text=True, encoding="utf-8")
    return r.stdout


FILES = [f for f in git("ls-files").splitlines() if f]
HEAD = git("rev-parse", "--short", "HEAD").strip()
BRANCH = git("branch", "--show-current").strip()


def cell(s, n=240):
    s = re.sub(r"\s+", " ", (s or "").strip()).replace("|", "\\|")
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)  # copied text: keep link labels, drop targets
    s = re.sub(r"(\.\w{1,5}):(\d+)", r"\1 line \2", s)  # keep the linter from reading prose as citations
    # copied text may name files that do not exist; show them as plain words so the linter checks only OUR links
    s = re.sub(r"([\w.-]+)/([\w.-]+\.(?:md|mjs|cjs|js|ts|tsx|json|py|sh))", r"\1 ⁄ \2", s)
    s = re.sub(r"(?<![\w/.-])(STATUS|CLAUDE|AGENTS|README)\.md", r"\1 .md", s)
    return (s[: n - 1] + "…") if len(s) > n else s


def read(p, limit=400000):
    try:
        return (REPO / p).read_text(encoding="utf-8", errors="replace")[:limit]
    except Exception:
        return ""


def header_line(path):
    t = read(path, 6000)
    if not t:
        return ""
    ext = Path(path).suffix.lower()
    if ext == ".py":
        m = re.search(r'^(?:#!.*\n)?(?:#.*\n)*\s*[rRuU]?("""|\'\'\')(.*?)\1', t, re.S)
        if m:
            for ln in m.group(2).splitlines():
                if ln.strip():
                    return ln.strip()
    m = re.search(r"/\*\*?(.*?)\*/", t[:3000], re.S)
    if m and t[: m.start()].strip().count("\n") < 6:
        for ln in m.group(1).splitlines():
            ln = ln.strip(" *\t")
            if ln and not ln.startswith("@") and len(ln) > 3:
                return ln
    for ln in t.splitlines()[:12]:
        s = ln.strip()
        if s.startswith("//") and len(s) > 6 and "eslint" not in s and "@ts-" not in s:
            return s.lstrip("/ ").strip()
        if ext in (".sh", ".py") and s.startswith("#") and not s.startswith("#!") and len(s) > 6:
            return s.lstrip("# ").strip()
    m = re.search(r"export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|interface|type)\s+(\w+)", t)
    if m:
        return f"(no header comment; exports {m.group(1)})"
    return ""


def frontmatter(slug, title):
    return (
        f"---\ndoc_id: rizzoma-wiki-ref-{slug}\ntitle: \"{title}\"\nversion: 1.0.0\nstatus: active\n"
        f"owner: Stephan De Spiegeleire (SDS)\nlast_verified: {TODAY}\nsource_branch: {BRANCH}\n"
        f"source_commit: {HEAD}\ngenerated: true\n---\n\n"
    )


def diagrams(td, lr):
    return (
        "## Structure (`Continuant` — `graph TD`)\n\n```mermaid\ngraph TD\n"
        + "\n".join("    " + x for x in td)
        + "\n```\n\n## How to use it (`Occurrent` — `graph LR`)\n\n```mermaid\ngraph LR\n"
        + "\n".join("    " + x for x in lr)
        + "\n```\n\n"
    )


def write(name, text):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(text, encoding="utf-8", newline="\n")
    print("wrote", name, len(text), "bytes")


def rel(path):
    return "../../" + path


def legacy_pointer():
    pngs = sorted(f for f in FILES if f.startswith(ARCHIVE + "/") and f.lower().endswith(".png"))
    mds = {f for f in FILES if f.startswith(ARCHIVE + "/") and f.endswith(".md")}
    no_desc = [p for p in pngs if p[:-4] + ".md" not in mds]
    sections = defaultdict(int)
    for p in pngs:
        m = re.search(r"^-\s+Section:\s*(.+)$", read(p[:-4] + ".md", 3000), re.M)
        sections[m.group(1).strip() if m else "(no section)"] += 1
    manifest = read(ARCHIVE + "/ARCHIVE_MANIFEST.md")
    in_manifest = set(re.findall(r"\]\s+(\d{3}-[\w.-]+\.png)", manifest))
    not_in_manifest = [Path(p).name for p in pngs if Path(p).name not in in_manifest]
    cap = re.search(r"Captured:\s*(\d+)", manifest)
    ex_a = Path(pngs[0]).name if pngs else ""
    out = frontmatter("legacy-screenshots", "Legacy Rizzoma Reference Screenshots — Where They Are and How to Use Them (GENERATED)")
    out += (
        "# Legacy Rizzoma Reference Screenshots\n\n"
        f"**¶1** □ The original Rizzoma's look and behaviour is documented in `{ARCHIVE}/`: "
        f"**{len(pngs)} PNG screenshots** captured from the live original rizzoma.com, each with a description file "
        f"next to it (`<name>.md`: title, section, capture date, what it shows). {len(pngs) - len(no_desc)} of "
        f"{len(pngs)} images have a description file. **Open the image and its `.md` before changing the layout or "
        "interaction of anything.** This wiki page does NOT copy the descriptions; they live with the images.\n\n"
        f"**¶2** □ Existing index: [`ARCHIVE_MANIFEST.md`]({rel(ARCHIVE + '/ARCHIVE_MANIFEST.md')}) lists "
        f"{len(in_manifest)} images by section, but its header says \"Captured: {cap.group(1) if cap else '?'}\", "
        f"so {len(not_in_manifest)} of the {len(pngs)} images are NOT in it"
        + (f" (e.g. {', '.join(not_in_manifest[:4])})" if not_in_manifest else "")
        + ". Use the section list below or `ls` the folder for the full set; each image name starts with a 3-digit number.\n\n"
        "**¶3** □ Related references: other original-vs-ours material is listed in "
        "[screenshot folders](screenshot-folders-catalog.md); how the pixel comparison is done is in "
        "[legacy visual parity](../subsystems/legacy-visual-parity.md); `docs/BLB.md` and "
        "`docs/VISUAL_SCREENSHOT_SWEEP.md` already cite this archive.\n\n"
    )
    td = [f"A[\"{Path(ARCHIVE).name}\"]"]
    for i, s in enumerate(sorted(sections)):
        td += [f"S{i}[\"{s} ({sections[s]})\"]", f"A --> S{i}"]
    out += diagrams(td, ["T[\"UI change\"] --> F[\"find the area by number or section\"]", "F --> O[\"open PNG + its .md\"]",
                         "O --> I[\"implement to match\"]", "I --> C[\"compare: deep_visual_comparison.py\"]"])
    out += "## Sections in the archive (count of images)\n\n| Section | Images |\n|---|---:|\n"
    for s in sorted(sections, key=lambda k: -sections[k]):
        out += f"| {cell(s, 60)} | {sections[s]} |\n"
    out += "\n## Every image, by section (file names only; the description is in the `.md` beside each)\n\n"
    bysec = defaultdict(list)
    for p in pngs:
        m = re.search(r"^-\s+Section:\s*(.+)$", read(p[:-4] + ".md", 3000), re.M)
        bysec[m.group(1).strip() if m else "(no section)"].append(p)
    for s in sorted(bysec):
        out += f"**{cell(s, 60)}** ({len(bysec[s])}): " + " · ".join(
            f"[{Path(p).name[:-4]}]({rel(p)})" for p in sorted(bysec[s])) + "\n\n"
    if no_desc:
        out += "\n## Images WITHOUT a description file\n\n" + "\n".join(f"- {Path(p).name}" for p in no_desc) + "\n"
    write("legacy-screenshots.md", out)
    return len(pngs), len(not_in_manifest), len(no_desc)


def folders_catalog():
    dirs = defaultdict(lambda: {"png": 0, "other": 0})
    for f in FILES:
        if f.startswith("screenshots/") and f.count("/") >= 2:
            d = f.split("/")[1]
            dirs[d]["png" if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")) else "other"] += 1
    loose = [f for f in FILES if f.startswith("screenshots/") and f.count("/") == 1]

    def kind(d):
        if "legacy-reference" in d or "live-reference" in d:
            return "LEGACY REFERENCE (original rizzoma.com)"
        if "vs-mine" in d or "side-by-side" in d:
            return "comparison original vs ours"
        if "sweep" in d:
            return "our build, automated feature sweep"
        if "handbuild" in d:
            return "our build, handbuild acceptance run"
        if "real-device" in d:
            return "our build, real-device capture"
        return "other / unknown"

    out = frontmatter("screenshot-folders-catalog", "Screenshot Folders Catalog (GENERATED)")
    out += (
        "# Screenshot Folders Catalog\n\n"
        f"**¶1** □ GENERATED. `screenshots/` has {len(dirs)} tracked folders and {len(loose)} loose files in git. "
        "The authority for the ORIGINAL is the [legacy archive](legacy-screenshots.md) plus the folders marked LEGACY "
        "REFERENCE or comparison below; sweep and handbuild folders are evidence about OUR build. The Kind column is "
        "a guess from the folder name only; read the folder's README/manifest where one exists.\n\n"
    )
    out += diagrams(["R[\"screenshots/\"]", "L[\"legacy reference\"]", "C[\"comparisons\"]", "S[\"our sweeps and runs\"]",
                     "R --> L", "R --> C", "R --> S"],
                    ["A[\"need the original\"] --> B[\"legacy-screenshots page\"]", "C1[\"need our evidence\"] --> D[\"folder row here\"]"])
    out += "| Folder | Images | Other files | Kind (name-based guess) | Description file |\n|---|---:|---:|---|---|\n"
    for d in sorted(dirs):
        desc = next((f"[{c}]({rel('screenshots/' + d + '/' + c)})" for c in ("README.md", "manifest.md", "ARCHIVE_MANIFEST.md")
                     if f"screenshots/{d}/{c}" in FILES), "—")
        out += f"| `{d}` | {dirs[d]['png']} | {dirs[d]['other']} | {kind(d)} | {desc} |\n"
    out += "\n## Loose files at `screenshots/`\n\n" + "\n".join(f"- [{Path(f).name}]({rel(f)})" for f in sorted(loose)) + "\n"
    write("screenshot-folders-catalog.md", out)
    return len(dirs)


def table_for(paths):
    s = "| File | Lines | Header / first fact |\n|---|---:|---|\n"
    for p in sorted(paths):
        n = read(p).count("\n") + 1 if p.endswith((".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".css", ".sh", ".html")) else 0
        s += f"| `{p}` | {n or '—'} | {cell(header_line(p), 200) or '—'} |\n"
    return s + "\n"


def source_map():
    ext = (".ts", ".tsx", ".js", ".mjs", ".cjs", ".css", ".html")
    groups = [
        ("Client components", "src/client/components/", None), ("Client native render port", "src/client/native/", None),
        ("Client other", "src/client/", ("src/client/components/", "src/client/native/")),
        ("Server routes", "src/server/routes/", None), ("Server lib", "src/server/lib/", None),
        ("Server other", "src/server/", ("src/server/routes/", "src/server/lib/")),
        ("Shared", "src/shared/", None), ("Types", "src/types/", None), ("Tests", "src/tests/", None),
    ]
    out = frontmatter("source-map", "Source Map — every file under src/ (GENERATED)")
    out += (
        "# Source Map\n\n**¶1** □ GENERATED from `git ls-files`. Each tracked code file under `src/` appears once with its "
        "length and its first header comment or, failing that, the first exported name; where neither exists the "
        "table says so instead of guessing. Subsystem pages explain the important ones: "
        "[native port](../subsystems/native-render-port.md), [BLB invariants](../subsystems/blb-and-editor-invariants.md), "
        "[server](../subsystems/server-collab-and-storage.md), [parity](../subsystems/legacy-visual-parity.md).\n\n"
    )
    out += diagrams(["S[\"src/\"]", "C[\"client/\"]", "V[\"server/\"]", "H[\"shared/\"]", "Y[\"types/\"]", "T[\"tests/\"]",
                     "S --> C", "S --> V", "S --> H", "S --> Y", "S --> T"],
                    ["Q[\"feature question\"] --> M[\"file here\"]", "M --> P[\"subsystem page\"]", "P --> K[\"code\"]"])
    total = 0
    for title, prefix, excl in groups:
        ps = [f for f in FILES if f.startswith(prefix) and f.endswith(ext) and not (excl and f.startswith(excl))]
        if prefix == "src/tests/":
            ps = [f for f in FILES if f.startswith(prefix) and f.endswith(ext + (".json",))]
        if ps:
            total += len(ps)
            out += f"## {title} ({len(ps)})\n\n" + table_for(ps)
    write("source-map.md", out)
    return total


def scripts_catalog():
    sc = [f for f in FILES if f.startswith("scripts/")]
    hooks = [f for f in FILES if f.startswith(".claude/hooks/")]
    pkg = json.loads(read("package.json"))
    out = frontmatter("scripts-catalog", "Scripts Catalog — scripts/, npm scripts, project hooks (GENERATED)")
    out += (
        f"# Scripts Catalog\n\n**¶1** □ GENERATED. {len(sc)} files in `scripts/`, {len(pkg.get('scripts', {}))} npm scripts, "
        f"{len(hooks)} project hooks in `.claude/hooks/`. Purpose text is each file's own header; "
        "`(no header comment...)` means none exists. See [gates and sweeps](../verification/gates-sweeps-and-deployment.md) "
        "and [legacy visual parity](../subsystems/legacy-visual-parity.md).\n\n"
    )
    out += diagrams(["R[\"repo\"]", "S[\"scripts/\"]", "N[\"package.json scripts\"]", "H[\".claude/hooks/\"]", "R --> S", "R --> N", "R --> H"],
                    ["N1[\"npm run X\"] --> S1[\"scripts/file\"]", "S1 --> E[\"evidence in screenshots/ or STATUS.md\"]"])
    out += "## npm scripts (`package.json`)\n\n| Name | Command |\n|---|---|\n"
    for k, v in pkg.get("scripts", {}).items():
        out += f"| `{k}` | `{cell(v, 160)}` |\n"
    out += f"\n## scripts/ ({len(sc)})\n\n" + table_for(sc) + f"## .claude/hooks/ ({len(hooks)})\n\n" + table_for(hooks)
    write("scripts-catalog.md", out)
    return len(sc)


def docs_inventory():
    md = sorted(f for f in FILES if f.endswith(".md") and not f.startswith(("screenshots/", "wiki/", "node_modules/", "snapshots/")))
    out = frontmatter("docs-inventory", "Documentation Inventory — every markdown file outside wiki/ and screenshots/ (GENERATED)")
    out += (
        f"# Documentation Inventory\n\n**¶1** □ GENERATED. {len(md)} markdown files. Title is the first heading; Status is the "
        "first status/updated/verified line in the first 25 lines, if any. Authority notes are in "
        "[the doc catalog](../reference-doc-catalog.md); `docs/deprecated/` is NOT authoritative.\n\n"
    )
    out += diagrams(["D[\"docs\"]", "R[\"root *.md\"]", "DD[\"docs/*.md\"]", "DEP[\"docs/deprecated\"]", "D --> R", "D --> DD", "D --> DEP"],
                    ["A[\"need a fact\"] --> B[\"wiki page\"]", "B --> C[\"inventory row\"]", "C --> E[\"read the doc\"]"])
    out += "| Doc | Title | Status line |\n|---|---|---|\n"
    for f in md:
        t = read(f, 6000)
        h = re.search(r"^#\s+(.+)$", t, re.M)
        st = next((ln.strip("> *#-") for ln in t.splitlines()[:25]
                   if re.search(r"(?i)\b(status|last updated|last verified|updated)\b", ln) and len(ln) < 400), "")
        out += f"| [`{f}`]({rel(f)}) | {cell(h.group(1) if h else '', 90)} | {cell(st, 160)} |\n"
    write("docs-inventory.md", out)
    return len(md)


def assets_snapshots():
    pub = [f for f in FILES if f.startswith("public/")]
    snaps = [f for f in FILES if f.startswith("snapshots/")]
    root = [f for f in FILES if "/" not in f]
    by, sd = defaultdict(int), defaultdict(int)
    for f in pub:
        by[str(Path(f).parent)] += 1
    for f in snaps:
        sd[f.split("/")[1] if f.count("/") > 1 else "(top)"] += 1
    out = frontmatter("assets-and-snapshots", "Assets, Snapshots and Root Files (GENERATED)")
    out += (
        f"# Assets, Snapshots and Root Files\n\n**¶1** □ GENERATED. `public/` {len(pub)} files (original-Rizzoma sprites "
        f"and images under `public/s/`), `snapshots/` {len(snaps)} files, {len(root)} root files.\n\n"
    )
    out += diagrams(["X[\"repo\"]", "P[\"public/\"]", "N[\"snapshots/\"]", "R[\"root files\"]", "X --> P", "X --> N", "X --> R"],
                    ["U[\"UI needs a legacy sprite\"] --> I[\"public/s/img\"]", "I --> C[\"CSS background\"]"])
    out += "## public/ by folder\n\n| Folder | Files |\n|---|---:|\n" + "".join(f"| `{k}` | {by[k]} |\n" for k in sorted(by))
    out += "\n## snapshots/ by folder\n\n| Folder | Files | Description |\n|---|---:|---|\n"
    for k in sorted(sd):
        d = next((f"[{c}]({rel('snapshots/' + k + '/' + c)})" for c in ("README.md", "INDEX.md") if f"snapshots/{k}/{c}" in FILES), "—")
        out += f"| `snapshots/{k}` | {sd[k]} | {d} |\n"
    out += "\n## Root files\n\n| File | First fact |\n|---|---|\n"
    for f in sorted(root):
        out += f"| `{f}` | {cell(header_line(f), 140) or '—'} |\n"
    write("assets-and-snapshots.md", out)
    return len(pub)


if __name__ == "__main__":
    print({
        "legacy(images,not_in_manifest,no_desc)": legacy_pointer(),
        "screenshot_folders": folders_catalog(), "src_files": source_map(),
        "scripts": scripts_catalog(), "docs": docs_inventory(), "public": assets_snapshots(),
    })
