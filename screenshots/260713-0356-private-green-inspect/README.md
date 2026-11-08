# PR #74 post-failure readback

- `inspect.png` visually proves the four bullet labels and collapsed `[+]`
  marker persisted after a fresh load.
- `inspect.json` records topic HTTP 200 with H1+UL and child HTTP 200 with
  `<ul><li><p></p></li></ul>` plus its durable anchor position.
- Only the automatic edit handoff failed; the stored BLB structures were not
  flattened or lost.
