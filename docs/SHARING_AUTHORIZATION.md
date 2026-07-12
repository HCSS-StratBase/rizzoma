# Sharing and Authorization

Status: required integration contract. PR #66 implements and locally verifies the centralized sharing resolver on `codex/sharing-access-control-stack`; this isolated `release/preintegration-offline-upload` branch does **not** contain that resolver and must not deploy standalone. The attachment and offline slices below are being preintegrated only so their direct conflicts can be removed before PR #66 lands.

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

## Attachment lifecycle

Attachments use the same effective topic role as their containing blip:

- `POST /api/uploads` requires an authenticated session plus a canonical `blipId`. The server resolves the blip's stored `waveId` and requires edit access; a client-supplied mismatching wave claim is rejected.
- Successful local uploads create an opaque `upload:<uuid>` CouchDB metadata document that binds the storage key, blip, wave, uploader, original name, MIME type, size, and creation time. Blip HTML keeps the stable `/uploads/<opaque-id>` URL.
- `GET /uploads/:id` loads metadata and resolves current read access on every request. Logout, participant removal, or making the topic private therefore revokes a previously known URL without changing the HTML.
- Authorized responses are streamed with `Cache-Control: private, no-store`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`, and attachment disposition for non-raster content. The upload directory is not mounted with `express.static`.
- Upload mutation requires CSRF. In production, malware scanning is mandatory and only an explicit ClamAV `OK` verdict is accepted; a missing scanner, timeout, connection failure, empty reply, malformed reply, or malware verdict fails closed before bytes are written.
- `/api/health` treats the production scanner as a readiness dependency and requires an explicit clamd `PONG`; a candidate cannot report green while every upload would fail closed.
- The stock `app-prod` Compose profile sets `CLAMAV_HOST=clamav`, waits for the scanner health check, and persists both the signature database and ACL-backed attachment bytes in named volumes; the managed systemd topology uses the equivalent loopback scanner plus `/var/lib/rizzoma/uploads` contract.
- Active same-origin document formats are not accepted as uploads: SVG and HTML/JavaScript/XML-style filenames are rejected, safe raster formats are signature/MIME bounded, and the private storage suffix is derived from the admitted type rather than the original filename. Non-raster responses remain forced downloads with `nosniff`.
- S3/MinIO fails closed with `upload_storage_acl_unavailable`. Public object URLs and pre-signed URLs are not accepted because they remain usable after a role is revoked; object storage may return only after its bytes are proxied through the same per-request ACL.

The read-only production inventory measured zero upload files and zero bytes in all known legacy, active, managed-release, and `/var/lib/rizzoma/uploads` paths. No legacy URL or metadata migration is required for the first ACL-backed deployment.

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

## Source-slice verification (not a standalone preintegration verdict)

- PR #66's source slice reported full stacked Vitest at 67 files, 361 passed, 3 skipped, 0 failed before this preintegration branch was assembled.
- Focused authorization gates: 62 passed, covering the anonymous/outsider/viewer/commenter/editor/owner route matrix, legacy behavior, sharing persistence, alternate invitations, client fail-closed loading, session-backed Socket.IO identity spoofing, read-only viewer sync, and live editor demotion.
- Stacked upload/access gates: 70 passed across the 62 role-policy checks and 14 upload tests, with overlap between suites. Upload coverage includes anonymous denial, non-editor denial, canonical wave binding, wave-claim mismatch, metadata-write cleanup, S3 fail-closed behavior, private download, non-cacheable streaming, and immediate denial of the same URL after participant revocation.
- Typecheck and production build passed; ESLint measured 0 errors / 6,684 warnings, and Vite transformed 3,298 modules. The warning backlog remains maintenance debt.
- Share and invite modals were visually inspected at 1280, 1366, 1440, and 1600 pixels. Evidence and measured modal bounds are in [`screenshots/260712-122218-sharing-access-ui/`](../screenshots/260712-122218-sharing-access-ui/).

## Remaining boundary

- The inventory is a read-only count; no policy-stamping migration or production policy mutation was performed.
- No deployment was performed. This preintegration branch is expected to fail typecheck or focused upload tests until PR #66's access APIs are integrated; public role/socket acceptance remains a post-merge gate after the managed-runtime base lands.
- The service-worker cache purge/network-only rule for `/uploads/*` lands in the sharing/cache integration branch. This isolated slice deliberately does not edit `public/sw.js`; it must not deploy without that companion cache change because a previously cached response could otherwise survive logout.
- User-scoped mention/task notification documents are handled in the sharing route-ACL slice rather than this attachment patch.
