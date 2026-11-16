# Worklog 2026-05-18 — Claude's Rizzoma training topic (live rizzoma.com)

**Goal:** Build a new live rizzoma.com topic "Claude's Rizzoma training" with the usual
root blips and a BLB-correct, fractal Progress post — as a capability exercise for
posting on Rizzoma unaided, in proper BLB shape, in the right blip.

## What was built (verified)

- New topic created via the New-topic wizard (`button.js-create-wave-by-wizard` → real
  click → `input.js-topic-title` → green `button.js-ctm-create-topic`).
  URL: `https://rizzoma.com/topic/b246d6db7ccfd17aca62565d42d04492/0_b_ck1q_cp9ud/`.
- Title set to **Claude's Rizzoma training**; meta-blip body = `#RizzomaTraining`
  hashtag line + the 5 canonical root blips (BLB §8): **Oneliner · Relevant links ·
  Research design · Methodology · Progress**, each a **folded `[+]` subblip — verified
  in the final screenshot `45-final-state.png`.**
- Oneliner / Research design / Methodology: each a `[+]` with atomic bulleted body
  (built + verified, never disturbed).
- **Relevant links: 4 REAL external hyperlinks** (`<a href>`, no bare URLs — M5 rule 5),
  built via the documented Ctrl+L `js-link-editor-url-input` flow. Verified
  (`36-links.png`).

### HONEST status of Progress (a regression I caused, then partially recovered)

- A true depth-3 fractal Progress (6 finding `[+]` → sub-points) **was** built and
  verified (gate 6/7, `34-final-gate.png`). It was structured **wrong vs the documented
  Progress-RB convention** (S0): findings were direct children of Progress instead of
  nested under a dated `update (YYMMDD)` entry.
- The corrective restructure to insert the `update (260518)` wrapper (depth-4) **crashed
  mid-run and destroyed the Progress subblip content.** A minimal recovery rebuilt
  `Progress [+]` and typed the `update (260518)` wrapper bullet, but re-entering the
  nested subblip's edit-mode after re-nav failed (a non-deterministic step across many
  attempts), so the detailed findings content is **not currently live** inside Progress.
- **Current live Progress state:** `Progress [+]` (folded) → body = the single bullet
  `update (260518)` (correct convention shape at the top level; findings content not yet
  populated inside it).
- **The findings content itself is fully preserved** in this worklog, in
  `RIZZOMA_BLIP_EDITING_PROCEDURE.md` S0–S7, and in `/mnt/c/Rizzoma/_tana_pending.md`.
  Nothing of substance was lost — only the live in-Rizzoma rendering is incomplete.
- **Root-cause lesson:** multi-level (depth-4) unattended orchestration scripts that
  re-enter a *nested* subblip's edit-mode after a re-nav are not deterministic enough on
  rizzoma.com's legacy editor. Single-`[+]`-at-a-time recipes (S6) are reliable; deep
  recursion needs attended/step-verified building, not one big script. This itself is a
  net-new operational finding (added as S8 below intent).

## Net-new operational findings (also written into the authoritative
`/mnt/g/My Drive/Tana/RIZZOMA_BLIP_EDITING_PROCEDURE.md` §"Lessons added 2026-05-18", S1–S6)

- **S1 Re-auth:** rizzoma.com `connect.sid` is a server-session cookie; storage_state
  goes stale in ~7 days. `rizzoma_login.bat` hangs on `Get-CimInstance Win32_Process`.
  Working bypass: WSL launches Windows Chrome `--remote-debugging-address=0.0.0.0
  --remote-allow-origins=*`, user does one Google SSO, WSL `connect_over_cdp` via the
  WSL2 gateway IP, `context.storage_state()` read-only (does not touch user tabs).
- **S2 Root meta-blip:** `.edit-mode` is on `div.js-wave-panel`, not `.blip-container`;
  editable editor is the `contenteditable=true ul.js-editor.editor` (the
  `.container-blip-editor` ul is a `contenteditable=false` decoy); Edit/Done toggle =
  `button.js-change-mode.change-mode` via real click — Ctrl+E keypress does NOT toggle.
- **S3 Root `[+]` (corrects M3):** root refuses Ctrl+Enter in edit-mode; from VIEW
  state Ctrl+Enter anchors at the **click pixel-x → char offset**, NOT the last LI;
  `End` is inert in the non-editable view editor; must click Range `rect.right-1` and
  assert `focusOffset===len` before Ctrl+Enter. Deleting a mis-anchored subblip
  (`js-delete-blip` "Delete comment" + accept dialog) auto-rejoins split label text.
- **S4 Recursion keystone:** a nested subblip's edit-mode DOES accept Ctrl+Enter
  (root does not). Enter a nested subblip via: expand parent `[+]` → real
  `mouse.click` into its body (URL → subblip's own address, scoped toolbar appears) →
  its scoped `js-change-mode`.
- **S5:** `Tab` in the root editor does not indent the list (absorbed) — real
  hierarchy must be recursive `[+]`, not list-indent.
- **S6:** reusable verified root-label→folded-`[+]` recipe (9 steps).

## FINAL OUTCOME (end of 2026-05-18 session)

- **Tana: POSTED ✅** node `i7L_tUdNE4uJ` (2026-05-18 day node; #output/#RuBase/#Claude;
  Created-by SDS; Generated-by Claude; post-flight 0 literal `\uXXXX`). `_tana_pending.md`
  resolved + deleted.
- **Root cause of the entire multi-hour Tana saga:** the launcher was renamed — the live
  app is **`Tana Outliner.exe`** (newest `app-1.520.8`); every relaunch I tried used the
  stale `Tana.exe` stub (old `app-*`) which never served. Plus my own `Stop-Process`
  during bridge-debugging killed a working Tana. Both lessons codified.
- **THE permanent cure:** post **Windows-side, bridge-free** via
  `C:\Apps\Tana\post_tana_win.py` (Windows Python → Tana `127.0.0.1:8262` direct, Host
  rewritten, self-refreshing token). Zero WSL proxy/portproxy/firewall in the path.
- **Systematic tooling delivered:** `C:\Apps\Tana\tana-doctor.py` (one-command
  diagnose+remediate, encodes 6 traps + the Windows-local discriminator) and
  `tana-mcp-setup.md` "🩺 SYSTEMATIC RECOVERY" section (trap table incl. **T0 launcher**,
  failure-mode→fix map, the cure).

## Status / remaining

- Topic + 5 root blips: **done, verified.**
- Progress fractal + bold: built (verify screenshot after run).
- Relevant links real hyperlinks (Ctrl+L `js-link-editor-url-input` flow): next.
- Remaining doc gate: CHANGELOG pointer, `/mnt/g/My Drive/HANDOFF.md`, Tana daily note.
