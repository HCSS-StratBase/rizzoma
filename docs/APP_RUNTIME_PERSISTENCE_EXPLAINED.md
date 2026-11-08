# App Runtime Persistence Explained

Date: 2026-03-30  
Branch: `master`

## Short version

The planner app bug was **not** that Rizzoma only saves when you click `Done`.

The real problem was that **two different persistence systems were active at the same time**:

1. the **topic-root editor** path, which had the correct updated planner state
2. a **generic blip save** path, which incorrectly treated the topic root like an ordinary blip and wrote stale data afterward

So the correct save happened, but then the wrong save overwrote it.

## What the intended model is

For the topic root, the expected behavior is:

- app/gadget state updates live while editing
- the topic editor holds the current truth in memory
- clicking `Done` finalizes and persists that same truth
- when the topic reloads, the saved content should match what the editor already showed

That means the user experience should feel like:

- "I edit on the fly"
- "the state is live"
- "`Done` just closes/finalizes"

## What was actually happening

In the failing planner case:

- the sandbox app iframe updated its state correctly
- the topic editor had the correct delayed milestone in memory
- `finishEditingTopic()` produced the correct final HTML
- the correct topic PATCH was sent

But after that, the saved topic still reverted.

## Why it reverted

The topic root was still partially flowing through the generic `RizzomaBlip` lifecycle.

That created a second persistence path:

- `PATCH /api/topics/:id` with the correct delayed planner state
- then a stale `PUT /api/blips/:topicId` with older app data

That second write should never have existed for a topic document.

Because it arrived afterward, it overwrote the correct topic save.

## Why this was confusing during debugging

Several things were simultaneously true:

- the live UI before `Done` looked correct
- the topic editor's final serialized HTML was correct
- the route-level topic save logging showed the correct payload
- but the persisted topic still ended up wrong

That made it look like the app iframe or `Done` logic was broken.

It was not.

The real bug was a **competing write path** that was still active after the correct save.

## The architecture boundary that mattered

There are two different concepts in the modernized UI:

### 1. Topic-root editor

This is the editor for the root topic content.

It should persist through the **topic** route and topic-specific save logic.

### 2. Blip editor

This is the generic editor for normal blips.

It should persist through the **blip** route and generic blip save logic.

## The bug

The topic root was accidentally being treated as both:

- a topic root
- and a normal editable blip

That overlap is what caused the persistence conflict.

## The fix

The repair had two parts.

### Client-side fix

Stop the topic root from entering the generic blip edit/save lifecycle.

Relevant files:

- `src/client/components/RizzomaTopicDetail.tsx`
- `src/client/components/blip/RizzomaBlip.tsx`

This removed the rogue topic-root blip saves.

### Server-side fix

Reject non-blip documents on the blip update route.

Relevant file:

- `src/server/routes/blips.ts`

This ensures that even if the client regresses later, a topic document cannot be silently mutated through the blip endpoint again.

## What verification proved

Fresh verification used the clean feature-flagged client on `http://127.0.0.1:4192`.

Artifacts:

- `screenshots/260330-app-runtime/live-topic-planner-debug-after-done.png`
- `screenshots/260330-app-runtime/live-topic-planner-debug-after-done.html`
- `screenshots/260330-app-runtime/live-topic-planner-debug-saved-topic.json`
- `screenshots/260330-app-runtime/live-topic-planner-debug-mutation-traffic.json`
- `screenshots/260330-app-runtime/topic-patch-log.ndjson`

The final proof was:

- saved topic payload contains `Ship preview (delayed)` at `16:30`
- topic route log contains the correct delayed payload
- mutation traffic is empty (`[]`)

That means the stale competing write path is gone.

## Final takeaway

The correct mental model is still:

- state updates live while editing
- persistence is continuous / on-the-fly in practical terms
- `Done` finalizes the current topic state

What broke was not that model.

What broke was that the topic root accidentally had a second, invalid persistence path layered on top of it.

Now that the topic root only persists through the topic path, the behavior matches the intended model again.
