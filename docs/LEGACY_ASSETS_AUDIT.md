# Legacy Assets Audit (Reference vs Active)

Branch: `feature/rizzoma-core-features`  
Date: 2026-02-02

## Summary
The active `src/` tree no longer contains CoffeeScript or legacy static assets. Remaining legacy material is confined to reference folders used for parity and historical comparison.

## Inventory
- `original-rizzoma/`
  - Legacy runtime dependencies and vendored node_modules (historical reference only).
- `original-rizzoma-src/`
  - CoffeeScript sources and legacy tests (reference for parity, not used by active build).
- `screenshots/`
  - Legacy UI references and parity snapshots (required for comparison).

## Recommendations
1. **Keep `original-rizzoma-src/`** as a read-only reference until BLB + toolbar parity are signed off.
2. **Keep `original-rizzoma/`** only if needed for legacy binary/vendor reference; otherwise archive to external storage to reduce repo size.
3. **Do not reintroduce CoffeeScript** into `src/`; prefer TS/ESM.

## Next Actions (when ready)
- Decide on archival vs retention of `original-rizzoma/` once parity is locked.
- If archived, remove from repo and document retrieval location in `docs/HANDOFF.md`.
