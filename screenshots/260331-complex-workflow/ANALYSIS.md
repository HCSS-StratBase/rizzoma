# Complex Live Workflow Audit vs Legacy References

Date: 2026-03-31  
Branch context: `master`  
Base URL: `http://127.0.0.1:4198`

## Captured workflow

Artifacts in this folder:

- `01-topic-loaded.png`
- `02-root-reply-a-created.png`
- `03-root-reply-b-created.png`
- `04-root-reply-a-expanded.png`
- `05-nested-reply-form-open.png`
- `06-nested-reply-created.png`
- `07-nested-reply-expanded.png`
- `08-topic-edit-mode.png`
- `09-gadget-palette-open.png`
- `10-poll-inserted.png`
- `11-done-mode-after-poll.png`
- `final.html`
- `summary.json`

The workflow intentionally used the ordinary live path:

1. Load a fresh topic.
2. Create two root replies via the topic `Write a reply...` field.
3. Expand the first root reply.
4. Open the nested reply form and submit a child reply.
5. Enter topic edit mode.
6. Open the gadget palette.
7. Insert a poll gadget.
8. Return to done/view mode.

## Legacy references used

- `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-main.png`
- `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-blip-view.png`
- `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-blip-edit.png`
- `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-blips-nested.png`
- `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-replies-expanded.png`
- `screenshots/rizzoma-live/feature/rizzoma-core-features/rizzoma-toolbar.png`

## What actually works

- Creating a root reply works.
- Expanding a root reply works.
- Opening the nested reply form works.
- Creating a nested reply works.
- Entering topic edit mode works.
- Opening the gadget palette works.
- Inserting a poll works.

So the live build is not “dead.” The core path is still operational.

## Where the build is clearly worse than the original

### 1. The main topic pane is visually anaemic

Compared with `rizzoma-main.png` and `rizzoma-blip-view.png`, the modern pane is too empty and washed out.

- The legacy UI had stronger edge definition, clearer blocks, and a more confident information hierarchy.
- The modern pane looks underfilled and fragile, with too much white space and too little structural weight.
- The topic body and reply layers blend together instead of reading like a confident threaded workspace.

### 2. Reply hierarchy is still less legible than the legacy nested view

Compared with `rizzoma-blips-nested.png` and `rizzoma-replies-expanded.png`:

- The indentation is present now, but it is still timid.
- Parent/child separation is much less obvious than in the original.
- Nested replies feel like lightly offset cards rather than a strong threaded tree.
- Root siblings and nested descendants are still too easy to confuse at a glance.

### 3. Toolbar affordance is significantly weaker

Compared with `rizzoma-blip-view.png`, `rizzoma-blip-edit.png`, and `rizzoma-toolbar.png`:

- The original made the active toolbar feel like a central, obvious control strip.
- The modern toolbar feels thin, low-contrast, and under-signaled.
- Edit mode exists, but it does not announce itself with the same authority.
- Gadget insertion is technically available, but the affordance remains too buried and too dependent on knowing the workflow already.

### 4. The gadget palette feels bolted on

In `09-gadget-palette-open.png`:

- The palette appears as a detached floating slab on the right.
- It does not feel integrated with the active blip the way the original gadget flow felt tied to active controls.
- The relationship between “current active content” and “this palette applies here” is still too implicit.

### 5. Edit mode still contains visible degradation

In `10-poll-inserted.png`:

- The inline comments degradation banner is visible during a normal workflow.
- That may be technically truthful, but it makes the build feel unfinished immediately.
- The original had rough edges too, but this kind of warning appearing directly in the active editing surface damages confidence.

### 6. The topic root still does not feel like the original meta-blip

The documented structure is now closer to correct, but the presentation still does not sell it:

- The root topic region lacks the stronger “top blip / meta-blip” identity of the original.
- The modern title/body/replies composition still feels like stacked React panels rather than one coherent wave/blip surface.

## Bottom line

The harsh but accurate summary is:

- Core workflow functionality: **working**
- Structural fidelity to the documented model: **improved but still easy to misread**
- Visual and interaction parity with the original: **still clearly worse**

This build is not failing because every action is broken.  
It is failing because the UI still does not *feel* like Rizzoma once you actually compare it to the legacy references step by step.

## Immediate next targets

1. Strengthen hierarchy and indentation so root siblings, expanded parents, and nested children are unmistakable.
2. Make active toolbar ownership visually obvious again.
3. Make gadget insertion feel anchored to the active blip, not like a detached right-side utility drawer.
4. Reduce or relocate edit-surface degradation banners that poison confidence during normal use.
