# 47-playback-cluster-skip — ✅ VERIFIED

**Category**: Playback
**Feature**: Cluster fast-forward (skip >3s gaps).
**Evidence type**: `SOURCE`

## Evidence

Cluster boundary detection in wave playback logic.

## Inspection (2026-04-16, pass 7)

Source: `WavePlaybackModal.tsx`. Skip button fast-forwards to the next edit cluster.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
