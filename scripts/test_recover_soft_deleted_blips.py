#!/usr/bin/env python3
"""Test of recover_soft_deleted_blips.py against a THROWAWAY database on a scratch CouchDB.

    COUCHDB_URL=http://127.0.0.1:5995 python3 scripts/test_recover_soft_deleted_blips.py

Creates a database named recover_test_<timestamp>, seeds one topic with a parent blip and
three children (two deleted by one cascade, one marker lost), exercises list-only, the
refusal of a non-local host, --ids, --apply with backup, and drops the database at the end.
Never point COUCHDB_URL at production.
"""
import json, os, subprocess, sys, tempfile, time, unittest, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "recover_soft_deleted_blips.py")
sys.path.insert(0, HERE)
import recover_soft_deleted_blips as rec  # noqa: E402

URL = os.environ.get("COUCHDB_URL", "http://127.0.0.1:5995")
DB = f"recover_test_{int(time.time())}"
TOPIC = "topic-1"


def raw(method, path, body=None):
    req = urllib.request.Request(f"{URL}/{path}", method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return {"error": e.code}


def run(*args):
    env = dict(os.environ, COUCHDB_URL=URL)
    return subprocess.run([sys.executable, SCRIPT, "--topic", TOPIC, "--db", DB, *args], capture_output=True, text=True, env=env)


class RecoverTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        raw("PUT", DB)
        marker = rec.marker_html
        cls.p = f"{TOPIC}:bp"
        docs = [
            {"_id": TOPIC, "type": "topic", "content": "<h1>T</h1>"},
            {"_id": cls.p, "type": "blip", "waveId": TOPIC, "parentId": None, "content": f"<ul><li><p>test 1{marker(TOPIC + ':b1')}{marker(TOPIC + ':b2')}</p></li></ul>"},
            {"_id": f"{TOPIC}:b1", "type": "blip", "waveId": TOPIC, "parentId": cls.p, "anchorPosition": 0, "content": "<ul><li><p>Liliia</p></li></ul>", "deleted": True, "deletedAt": 1000, "deletedBy": "u1"},
            {"_id": f"{TOPIC}:b2", "type": "blip", "waveId": TOPIC, "parentId": cls.p, "anchorPosition": 0, "content": "<ul><li><p>Hryhorii</p></li></ul>", "deleted": True, "deletedAt": 1000, "deletedBy": "u1"},
            {"_id": f"{TOPIC}:b3", "type": "blip", "waveId": TOPIC, "parentId": cls.p, "anchorPosition": 0, "content": "<ul><li><p>third</p></li></ul>", "deleted": True, "deletedAt": 5000, "deletedBy": "u2"},
            {"_id": f"{TOPIC}:keep", "type": "blip", "waveId": TOPIC, "parentId": cls.p, "content": "<ul><li><p>alive</p></li></ul>"},
        ]
        for d in docs:
            res = raw("PUT", f"{DB}/{urllib.parse.quote(d['_id'], safe='')}", d)
            assert res.get("ok"), res

    @classmethod
    def tearDownClass(cls):
        raw("DELETE", DB)

    def doc(self, i):
        return raw("GET", f"{DB}/{urllib.parse.quote(i, safe='')}")

    def test_1_list_only_changes_nothing(self):
        r = run()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("3 soft-deleted blip(s)", r.stdout)
        self.assertIn("marker_to_restore=yes", r.stdout)          # b3's marker is not in the parent
        self.assertIn("'Liliia'", r.stdout)
        self.assertTrue(self.doc(f"{TOPIC}:b1").get("deleted"))
        self.assertNotIn("recover_backup", "".join(os.listdir(".")))

    def test_2_refuses_a_remote_host(self):
        env = dict(os.environ, COUCHDB_URL="http://203.0.113.9:5984")
        r = subprocess.run([sys.executable, SCRIPT, "--topic", TOPIC], capture_output=True, text=True, env=env)
        self.assertEqual(r.returncode, 2)
        self.assertIn("not this machine", r.stderr)

    def test_3_apply_with_ids_restores_only_those_and_backs_up_first(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = run("--apply", "--ids", f"{TOPIC}:b3", "--backup-dir", tmp)
            self.assertEqual(r.returncode, 0, r.stderr)
            files = os.listdir(tmp)
            self.assertEqual(len(files), 1)
            backup = json.load(open(os.path.join(tmp, files[0])))
            self.assertEqual([b["_id"] for b in backup["blips"]], [f"{TOPIC}:b3"])
            self.assertTrue(backup["blips"][0]["deleted"])              # the backup holds the BEFORE state
            self.assertIn(self.p, backup["parents"])
        b3 = self.doc(f"{TOPIC}:b3")
        self.assertNotIn("deleted", b3); self.assertNotIn("deletedAt", b3); self.assertNotIn("deletedBy", b3)
        self.assertEqual(b3["content"], "<ul><li><p>third</p></li></ul>")  # content untouched
        self.assertIn(f"{TOPIC}:b3", self.doc(self.p)["content"])           # marker put back
        self.assertTrue(self.doc(f"{TOPIC}:b1").get("deleted"))             # others untouched

    def test_4_apply_all_then_nothing_left(self):
        with tempfile.TemporaryDirectory() as tmp:
            r = run("--apply", "--backup-dir", tmp)
            self.assertEqual(r.returncode, 0, r.stderr)
        for i in ("b1", "b2", "b3"):
            self.assertNotIn("deleted", self.doc(f"{TOPIC}:{i}"))
        parent = self.doc(self.p)["content"]
        self.assertEqual(parent.count("blip-thread-marker"), 3)             # b1, b2 already there; b3 added once, no duplicates
        self.assertEqual(self.doc(f"{TOPIC}:keep")["content"], "<ul><li><p>alive</p></li></ul>")
        self.assertIn("0 soft-deleted blip(s)", run().stdout)

    def test_5_deleted_at_window(self):
        raw("PUT", f"{DB}/x", {})  # no-op noise
        d = self.doc(f"{TOPIC}:b1"); d["deleted"] = True; d["deletedAt"] = 1000; d["deletedBy"] = "u1"
        raw("PUT", f"{DB}/{urllib.parse.quote(d['_id'], safe='')}", d)
        r = run("--deleted-from", "900", "--deleted-to", "1100")
        self.assertIn("1 soft-deleted blip(s)", r.stdout)
        raw("PUT", f"{DB}/{urllib.parse.quote(d['_id'], safe='')}", dict(self.doc(d["_id"]), deleted=None))


if __name__ == "__main__":
    import urllib.parse, urllib.error  # noqa: F401
    unittest.main(verbosity=2)
