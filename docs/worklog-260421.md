# Worklog — 2026-04-21

## BUG #43: gear-menu "Delete blip" silently 404s (THE fix of the day)

Hryhorii reported on rizzoma.com (HCSS Team Ukraine topic, blip
`cp3io`, Apr 20): clicking "Delete blip" on a nested sub-blip does
nothing. Level-1 `[+]` also disappears after restart. Repro-tested
on the live VPS (`138.201.62.161:8200`, commit `22e90c01`):

- `DELETE /api/blips/<waveId>%3A<blipId>` → 404 `not_found`
- `GET /api/blips/<waveId>%3A<blipId>` → 200 with blip data
- Same URL, same session, only differing in HTTP method.

### Root cause

`src/server/app.ts` mounted `linksRouter` at `/api`, and
`linksRouter` defined `DELETE /:from/:to`. Under that mount, the
pattern expanded to `DELETE /api/:from/:to` — matching every
two-segment DELETE URL under `/api/`. The links handler never
calls `next()`, so every blip delete got routed to it instead,
looked up `{type:'link', fromBlipId:'blips', toBlipId:'<id>'}`,
found nothing, and responded `404 {"error":"not_found"}`. The
error payload shape collides with blipsRouter's own not-found
response, which is why the shadow stayed invisible for weeks.

### Fix (commit TBD)

```diff
- app.use('/api', linksRouter);
+ app.use('/api/links', linksRouter);
  app.use('/api/blips', blipsRouter);
```

Plus moved the `GET /blips/:id/links` handler from linksRouter
to blipsRouter (as `GET /:id/links`) so the client path
`/api/blips/:id/links` — called from `WaveView.tsx` — still
resolves.

Verified:
- `npm test -- src/tests/routes.blips` → 5/5 pass.
- `npm test -- src/tests/routes` → 51/53 pass (2 failing are
  pre-existing `routes.comments.inline` view-mock bugs
  documented in worklog-260416.md, not introduced here).
- TypeScript clean via `tsc --noEmit`.

### Full writeup

`docs/BUG_DELETE_BLIP_SHADOW.md`.

---

## Adjacent VPS config fixes

### `FEAT_ALL=1` for dev docker builds

`vite.config.ts` defaults `FEAT_ALL` to `'1'` only when
`command === 'build'`. The VPS container runs `npm run dev`
(development stage in `Dockerfile`), so `FEAT_ALL` was `''` →
the featureFlags module saw no value and every Track-A..E guard
tree-shook to false. Symptoms on the VPS: no inline comments,
no realtime collab, no follow-the-green, no live cursors. Same
failure class as BUG #58 but for the dev server inside Docker
(BUG #58 only fixed the production-build path).

Added `FEAT_ALL: "1"` to the `environment:` of both `app` and
`app-prod` services in `docker-compose.yml`.

### Sphinx behind `profiles: ["search"]` (closes issue #42)

Hryhorii filed HCSS-StratBase/rizzoma#42: `docker compose up -d
--build` fails because the stack references `Dockerfile.sphinx`
which isn't in the repo. The modernized TypeScript codebase has
**zero** `src/` references to Sphinx — it's left over from the
CoffeeScript era. Moved the sphinx service behind
`profiles: ["search"]` and removed it from `app`'s `depends_on`.
A clean `docker compose up -d --build` now boots without
complaint; anyone who actually wants the legacy search index
can opt in with `docker compose --profile search up`.

---

## VPS state audit (for Hryhorii)

- Container `rizzoma-app` at `138.201.62.161:8200` was built
  2026-04-20 15:15 UTC from commit `22e90c01` — **BUG #40 and
  BUG #41 fixes ARE live**. His test reports are against fully
  current master code, not stale builds.
- OAuth sign-in buttons disabled because no `GOOGLE_CLIENT_ID`
  / `FACEBOOK_*` / `MICROSOFT_*` creds exist in the container
  env (and no `.env` file on the host checkout). Email sign-in
  works. Wiring OAuth is deployment config, not a code bug.
- Docker-compose diff on the VPS (uncommitted, applied by
  Hryhorii) includes a port remap `8200:3000`, `ALLOWED_ORIGINS`
  for the public IP, `APP_BASE_URL`, persistent volumes under
  `/data/volumes/stephan-rizzoma/...`, AND the `profiles:
  ["search"]` on sphinx. His local changes were correct — just
  needed upstreaming. The upstream docker-compose now matches
  (minus the VPS-specific port/origin env).

---

## Deploy status (end of session, 2026-04-21 ~00:00 local)

The deploy was done in-session by Stephan, not left as a todo
for Hryhorii:

1. Stashed Hryhorii's VPS-local docker-compose.yml overrides
2. `git pull origin master` on the VPS brought `c4844c73` down
3. Stash pop had two conflicts (app + app-prod environment
   blocks, where upstream added `FEAT_ALL` and VPS had
   `ALLOWED_ORIGINS` / `APP_BASE_URL` / `APP_URL`). Merged by
   keeping BOTH sets.
4. `docker compose up -d --build app` rebuilt the image
5. Verified `curl -X DELETE /api/blips/<id>` returns
   `{"deleted":true,...}` and CouchDB doc now has
   `deleted=True rev=2-...`

The VPS container is running `c4844c73` as of 2026-04-21
23:53 UTC. No further action needed from Hryhorii. Current
VPS state is documented in `docs/VPS_DEPLOYMENT.md` (refreshed
2026-04-22).

If the level-1 `[+]` disappearance after restart recurs, that's
a separate BUG (editor/autosave race) that wasn't reproduced
in this session — file a follow-up issue with reproduction
steps.
