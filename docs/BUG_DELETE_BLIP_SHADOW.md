# BUG #43: gear-menu "Delete blip" silently 404s

**Reported**: 2026-04-20 by Hryhorii on rizzoma.com topic `HCSS Team Ukraine`
(URL: `rizzoma.com/topic/62d6bdc5…/0_b_cjjg_cp3io/`), confirmed against the
VPS instance `138.201.62.161:8200` running commit `22e90c01`.

**Fixed**: 2026-04-21, commit TBD.

## Symptom

Opening a non-root blip → clicking its gear → "Delete blip" shows the
confirm dialog. Accepting the dialog appears to do nothing. Browser
DevTools network tab shows:

```
DELETE /api/blips/<waveId>%3A<blipId>  →  404  {"error":"not_found", …}
```

Hryhorii's workaround: placing the caret around the `[+]` marker inside
the parent blip's content and pressing Delete on the keyboard. That's a
different code path (editor-level node deletion) and happens to work.

## Root cause

`src/server/app.ts` used to mount `linksRouter` at `/api`:

```ts
app.use('/api', linksRouter);        // ← old mount, the bug
app.use('/api/blips', blipsRouter);
```

`linksRouter` defines `DELETE /:from/:to`. Under the `/api` mount, that
expands to `DELETE /api/:from/:to` — a two-path-segment pattern that
**matches any two-segment URL under `/api/`**, including
`DELETE /api/blips/<blipId>`.

Since the `linksRouter`'s handler never calls `next()` (it always
returns a response), Express never falls through to the blips router's
`DELETE /:id` handler. For a blip delete:

1. `:from` binds to `"blips"`.
2. `:to` binds to the URL-encoded blip ID.
3. `findOne({ type: 'link', fromBlipId: 'blips', toBlipId: '<id>' })`
   finds nothing.
4. The handler responds `404 {"error":"not_found"}`.

This masquerades as "the blip wasn't found" — the exact error shape
the user would expect from a real not-found blip. The shadow was
invisible because:

- `GET /api/blips/:id` still worked (linksRouter has no `GET
  /:from/:to`).
- The error payload collides with blipsRouter's own `not_found`
  response for a missing doc, so log inspection didn't flag it.
- URL-encoded colons (`%3A`) in blip IDs made the request look
  suspicious, sending diagnosis down the wrong path.

## Fix

`src/server/app.ts`:

```ts
app.use('/api/links', linksRouter);   // ← was '/api'
app.use('/api/blips', blipsRouter);
```

`src/server/routes/links.ts`: removed the `GET /blips/:id/links`
handler (it only existed under `/api` because of the old wrong mount).

`src/server/routes/blips.ts`: added `GET /:id/links` so clients still
hit `GET /api/blips/:id/links` (the actual URL `WaveView.tsx` calls).

Client call sites (all already correct):
- `POST /api/links` — unchanged.
- `DELETE /api/links/:from/:to` — unchanged.
- `GET /api/blips/:id/links` — unchanged (now served by blipsRouter).

## Reproduction

```
curl -c /tmp/c -X POST http://138.201.62.161:8200/api/auth/login \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $(curl -s -c /tmp/c http://138.201.62.161:8200/api/auth/csrf | jq -r .csrfToken)" \
  -d '{"email":"hp@rizzoma.com","password":"stratbase2026"}'

# Pre-fix: returns 404 not_found
curl -b /tmp/c -X DELETE \
  -H "X-CSRF-Token: $(curl -s -b /tmp/c http://138.201.62.161:8200/api/auth/csrf | jq -r .csrfToken)" \
  'http://138.201.62.161:8200/api/blips/<waveId>%3A<blipId>'

# Post-fix: returns {"deleted": true, "id": "..."}
```

## Related findings (out of scope for this issue)

The same session investigation also uncovered two VPS-configuration
issues separate from this bug:

1. **`FEAT_ALL=1` not set in dev docker builds.** `vite.config.ts` only
   defaults `FEAT_ALL` to `'1'` for production builds. In dev mode
   (which the VPS container runs via `npm run dev`), every feature
   flag tree-shook to false → no realtime collab, no inline comments,
   no follow-the-green, etc. Fixed in the same commit by adding
   `FEAT_ALL: "1"` to both `app` and `app-prod` services in
   `docker-compose.yml`.

2. **Sphinx builds fail because `Dockerfile.sphinx` is missing.** The
   modernized TypeScript codebase has zero `src/` references to
   Sphinx; it was left behind from the CoffeeScript era. Moved
   `sphinx` behind `profiles: ["search"]` and removed from `app`'s
   `depends_on` so a clean `docker compose up` boots without
   requiring a missing Dockerfile. Closes HCSS-StratBase/rizzoma#42.

Google / Facebook / Microsoft OAuth buttons show as disabled on the
VPS login page because `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and
the corresponding pairs for the other providers are not set in the
container environment. Local email sign-in (`hp@rizzoma.com` /
`stratbase2026`) works fine. Wiring OAuth is a deployment
configuration task, not a code bug.
