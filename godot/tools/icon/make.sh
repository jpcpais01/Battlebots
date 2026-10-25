#!/bin/sh
# The app icon, from its art (icon.svg: one 1024-unit square, layers bg / head / eyes / fistL /
# fistR), to every picture the app uses:
#   assets/icons/  the launcher icon: the legacy 192 and Android's adaptive layers (foreground,
#                  background, and a white monochrome one for themed icons). Adaptive layers are
#                  108dp of which the launcher shows the middle 72dp, so the art is drawn into the
#                  middle two thirds (viewBox -256 -256 1536 1536).
#   assets/boot/   the loading screen's big animated boxer (app/boot/boot_emblem.gd), a layer each
#                  (the robot only: no tile).
#   icon.png       the project's own icon (and assets/icons/icon.ico from it, for Windows).
#   godot/tools/icon/make.sh   (then godot --headless --path godot --import for new files)
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
G=$HERE/../..
I=$G/assets/icons
B=$G/assets/boot
mkdir -p "$B"
R="node $HERE/render.mjs $HERE/icon.svg"
VB="-256 -256 1536 1536"
$R "$I/adaptive_fg_432.png" 432 head,eyes,fistL,fistR none "$VB" &
$R "$I/adaptive_bg_432.png" 432 bg none "$VB" &
$R "$I/icon_192.png" 192 all squircle &
$R "$G/icon.png" 256 all squircle &
$R "$B/head.png" 768 head &
$R "$B/eyes.png" 768 eyes &
$R "$B/fist_l.png" 768 fistL &
$R "$B/fist_r.png" 768 fistR &
wait
# themed icons: white, with the dark parts (the visor, the gaps) let through so the eyes read
python3 - "$I/adaptive_fg_432.png" "$I/adaptive_mono_432.png" <<'PY'
import sys
import numpy as np
from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert('RGBA')).astype(float) / 255
lum = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
out = np.full(a.shape, 255, dtype=np.uint8)
out[..., 3] = (a[..., 3] * np.clip((lum - 0.12) / 0.3, 0, 1) * 255).astype(np.uint8)
Image.fromarray(out).save(sys.argv[2])
PY
# the Windows build's icon (.exe, window and taskbar): every size Windows asks for, from icon.png
python3 - "$G/icon.png" "$I/icon.ico" <<'PY'
import sys
from PIL import Image
Image.open(sys.argv[1]).convert('RGBA').save(sys.argv[2], sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
PY
