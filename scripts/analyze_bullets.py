from PIL import Image
import numpy as np

def analyze(path, name):
    print(f"=== Analyzing {name} ({path}) ===")
    im = Image.open(path)
    gray = im.convert('L')
    arr = np.array(gray)
    h, w = arr.shape

    # Focus on the left edge where bullets appear (x: 0 to 60)
    left_strip = arr[:, :70]
    # Bullets are dark clusters (pixel < 120)
    bullet_mask = left_strip < 120

    # Project horizontally to find line y-ranges
    row_counts = np.sum(bullet_mask, axis=1)
    
    # Group active rows into lines
    lines = []
    in_line = False
    start_y = 0
    for y in range(h):
        if row_counts[y] > 0 and not in_line:
            in_line = True
            start_y = y
        elif row_counts[y] == 0 and in_line:
            in_line = False
            if y - start_y > 2: # filter 1-pixel noise
                lines.append((start_y, y))
    if in_line:
        lines.append((start_y, h))

    print(f"Detected {len(lines)} bullet glyph regions in left margin:")
    for idx, (y0, y1) in enumerate(lines):
        # find x-range
        glyph_box = bullet_mask[y0:y1, :]
        active_cols = np.where(np.sum(glyph_box, axis=0) > 0)[0]
        if len(active_cols) > 0:
            x0, x1 = active_cols[0], active_cols[-1]
            glyph_w = x1 - x0 + 1
            glyph_h = y1 - y0
            # Count connected components in this line to check for double bullets
            from scipy.ndimage import label
            labeled, num_features = label(glyph_box[:, x0:x1+1])
            print(f"  Line {idx+1}: y=[{y0}:{y1}] (height {glyph_h}px), x=[{x0}:{x1}] (width {glyph_w}px), distinct glyphs: {num_features}")

analyze('/mnt/c/Rizzoma/screenshots/1_crop_root_bullets.png', 'Root Blip Read Mode')
analyze('/mnt/c/Rizzoma/screenshots/4_crop_child_expanded.png', 'Child Blip Read Mode')
