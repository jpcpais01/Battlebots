#!/bin/sh
# A fight frame from the Godot game, sRGB-encoded like a phone screen.
#   godot/tools/shots/fight.sh out.png [steps] ["camx,y,z;lookx,y,z"]
# Env: BB_NOBOTS=1 BB_NOHUD=1 BB_SEED=n BB_NOSKY (default 1) and anything game/fight.gd reads.
D=$(cd "$(dirname "$0")" && pwd)
OUT=$(realpath -m "$1")
BB_NOSKY=${BB_NOSKY-1} BB_CAM="$3" sh "$D/shot.sh" res://tests/shot_fight.gd "${2:-10}" "$OUT" 6 | grep -iv "leaked"
[ -f "$OUT" ] && python3 "$D/srgb.py" "$OUT"
