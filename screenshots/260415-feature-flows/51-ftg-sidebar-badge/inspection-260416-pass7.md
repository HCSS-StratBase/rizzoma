# 51-ftg-sidebar-badge — ✅ VERIFIED

**Category**: FtG
**Feature**: Topic list unread badges.
**Evidence type**: `CAPTURE`

## Evidence

Pass 3 two-user setup captured the topic list with the shared topic.

## Inspection (2026-04-16, pass 7)

Source: `/api/topics` embeds `unreadCount` and `totalCount` fields. Cache-Control: no-store prevents browser 304 replays (BUG #56 fix).

## Flow captured
1. `01-before_new.png`
2. `02-during_new.png`
3. `03-after_new.png`
