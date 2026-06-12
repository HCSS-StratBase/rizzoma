# Worklog 2026-06-12 — Fishman topic skeleton and Rizzoma skill extension

## What changed

- Added a `standard-topic` skeleton operation to the canonical Rizzoma posting engine:
  `/mnt/g/My Drive/claude-skills/rizzoma/rizzoma_post.py`, synced to
  `~/.claude/skills/rizzoma/rizzoma_post.py`.
- Added a clean `operation: "hashtags"` path so topic-root hashtags can be inserted
  without falling through into the full skeleton-building pass.
- Posted the Fishman topic root skeleton at:
  `https://rizzoma.com/topic/f0f5eb201e41d9fcf080a89da7d30b0c/0_b_ck31_cpdq9/`.

## Verified result

- Readback verified the live topic root text contains:
  `#HCSS #RuBase`
- Readback verified the visible skeleton labels:
  `Oneliner`, `Relevant links`, `Research design`, `Methodology`, `Progress`.
- The five folded `[+]` section children were populated with substantive Fishman
  project content derived from the local result docs and this session's corrections.
- Final text readback verified representative strings from every section, including:
  `284 combined on-air interlocutor appearances across 129 people`,
  `fishman_combined_interlocutor_counts_tab20_2026-06-12.png`,
  `who appears as Fishman's interlocutors`,
  `Scanned full Russian subtitle windows`, and
  `Troitskiy appears at rank 4 with 8 lower-third inserted expert appearances`.
- Visual verification screenshot:
  `/tmp/fishman_rizzoma_rich_expanded.png`.
- Repair pass after SDS content-bar review:
  - Mandatory pre-post gate passed:
    `python3 ~/.claude/skills/rizzoma/content_gate.py /tmp/fishman_rizzoma_fix_draft.json`
    returned `CONTENT GATE: PASS`.
  - Verified attribution was added from session metadata:
    `gpt-5.5` via `codex-cli 0.139.0`.
  - Folded `[+]` depth was added under the Research design Troitskiy-miss
    line and the Methodology per-appearance visual-verification line using the
    existing `rizzoma_post.py` `child` operation. No shared-engine edits were
    made during the repair.
  - Relevant links now has 7 Google Drive cloud anchors and no raw URL text in
    the section body.
  - Structural acceptance probe after repair:
    `Relevant links links=7`, `Research design inline_threads=1`,
    `Methodology inline_threads=1`; both new child threads were folded on fresh
    reload.
  - Visual verification screenshot:
    `/tmp/fishman_rizzoma_fixed_acceptance.png`.

## Boundary

- The visible root skeleton exists, the hashtags were added, each root section has
  readable bullet content, Relevant links has live Drive anchors, and the two
  required substantive claims now have folded `[+]` evidence/detail children.
- The measured canonical count is **284 appearances / 129 people** from the
  combined TSVs. Any earlier **290 / 132** figure is superseded.
