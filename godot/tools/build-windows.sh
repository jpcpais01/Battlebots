#!/bin/sh
# Export the Windows build (release, x86_64) and zip it: Battlebots/Battlebots.exe + .pck.
#   godot/tools/build-windows.sh [out.zip]
# The toolchain (Godot and its Windows template) comes from tools/setup-container.sh. No rcedit in
# the container, so the .exe keeps Godot's own icon (the window still shows the game's).
set -e
cd "$(dirname "$0")/.."
OUT=${1:-build/Battlebots-Windows.zip}
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac
mkdir -p "$(dirname "$OUT")"
# the commentary clips, from the web game's public/voice (gitignored here; see tools/pack-voice.py)
python3 tools/pack-voice.py
godot --headless --path . --import >/dev/null 2>&1 || true
STAGE=build/windows-stage
rm -rf "$STAGE" && mkdir -p "$STAGE/Battlebots"
godot --headless --path . --export-release "Windows Desktop" "$STAGE/Battlebots/Battlebots.exe" 2>&1 | grep -v "^\s*$" | tail -5
test -f "$STAGE/Battlebots/Battlebots.exe" && test -f "$STAGE/Battlebots/Battlebots.pck"
rm -f "$OUT"
(cd "$STAGE" && python3 -c "
import sys, zipfile, os
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for root, _, files in os.walk('Battlebots'):
        for f in sorted(files):
            z.write(os.path.join(root, f))
" "$OUT")
rm -rf "$STAGE"
ls -la "$OUT"
