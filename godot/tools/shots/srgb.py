# The container's GL renderer hands back linear pixels: encode them to sRGB like a phone screen.
import sys
from PIL import Image

im = Image.open(sys.argv[1]).convert('RGB')
lut = [min(255, round(255 * (v / 255 * 12.92 if v / 255 <= 0.0031308 else 1.055 * (v / 255) ** (1 / 2.4) - 0.055))) for v in range(256)]
im.point(lut * 3).save(sys.argv[1])
