# BUG #43 — gear-menu "Delete blip" silently 404s

End-to-end Playwright capture of the bug and its fix, against the live VPS (`138.201.62.161:8200`).

## Pre-fix (VPS at commit `22e90c01`)

| File | What it shows |
|---|---|
| `prefix-01-hryhorii-bug-report-rizzoma-com.png` | Hryhorii's bug report thread on rizzoma.com (topic HCSS Team Ukraine, Apr 20 post). Shows the LLMs test topic + screenshots of the symptoms he was seeing. |
| `prefix-02-hryhorii-bug-report-rizzoma-com-bottom.png` | Bottom of the same rizzoma.com thread. |
| `prefix-03-vps-before-delete-attempt.png` | VPS at `138.201.62.161:8200`, LLMs topic open, `qwe` reply blip visible as standalone nested blip. |
| `prefix-04-vps-qwe-blip-active-with-gear.png` | `qwe` blip activated via click — blip toolbar (`Edit | Collapse | Expand | ↗ | ↗ | 🔗 | ⚙️`) visible. Gear dropdown opened via follow-up JS shows `Delete blip` item. Clicking it resulted in `DELETE /api/blips/... → 404 {"error":"not_found"}` in the browser console. |

## Post-fix (VPS at commit `c4844c73`)

Same VPS, after `git pull && docker compose up -d --build`. The previous `qwe` blip is gone (deleted via curl during session verification), so a fresh reply was created to retest the full UI flow.

| File | What it shows |
|---|---|
| `postfix-01-topic-loaded.png` | LLMs topic loaded, no reply blips (previous ones deleted). |
| `postfix-02-after-reply-attempt.png` | Typing "test-delete-260421" into the Write-a-reply box. |
| `postfix-03-reply-created.png` | Reply blip created, visible as `• test-delete-260421` row under the topic. |
| `postfix-04-blip-active-with-gear.png` | Blip activated (click) — gear visible in toolbar. |
| `postfix-05-gear-menu-open.png` | Gear dropdown open with all 7 items visible; `Delete blip` at bottom. |
| `postfix-06-blip-deleted-gone.png` | After clicking `Delete blip` + accepting the confirm dialog: **blip is gone from the DOM**. Browser console shows `DELETE /api/blips/...%3Ab1776812471202 → 200` (not 404). |

## Browser-console evidence

From `postfix-*` session, `.playwright-mcp/console-2026-04-21T22-59-36-545Z.log`:

```
[   93987ms] /api/blips POST 201 150ms              ← created blip
[   94279ms] /api/blips?waveId=... GET 200 84ms     ← refresh after create
[  169324ms] /api/blips/...%3Ab1776812471202 DELETE 200 180ms   ← THE 200
[  169606ms] /api/blips?waveId=... GET 200 82ms     ← refresh after delete
```

Pre-fix, the DELETE line was `404 73ms`. Post-fix, it's `200 180ms`.

## Root cause + fix

See `docs/BUG_DELETE_BLIP_SHADOW.md` for the full writeup. One-line summary: `linksRouter` at `/api` shadowed `DELETE /api/blips/:id` via its `DELETE /:from/:to` catch-all. Fix: remount linksRouter at `/api/links`, move `GET /:id/links` into blipsRouter. Commit `c4844c73`.
