# BUG #40 — sub-blip nesting at depth ≥ 2

End-to-end Playwright verification on the live VPS (commit `c4844c73`, 2026-04-22). Fix landed earlier in commit `222efc97`: `rizzoma:refresh-topics` handler now calls `load(true, false)` instead of `load(true, true)` to bypass the 10-second `SOCKET_COOLDOWN_MS` that was silently skipping grandchild-creation reloads.

## Test: create reply chain DEPTH-1 → DEPTH-2 → DEPTH-3

All three levels created in one continuous session, each within the SOCKET_COOLDOWN window of the previous one (originally the bug trigger).

| File | What it shows |
|---|---|
| `bug40-01-depth1-created.png` | "DEPTH-1 parent for nesting test" created via the topic-level Write-a-reply box. Reply blip `b1776812968505` rendered as nested-blip under the topic. |
| `bug40-02-depth2-grandchild-created.png` | "DEPTH-2 grandchild (inside DEPTH-1)" created via DEPTH-1's OWN Write-a-reply form. Pre-fix, this request would have made it into CouchDB but the topic-reload skipped, leaving the grandchild invisible in the UI. Here it renders immediately with blip id `b1776813105751`, wrapped in `child-blip-wrapper` under DEPTH-1. |
| `bug40-03-depth3-great-grandchild-created.png` | "DEPTH-3 great-grandchild" created via DEPTH-2's own reply form. Final DOM shows DEPTH-1 → DEPTH-2 → DEPTH-3 nested, each with its own toolbar + reply area. Blip id `b1776813231293`. |

## Browser-console evidence

Each reply created triggered the correct API sequence:

```
POST /api/blips 201 (create)
GET /api/blips?waveId=... 200 (refresh — CRITICAL — was skipped pre-fix)
```

Pre-fix this sequence would have had the GET silently skipped by `SOCKET_COOLDOWN_MS`, leaving the new blip invisible until a hard refresh.

## Root cause + fix

See `docs/BUG_SUBBLIP_NESTING.md` + commit `222efc97` ("fix: sub-blip nesting broken by 10s SOCKET_COOLDOWN_MS"). `RizzomaTopicDetail.tsx:1392` flipped `load(true, true)` to `load(true, false)` in the `rizzoma:refresh-topics` handler.

GitHub issue HCSS-StratBase/rizzoma#40 — closed.
