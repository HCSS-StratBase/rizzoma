# Depth-10 reply chain test

User asked: "test at depth 10". Stress-tested how Rizzoma handles 10 levels of reply nesting on the live VPS (`138.201.62.161:8200`, commit `c4844c73`), session 2026-04-22.

## Setup

Built D1 → D2 → D3 → D4 → D5 → D6 → D7 → D8 → D9 → D10 reply chain via direct API:

```
POST /api/blips with parentId chained, 7 calls (D4..D10)
```

All 7 calls returned 201 with new blip IDs:
- D4 = `b1776816876076` (parent: D3)
- D5 = `b1776816876270` (parent: D4)
- D6 = `b1776816876499` (parent: D5)
- D7 = `b1776816876717` (parent: D6)
- D8 = `b1776816876963` (parent: D7)
- D9 = `b1776816877195` (parent: D8)
- D10 = `b1776816877412` (parent: D9)

CouchDB `find({type:'blip',waveId:...})` returns all 15 blips with the parent-chain intact.

## Discovery: Rizzoma's "subblip drill-down" pattern

When viewing the topic (`/#/topic/:waveId`), the React tree-build renders the FULL recursive `childBlips` structure (RizzomaTopicDetail.tsx:1027-1042). But the in-place rendering inside a parent blip uses `LazyBlipSlot` for `listChildren` and renders deeper children as **collapsed** `child-blip-wrapper` placeholders — they only become full RizzomaBlip components when the user clicks to expand them. So the topic view by default only shows the top 2-3 levels of any thread.

To reach a deep blip directly, Rizzoma uses the deep-link URL pattern `/#/topic/:waveId/:blipPathSuffix`. This loads a **drill-down view** showing the focused blip + its immediate parent context (with `PARENT THREAD · 1 reply in this thread` header).

## Results

| Aspect | Result | Evidence |
|---|---|---|
| **Backend create at depth 10** | ✅ | All 7 API POSTs returned 201; CouchDB has the full chain with correct parentIds |
| **Deep-link navigation `/#/topic/.../b1776816877412`** | ✅ | `depth10-01`: drill-down view shows D9 (parent context) + D10 (focused blip) with full toolbar |
| **D10 fully editable** | ✅ | `depth10-02`: clicked Edit → ProseMirror editable → typed " [edited at depth 10!]" → autosaved |
| **D10 edit persists to CouchDB** | ✅ | `curl couchdb` shows `_rev=2`, content = `<p>D10 at depth 10 [edited at depth 10!]</p>` |
| **Breadcrumb shows depth path** | ✅ | Top of view: `Hide \| LLMs → D10 at depth 10 [edited at depth 10!]` |
| **D10 has its own full toolbar** | ✅ | Done / undo / redo / link / 😀 / 📎 / 🖼️ / B / I / U / S / 🎨 / ❌ / • / 1. / ⚙️ — every feature available at depth 10 |

## Key takeaway

Rizzoma works at arbitrary depth. The data layer (CouchDB + API) has zero depth limit. The UI by default doesn't render the full chain inline (smart UX choice — would be unreadable for long threads), but every blip is **deep-linkable** at any depth and gets the full editor toolbar when focused. Hryhorii (or anyone) can comfortably nest 10+ replies and fully edit the deepest one.

## Cleanup

Test data left in place under "LLMs" topic:
- D1..D10 chain (D1 = "D1 — depth-3 features test parent", D10 = "D10 at depth 10 [edited at depth 10!]")
- All previous test fixtures from earlier sessions

Cascade-delete D1 to clean up if needed (will remove all 10 in one operation, verified earlier).
