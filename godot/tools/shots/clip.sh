#!/bin/sh
# A stretch of a real fight as a video, to judge how the robots move (tests/motion_clip.gd).
#   godot/tools/shots/clip.sh out.mp4 [bots seed] [fight seed] [from s] [frames] [cam] [speed] [lab]
# lab: a reel of single moves instead of the fight, e.g. "strike:jab,cross:1.1:head;dodge:slip"
# (see tests/motion_clip.gd; each scenario's first frame is printed as "lab i: ... frame N").
# Env: GD_FPS (30): the frames per second of fight time recorded (and played back at).
# Frames go to out_frames/ next to the video, as the renderer's linear pixels (the video is
# sRGB-encoded, like a phone screen).
D=$(cd "$(dirname "$0")" && pwd)
GD=$(cd "$D/../.." && pwd)
OUT=$(realpath -m "$1"); shift
FPS=${GD_FPS:-30}
FR="${OUT%.*}_frames"
rm -rf "$FR" && mkdir -p "$FR"
flock /tmp/bb-godot-import.lock timeout 120 godot --headless --path "$GD" --import >/dev/null 2>&1
BB_NOSKY=${BB_NOSKY-1} timeout ${BB_TIMEOUT:-3000} xvfb-run -a -s "-screen 0 1280x720x24" godot --path "$GD" --rendering-driver opengl3 --resolution ${BB_RES:-1280x720} --fixed-fps "$FPS" --disable-vsync -s res://tests/motion_clip.gd -- "$FR/f" "$@" 2>&1 | grep -v "^$\|ALSA\|audio\|init_output\|ObjectDB\|resources still\|at: cleanup\|at: clear\|dummy driver\|status < 0\|leaked"
# the GL renderer hands back linear pixels: encode them to sRGB on the way into the video
ffmpeg -loglevel error -y -framerate "$FPS" -i "$FR/f_%04d.png" -vf "lutrgb=r='255*if(lte(val/255\,0.0031308)\,12.92*val/255\,1.055*pow(val/255\,1/2.4)-0.055)':g='255*if(lte(val/255\,0.0031308)\,12.92*val/255\,1.055*pow(val/255\,1/2.4)-0.055)':b='255*if(lte(val/255\,0.0031308)\,12.92*val/255\,1.055*pow(val/255\,1/2.4)-0.055)',format=yuv420p" -c:v libx264 -crf 20 -preset medium "$OUT" && echo "wrote $OUT"
