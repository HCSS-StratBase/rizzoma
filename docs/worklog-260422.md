# Worklog — 2026-04-22

Documentation refresh + comprehensive depth-feature audit.

## Morning: doc refresh after BUG #43 deploy (commit `55f7319d`)

Refreshed CLAUDE.md / CLAUDE_SESSION.md / HANDOFF.md / RESTART.md / docs/VPS_DEPLOYMENT.md / docs/worklog-260421.md after the BUG #43 deploy + verification on the live VPS the previous session. Closed Hryhorii's issues #42 and #43 on GitHub.

## Mid-day: Playwright end-to-end verification of all Hryhorii issues (commits `e65411d8`, `954f8968`)

Hryhorii had reported five distinct symptoms on the rizzoma.com cp3io thread (Apr 20). Each one verified via Playwright on the live VPS:

| Issue | Result | Screenshots |
|---|---|---|
| **BUG #43** (Delete blip 404) | ✅ FIXED + UI-verified | `screenshots/260421-bug43-delete-blip/` (10 screenshots: pre-fix bug + post-fix full lifecycle, console DELETE 404→200 diff) |
| **BUG #40** (sub-blip nesting) | ✅ FIXED + UI-verified | `screenshots/260421-bug40-subblip-nesting/` (DEPTH-1 → DEPTH-2 → DEPTH-3 chain creation) |
| **Issue #42** (sphinx Dockerfile missing) | ✅ FIXED via profiles | `docker compose config --services` confirms sphinx absent by default, present only with `--profile search` |
| **FEAT_ALL=1 on VPS** | ✅ ACTIVE | `docker exec rizzoma-app env` shows `FEAT_ALL=1` |
| **`[+]` disappears after restart** | NOT REPRODUCED | `screenshots/260421-plus-marker-persistence/` — 3 markers persisted across `docker restart rizzoma-app` + page reload, identical threadIds |

Full per-folder READMEs document the lifecycle, browser-console evidence, and what each test does NOT rule out.

## Afternoon: deep editing at DEPTH-3 (commit `b109cc98`)

Concern raised: creation alone doesn't prove editing works. Tested every path on a freshly-created DEPTH-3 great-grandchild blip:

| Feature at DEPTH-3 | Result |
|---|---|
| Edit mode entry via gear menu | ✅ DEPTH-3's own rich toolbar (Done / undo / redo / link / emoji / attach / image / B / I / U / S / color / clear / lists / gear) |
| Plain text typing | ✅ |
| Bold (Ctrl+B) → `<strong>` | ✅ |
| Italic (Ctrl+I) → `<em>` | ✅ |
| Emoji via DEPTH-3's picker | ✅ inserted 🤩 |
| Done saves to CouchDB | ✅ rev=20, full HTML preserved |
| gear → Delete blip at DEPTH-3 | ✅ `DELETE /api/blips/...%3Ab1776813231293 → 200`, blip gone from DOM |
| Cascading delete | ✅ DEPTH-1 delete cascaded to DEPTH-2 (both `deleted=True`, `deletedBy=hp` in CouchDB) |

Screenshots + README at `screenshots/260422-deep-editing-verification/`.

## Evening: every remaining feature at DEPTH-3 (commit `48d5608a`)

Closed the "still not covered" list from the prior session. Recreated D1→D2→D3 and exercised every remaining toolbar/keyboard path on D3:

| Feature at DEPTH-3 | Result |
|---|---|
| **@mention popup** | ✅ Picker shows John Doe / Jane Smith / Bob / Alice; Enter → `<span class="mention" data-id="1">@John Doe</span>` pill |
| **#tag** | ✅ `#depth3 ` text with suggestion decoration → committed plain |
| **~task** | ✅ `~Fix ` text with suggestion decoration → committed plain |
| **Code block** (` ``` ` shortcut) | ✅ Full TipTap CodeBlockLowlight node with 30-language selector + Copy button + lowlight syntax highlighting |
| **Gadget palette** | ✅ Opens with 11 tiles (YouTube, Code, Poll, LaTeX, iFrame, Sheet, Image + 4 INSTALLED APPs) |
| **YouTube gadget embed** | ✅ URL prompt → `<iframe src="youtube.com/embed/dQw4w9WgXcQ">` rendered |
| **Image upload** | ✅ File chooser → `tiny-red.png` uploaded → file on VPS disk at `/app/data/uploads/tiny-red-...png` + `<img src>` in D3 content |

Screenshots + README at `screenshots/260422-deeper-features-at-depth/`.

## Side findings (non-depth-specific, worth noting)

1. **Gadget palette is too greedy** — YouTube embedded into BOTH topic root AND DEPTH-3 because both were active. Routing heuristic should disambiguate. Minor cleanup, not blocking.
2. **Vite dev-server doesn't proxy `/uploads/*` to Express** — uploaded files land on disk and `<img src>` is correct, but direct fetch returns the SPA `index.html` instead of the PNG. Production builds (Express serving SPA static) work fine. Worth fixing for the dev path so uploaded images actually display on the live VPS.
3. **Topic-root toolbar shortcuts can hit the topic root, not the active depth-3 editor** — D3's OWN toolbar is fully isolated and works correctly when used directly. Routing via the top-level "Insert into active blip" buttons is the affected path.

## Conclusion

**No depth-specific gating in any rich-feature code path.** Same `RizzomaBlip` React component handles every level. `!isTopicRoot` is the only depth-relevant guard in the codebase (controls collab seeding). Hryhorii can fully edit deeply-nested blips with every editor capability.

## Commits today

| SHA | Description |
|---|---|
| `55f7319d` | docs: refresh all after BUG #43 deploy + VPS verification |
| `e65411d8` | test(#43): end-to-end Playwright verification of the fix |
| `954f8968` | test: Playwright E2E verification for ALL Hryhorii-reported issues |
| `b109cc98` | test: deep-editing verification at DEPTH-3 (edit, emoji, delete) |
| `48d5608a` | test: every rich-feature works at DEPTH-3 (mention/tag/task/code/gadget/image) |

## VPS state

`138.201.62.161:8200` rebuilt 2026-04-21 23:53 UTC from commit `c4844c73`. The 4 test-only commits since then are screenshots + READMEs only — no code changes. VPS doesn't need a re-deploy.
