#!/bin/sh
# Export the Windows build (release, x86_64) for a release, into one folder:
#   Battlebots-Windows.zip  Battlebots.exe with what it needs beside it (Battlebots.pck, the
#                           WebRTC DLL): what people download, and what the game updates from
#   Battlebots.exe          the whole game in one file (embed_pck, the DLL inside it too, see
#                           net/webrtc_windows.gd), only so builds from before the zip, whose
#                           updater swaps that one file in, can still update themselves
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
rm -rf "$STAGE" "$OUT/Battlebots-Windows.zip" "$OUT/Battlebots.exe" && mkdir -p "$STAGE/zip" "$STAGE/one"
godot --headless --path . --export-release "Windows Desktop" "$STAGE/zip/Battlebots.exe" 2>&1 | grep -v "^\s*$" | tail -5
test -f "$STAGE/zip/Battlebots.exe" && test -f "$STAGE/zip/Battlebots.pck"
ls "$STAGE"/zip/*.dll >/dev/null
# (files at the zip's root: Windows' Extract All puts them in Downloads\Battlebots-Windows)
python3 - "$STAGE/zip" "$OUT/Battlebots-Windows.zip" <<'PY'
import os, sys, zipfile
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for name in sorted(os.listdir(src)):
        z.write(os.path.join(src, name), name)
PY
# the one-file .exe: the same export with the pck inside (export_presets.cfg put back after)
cp export_presets.cfg "$STAGE/presets.cfg"
trap 'cp "$STAGE/presets.cfg" export_presets.cfg' EXIT
sed -i 's/^binary_format\/embed_pck=false/binary_format\/embed_pck=true/' export_presets.cfg
godot --headless --path . --export-release "Windows Desktop" "$STAGE/one/Battlebots.exe" 2>&1 | grep -v "^\s*$" | tail -5
cp "$STAGE/presets.cfg" export_presets.cfg && trap - EXIT
test -f "$STAGE/one/Battlebots.exe" && ! test -f "$STAGE/one/Battlebots.pck"
mv "$STAGE/one/Battlebots.exe" "$OUT/Battlebots.exe"
rm -rf "$STAGE"
python3 -c "import zipfile,sys; [print('  zip: %-60s %9d' % (i.filename, i.file_size)) for i in zipfile.ZipFile(sys.argv[1]).infolist()]" "$OUT/Battlebots-Windows.zip"
ls -la "$OUT"
