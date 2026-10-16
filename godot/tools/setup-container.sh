#!/bin/sh
# Recreate the Godot Android toolchain in a fresh cloud container (or any Linux box).
#
# Google's download hosts (dl.google.com) are blocked in the container, so there is no real
# Android SDK: Godot's prebuilt (non-gradle) templates don't need one, apart from apksigner
# (tools/apksigner.py stands in: APK Signature Scheme v2, sign + verify) and adb (a stub).
# Godot itself and its export templates come from GitHub releases. Needs Java (keytool) for the
# debug keystore Godot makes on first export.
#   godot/tools/setup-container.sh
set -e
V=4.7.2
HERE=$(cd "$(dirname "$0")" && pwd)
if ! command -v godot >/dev/null || ! godot --version | grep -q "^$V"; then
  mkdir -p /opt/godot && cd /opt/godot
  curl -sSLo godot.zip "https://github.com/godotengine/godot/releases/download/$V-stable/Godot_v$V-stable_linux.x86_64.zip"
  unzip -oq godot.zip && rm godot.zip
  ln -sf "/opt/godot/Godot_v$V-stable_linux.x86_64" /usr/local/bin/godot
fi
T="$HOME/.local/share/godot/export_templates/$V.stable"
if [ ! -f "$T/android_release.apk" ]; then
  mkdir -p "$T" && cd /tmp
  curl -sSLo tpl.tpz "https://github.com/godotengine/godot/releases/download/$V-stable/Godot_v$V-stable_export_templates.tpz"
  unzip -oq tpl.tpz 'templates/android_*' 'templates/version.txt' -d tpl && mv tpl/templates/* "$T/" && rm -rf tpl tpl.tpz
fi
SDK=/opt/android-sdk
mkdir -p $SDK/platform-tools $SDK/build-tools/35.0.0 $SDK/platforms/android-35
cat > $SDK/platform-tools/adb <<'ADB'
#!/bin/sh
# Stand-in adb: no devices are ever attached in the container.
case "$1" in
  devices) echo "List of devices attached"; echo;;
  version) echo "Android Debug Bridge version 1.0.41";;
esac
exit 0
ADB
printf '#!/bin/sh\nexec python3 %s/apksigner.py "$@"\n' "$HERE" > $SDK/build-tools/35.0.0/apksigner
chmod +x $SDK/platform-tools/adb $SDK/build-tools/35.0.0/apksigner
python3 -c "import cryptography" 2>/dev/null || echo "apksigner.py needs the python 'cryptography' package"
JAVA=$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")
# point the editor settings at the SDK and Java (created on first run)
godot --headless --quit >/dev/null 2>&1 || true
ES=$(ls "$HOME"/.config/godot/editor_settings-4.*.tres 2>/dev/null | head -1)
if [ -n "$ES" ] && ! grep -q android_sdk_path "$ES"; then
  printf 'export/android/android_sdk_path = "%s"\nexport/android/java_sdk_path = "%s"\n' "$SDK" "$JAVA" >> "$ES"
fi
echo "Godot $(godot --version) ready; build with godot/tools/build-apk.sh"
