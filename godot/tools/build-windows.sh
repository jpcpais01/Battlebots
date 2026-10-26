#!/bin/sh
# Export the Windows build (release, x86_64) for a release, into one folder:
#   Battlebots-Windows.zip  Battlebots.exe (the whole game in one file: embed_pck, the WebRTC DLL
#                           inside it too, see net/webrtc_windows.gd) with the store art beside it,
#                           store/Battlebots_banner.png, _cover.png and _logo.png: what people
#                           download, and what the game updates from
#   Battlebots.exe          the same .exe on its own, so builds from before the zip, whose updater
#                           swaps that one file in, can still update themselves
#   godot/tools/build-windows.sh [out-dir]
# The toolchain (Godot and its Windows template) comes from tools/setup-container.sh. The icon
# (assets/icons/icon.ico) goes into the .exe through Godot's own resource patcher, no rcedit.
set -e
cd "$(dirname "$0")/.."
OUT=${1:-build/windows}
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac
mkdir -p "$OUT"
# the commentary clips, from the web game's public/voice (gitignored here; see tools/pack-voice.py)
python3 tools/pack-voice.py
godot --headless --path . --import >/dev/null 2>&1 || true
STAGE="$OUT/stage"
rm -rf "$STAGE" "$OUT/Battlebots-Windows.zip" "$OUT/Battlebots.exe" && mkdir -p "$STAGE"
godot --headless --path . --export-release "Windows Desktop" "$STAGE/Battlebots.exe" 2>&1 | grep -v "^\s*$" | tail -5
# (one file: nothing may land beside it)
test -f "$STAGE/Battlebots.exe"
if ls "$STAGE"/*.pck "$STAGE"/*.dll >/dev/null 2>&1; then echo "the Windows export left files beside the .exe"; exit 1; fi
cp store/Battlebots_banner.png store/Battlebots_cover.png store/Battlebots_logo.png "$STAGE/"
# (files at the zip's root: Windows' Extract All puts them in Downloads\Battlebots-Windows)
python3 - "$STAGE" "$OUT/Battlebots-Windows.zip" <<'PY'
import os, sys, zipfile
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for name in sorted(os.listdir(src)):
        # (the PNGs are compressed already)
        z.write(os.path.join(src, name), name, zipfile.ZIP_STORED if name.endswith(".png") else zipfile.ZIP_DEFLATED)
PY
mv "$STAGE/Battlebots.exe" "$OUT/Battlebots.exe"
rm -rf "$STAGE"
python3 -c "import zipfile,sys; [print('  zip: %-28s %10d' % (i.filename, i.file_size)) for i in zipfile.ZipFile(sys.argv[1]).infolist()]" "$OUT/Battlebots-Windows.zip"
ls -la "$OUT"
