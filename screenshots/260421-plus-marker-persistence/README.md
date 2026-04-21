# [+] marker persistence across docker restart

Hryhorii's 2026-04-20 report (rizzoma.com HCSS Team Ukraine, blip cp3io): "level 1 had a plus sign, now it doesn't" after a docker container restart. Separate from BUG #40 (fixed) and BUG #43 (fixed).

## Test (2026-04-22, VPS `138.201.62.161:8200` at commit `c4844c73`)

1. Capture pre-restart DOM state — enumerate all `[data-blip-thread]` elements
2. `docker restart rizzoma-app` on the VPS
3. Wait for `/api/health` → 200
4. Reload Playwright page
5. Re-enumerate `[data-blip-thread]` elements
6. Compare

## Result: NOT REPRODUCED

Pre-restart: 3 markers on the "LLMs" topic root, attached to `level 2`, `level 1`, and `another blip after a restart`.

Post-restart: **same 3 markers, same threadIds, same parent text**.

| File | What it shows |
|---|---|
| `plus-01-before-restart-3-markers-visible.png` | VPS container running. Topic LLMs shows 3 `[+]` markers (green) next to the three bullets. DEPTH-1/2/3 reply chain visible below. |
| `plus-02-after-restart-3-markers-still-there.png` | After `docker restart rizzoma-app` + page reload. Same 3 markers still visible. DEPTH-1 blip now also has a `[+]` marker (from the reply I created earlier — also persisted). No markers lost. |

## What this does NOT rule out

This test tried the simplest case: existing persisted markers + container restart. Hryhorii's symptom may require a more specific trigger — for example:

- Creating a subblip via Ctrl+Enter **immediately before** the restart, before the parent's tiptap autosave (300ms debounce) has flushed the `<span data-blip-thread>` insertion to CouchDB
- A race between `seedingYdocRef.current` state and the autosave that overwrites the parent's content HTML from a stale server response
- Browser-cached stale blip content served with 304 (BUG #56 fixed `/api/topics` but not `/api/blips`)

If the symptom recurs, capture the specific operation sequence and open a new issue with repro steps. Current master/VPS behavior is: markers persist correctly across container restarts with reasonable autosave-settle time.

## Related: already-fixed bugs in this area

- **#40** — SOCKET_COOLDOWN skipping the reload after grandchild creation
- **#43** — linksRouter route shadow making DELETE /api/blips/:id 404
- **#56** — /api/topics cache-control for sidebar unread count updates
- **#57** — Y.js seed race between tabs joining the same blip
