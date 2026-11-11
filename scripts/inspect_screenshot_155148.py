from PIL import Image
import numpy as np

im = Image.open('/mnt/c/Users/sdspi/Downloads/2026-11-07_15-51-48.png').convert('RGB')
rgb = np.array(im)
h, w, _ = rgb.shape
print(f"Image shape: {w}x{h}")

# Find all blue ribbons (#4ea0f1 -> r ~ 78, g ~ 160, b ~ 241)
blue = (np.abs(rgb[:, :, 0] - 78) < 25) & (np.abs(rgb[:, :, 1] - 160) < 25) & (np.abs(rgb[:, :, 2] - 241) < 25)
print(f"Total blue toolbar pixels: {blue.sum()}")
if blue.sum() > 0:
    from scipy.ndimage import label
    labeled, num_features = label(blue)
    print(f"Found {num_features} blue toolbar regions:")
    for feat in range(1, num_features + 1):
        y_idxs, x_idxs = np.where(labeled == feat)
        if len(y_idxs) > 100:
            print(f"  Toolbar #{feat}: x=[{x_idxs.min()}:{x_idxs.max()}], y=[{y_idxs.min()}:{y_idxs.max()}], w={x_idxs.max()-x_idxs.min()+1}, h={y_idxs.max()-y_idxs.min()+1}")

# Red annotations
red = (rgb[:, :, 0] > 180) & (rgb[:, :, 1] < 70) & (rgb[:, :, 2] < 70)
print(f"Total red annotation pixels: {red.sum()}")
if red.sum() > 0:
    y_idxs, x_idxs = np.where(red)
    print(f"Red annotation bbox: x=[{x_idxs.min()}:{x_idxs.max()}], y=[{y_idxs.min()}:{y_idxs.max()}]")
