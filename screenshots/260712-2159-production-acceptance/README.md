# Public production acceptance evidence — 2026-07-12

This folder records the acceptance run against public production at
`https://138-201-62-161.nip.io/`, exact deployed commit `04b94622` on the
managed blue lane.

## Verified before the coherence blocker

- `phase1.json` records **15/15** passing checks: stale-cookie rejection,
  authenticated-session survival, Google OAuth redirect/state shape, topic and
  hierarchy readback, invitation readback, clean-upload persistence, EICAR
  rejection, and a console-clean owner render.
- `owner-1366.png` is the rendered owner view at the required 1366 px laptop
  width.
- `ftg-desktop-2.png` and `ftg-desktop-0.png` show Follow-the-Green before and
  after the persisted `2 -> 1 -> 0` completion sequence.
- The HTML, JSON, and text files are three recursive exports of the same live
  acceptance topic.

## Blocking finding

Phase 2 also passed invitation acceptance, role boundaries, uploads,
two-browser relay/reconnect, exports, public/private transitions, and
revocation. It then exposed a real REST/Yjs dual-authority defect: older Yjs
state replaced newer task-bearing HTML and reconciliation removed the derived
Task document. These artifacts therefore prove the deployed baseline and the
path to the blocker; they are not evidence that the coherence repair is live.

The repair is on `fix/rest-yjs-content-coherence`. Exact private-lane and
public evidence for the repaired build will live in a separate timestamped
folder after CI and deployment.
