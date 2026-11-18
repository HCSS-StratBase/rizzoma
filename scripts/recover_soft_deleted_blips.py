#!/usr/bin/env python3
"""Recover soft-deleted blips of ONE topic (CouchDB).

A blip delete in the app is a soft delete: the document stays, with
`deleted: true`, `deletedAt`, `deletedBy`, and its content intact. The server
delete also cascades to every descendant. This script LISTS those blips and,
only when told to (--apply), clears the deleted flag again.

    # 1. look (read-only; the default)
    python3 scripts/recover_soft_deleted_blips.py --topic <waveId>

    # 2. restore exactly what you chose, after a backup file has been written
    python3 scripts/recover_soft_deleted_blips.py --topic <waveId> --apply \
        [--ids a,b,c | --deleted-from MS --deleted-to MS]

What --apply does, and nothing else:
  * writes a JSON backup of every document it is about to change (the blips and the
    parent documents whose marker it may restore) BEFORE the first write;
  * removes `deleted`, `deletedAt`, `deletedBy` from each chosen blip;
  * if the blip has an anchor (`anchorPosition` is a number) and its parent's stored
    HTML no longer contains the blip id, puts the [+] marker back at the end of the
    parent's last paragraph (the parent is the topic document when `parentId` is null).
Content is never edited. A revision conflict (someone saved meanwhile) stops the run
with a message; nothing is retried blindly.

Safety: by default it refuses a CouchDB that is not on this machine. Pointing it at the
production database needs the explicit flag --production-approved, which only SDS decides.

Connection: --couch URL or the COUCHDB_URL environment variable (user:password@ in the
URL is used for basic auth and is never printed). Database: --db (default project_rizzoma).
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1", "0.0.0.0"}


def plain(html: str, limit: int = 40) -> str:
    html = re.sub(r'<span class="blip-thread-host"[\s\S]*?</span></span>', "", html or "")
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def marker_html(blip_id: str) -> str:
    return (
        '<span class="blip-thread-host" contenteditable="false">'
        f'<span data-blip-thread="{blip_id}" class="blip-thread-marker">+</span>'
        f'<span class="inline-child-portal" data-portal-child="{blip_id}"></span></span>'
    )


def insert_marker(parent_html: str, blip_id: str) -> str:
    """Put the marker before the last </p>; append it when the parent has no paragraph."""
    marker = marker_html(blip_id)
    idx = (parent_html or "").rfind("</p>")
    if idx == -1:
        return (parent_html or "") + marker
    return parent_html[:idx] + marker + parent_html[idx:]


class Couch:
    def __init__(self, url: str, db: str):
        parts = urllib.parse.urlsplit(url)
        self.host = parts.hostname or ""
        netloc = parts.hostname or ""
        if parts.port:
            netloc += f":{parts.port}"
        self.base = f"{parts.scheme}://{netloc}{parts.path.rstrip('/')}"
        self.db = db
        self.auth = None
        if parts.username is not None:
            raw = f"{urllib.parse.unquote(parts.username)}:{urllib.parse.unquote(parts.password or '')}"
            self.auth = "Basic " + base64.b64encode(raw.encode()).decode()

    def request(self, method: str, path: str, body=None):
        req = urllib.request.Request(f"{self.base}/{urllib.parse.quote(self.db)}{path}", method=method)
        req.add_header("content-type", "application/json")
        if self.auth:
            req.add_header("authorization", self.auth)
        data = json.dumps(body).encode() if body is not None else None
        try:
            with urllib.request.urlopen(req, data=data, timeout=30) as resp:
                return resp.status, json.loads(resp.read() or b"null")
        except urllib.error.HTTPError as err:
            try:
                payload = json.loads(err.read() or b"null")
            except Exception:
                payload = None
            return err.code, payload

    def get(self, doc_id: str):
        status, doc = self.request("GET", "/" + urllib.parse.quote(doc_id, safe=""))
        return doc if status == 200 else None

    def put(self, doc: dict):
        return self.request("PUT", "/" + urllib.parse.quote(doc["_id"], safe=""), doc)

    def find(self, selector: dict, page: int = 500):
        out, skip = [], 0
        while True:
            status, res = self.request("POST", "/_find", {"selector": selector, "limit": page, "skip": skip})
            if status != 200 or not res:
                raise SystemExit(f"CouchDB _find failed: HTTP {status} {res}")
            docs = res.get("docs", [])
            out.extend(docs)
            if len(docs) < page:
                return out
            skip += page


def iso(ms) -> str:
    try:
        return datetime.fromtimestamp(int(ms) / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    except Exception:
        return "-"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--topic", required=True, help="topic (wave) id")
    ap.add_argument("--couch", default=os.environ.get("COUCHDB_URL"), help="CouchDB URL (default: $COUCHDB_URL)")
    ap.add_argument("--db", default=os.environ.get("COUCHDB_DB", "project_rizzoma"))
    ap.add_argument("--apply", action="store_true", help="write changes (default: list only)")
    ap.add_argument("--ids", help="comma-separated blip ids to restore (default: every listed blip)")
    ap.add_argument("--deleted-from", type=int, help="only blips with deletedAt >= this epoch-ms value")
    ap.add_argument("--deleted-to", type=int, help="only blips with deletedAt <= this epoch-ms value")
    ap.add_argument("--backup-dir", default=".", help="where the JSON backup is written before --apply changes anything")
    ap.add_argument("--production-approved", action="store_true", help="allow a CouchDB that is not on this machine")
    args = ap.parse_args(argv)

    if not args.couch:
        print("no CouchDB URL: pass --couch or set COUCHDB_URL", file=sys.stderr)
        return 2
    couch = Couch(args.couch, args.db)
    if couch.host not in LOCAL_HOSTS and not args.production_approved:
        print(f"refusing: {couch.host} is not this machine. Production recovery needs --production-approved "
              "and SDS's decision.", file=sys.stderr)
        return 2

    deleted = couch.find({"type": "blip", "waveId": args.topic, "deleted": True})
    if args.deleted_from is not None:
        deleted = [d for d in deleted if int(d.get("deletedAt") or 0) >= args.deleted_from]
    if args.deleted_to is not None:
        deleted = [d for d in deleted if int(d.get("deletedAt") or 0) <= args.deleted_to]
    if args.ids:
        wanted = {x.strip() for x in args.ids.split(",") if x.strip()}
        deleted = [d for d in deleted if d["_id"] in wanted or d["_id"].split(":")[-1] in wanted]
    deleted.sort(key=lambda d: (int(d.get("deletedAt") or 0), d["_id"]))

    parents: dict[str, dict | None] = {}

    def parent_doc(blip: dict):
        pid = blip.get("parentId") or args.topic
        if pid not in parents:
            parents[pid] = couch.get(pid)
        return parents[pid]

    rows = []
    for d in deleted:
        parent = parent_doc(d)
        html = (parent or {}).get("content") or ""
        anchored = isinstance(d.get("anchorPosition"), (int, float))
        has_marker = d["_id"] in html
        rows.append({
            "id": d["_id"],
            "parentId": d.get("parentId"),
            "title": plain(d.get("content", "")),
            "sha256": hashlib.sha256((d.get("content") or "").encode()).hexdigest()[:16],
            "deletedAt": iso(d.get("deletedAt")),
            "deletedBy": str(d.get("deletedBy") or "-")[-12:],
            "needs_marker": anchored and not has_marker,
        })

    print(f"topic {args.topic}: {len(rows)} soft-deleted blip(s)")
    for r in rows:
        print(f"  {r['id']}  parent={str(r['parentId'] or '(topic)')[-12:]}  deleted={r['deletedAt']}  "
              f"by=...{r['deletedBy']}  sha={r['sha256']}  marker_to_restore={'yes' if r['needs_marker'] else 'no'}  "
              f"'{r['title']}'")
    if not args.apply:
        print("list only: nothing was changed. Add --apply to restore the blips listed above.")
        return 0
    if not rows:
        print("nothing to restore")
        return 0

    # 1. backup, before any write
    backup = {
        "createdAt": iso(time.time() * 1000), "couchHost": couch.host, "db": args.db, "topic": args.topic,
        "blips": deleted,
        "parents": {k: v for k, v in parents.items() if v is not None},
    }
    os.makedirs(args.backup_dir, exist_ok=True)
    path = os.path.join(args.backup_dir, f"recover_backup_{args.topic}_{int(time.time())}.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(backup, fh, ensure_ascii=False, indent=1)
    print(f"backup written: {path}")

    # 2. markers first (parent documents), then the blips
    restored_markers = 0
    for d in deleted:
        html_parent = parent_doc(d)
        if not html_parent:
            print(f"  parent of {d['_id']} not found: blip restored without a marker")
            continue
        anchored = isinstance(d.get("anchorPosition"), (int, float))
        if anchored and d["_id"] not in (html_parent.get("content") or ""):
            html_parent["content"] = insert_marker(html_parent.get("content") or "", d["_id"])
            html_parent["_marker_dirty"] = True
            restored_markers += 1
    for pid, p in parents.items():
        if p and p.pop("_marker_dirty", False):
            status, res = couch.put(p)
            if status not in (200, 201):
                print(f"stopped: could not save parent {pid}: HTTP {status} {res}. Nothing else was written; backup is intact.",
                      file=sys.stderr)
                return 1
            p["_rev"] = res.get("rev", p.get("_rev"))
    restored = 0
    for d in deleted:
        d.pop("deleted", None)
        d.pop("deletedAt", None)
        d.pop("deletedBy", None)
        status, res = couch.put(d)
        if status not in (200, 201):
            print(f"stopped at {d['_id']}: HTTP {status} {res}. {restored} restored so far; backup is intact.", file=sys.stderr)
            return 1
        restored += 1
    print(f"restored {restored} blip(s), {restored_markers} marker(s) put back")
    return 0


if __name__ == "__main__":
    sys.exit(main())
