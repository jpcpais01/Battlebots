#!/bin/sh
# Render check in the container: runs a Godot script under Xvfb with the GL (compatibility)
# renderer and llvmpipe, the only GPU path here.
#   godot/tools/shots/shot.sh res://tests/shot_fight.gd ARGS...
# Notes on this renderer (it is not what phones run, which is the Mobile renderer on Vulkan):
# - get_image() pixels come back linear: shot_fight.gd PNGs go through srgb.py (fight.sh does it).
# - very dark values (below about 0.05 linear) come out darker than they should; judge the
#   darkest tones by the maths, not the picture.
# - a Sky draws a bogus white box: set BB_NOSKY=1.
GD=$(cd "$(dirname "$0")/../.." && pwd)
# the import step isn't safe to run twice at once in one project
flock /tmp/bb-godot-import.lock timeout 120 godot --headless --path "$GD" --import >/dev/null 2>&1
s=$1; shift
timeout 240 xvfb-run -a -s "-screen 0 1280x720x24" godot --path "$GD" --rendering-driver opengl3 --resolution 1280x720 -s "$s" -- "$@" 2>&1 | grep -v "^$\|ALSA\|audio\|init_output\|ObjectDB\|resources still\|at: cleanup\|at: clear\|dummy driver\|status < 0"
