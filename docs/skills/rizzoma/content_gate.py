#!/usr/bin/env python3
"""MANDATORY pre-post content gate for Rizzoma posts (added 2026-06-12 after SDS:
"if you missed the very rule you were describing, what will guarantee me you'll do it
properly next time?!" — the answer: nothing, unless it's mechanically checked).

Usage:  python3 content_gate.py draft.json [--append]
draft.json: {"bullets": [{"text": "...", "indent": 0}, ...]}
  --append = appending to an existing own blip (attribution not required again)

Deterministic checks (exit 1 + offending lines on any failure):
  G1 attribution   first bullet of a NEW post/reply must contain "[Claude <version>]"
  G2 semicolons    no "; " clause-chaining inside a bullet -> split into sub-bullets
  G3 bare URLs     no http(s):// in bullet text (links are applied as wrapped anchors)
  G4 length        no bullet over 55 words -> split or move detail behind a [+]
  G5 flatness      >5 bullets all at indent 0 -> add hierarchy (sub-bullets or [+] plan)
"""
import json, re, sys

def gate(draft, append=False):
    bullets = draft["bullets"]
    fails = []
    if not append:
        if not re.search(r"\[Claude [^\]]+\]", bullets[0]["text"]):
            fails.append(("G1 attribution", bullets[0]["text"][:70]))
    for b in bullets:
        t = b["text"]
        if "; " in t:
            fails.append(("G2 semicolon-chain -> sub-bullets", t[:70]))
        if re.search(r"https?://", t):
            fails.append(("G3 bare URL -> wrapped anchor", t[:70]))
        if len(t.split()) > 55:
            fails.append(("G4 over-long -> split / [+]", t[:70]))
    if len(bullets) > 5 and all(b.get("indent", 0) == 0 for b in bullets):
        fails.append(("G5 flat list -> add hierarchy", f"{len(bullets)} bullets, all indent 0"))
    return fails

if __name__ == "__main__":
    draft = json.load(open(sys.argv[1]))
    append = "--append" in sys.argv
    fails = gate(draft, append)
    if fails:
        print(f"CONTENT GATE: FAIL ({len(fails)})")
        for rule, line in fails:
            print(f"  [{rule}] {line}")
        sys.exit(1)
    print("CONTENT GATE: PASS")
