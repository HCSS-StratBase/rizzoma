## Handoff Summary — Rizzoma Modernization

Current State
- Repo target: HCSS-StratBase/rizzoma (origin). Upstream PRs are disallowed until parity.
- Master:
  - Milestone A roll-up merged (#21): Waves read-only + unread/nav, counts, materialize + seeder.
  - Milestone B foundation merged (#22): Links APIs, reparent endpoint, WaveView links panel, editor endpoints (flagged).
- Open PRs:
  - #23 Milestone B: Editor Part 1 — TipTap + Yjs (flagged) with snapshot save/restore.

Active Work (Milestone B)
- PR #23 (phase4/editor-yjs-tiptap):
  - Client: TipTap + Yjs behind EDITOR_ENABLE=1; snapshot cadence; modular docs.
  - Server: editor endpoints with socket events (editor:snapshot, editor:update).
  - Docs: README links to docs/EDITOR.md and docs/LINKS_REPARENT.md.

Next Steps
1) Resolve PR #23 conflicts (merge master → keep Editor.tsx from PR; keep README links + combine non-overlapping changes).
2) Editor Part 2 on the same branch:
   - Materialize editor text for search (server helper + index notes).
   - Minimal mount of Editor inside WaveView for selected blip (behind flag).
   - Tests (routes + minimal client adapter), docs updates.
3) Merge PR #23, then proceed to migration/write-parity milestones.

Operational Policies (from AGENTS.md)
- No approval prompts; assume Yes.
- Keep docs current; prefer docs/ for details; link from README to reduce conflicts.
- After pushes/merges, refresh GDrive bundle:
  - `git -C /mnt/c/Rizzoma bundle create /mnt/c/Rizzoma/rizzoma.bundle --all`
  - `powershell.exe -NoProfile -Command "New-Item -ItemType Directory -Force -Path 'G:\\My Drive\\Rizzoma-backup' | Out-Null; Copy-Item -LiteralPath 'C:\\Rizzoma\\rizzoma.bundle' -Destination 'G:\\My Drive\\Rizzoma-backup\\rizzoma.bundle' -Force'"`

Verification (dev)
- Start: `docker compose up -d couchdb redis`; `npm run prep:views && npm run deploy:views`; `npm run dev`.
- Waves: UI at http://localhost:3000 → select a wave. Links panel (add/remove) auto-refreshes via sockets.
- Editor: start server with `EDITOR_ENABLE=1`; Editor snapshot requests visible on network.

