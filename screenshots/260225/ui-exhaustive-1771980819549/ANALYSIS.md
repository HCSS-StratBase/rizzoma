# Exhaustive UI Analysis

- Run folder: `screenshots/260225/ui-exhaustive-1771980819549`
- Screenshot count: 105
- PASS: 0
- PARTIAL: 105
- FAIL: 0

## Interpretation
- Each screenshot has a paired markdown analysis in `notes/` listing expected tokens found (Right) vs missing (Wrong).
- Most entries are PARTIAL because checks are strict token-based across many navigation/view permutations, not because screen capture failed.
- Use per-screenshot note files for exact scenario-level pass/fail context.

## Notable global gaps seen repeatedly
- Share dialog discoverability remains inconsistent in several scenarios.
- Gear/overflow discoverability is not consistent in all scenarios/profile combinations.
- Legacy-labeled screens (`search-overlay`, `unread`) in old live refs still look like duplicate share-modal references.