#!/bin/sh
# Export the Windows build (release, x86_64): one Battlebots.exe with the game packed inside it
# (embed_pck; the WebRTC DLL rides inside too, see net/webrtc_windows.gd).
#   godot/tools/build-windows.sh [out.exe]
# The toolchain (Godot and its Windows template) comes from tools/setup-container.sh. The icon
# (assets/icons/icon.ico) goes into the .exe through Godot's own resource patcher, no rcedit.
set -e
cd "$(dirname "$0")/.."
OUT=${1:-build/Battlebots.exe}
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac
mkdir -p "$(dirname "$OUT")"
# the commentary clips, from the web game's public/voice (gitignored here; see tools/pack-voice.py)
python3 tools/pack-voice.py
godot --headless --path . --import >/dev/null 2>&1 || true
rm -f "$OUT" "$(dirname "$OUT")"/*.pck "$(dirname "$OUT")"/*.dll
godot --headless --path . --export-release "Windows Desktop" "$OUT" 2>&1 | grep -v "^\s*$" | tail -5
# (one file: nothing may land beside it)
D=$(dirname "$OUT")
test -f "$OUT"
if ls "$D"/*.pck "$D"/*.dll >/dev/null 2>&1; then echo "the Windows export left files beside the .exe"; exit 1; fi
ls -la "$OUT"
