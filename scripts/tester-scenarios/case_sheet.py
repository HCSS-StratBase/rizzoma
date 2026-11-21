#!/usr/bin/env python3
"""Contact sheets of the evidence screenshot of passing cases, for reading: case_sheet.py <results.json[,more]> <steps dir> <out dir> [case ids...]
   Picks the shot the ledger would link (last step shot of the case), 4 per sheet (2x2), captioned with case id and its last check labels."""
import sys, os, json
from PIL import Image, ImageDraw
res = {}
for f in sys.argv[1].split(','):
    for r in json.load(open(f))['results']: res[r['id']] = r
steps, out = sys.argv[2], sys.argv[3]; os.makedirs(out, exist_ok=True)
ids = sys.argv[4:] or sorted(i for i, r in res.items() if r['status'] == 'PASS' and r['family'] not in ('S', 'P'))
def shot(i):
    d = os.path.join(steps, 'react-' + i)
    if not os.path.isdir(d): return None
    fl = [os.path.join(d, f) for f in os.listdir(d) if f.endswith('.png')]  # newest by time: a folder can hold shots of older runs
    return max(fl, key=os.path.getmtime) if fl else None
items = [(i, shot(i)) for i in ids]; items = [(i, s) for i, s in items if s]
n = 0
for k in range(0, len(items), 4):
    grp = items[k:k + 4]; W = 683; H = 450 + 30
    sheet = Image.new('RGB', (W * 2, H * 2), (60, 60, 60)); d = ImageDraw.Draw(sheet)
    for j, (i, s) in enumerate(grp):
        im = Image.open(s).convert('RGB'); im = im.resize((W, int(im.height * W / im.width)))
        x, y = (j % 2) * W, (j // 2) * H
        sheet.paste(im.crop((0, 0, W, 450)), (x, y + 30)); d.rectangle((x, y, x + W, y + 28), fill=(255, 255, 255))
        d.text((x + 4, y + 4), f"{i}: {res[i]['title'][:100]}", fill=(0, 0, 0))
    name = os.path.join(out, f"sheet{n:02d}_" + '_'.join(i for i, _ in grp) + '.png'); sheet.save(name); print(name, [i for i, _ in grp]); n += 1
