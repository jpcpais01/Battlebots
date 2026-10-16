# A menu screenshot as a phone shows it, from tests/ui_shot.gd's three captures of one still frame.
#   python3 godot/tools/shots/ui_srgb.py <prefix>_paused   ->  <prefix>_paused.png rewritten
# The container's GL renderer hands back the 3D linear (srgb.py encodes it) but the 2D as drawn,
# already sRGB. With F the frame, B the 3D alone and D the 2D over black, F = B * (1 - a) + D, so
# the true frame is srgb(B) * (1 - a) + D, with (1 - a) = (F - D) / B.
import sys
import numpy as np
from PIL import Image

base = sys.argv[1]
F = np.asarray(Image.open(base + '.png').convert('RGB'), dtype=np.float64)
B = np.asarray(Image.open(base + '_3d.png').convert('RGB'), dtype=np.float64)
D = np.asarray(Image.open(base + '_2d.png').convert('RGB'), dtype=np.float64)
x = B / 255.0
enc = np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055) * 255.0
# how much of the 3D shows through, from the brightest channel (the most reliable)
k = np.clip((F - D).max(axis=2) / np.maximum(B.max(axis=2), 1.0), 0.0, 1.0)[..., None]
out = np.clip(enc * k + D, 0, 255).round().astype(np.uint8)
Image.fromarray(out).save(base + '.png')
