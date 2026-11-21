#!/usr/bin/env python3
"""Record a reading for every ledger row a case covers: review_case.py <results.json[,more]> <case id> <WORKS|PARTIAL|BROKEN> "<note>" [<sheet path>]"""
import sys, json, os, subprocess
res = {}
for f in sys.argv[1].split(','):
    for r in json.load(open(f))['results']: res[r['id']] = r
cid, verdict, note = sys.argv[2], sys.argv[3], sys.argv[4]
rows = res[cid].get('rows') or []
here = os.path.dirname(os.path.abspath(__file__))
for row in rows:
    subprocess.run([sys.executable, os.path.join(here, 'review.py'), row, verdict, f'[case {cid}] ' + note] + sys.argv[5:], stdout=subprocess.DEVNULL, env={**os.environ, 'MERGE': '1'})
print(cid, verdict, len(rows), 'rows')
