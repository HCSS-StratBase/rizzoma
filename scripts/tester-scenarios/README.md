# tester-scenarios

Behavioural regression suite for the modernized Rizzoma: it signs in, types, pastes, reloads and uses a second user, and
judges what the server stored. Cases live in `cases/<family>-*.mjs`, the driver is `lib.mjs`, the runner is
`../../test-tester-scenarios.mjs`.

- Run (fast triage, headless): `npm run test:tester-scenarios`
- Run (evidence, headed on a private virtual display, human pace, video and step screenshots): `npm run test:tester-scenarios:headed`
- Coverage gate (every documented feature row needs a case): `npm run test:scenarios-coverage`
- Which cases are GUI tests, which are API contract tests, the deliberate exceptions, the native-path status and the mapping of
  the tester's notes: [`../../TESTERS_COVERAGE.md`](../../TESTERS_COVERAGE.md)

Rules: act only through user-visible actions in GUI cases; never capture a real screen or window, only the pages of this run
(Playwright screenshots, video, or `ffmpeg x11grab` of the suite's own virtual display); kill processes by exact PID.
