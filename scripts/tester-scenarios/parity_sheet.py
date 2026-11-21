#!/usr/bin/env python3
"""Stack several composites into one image for reading: parity_sheet.py <evidence dir> <out.png> key [key ...]"""
import sys, os
from PIL import Image
ev, out, keys = sys.argv[1], sys.argv[2], sys.argv[3:]
ims = []
for k in keys:
    p = os.path.join(ev, 'parity', k + '-compare.png')
    if os.path.exists(p): ims.append(Image.open(p).convert('RGB'))
if os.environ.get('HSHEET'):
    H = max(i.height for i in ims); W = sum(i.width for i in ims) + 6 * len(ims)
    s = Image.new('RGB', (W, H), (90, 90, 90)); x = 0
    for i in ims: s.paste(i, (x, 0)); x += i.width + 6
else:
    W = max(i.width for i in ims); H = sum(i.height for i in ims) + 6 * len(ims)
    s = Image.new('RGB', (W, H), (90, 90, 90)); y = 0
    for i in ims: s.paste(i, (0, y)); y += i.height + 6
s.save(out); print(out, s.size)
