#!/usr/bin/env python3
"""Wiki-first gate for ONE repo, shared by every agent CLI that can run hooks.

    python3 scripts/wiki_first_hook.py <mode> [--cli claude|gemini|codex|agy]

Modes: start (SessionStart: inject the rule and the wiki index), pre (before a tool: deny code access until
wiki/index.md was read), stop (end of turn: block once if code was edited but no wiki page was).

One script, five dialects. Input is normalised: claude/grok/gemini/codex send session_id, cwd, tool_name,
tool_input; Antigravity (agy) sends conversationId, workspacePaths, toolCall.name, toolCall.args. Tool names are
mapped to three kinds (read, search, edit) so Claude, Grok, Gemini and agy names all work. Codex has no read
tool, so its shell command text and apply_patch text are inspected (heuristic).
Deny: exit 2 + stderr (claude, grok, gemini, codex); agy gets {"decision":"deny"} on stdout.
Fails open on any internal error. State: <tmp>/wiki_first/<session>.json.
Where it is wired: .claude/settings.json (Claude Code and Grok), .gemini/settings.json, .codex/hooks.json,
.agents/hooks.json. Project hooks need the CLI's folder trust.
"""
import json
import os
import re
import sys
import tempfile
from pathlib import Path

CODE_DIRS = ("src", "scripts", "server", "client", "lib", "app")
READ = {"Read", "read_file", "view_file", "read_many_files"}
SEARCH = {"Grep", "Glob", "LS", "grep", "grep_search", "glob", "list_dir", "list_directory", "find_by_name"}
EDIT = {"Edit", "Write", "MultiEdit", "NotebookEdit", "write_file", "replace", "search_replace", "write",
        "hashline_edit", "replace_file_content", "multi_replace_file_content", "write_to_file", "apply_patch"}
SHELL = {"Bash", "run_terminal_command", "run_shell_command", "run_command", "exec_command", "shell", "local_shell"}
PATH_KEYS = ("file_path", "path", "absolute_path", "notebook_path", "target_file", "TargetFile", "AbsolutePath",
             "SearchPath", "dir_path", "directory", "target_notebook", "filePath")
STATE_DIR = Path(tempfile.gettempdir()) / "wiki_first"


def norm(p):
    p = p or ""
    if os.name == "nt":
        m = re.match(r"^/mnt/([a-zA-Z])/(.*)$", p)
        if m:
            p = f"{m.group(1).upper()}:/{m.group(2)}"
    else:
        m = re.match(r"^([a-zA-Z]):[\\/](.*)$", p)
        if m:
            p = f"/mnt/{m.group(1).lower()}/" + m.group(2).replace("\\", "/")
    return Path(p)


def find_repo(p):
    try:
        p = p.resolve()
    except Exception:
        pass
    for d in [p, *p.parents]:
        if (d / "wiki" / "index.md").is_file() and (d / "wiki" / "SCHEMA.md").is_file():
            return d
    return None


def load(sid):
    try:
        return json.loads((STATE_DIR / f"{sid}.json").read_text(encoding="utf-8"))
    except Exception:
        return {"read_index": False, "src_edits": [], "wiki_edits": False, "stop_warned": False}


def save(sid, st):
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        (STATE_DIR / f"{sid}.json").write_text(json.dumps(st), encoding="utf-8")
    except Exception:
        pass


def rel_parts(repo, target):
    try:
        return target.resolve().relative_to(repo).parts
    except Exception:
        return ()


def is_code(repo, target):
    r = rel_parts(repo, target)
    return bool(r) and r[0] in CODE_DIRS


def is_wiki(repo, target):
    r = rel_parts(repo, target)
    return bool(r) and r[0] == "wiki"


def deny(cli, msg):
    if cli == "agy":
        print(json.dumps({"decision": "deny", "reason": msg}))
        return 0
    sys.stderr.write(msg + "\n")
    return 2


