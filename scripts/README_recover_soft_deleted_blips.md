# recover_soft_deleted_blips.py

Brings back soft-deleted blips of one topic. Written for the 18 Nov 2026 tester topic, where
a delete of "test 1" soft-deleted 8 blips (content intact, `deleted: true`) in one cascade.

**It has not been run against production. SDS decides whether and when.**

## What a delete leaves behind
The app never removes a blip document. A delete sets `deleted: true`, `deletedAt`, `deletedBy`
on the blip and on every descendant. Everything else, including the content, stays.

## Use
```bash
# list (read-only, the default): id, parent, deletion time, who, content hash, title
python3 scripts/recover_soft_deleted_blips.py --topic <waveId>

# restore only what you choose
python3 scripts/recover_soft_deleted_blips.py --topic <waveId> --apply --backup-dir ./backup \
    --ids <blipId>,<blipId>            # or --deleted-from <ms> --deleted-to <ms>
```
Connection: `--couch URL` or `COUCHDB_URL` (credentials in the URL are used, never printed);
`--db` defaults to `project_rizzoma`.

## What --apply does
1. Writes `recover_backup_<topic>_<time>.json` (every blip and parent document it may change,
   in their current state) **before the first write**.
2. If a restored blip is anchored (`anchorPosition` is a number) and its parent's stored HTML no
   longer holds the blip id, puts the `[+]` marker back before the parent's last `</p>`
   (the parent is the topic document when `parentId` is null).
3. Removes `deleted`, `deletedAt`, `deletedBy` from each chosen blip. Content is never edited.
A revision conflict or any failed write stops the run and says how far it got.

## Safety
* Refuses a CouchDB that is not on this machine unless `--production-approved` is given.
* List-only unless `--apply`.
* Restoring a parent without its children, or a child under a still-deleted parent, is possible:
  restore the whole cascade you want (list shows the parent of each).

## Test
`COUCHDB_URL=http://127.0.0.1:<port> python3 scripts/test_recover_soft_deleted_blips.py` builds a
throwaway database, seeds a topic with deleted children and a lost marker, checks list-only,
the remote-host refusal, `--ids`, backup-before-write, marker restore without duplicates and the
deletion-time window, then drops the database. Run on 18 Nov 2026 against a scratch
pouchdb-server (5 of 5 passed); pouchdb-server is not CouchDB itself, so the `_find` behaviour
on the real server was not exercised.
