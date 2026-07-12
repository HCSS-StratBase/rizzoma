# Sharing and Authorization

Status: implemented and locally verified on `codex/sharing-access-control-stack`, rebased onto merged hardening commit `2595d2de` whose tree matches source head `dda4d1d5` (2026-07-12); not merged or deployed.

## Persisted policy

Topic metadata stores three top-level fields:

- `shareLevel`: `private`, `link`, or `public`
- `allowComments`: grants authenticated non-participants comment/reply access on link/public topics
- `allowEdits`: grants authenticated non-participants editor access on link/public topics and canonically implies `allowComments`

New topics are created with an explicit `private / false / false` policy. Only the owner may change policy through `GET/PATCH /api/waves/:id/sharing`.

## Roles and capabilities

| Role | Read | Comment/reply | Edit | Manage policy/participants |
|---|---:|---:|---:|---:|
| Anonymous/outsider on private | No | No | No | No |
| Viewer | Yes | No | No | No |
| Commenter | Yes | Yes | No | No |
| Editor | Yes | Yes | Yes | No |
| Owner | Yes | Yes | Yes | Yes |

Explicit owner/participant roles take precedence over public policy. Anonymous link/public visitors are view-only. Authenticated outsiders gain commenter/editor rights only when the matching policy flag explicitly grants them.

The [centralized access resolver](../src/server/lib/access.ts) is used by topic and wave reads/listing, topic/blip writes, regular and inline comments, links, editor snapshots/updates/search, participants, invitations, unread endpoints, and Socket.IO joins/writes.

Socket identity comes from the shared Express session middleware; client-supplied user IDs and names are ignored. Policy and participant-role changes immediately re-evaluate connected sockets: removed readers leave all wave rooms, and demoted editors lose Yjs and awareness write authority without waiting for reconnect.

## Bounded legacy compatibility

Before this policy existed, topics were publicly readable and any authenticated user could attempt edits. Compatibility preserves only the former read behavior:

- a topic/wave metadata document with neither top-level `shareLevel` nor nested `sharing.shareLevel` is public **read-only**;
- a legacy wave with no modern metadata document is also public **read-only**;
- explicit malformed policy fails to `private`;
- missing metadata caused by a real database/transport error does not use the fallback; only an actual CouchDB 404 does;
- unaffiliated users never inherit comment, edit, manage, or socket-write rights from the legacy fallback.

The fallback is intentionally measurable and removable. Run the read-only inventory:

```bash
COUCHDB_URL=http://admin:password@127.0.0.1:5984 \
COUCHDB_DB=project_rizzoma \
npm run sharing:count-legacy
```

The command pages through this Mango condition without changing documents:

```json
{
  "type": { "$in": ["topic", "wave"] },
  "shareLevel": { "$exists": false },
  "sharing.shareLevel": { "$exists": false }
}
```

The read-only production inventory measured **26 total topic metadata documents: 0 explicit policies, 26 missing-policy legacy documents, and 0 malformed policies**. All 26 existing topics therefore use the public-read-only outsider fallback; their owners retain management. This branch deliberately does not infer or write policy for existing documents.

## Verification

- Full stacked Vitest: 67 files, 361 passed, 3 skipped, 0 failed.
- Focused authorization gates: 62 passed, covering the anonymous/outsider/viewer/commenter/editor/owner route matrix, legacy behavior, sharing persistence, alternate invitations, client fail-closed loading, session-backed Socket.IO identity spoofing, read-only viewer sync, and live editor demotion.
- Typecheck and production build passed; ESLint measured 0 errors / 6,684 warnings, and Vite transformed 3,298 modules. The warning backlog remains maintenance debt.
- Share and invite modals were visually inspected at 1280, 1366, 1440, and 1600 pixels. Evidence and measured modal bounds are in [`screenshots/260712-122218-sharing-access-ui/`](../screenshots/260712-122218-sharing-access-ui/).

## Remaining boundary

- The inventory is a read-only count; no policy-stamping migration or production policy mutation was performed.
- No deployment was performed. Public role/socket acceptance remains a post-merge gate after the managed-runtime base lands.
- Upload URLs and user-scoped mention/task notification documents retain their existing authorization model; this change secures topic/wave content paths but does not redesign storage-level attachment ACLs.
