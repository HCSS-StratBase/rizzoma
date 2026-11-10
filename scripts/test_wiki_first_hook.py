#!/usr/bin/env python3
"""Tests for scripts/wiki_first_hook.py: wiki-first and ORIGINAL-FIRST gates. Run: python3 scripts/test_wiki_first_hook.py"""
import json, subprocess, sys, tempfile, uuid
from pathlib import Path

HOOK = Path(__file__).resolve().parent / "wiki_first_hook.py"
REPO = HOOK.parent.parent
results = []

def run(mode, payload, cli="claude"):
    p = subprocess.run([sys.executable, str(HOOK), mode, "--cli", cli], input=json.dumps(payload), capture_output=True, text=True, timeout=20)
    return p.returncode, p.stdout + p.stderr

def check(name, cond):
    results.append(cond); print(("PASS " if cond else "FAIL ") + name)

def session():
    return "t-" + uuid.uuid4().hex

def pre(sid, tool, **ti):
    return run("pre", {"session_id": sid, "cwd": str(REPO), "tool_name": tool, "tool_input": ti})

app_file = str(REPO / "src/client/components/blip/RizzomaBlip.tsx")
index = str(REPO / "wiki/index.md")

s = session(); rc, out = pre(s, "Edit", file_path=app_file)
check("edit app code before reading the wiki index is denied (wiki-first)", rc == 2 and "WIKI-FIRST" in out)

s = session(); pre(s, "Read", file_path=index); rc, out = pre(s, "Edit", file_path=app_file)
check("edit app code after the index but without the original is denied (original-first)", rc == 2 and "ORIGINAL-FIRST" in out)

s = session(); pre(s, "Read", file_path=index); pre(s, "Read", file_path="/mnt/c/Rizzoma/original-rizzoma-src/src/client/blip/view.coffee")
rc, out = pre(s, "Edit", file_path=app_file)
check("edit app code after reading the original is allowed", rc == 0)

s = session(); pre(s, "Read", file_path=index); pre(s, "Grep", pattern="initInsertInlineBlip", path="C:\\Rizzoma\\original-rizzoma-src\\src\\client")
rc, out = pre(s, "Write", file_path=app_file)
check("a Grep of the original (Windows path) counts", rc == 0)

s = session(); pre(s, "Read", file_path=index); rc, out = pre(s, "Edit", file_path=str(REPO / "wiki/log.md"))
check("wiki edits are never blocked by original-first", rc == 0)

s = session(); pre(s, "Read", file_path=index); rc, out = pre(s, "Edit", file_path=str(REPO / "scripts/visual-feature-sweep.mjs"))
check("test/tool scripts are not app code (no original-first)", rc == 0)

s = session(); pre(s, "Read", file_path=index); rc, out = pre(s, "Read", file_path=app_file)
check("reading app code needs only the index", rc == 0)

s = session(); pre(s, "Read", file_path=index); pre(s, "Bash", command="sed -n 500,540p /mnt/c/Rizzoma/original-rizzoma-src/src/client/blip/view.coffee", cli="codex")
rc, out = run("pre", {"session_id": s, "cwd": str(REPO), "tool_name": "Edit", "tool_input": {"file_path": app_file}})
check("a shell read of the original counts", rc == 0)

rc, out = run("start", {"session_id": session(), "cwd": str(REPO)})
check("session start states the ORIGINAL-FIRST rule", rc == 0 and "ORIGINAL-FIRST RULE" in out and "inspiration, not a template" in out.lower())

print(f"{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
