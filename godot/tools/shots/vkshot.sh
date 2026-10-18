#!/bin/sh
# shot.sh on the phones' renderer (Mobile, Vulkan) instead of the GL one: Vulkan runs on the
# SwiftShader that ships with the container's Chromium, through a stand-in libvulkan
# (vk/xlib_shim.c) that gives Godot's X11 window the xlib surface SwiftShader lacks (it only has
# xcb). Slow (minutes a shot) but it runs the same shader paths the phones do; it is not an
# Adreno, so a driver's own bugs won't show.
#   godot/tools/shots/vkshot.sh res://tests/look/bot_close.gd ARGS...
GD=$(cd "$(dirname "$0")/../.." && pwd)
VK=${TMPDIR:-/tmp}/bb-vkshim
ICD=$(ls /opt/pw-browsers/chromium-*/chrome-linux/vk_swiftshader_icd.json 2>/dev/null | head -1)
[ -n "$ICD" ] || { echo "no SwiftShader ICD under /opt/pw-browsers"; exit 1; }
if [ ! -f "$VK/libvulkan.so.1" ]; then
  mkdir -p "$VK" && gcc -shared -fPIC -O1 -o "$VK/libvulkan.so.1" "$GD/tools/shots/vk/xlib_shim.c" -ldl || exit 1
fi
flock /tmp/bb-godot-import.lock timeout 120 godot --headless --path "$GD" --import >/dev/null 2>&1
s=$1; shift
VK_ICD_FILENAMES=$ICD LD_LIBRARY_PATH=$VK timeout ${BB_TIMEOUT:-900} xvfb-run -a -s "-screen 0 1280x720x24" godot --path "$GD" --rendering-method mobile --rendering-driver vulkan --resolution 1280x720 -s "$s" -- "$@" 2>&1 | grep -v "^$\|ALSA\|audio\|init_output\|ObjectDB\|resources still\|at: cleanup\|at: clear\|dummy driver\|status < 0\|same texture in framebuffer\|draw_list_bind_uniform_set"
