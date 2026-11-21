#!/usr/bin/env python3
"""Side-by-side composites for the parity rows: legacy reference screenshot (left) next to the modernized screen (right).
   parity_compose.py <evidence dir> [key ...]   reads <evidence>/parity/<key>-ours.png, writes <key>-compare.png"""
import sys, glob, os
from PIL import Image, ImageDraw
ev = sys.argv[1]
legacy = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'screenshots', '260714-legacy-reference-archive')
keys = sys.argv[2:] or sorted(os.path.basename(f)[:-9] for f in glob.glob(os.path.join(ev, 'parity', '*-ours.png')))
def fit(im, h):
    if im.height > h: im = im.resize((max(1, int(im.width * h / im.height)), h), Image.LANCZOS)
    return im
for k in keys:
    lp = os.path.join(legacy, k + '.png'); op = os.path.join(ev, 'parity', k + '-ours.png')
    if not (os.path.exists(lp) and os.path.exists(op)): print('skip', k); continue
    a = Image.open(lp).convert('RGB'); b = Image.open(op).convert('RGB')
    # shrink both to the same scale so the comparison is fair: target total width 1700
    H = min(900, max(a.height, b.height))
    s = min(1.0, 1700 / (a.width + b.width + 20))
    a = a.resize((max(1, int(a.width * s)), max(1, int(a.height * s))), Image.LANCZOS); b = b.resize((max(1, int(b.width * s)), max(1, int(b.height * s))), Image.LANCZOS)
    h = max(a.height, b.height) + 22
    out = Image.new('RGB', (a.width + b.width + 20, h), (255, 255, 255)); d = ImageDraw.Draw(out)
    miss = os.path.exists(os.path.join(ev, 'parity', k + '.missing'))
    d.text((4, 4), 'ORIGINAL ' + k, fill=(160, 0, 0)); d.text((a.width + 24, 4), 'MODERNIZED' + ('   *** ELEMENT NOT FOUND, FULL PAGE SHOWN ***' if miss else ''), fill=(200, 0, 0) if miss else (0, 100, 0))
    out.paste(a, (0, 22)); out.paste(b, (a.width + 20, 22))
    out.save(os.path.join(ev, 'parity', k + '-compare.png')); print('ok', k, out.size)
