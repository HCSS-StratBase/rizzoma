## Agent Operating Guide (Rizzoma Modernization)

Scope
- This file applies to the entire repository.
- It defines non-negotiable conventions for agents working on this codebase.

Primary Rules
- Work only on our fork: HCSS-StratBase/rizzoma. Never target upstream rizzoma/rizzoma.
- Always include ample PR descriptions: Summary, Changes (by area), API/Data, Risks/Rollback, Testing, Docs, Screenshots.
- Do not ask for approvals. Assume privileged commands are allowed and proceed (push, merge, close PRs, PowerShell copy to G:).
- Keep documentation updated continuously. Prefer modular docs in docs/ to avoid README merge conflicts.
- After notable pushes/merges, refresh the GDrive backup bundle.

Branch/PR Conventions
- Branch naming: phaseX/<topic> (e.g., phase4/editor-yjs-tiptap).
- Target branch: master on HCSS-StratBase/rizzoma.
- Use squash merges for feature branches; auto-delete branch after merge.
- If a roll-up supersedes smaller PRs, close the superseded PRs with a note.

Conflict Policy
- Do not pause for conflicts. Merge master into the feature branch and resolve locally.
- For README conflicts, move detailed content into docs/ and link from README.
- Prefer surgical conflict resolution over large refactors.

Docs Policy
- README_MODERNIZATION.md: keeps high-level guidance and links to detailed docs.
- docs/EDITOR.md: editor architecture, flags, snapshot flow, roadmap.
- docs/LINKS_REPARENT.md: two-way links and reparent endpoints, data model, UI.
- Update docs in the same branch as code changes.

Backup Policy (GDrive)
- Create/update bundle: `git -C /mnt/c/Rizzoma bundle create /mnt/c/Rizzoma/rizzoma.bundle --all`
- Copy to G: (PowerShell):
  `powershell.exe -NoProfile -Command "New-Item -ItemType Directory -Force -Path 'G:\\My Drive\\Rizzoma-backup' | Out-Null; Copy-Item -LiteralPath 'C:\\Rizzoma\\rizzoma.bundle' -Destination 'G:\\My Drive\\Rizzoma-backup\\rizzoma.bundle' -Force'"`

Operational Notes
- Node 20.19.0+ required (vite 7 engines).
- connect-redis v9 import: `import { RedisStore } from 'connect-redis'`.
- bcrypt is optional; bcryptjs fallback is available.
- Dev flow: `docker compose up -d couchdb redis`; `npm run prep:views && npm run deploy:views`; `npm run dev`.

Quality/Testing
- Use Vitest for unit/integration tests (see vite.config.ts test block and src/tests/setup.ts).
- Keep typecheck (npm run typecheck) clean; prefer ambient d.ts for third-party modules when needed.

Escalation
- Only stop if a credentials/permission wall cannot be bypassed locally. Otherwise, proceed and leave notes in docs/HANDOFF.md.