def patch_paths(text):
    return re.findall(r"^\*\*\* (?:Update|Add|Delete) File:\s*(.+)$", text or "", re.M)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    cli = sys.argv[sys.argv.index("--cli") + 1] if "--cli" in sys.argv else "claude"
    try:
        data = json.load(sys.stdin)
    except Exception:
        return 0
    sid = data.get("session_id") or data.get("sessionId") or data.get("conversationId") or "unknown"
    cwd_raw = data.get("cwd") or (data.get("workspacePaths") or [None])[0] or os.getcwd()
    cwd = norm(cwd_raw)

    if mode == "start":
        repo = find_repo(cwd)
        if not repo:
            return 0
        idx = (repo / "wiki" / "index.md").read_text(encoding="utf-8", errors="replace")
        msg = (
            f"WIKI-FIRST RULE for {repo}: this repo has a compounding LLM wiki. Before searching, reading or "
            f"editing code under {', '.join(CODE_DIRS)}/, read {repo / 'wiki' / 'index.md'} and then the wiki page "
            "for the area you touch. A hook blocks code access until the index was read. If you change code, update "
            "the matching wiki page and wiki/log.md in the same session. UI work: look at the original screenshots "
            "first (wiki/reference/legacy-screenshots.md). Index follows.\n\n" + idx[:6000]
        )
        if cli == "agy":
            print(json.dumps({"injectSteps": [{"systemMessage": {"systemMessage": msg}}]}))
        else:
            print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": msg}}))
        return 0

    if mode == "pre":
        call = data.get("toolCall") or {}
        tool = data.get("tool_name") or data.get("toolName") or call.get("name") or ""
        ti = data.get("tool_input") or data.get("toolInput") or call.get("args") or {}
        if not isinstance(ti, dict):
            ti = {}
        raw = next((ti[k] for k in PATH_KEYS if isinstance(ti.get(k), str) and ti.get(k)), "")
        cmd = ti.get("command") if isinstance(ti.get("command"), str) else ""
        repo = find_repo(norm(raw) if raw else cwd) or find_repo(cwd)
        if not repo:
            return 0
        st = load(sid)
        index_path = (repo / "wiki" / "index.md").resolve()
        kind = "read" if tool in READ else "search" if tool in SEARCH else "edit" if tool in EDIT else "shell" if tool in SHELL else ""
        if not kind:
            return 0

        if kind == "shell":  # no parser: only note that the index was read, and block obvious code reads (codex has no read tool)
            if re.search(r"wiki[\\/]+index\.md", cmd):
                st["read_index"] = True
                save(sid, st)
                return 0
            if not st["read_index"] and cli == "codex" and re.search(
                r"\b(rg|grep|cat|sed|head|tail|less|find|type|Get-Content|Select-String)\b[^|;&]*\b(" + "|".join(CODE_DIRS) + r")[\\/]", cmd
            ):
                return deny(cli, f"WIKI-FIRST GATE: read {index_path} (for example: sed -n 1,200p wiki/index.md) before reading this repo's code. Then retry.")
            return 0

        if kind == "edit" and tool == "apply_patch":
            paths = patch_paths(cmd) or ([raw] if raw else [])
        else:
            paths = [raw] if raw else []
        targets = [norm(p) if os.path.isabs(p) or re.match(r"^[A-Za-z]:", p) else repo / p for p in paths] or [cwd]

        if kind == "read" and paths:
            try:
                if targets[0].resolve() == index_path:
                    st["read_index"] = True
                    save(sid, st)
                    return 0
            except Exception:
                pass
        if all(is_wiki(repo, t) for t in targets):
            if kind == "edit":
                st["wiki_edits"] = True
                save(sid, st)
            return 0
        touches_code = any(is_code(repo, t) for t in targets) or (not paths and kind == "search") or (
            kind == "search" and any(t.resolve() == repo.resolve() for t in targets)
        )
        if not touches_code:
            return 0
        if not st["read_index"]:
            return deny(cli, f"WIKI-FIRST GATE: read {index_path} (and the page for this area) before using {tool} on this repo's code. Then retry.")
        if kind == "edit":
            st["src_edits"] = sorted(set(st["src_edits"]) | {str(t) for t in targets if is_code(repo, t)})[:200]
            save(sid, st)
        return 0

    if mode == "stop":
        if cli == "agy":
            return 0  # Stop output schema for agy is undocumented; not enforced there
        st = load(sid)
        if st["src_edits"] and not st["wiki_edits"] and not st["stop_warned"]:
            st["stop_warned"] = True
            save(sid, st)
            sys.stderr.write(
                f"WIKI FRESHNESS GATE: this session edited {len(st['src_edits'])} code file(s) (e.g. {st['src_edits'][0]}) "
                "but no wiki/ page. Update the matching wiki page, wiki/index.md if a page was added, and append to "
                "wiki/log.md; then run scripts/wiki_lint.py. If the change truly needs no wiki update, say so plainly.\n"
            )
            return 2
        return 0
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception:
        sys.exit(0)
