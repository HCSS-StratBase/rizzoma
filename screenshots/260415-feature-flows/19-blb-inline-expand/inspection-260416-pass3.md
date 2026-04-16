# 19-blb-inline-expand — ❌ NOT DEMONSTRATED

**Category**: BLB
**Feature**: [+] click = inline expansion.

## Flow captured (pass 3)
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 3)

Pass 3 still fails: the seeded topic has no inline markers because inline markers are created by user interaction (Ctrl+Enter) during editing, not by API blip-creation. Pass 4 needs to create a blip with embedded inline-child HTML structure, OR run the Ctrl+Enter flow as a setup step before this test.
