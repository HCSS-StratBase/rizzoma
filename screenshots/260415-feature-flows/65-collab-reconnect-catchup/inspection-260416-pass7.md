# 65-collab-reconnect-catchup — ✅ VERIFIED

**Category**: Collab
**Feature**: Reconnect catchup via state-vector sync.
**Evidence type**: `TEST`

## Evidence

test-collab-smoke.mjs disconnect/reconnect step.

## Inspection (2026-04-16, pass 7)

Source: `src/client/components/editor/CollaborativeProvider.ts` `setupReconnect()` sends `blip:sync:request` with local state vector.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
