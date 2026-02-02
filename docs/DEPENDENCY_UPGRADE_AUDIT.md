# Dependency Upgrade Audit (feature/rizzoma-core-features)

Date: 2026-02-03

Source: `npm outdated --json` saved at `tmp/npm-outdated.json` (51 outdated packages).

## Summary

- 36 packages have **major-version** deltas (high risk).
- 15 packages are **minor/patch** updates (low risk).
- TipTap + React ecosystem upgrades are the highest-risk items because they touch the editor, toolbar parity, and inline BLB behavior.

## Major-Upgrade Candidates (Defer Until Dedicated Pass)

**Editor stack / UI (high risk)**
- `react` 18.3.1 → 19.2.4
- `react-dom` 18.3.1 → 19.2.4
- `@tiptap/*` 2.27.2 → 3.18.0 (starter-kit, react, collaboration, link, mention, highlight, task list/item)

**Tooling / lint / test (medium risk)**
- `eslint` 8.57.1 → 9.39.2
- `@typescript-eslint/*` 6.21.0 → 8.54.0
- `eslint-config-prettier` 9.1.2 → 10.1.8
- `eslint-plugin-react-hooks` 4.6.2 → 7.0.1
- `jest` 29.7.0 → 30.2.0
- `@types/jest` 29.5.14 → 30.0.0
- `jsdom` 27.4.0 → 28.0.0
- `cypress` 13.17.0 → 15.9.0
- `concurrently` 8.2.2 → 9.2.1
- `decaffeinate` 6.2.1 → 8.1.4

**Server/runtime (medium/high risk)**
- `express-rate-limit` 7.5.1 → 8.2.1
- `helmet` 7.2.0 → 8.1.0
- `connect-redis` 7.1.1 → 9.0.0
- `multer` 1.4.5-lts.2 → 2.0.2
- `nano` 10.1.4 → 11.0.3
- `stripe` 14.25.0 → 20.3.0
- `dotenv` 16.6.1 → 17.2.3
- `date-fns` 3.6.0 → 4.1.0
- `zod` 3.25.76 → 4.3.6

**Types**
- `@types/node` 20.19.30 → 25.2.0
- `@types/react` 18.3.27 → 19.2.10
- `@types/react-dom` 18.3.7 → 19.2.3
- `@types/multer` 1.4.13 → 2.0.0
- `@types/nodemailer` 6.4.21 → 7.0.9
- `@types/bcrypt` 5.0.2 → 6.0.0

## Minor/Patch Candidates (Safe Batch)

These can be updated in a single low-risk batch once BLB parity is fully signed off:

- `@aws-sdk/client-s3` 3.971.0 → 3.981.0
- `@aws-sdk/s3-request-presigner` 3.971.0 → 3.981.0
- `@floating-ui/dom` 1.7.4 → 1.7.5
- `@swc/core` 1.15.8 → 1.15.11
- (plus the remaining minor/patch set in `tmp/npm-outdated.json`)

## Recommended Upgrade Order

1. **Minor/Patch batch first** (low risk, keep editor parity stable).
2. **Tooling majors** (eslint/jest/jsdom/cypress) after CI/Playwright green.
3. **Server/runtime majors** (multer/nano/stripe/helmet/express-rate-limit).
4. **Editor stack majors** (React 19 + TipTap 3) last, and only after BLB parity + perf harness budgets are locked.

## Risks / Notes

- React 19 + TipTap 3 is the largest surface area; expect breaking changes in editor commands and node schema.
- `multer` 2.x and `connect-redis` 9.x have breaking changes; update server tests first.
- `zod` 4.x and `date-fns` 4.x have API deltas; plan explicit migration.

## Applied Updates (Minor/Patch Batch)

Date: 2026-02-03

Updated (minor/patch within current ranges):
- `@aws-sdk/client-s3` → 3.981.0
- `@aws-sdk/s3-request-presigner` → 3.981.0
- `@floating-ui/dom` → 1.7.5
- `@swc/core` → 1.15.11
- `@vitejs/plugin-react` → 5.1.3
- `cors` → 2.8.6
- `emoji-picker-react` → 4.17.4
- `express-session` → 1.19.0
- `mailparser` → 3.9.3
- `nodemailer` → 7.0.13
- `playwright` → 1.58.1
- `prettier` → 3.8.1
- `vitest` → 4.0.18

Skipped (outside current semver range):
- `@xmpp/client` remains at 0.13.6 (latest 0.14.0 is outside the current range).
- `sharp` remains at 0.33.5 (latest 0.34.5 is outside the current range).

Audit note: `npm audit` reports 26 vulnerabilities post-update; no automated fixes applied yet.
