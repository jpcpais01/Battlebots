#!/bin/sh
# Export the Android APK (release build, signed with the dev key unless told otherwise).
#   godot/tools/build-apk.sh [out.apk]
# Signing: GODOT_ANDROID_KEYSTORE_RELEASE_{PATH,USER,PASSWORD}, or the project's dev key in
# /mnt/project-files/battlebots-godot/ (battlebots-dev.keystore + .txt with the password).
# The toolchain (Godot, export templates, SDK stand-ins) comes from tools/setup-container.sh.
set -e
cd "$(dirname "$0")/.."
OUT=${1:-build/battlebots.apk}
mkdir -p "$(dirname "$OUT")"
DEV=/mnt/project-files/battlebots-godot/battlebots-dev.keystore
if [ -z "$GODOT_ANDROID_KEYSTORE_RELEASE_PATH" ] && [ -f "$DEV" ]; then
  export GODOT_ANDROID_KEYSTORE_RELEASE_PATH="$DEV"
  export GODOT_ANDROID_KEYSTORE_RELEASE_USER=$(sed -n 's/^alias=//p' "$DEV.txt")
  export GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD=$(sed -n 's/^password=//p' "$DEV.txt")
fi
# the commentary clips, from the web game's public/voice (gitignored here; see tools/pack-voice.py)
python3 tools/pack-voice.py
godot --headless --path . --import >/dev/null 2>&1 || true
godot --headless --path . --export-release Android "$OUT" 2>&1 | grep -v "^\s*$" | tail -5
ls -la "$OUT"
