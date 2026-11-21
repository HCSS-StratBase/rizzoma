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

## Mail: the suite must never send real e-mail (21 Nov 2026)

Production sends a real invitation mail to the invited address. The two live test accounts are `+fractal1` and `+fractal2` aliases of SDS's own mailbox, so every live `shareWith` landed a mail there: **95 "ZZ SCRATCH" invitation mails (103 invitation mails in all) between 6 and 21 Nov**, 91 of them on 21 Nov alone. Rules now:

- `lib.mjs` `shareWith` in live mode **throws** unless `SUITE_LIVE_ALLOW_MAIL=1`. Live cases that need a second person therefore fail loudly instead of mailing; they stay blocked until the server can invite the test aliases without mail (open item: `INVITE_EMAIL_SUPPRESS_PATTERN`) or a third non-delivering account exists.
- Local runs send to a sink: start `node mail-sink.mjs <port> <dir>` (captures every message as `.eml`, delivers nothing) and start the app with `SMTP_HOST=127.0.0.1 SMTP_PORT=<port>`. `test-invite-journey-smoke.mjs` in the app repo reads the invitation link from that directory.
- Never point a run at a real address. Test addresses use `example.com` (the sink) or a non-delivering domain.

## Live test accounts (updated 21 Nov 2026)

Three accounts exist on production, all aliases of SDS's mailbox and all covered by the server setting `INVITE_MAIL_SUPPRESS_PATTERN=\+fractal[0-9]@gmail\.com$` (in `/etc/rizzoma/green.env`, so invitations to them send no mail):
- Fractal Tester 1 `sdspieg+fractal1@gmail.com` (`RIZZOMA_MODERN_FRACTAL1_*`), tags b, v, m, l, n, e, g.
- Fractal Tester 2 `sdspieg+fractal2@gmail.com` (`RIZZOMA_MODERN_FRACTAL2_*`), every other tag; the topic owner in most cases.
- Fractal Tester 3 `sdspieg+fractal3@gmail.com` (`RIZZOMA_MODERN_FRACTAL3_*`), created 21 Nov 2026 directly in the production database with the E2E fixture (production sign-up needs an invitation whose token is mailed; a suppressed invitation has none), tags k and x: the third distinct person (contact, stranger).
All three read their credentials from `SYSTEM_CREDENTIALS.env` inside the process; nothing is printed. `pickPerson` in `lib.mjs` clicks the right row in the mention/task list because the three share the e-mail prefix.
