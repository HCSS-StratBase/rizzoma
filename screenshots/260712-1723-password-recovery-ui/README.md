# Password recovery UI verification

- Branch: `codex/password-recovery`
- Source base: integration commit `c00e1711`
- Capture target: isolated local Vite client at `http://127.0.0.1:4327`
- Command: `node screenshots/260712-1723-password-recovery-ui/capture.mjs`

The capture exercises both password-recovery surfaces with API requests mocked
at the browser boundary: the fragment-backed **Choose a new password** form and
the **Forgot password? → Reset your password** request form. It records each at
1280, 1366, 1440, and 1600 × 900 plus a 390 × 844 mobile viewport.

All ten PNGs were visually inspected. The desktop forms remain centered with
fully visible headings, explanatory copy, fields, actions, and navigation. The
first mobile pass exposed controls touching the viewport edge; a responsive
one-rem padding fix was applied, the full capture was rerun, and both final
mobile surfaces now retain clean side margins without clipping or horizontal
overflow. The final manifest records zero unexpected browser console errors.

Boundary: this is isolated visual evidence, not a production-deployment or
live-SMTP claim. Server behavior is covered by the password-reset and session-
generation Vitest suites.
