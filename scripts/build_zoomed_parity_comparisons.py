#!/usr/bin/env python3
"""Build true zoomed component-level side-by-side comparison sheets.

Focuses directly on the isolated pixel-matched components:
1. Blip Read Toolbar (legacy vs current)
2. Blip Edit Ribbon (legacy vs current)
"""
from pathlib import Path
from PIL import Image, ImageDraw

REPO = Path('/mnt/c/Rizzoma')
SWEEP_DIR = sorted(REPO.glob('screenshots/*-feature-sweep'))[-1]
OUT = SWEEP_DIR / 'legacy-current-comparisons' / 'zoomed'
OUT.mkdir(parents=True, exist_ok=True)

# 1. Blip Read Toolbar
leg_read = Image.open('/tmp/legacy_exact_blip_menu.png') # width 265, height 31
curr_read = Image.open('/tmp/exact_curr_read_toolbar.png') # width 195, height 30

sheet1 = Image.new('RGB', (700, 180), 'white')
d1 = ImageDraw.Draw(sheet1)
d1.text((20, 15), 'LEGACY rizzoma.com — Blip Read Menu (width 265, height 31)', fill='#111')
sheet1.paste(leg_read, (20, 40))

d1.text((20, 95), 'CURRENT modern Rizzoma — Blip Read Menu (width 195, height 30)', fill='#111')
sheet1.paste(curr_read, (20, 120))
sheet1.save(OUT / 'zoomed_blip_menu_read.png')
print('✓ zoomed_blip_menu_read.png')

# 2. Blip Edit Ribbon
im63 = Image.open(REPO / 'screenshots/260714-legacy-reference-archive/063-root-edit-mode-ribbon.png')
leg_edit = im63.crop((605, 365, 960, 396)) # width 355, height 31
curr_edit = Image.open('/tmp/exact_curr_edit_toolbar_bar.png') # width 502, height 30

sheet2 = Image.new('RGB', (800, 180), 'white')
d2 = ImageDraw.Draw(sheet2)
d2.text((20, 15), 'LEGACY rizzoma.com — Blip Edit Ribbon (width 355, height 31)', fill='#111')
sheet2.paste(leg_edit, (20, 40))

d2.text((20, 95), 'CURRENT modern Rizzoma — Blip Edit Ribbon (width 502, height 30)', fill='#111')
sheet2.paste(curr_edit, (20, 120))
sheet2.save(OUT / 'zoomed_edit_ribbon.png')
print('✓ zoomed_edit_ribbon.png')

print(f'Done! Saved to {OUT}')
