## Restart Checklist (Same Folder, Any Machine)

This is a condensed checklist to resume work from this repository on any computer, provided you have the same folder contents.

1) Node and npm
- Require Node 20.19.0: `node -v` → `v20.19.0`
- If needed: `nvm install 20.19.0 && nvm use 20.19.0`

2) Dependencies
- Install: `npm ci` (or `npm install`)

3) Services
- Docker Desktop with WSL integration ON (if on Windows/WSL)
- Start: `docker compose up -d couchdb redis`

4) Legacy Views (if DB doesn’t have them yet)
- `npm run prep:views && npm run deploy:views`

5) Run Dev
- `npm run dev` → server on :8000, client on :3000
- Open http://localhost:3000

6) Editor Flag
- To enable editor endpoints: set `EDITOR_ENABLE=1`

7) Verifications
- Typecheck: `npm run typecheck`
- Tests: `npm test`
- Build: `npm run build`

8) PR Workflow (CLI only)
- Create PR: `gh pr create -R HCSS-StratBase/rizzoma -B master -H <branch> -t "Title" -F <body.md>`
- Update body: `gh api -X PATCH /repos/HCSS-StratBase/rizzoma/pulls/<num> -f body@body.md`
- Merge (squash): `gh pr merge <num> --squash --delete-branch --admin`

9) Backup
- Bundle: `git -C /mnt/c/Rizzoma bundle create /mnt/c/Rizzoma/rizzoma.bundle --all`
- Copy: PowerShell command in docs/HANDOFF.md

For full status and roadmap, see `docs/HANDOFF.md`.

