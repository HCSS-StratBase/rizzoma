from PIL import Image
import numpy as np

im = Image.open('/mnt/c/Rizzoma/screenshots/user_screenshot_main_crop.png').convert('RGB')
rgb = np.array(im)
h, w, _ = rgb.shape

# Let's inspect horizontal slices of 20px
print(f"Crop dimensions: width={w}, height={h}")

# Find all text rows
gray = im.convert('L')
arr = np.array(gray)

# We want to see:
# 1. Root blip text
# 2. Child blip text
# 3. Position of toolbars
# 4. Where the red arrow points
red = (rgb[:, :, 0] > 180) & (rgb[:, :, 1] < 70) & (rgb[:, :, 2] < 70)
y_red, x_red = np.where(red)
if len(y_red) > 0:
    print(f"Red arrow tip in crop: x={x_red[np.argmax(y_red)]}, y={np.max(y_red)}")

# Check what is directly around red arrow tip
tip_x = x_red[np.argmax(y_red)]
tip_y = np.max(y_red)
print(f"Examining region around ({tip_x}, {tip_y}):")
sub = rgb[tip_y-20:tip_y+30, tip_x-80:tip_x+80]
# Save sub
Image.fromarray(sub).save('/mnt/c/Rizzoma/screenshots/red_arrow_tip_exact.png')
print("Saved /mnt/c/Rizzoma/screenshots/red_arrow_tip_exact.png")
