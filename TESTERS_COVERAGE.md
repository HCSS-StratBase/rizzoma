# Tester scenarios: what each of Liliia's notes maps to

Suite: `npm run test:tester-scenarios` (`test-tester-scenarios.mjs`, cases in `scripts/tester-scenarios/cases/`).
Parameters: `RIZZOMA_BASE_URL` (any host), `RIZZOMA_RENDER=react|native|both`, `SUITE_FAMILIES=A,C`, `SUITE_CASES=A01`,
`RIZZOMA_SERVER_LOG` (server log scanned for errors per case), `COUCHDB_URL` (account fixtures).
Feature coverage of every documented row: [TESTERS_FEATURE_MATRIX.md](TESTERS_FEATURE_MATRIX.md), generated and gated by
`npm run test:scenarios-coverage` (fails when a documented row of `RIZZOMA_FEATURES_STATUS.md` has no case).

Liliia's notes were a sample of the defect kinds, not the scope: the suite covers every documented feature row.

| Liliia's note (paraphrased) | Cases |
|---|---|
| Login works | G01, S01 |
| Creating blips works | A09, B01, B02 |
| Text posted in the sub-blip "moves the way it wants", ends up elsewhere | A01 to A10, B03, B06, C03 |
| Creating blips is possible, editing them much harder or not possible | B01, B02, B05, A08, T01 to T08 |
| You must be in an editor mode to comment or create a blip (original: jump in and paste) | B02, B03, B04, K01 |
| Cannot post in the third-level blip (test = 1, people = 2, a blip inside the Liliia sub-blip = 3) | A01, A03, A04, I01 |
| Cannot invite people to the topics; people appear on mention but not as in the original | D01 to D06, S07, S08 |
| Always-hide-blips option works | G05, G06, K02 |
| Links work | G02, B08, S16 |
| Follow-the-green is there and works | G03, N03, S10 |
| Screenshots work, a pasted image takes almost the whole page | E01, E03 |
| The time a blip was created does not display (only while writing) | F01 to F04, I02 |
| My blips disappear, I created multiple sub-blips, then they vanished | A02, A03, A10, C01 to C05 |
| Tasks work | G04 |
| Generally it works but needs getting used to | whole suite, both render paths |

Render paths: every case runs on the React path (`RIZZOMA_RENDER=react`) and on `?render=native` (`RIZZOMA_RENDER=native`);
a case that cannot run on one path is reported `N/A` with its reason, never skipped silently. Cases whose contract row is
documented as a gap (`knownGap`) run and report `KNOWN-GAP`, so the gap stays visible without blocking.
Content is created by real key events; the only API writes in the suite are the deliberate negative permission probes (D02, D04,
S-family contract cases), the construction of a marker-less orphan (C05, no UI path produces one) and the 500-blip volume
seed of R01.

## The native render path (`?render=native`): status and why most UI cases are N/A there

- **Status: opt-in, unfinished, not reachable by users.** `RizzomaTopicDetail.tsx:1850-1860` selects it only for the URL
  parameter `?render=native` or `localStorage.rizzoma_render_mode === 'native'`; neither the default URL nor any control in
  the app sets or links to it (searched `src/client`: no writer of `rizzoma_render_mode`, no `render=native` link).
  `docs/NATIVE_RENDER_PORT_PLAN.md` lists Phase 5 (cut-over) as not done and requires `HB_RENDER=native` handbuild acceptance to
  pass before any cut-over; `wiki/subsystems/native-render-port.md` ¶ phase matrix calls it opt-in, Phase 2 partly wired.
- **What it lacks for the suite:** no topic reply box (`.write-reply-input`) and a different blip DOM (children are markers
  inside the root's bullets, no `.blip-collapsed-row` / `.nested-blip`). The runner probes this once per run and reports every
  UI case N/A on native with that reason; the server-contract (S) and repository (R) cases run on both paths.
- **Guard:** case Q01 fails if the default path stops being React, if the app stores a native preference, or if any link,
  button or menu item leads to `?render=native`. When native is cut over, remove the N/A rule in `test-tester-scenarios.mjs`
  and the UI cases must pass there.
- **Native gate that does exist:** `HB_RENDER=native node scripts/handbuild_acceptance.mjs` (run in the shipping checklist).

## How to run it

- **Fast triage (headless):** `npm run test:tester-scenarios` (filters: `SUITE_FAMILIES=A,C`, `SUITE_CASES=A01`; `RIZZOMA_RENDER=react|native|both`). Headless runs are for debugging; they are not the evidence that something works.
- **Evidence run (headed, human pace):** `npm run test:tester-scenarios:headed` (`scripts/tester-scenarios/run-headed.sh`). A real, headed Chromium on a PRIVATE virtual display (`xvfb-run -a`, `DISPLAY` and `WAYLAND_DISPLAY` unset), so nothing appears on anyone's desktop and the clipboard is the virtual browser's own. Pace: `SUITE_SLOWMO` (default 120 ms per action) and `SUITE_TYPE_DELAY` (default 90 ms per character). Video and step screenshots are written to `SUITE_EVIDENCE` (default `/mnt/c/Apps/rizzoma/session-2026-11-16/screenshots/tester-scenarios-suite/videos` and `.../steps`). Runs are serialised with `flock /tmp/rizzoma-visible-browser.lock`. Never capture a real screen or window: look only at the page screenshots and videos of this run.
- **Needs** a real CouchDB (`COUCHDB_URL`), Redis, the app server and vite; `RIZZOMA_SERVER_LOG` makes every case also fail on server-log errors. The login route allows 30 attempts per 10 minutes per IP, so the suite reuses a pool of fixture users (one sign-in each).

## What is a GUI test and what is not

- **GUI tests (user-visible actions only):** families A, B, C, D, E, F, G, I, K, L, N, T, W, X. Sign-in is typed into the sign-in form, topics are created with the "+ New" wizard, content is typed, the clipboard is the browser's real clipboard (image paste via `navigator.clipboard.write` and a real Ctrl+V), files go through the real file chooser.
- **API contract tests, not GUI tests:** family S (and R02 to R06, which run commands and read files). They call the server as a signed-in colleague and a second user.
- **Deliberate exceptions inside GUI families:** the negative permission probes D02 and D04 (a viewer is refused a write, asked over the API); C05 (a blip whose parent marker is missing, which no GUI action can produce); R01 (the 500-blip seed, typing 500 blips is not practical). Fixtures that stand in for the outside world: fixture accounts are seeded in CouchDB, and the acceptance of an invitation (an e-mail link) is simulated by writing the accepted participant (`shareWith`). Reads (checking what the server stored) and the final cleanup of scratch topics use the API.

