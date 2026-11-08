# Private green BLB acceptance — failed

- Candidate: exact PR #73 merge `7581d036` on inactive managed green `:8102`.
- Real topic creation initially rendered the required four labels as bullets;
  `01-topic-real-editor-bulleted.png` is the before-state.
- Immediate real Ctrl+Enter then produced blank topic/child bullets rather than
  preserving the four labels; `02-topic-ctrl-enter-child-bulleted.png` is the
  visually inspected failure state.
- Network/server evidence recorded repeated topic PATCH 409 responses. After a
  managed restart the duplicate H1+UL collaborative snapshot was rejected as
  HTTP 400 `invalid_blb_structure`.
- Release action: green was stopped; nginx/public blue was never changed. These
  screenshots are failure evidence, not acceptance evidence.
