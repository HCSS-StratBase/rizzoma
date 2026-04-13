# Dependency Upgrade Audit

Last refreshed: **2026-04-13** (Hard Gap #27, master branch).

Source: `npm outdated --json` captured at `tmp/npm-outdated-260413.json` against the installed `node_modules` on master HEAD `5890d54e`.

> The original 2026-02-03 snapshot was on `feature/rizzoma-core-features` (now retired). This refresh re-ran `npm outdated` against master after Hard Gap #30 wired connect-redis 7 and added React 19 / Mantine 9 / TypeScript 6 as newly-appearing major upgrades since the prior audit.

## Summary at refresh

- **61 outdated packages** total (up from 51 at 2026-02-03)
- **45 major-version deltas** (high risk — breaking changes expected)
- **16 minor/patch updates** (low risk — safe batch ready to apply)
- React 19, Mantine 9, and TypeScript 6.0 are new in this snapshot since the prior audit.

## Major-Upgrade Candidates (defer until dedicated pass)

### Editor stack / UI (HIGH risk — touches BLB parity, toolbar, inline comments)

| Package | Current | Latest | Notes |
|---|---|---|---|
| `react` | 18.3.1 | 19.2.5 | React 19 introduces new compiler expectations, Actions API, ref-as-prop. Highest single surface-area change. |
| `react-dom` | 18.3.1 | 19.2.5 | Must match react. Affects hydration + Strict Mode semantics. |
| `@types/react` | 18.3.27 | 19.2.14 | Matches react. |
| `@types/react-dom` | 18.3.7 | 19.2.3 | Matches react. |
| `@tiptap/react` | 2.27.2 | 3.22.3 | TipTap 3 — editor commands and node schema changes. |
| `@tiptap/starter-kit` | 2.27.2 | 3.22.3 | TipTap 3. |
| `@tiptap/extension-collaboration` | 2.27.2 | 3.22.3 | TipTap 3 — verify Y.Doc fragment name still defaults to `'default'` and synchronous provider creation pattern still works. |
| `@tiptap/extension-code-block-lowlight` | 2.27.2 | 3.22.3 | TipTap 3. |
| `@tiptap/extension-highlight` | 2.27.2 | 3.22.3 | TipTap 3. |
| `@tiptap/extension-link` | 2.27.2 | 3.22.3 | TipTap 3. |
| `@tiptap/extension-mention` | 2.27.2 | 3.22.3 | TipTap 3. |
| `@tiptap/extension-task-item` | 2.27.2 | 3.22.3 | TipTap 3. |
| `@tiptap/extension-task-list` | 2.27.2 | 3.22.3 | TipTap 3. |
| `@mantine/charts` | 8.3.18 | 9.0.1 | Mantine 9 — NEW in this refresh. |
| `@mantine/core` | 8.3.18 | 9.0.1 | Mantine 9. |
| `@mantine/hooks` | 8.3.18 | 9.0.1 | Mantine 9. |
| `@vitejs/plugin-react` | 5.1.3 | 6.0.1 | Paired with vite 7→8. |
| `vite` | 7.3.1 | 8.0.8 | Vite 8 — check proxy + dev-server config still work. |

### Tooling / lint / test (MEDIUM risk)

| Package | Current | Latest | Notes |
|---|---|---|---|
| `typescript` | 5.9.3 | 6.0.2 | TS 6.0 — NEW. Check for breaking type inference changes. |
| `eslint` | 8.57.1 | 10.2.0 | ESLint 10 — flat-config migration required. |
| `@typescript-eslint/eslint-plugin` | 6.21.0 | 8.58.1 | Paired with eslint. |
| `@typescript-eslint/parser` | 6.21.0 | 8.58.1 | Paired. |
| `eslint-config-prettier` | 9.1.2 | 10.1.8 | Flat-config refactor. |
| `eslint-plugin-react-hooks` | 4.6.2 | 7.0.1 | Paired. |
| `jest` | 29.7.0 | 30.3.0 | Jest 30. |
| `@types/jest` | 29.5.14 | 30.0.0 | Matches jest. |
| `jsdom` | 27.4.0 | 29.0.2 | Jest/vitest env. |
| `cypress` | 13.17.0 | 15.13.1 | We don't actively run cypress. Consider removing. |
| `concurrently` | 8.2.2 | 9.2.1 | npm run dev dispatcher. |
| `decaffeinate` | 6.2.1 | 8.1.4 | Only used for legacy CoffeeScript reference tree. Candidate for removal entirely (see #28). |

### Server / runtime (MEDIUM/HIGH risk)

| Package | Current | Latest | Notes |
|---|---|---|---|
| `express-rate-limit` | 7.5.1 | 8.3.2 | Rate-limit 8 — `keyGenerator` signature change. |
| `helmet` | 7.2.0 | 8.1.0 | Helmet 8 — CSP default changes. |
| `connect-redis` | 7.1.1 | 9.0.0 | **Be careful.** We just wired connect-redis 7 in Hard Gap #30 (2026-04-13). Verify the `RedisStore.normalizeClient` API is compatible with redis@5's client shape before bumping. Defer until LAST. |
| `multer` | 1.4.5-lts.2 | 2.1.1 | Multer 2 — file upload API change. Affects `src/server/routes/uploads.ts`. |
| `nano` | 10.1.4 | 11.0.5 | CouchDB client — check index / Mango query API. |
| `nodemailer` | 7.0.13 | 8.0.5 | Nodemailer 8 — SMTP transport changes. |
| `@types/nodemailer` | 6.4.21 | 8.0.0 | Matches. |
| `stripe` | 14.25.0 | 22.0.1 | **8-major-version gap.** We don't ship billing. Recommend removing stripe entirely unless billing is on the roadmap. |
| `dotenv` | 16.6.1 | 17.4.2 | Dotenv 17 — check `.env` loading precedence. |
| `date-fns` | 3.6.0 | 4.1.0 | Date-fns 4 — tree-shaking + timezone API changes. |
| `zod` | 3.25.76 | 4.3.6 | Zod 4 — significant API deltas. Most validation lives in `src/server/routes/` input parsers. |
| `amqplib` | 0.10.9 | 1.0.3 | RabbitMQ client. We run it via docker-compose but only use it in scheduled jobs. |

### Types

| Package | Current | Latest | Notes |
|---|---|---|---|
| `@types/node` | 20.19.30 | 25.6.0 | Track whatever Node runtime is actually in use. |
| `@types/multer` | 1.4.13 | 2.1.0 | Matches multer. |
| `@types/bcrypt` | 5.0.2 | 6.0.0 | Matches bcrypt. |

## Minor/Patch Candidates (safe batch — ready to apply)

All 16 are within-major updates. Batch in a single commit after a clean test pass. Nothing here should require code changes.

| Package | Current | Latest |
|---|---|---|
| `@aws-sdk/client-s3` | 3.981.0 | 3.1029.0 |
| `@aws-sdk/s3-request-presigner` | 3.981.0 | 3.1029.0 |
| `@google-cloud/storage` | 7.18.0 | 7.19.0 |
| `@swc/core` | 1.15.11 | 1.15.24 |
| `@xmpp/client` | 0.13.6 | 0.14.0 |
| `emoji-picker-react` | 4.17.4 | 4.18.0 |
| `express-validator` | 7.3.1 | 7.3.2 |
| `lucide-react` | 1.7.0 | 1.8.0 |
| `mailparser` | 3.9.3 | 3.9.8 |
| `playwright` | 1.58.1 | 1.59.1 |
| `prettier` | 3.8.1 | 3.8.2 |
| `redis` | 5.10.0 | 5.11.0 |
| `sharp` | 0.33.5 | 0.34.5 |
| `ts-jest` | 29.4.6 | 29.4.9 |
| `vitest` | 4.0.18 | 4.1.4 |
| `yjs` | 13.6.29 | 13.6.30 |

## Recommended upgrade order (revised 2026-04-13)

1. **Minor/patch batch** (low risk, one commit). Run `npm test` + browser smokes. If green, merge.
2. **Tooling batch**: typescript 5.9→6.0, eslint 8→10, @typescript-eslint 6→8, jest 29→30, jsdom 27→29, cypress 13→15, concurrently 8→9. Expect eslint flat-config migration work.
3. **Server runtime batch (non-editor)**: express-rate-limit 7→8, helmet 7→8, multer 1→2, nano 10→11, dotenv 16→17, nodemailer 7→8. Test health/upload/comment routes after each.
4. **zod 3→4 + date-fns 3→4** together. Both are pure-data libraries with breaking API changes; unit tests catch most regressions.
5. **Editor stack**: React 18→19, TipTap 2→3, @vitejs/plugin-react 5→6, vite 7→8, Mantine 8→9. **Lock BLB parity + perf harness budgets BEFORE starting.** This is the largest surface area and will almost certainly break toolbar parity and inline BLB behavior in transient states.
6. **connect-redis 7→9**: deferred until LAST. We just wired connect-redis 7 in Hard Gap #30 and the `RedisStore.normalizeClient` API may be incompatible with redis@5's client shape across the 7→9 boundary. Re-verify session persistence end-to-end after any bump.

## Risks / notes

- **TipTap 3 + React 19 together** is the largest single risk. Run them in separate commits so a rollback surgery is cleaner.
- **Stripe 14→22** is an 8-major-version gap. Recommend removing stripe entirely before the next upgrade pass unless billing is on the roadmap.
- **decaffeinate 6→8** — only used for the legacy CoffeeScript reference tree. Candidate for removal along with the tree itself (tracked as #28).
- **@tiptap/extension-collaboration 2→3** requires re-verifying the Y.Doc fragment name (still `'default'`?) and the synchronous provider creation pattern documented in `CLAUDE_SESSION.md`.
- **connect-redis 7→9 + multer 1→2** should not be batched together — if the upgrade breaks auth OR uploads, the other area should be untouched so bisection is cheaper.

## Applied updates

### 2026-02-03 — minor/patch batch

Updated (minor/patch within current ranges):
- `@aws-sdk/client-s3` → 3.981.0
- `@aws-sdk/s3-request-presigner` → 3.981.0

### 2026-04-13 — NO upgrades applied by #27

Hard Gap #27 is an audit-only refresh. No deps were upgraded in this pass — the existing major candidates were re-counted against current `node_modules` and the recommended upgrade order was revised to account for the Hard Gap #30 connect-redis 7 wiring that landed in the same session.

The minor/patch batch above is ready to apply in a follow-up commit once the maintainer confirms the dev/test stack is otherwise settled.
