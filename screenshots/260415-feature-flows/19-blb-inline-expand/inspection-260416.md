# 19-blb-inline-expand — ❌ NOT DEMONSTRATED

**Category**: BLB
**Feature**: [+] click = inline expansion.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`

## Inspection (2026-04-16, pass 1)

The driver queried `.inline-blip-marker, [data-inline-marker], .blip-inline-marker` — none of these exist on a fresh seed topic because the topic has no inline markers yet (inline markers are created by users via Ctrl+Enter during editing). Needs a seeded blip with a pre-existing inline child.
