# PR #75 private-green BLB acceptance failure

- Exact deployed SHA: `cb209dbd29c2c60ee17244328bee764f35aea6cb`.
- Result: failed before public cutover.
- Evidence: `01-topic-real-editor-bulleted.png` shows the topic body was correctly bulleted before Ctrl+Enter.
- Failure: root Ctrl+Enter created a child id, but the child editor never became contenteditable within 30 seconds.
- Result JSON records one transient topic PATCH 500 and the child-editor timeout.

