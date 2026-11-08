# 70-upload-clamav — ✅ VERIFIED

**Category**: Uploads
**Feature**: ClamAV virus scanning.
**Evidence type**: `SOURCE`

## Evidence

Optional ClamAV Docker service via env flag.

## Inspection (2026-04-16, pass 7)

Source: `src/server/lib/scanUpload.ts`. Enable with `CLAMAV_ENABLED=1` + `docker compose up clamav`.

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
