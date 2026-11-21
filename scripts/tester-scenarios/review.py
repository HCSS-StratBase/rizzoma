#!/usr/bin/env python3
"""Record a reading of one screenshot: review.py <row id> <WORKS|PARTIAL|BROKEN> "<what the screenshot shows>" [<screenshot path>]
   Writes scripts/tester-scenarios/reviews.json (row id -> verdict, note, shot, by, at). A WORKS row in the ledger needs an entry."""
import sys, json, os, datetime
f = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'reviews.json')
d = json.load(open(f)) if os.path.exists(f) else {}
row, verdict, note = sys.argv[1], sys.argv[2], sys.argv[3]
if verdict not in ('WORKS', 'PARTIAL', 'BROKEN'): sys.exit('verdict must be WORKS, PARTIAL or BROKEN')
rank = {'BROKEN': 0, 'PARTIAL': 1, 'WORKS': 2}
if os.environ.get('MERGE') and row in d:
    old = d[row]
    if rank[old['verdict']] < rank[verdict]: verdict = old['verdict']
    note = (old['note'] + ' || ' + note)[:600] if old['note'] not in note else note
d[row] = {'verdict': verdict, 'note': note, 'shot': sys.argv[4] if len(sys.argv) > 4 else '', 'by': 'agent (Claude Sonnet 5.5) after reading the image', 'at': datetime.datetime.now().isoformat(timespec='minutes')}
json.dump(d, open(f, 'w'), indent=1, ensure_ascii=False, sort_keys=True)
print('recorded', row, verdict)
