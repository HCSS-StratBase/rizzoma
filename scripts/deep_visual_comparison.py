#!/usr/bin/env python3
"""
Deep Visual Parity Comparison between Real Legacy Rizzoma and Modern Rizzoma.
Evaluates 8 Interface Zones:
  Z1: Left Navigation Strip (x: 0..79, y: 0..1226)
  Z2: Topics List Header / Search (x: 79..560, y: 0..50)
  Z3: Topic List Rows (x: 79..560, y: 50..1041)
  Z4: Wave Header Collaboration Toolbar (x: 560..1580, y: 0..50)
  Z5: Topic Title & Meta (x: 560..1580, y: 50..150)
  Z6: Folded BLB Outlines & Prose (x: 560..1580, y: 150..1226)
  Z7: Bottom Shortcuts & Logo Box (x: 79..560, y: 1041..1226)
  Z8: Right Tools Panel (x: 1580..1679, y: 0..1226)
"""

import os
import sys
import numpy as np
from PIL import Image

ZONES = {
    "Z1_LeftNavigation": (0, 0, 118, 1226),
    "Z2_TopicsSearchHeader": (118, 0, 570, 75),
    "Z3_TopicListRows": (118, 75, 570, 950),
    "Z4_WaveHeader": (570, 0, 1581, 75),
    "Z5_TopicTitle": (570, 75, 1581, 180),
    "Z6_BLBOutlinesProse": (570, 180, 1581, 1226),
    "Z7_BottomShortcutsLogo": (118, 950, 570, 1226),
    "Z8_RightToolsRail": (1581, 0, 1679, 1226),
}

def analyze_parity(legacy_path, modern_path, output_dir="/tmp/deep_parity"):
    os.makedirs(output_dir, exist_ok=True)
    legacy = Image.open(legacy_path).convert('RGB')
    modern = Image.open(modern_path).convert('RGB')

    # Ensure same dimensions
    if legacy.size != modern.size:
        modern = modern.resize(legacy.size, Image.Resampling.LANCZOS)

    leg_arr = np.array(legacy, dtype=float)
    mod_arr = np.array(modern, dtype=float)

    total_diff = np.abs(leg_arr - mod_arr)
    # Binary divergence: pixels differing by more than 25 in any RGB channel
    divergent_pixels = np.any(total_diff > 25, axis=2)
    overall_divergence = np.mean(divergent_pixels) * 100.0

    print("=" * 60)
    print("EXTREMELY DEEP VISUAL PARITY AUDIT")
    print("=" * 60)
    print(f"Legacy image: {legacy_path} ({legacy.size})")
    print(f"Modern image: {modern_path} ({modern.size})")
    print(f"Overall Full-Canvas Pixel Divergence: {overall_divergence:.2f}%\n")

    zone_results = {}
    for zone_name, (x1, y1, x2, y2) in ZONES.items():
        z_leg = leg_arr[y1:y2, x1:x2]
        z_mod = mod_arr[y1:y2, x1:x2]
        z_div = divergent_pixels[y1:y2, x1:x2]
        div_pct = np.mean(z_div) * 100.0

        # Mean Absolute Error (MAE)
        mae = np.mean(np.abs(z_leg - z_mod))
        zone_results[zone_name] = {
            "divergence_pct": div_pct,
            "mae": mae,
            "coords": (x1, y1, x2, y2)
        }
        print(f"[{zone_name}] Divergence: {div_pct:5.2f}% | MAE: {mae:5.2f} | BBox: ({x1},{y1}) -> ({x2},{y2})")

        # Save side-by-side crop
        crop_leg = legacy.crop((x1, y1, x2, y2))
        crop_mod = modern.crop((x1, y1, x2, y2))
        w = crop_leg.width
        h = crop_leg.height
        sbs = Image.new('RGB', (w * 2 + 10, h), (200, 200, 200))
        sbs.paste(crop_leg, (0, 0))
        sbs.paste(crop_mod, (w + 10, 0))
        sbs.save(os.path.join(output_dir, f"{zone_name}_comparison.png"))

    # Save full diff heat map
    diff_vis = np.zeros_like(leg_arr, dtype=np.uint8)
    diff_vis[divergent_pixels] = [255, 0, 0] # Red where divergent
    diff_vis[~divergent_pixels] = (leg_arr[~divergent_pixels] * 0.4 + 100).astype(np.uint8)
    Image.fromarray(diff_vis).save(os.path.join(output_dir, "full_diff_map.png"))
    print("\nVisual comparison sheets saved to:", output_dir)
    print("=" * 60)
    return overall_divergence, zone_results

if __name__ == "__main__":
    leg = sys.argv[1] if len(sys.argv) > 1 else "/mnt/c/Users/sdspi/Downloads/2026-11-07_02-56-39.png"
    mod = sys.argv[2] if len(sys.argv) > 2 else "/mnt/c/Users/sdspi/Downloads/2026-11-07_02-58-08.png"
    analyze_parity(leg, mod)
