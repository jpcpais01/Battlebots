#!/usr/bin/env python3
"""Package the commentary clips for the app: public/voice -> godot/assets/voice (gitignored).

    python3 godot/tools/pack-voice.py

The web game's clips (public/voice/manifest.json and c/*.mp3, made by scripts/voice) are the
source. The app ships them as they are, renamed .bin, so the export packs the raw bytes (the
include_filter in export_presets.cfg) instead of importing 4,500 audio files; audio/voice.gd loads
them into AudioStreamMP3.data at runtime.

The robot co-commentator's clips get the metal the web adds live (src/audio/voice.ts robotFx)
baked in, because Godot's bus effects have no ring modulator. ffmpeg runs exactly that graph:

    0.8 * x  +  0.32 * x * sin(2 pi 55 t)  +  0.22 * comb(x)
    comb: a 6.5 ms delay feeding back 0.42 into itself, H(z) = z^-D / (1 - 0.42 z^-D)

at the clips' own 24 kHz (D = 156 samples, exact), then encodes at a little over the source's
40 kb/s so the second encode costs nothing audible. Incremental: only missing or stale files are
redone. Needs ffmpeg with libmp3lame (without it the robot ships dry, with a warning).
"""
import json
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
SRC = os.path.join(ROOT, "public", "voice")
DST = os.path.join(ROOT, "godot", "assets", "voice")
RATE = 24000
D = round(0.0065 * RATE)
COMB_Z = " ".join(["0"] * D + ["1"])
COMB_P = " ".join(["1"] + ["0"] * (D - 1) + ["-0.42"])
ROBOT = (
    f"[0:a]aresample={RATE},aformat=sample_fmts=dbl:channel_layouts=mono,asplit=2[a][b];"
    "[a]aeval='val(0)*(0.8+0.32*sin(2*PI*55*t))'[d];"
    f"[b]aiir=z='{COMB_Z}':p='{COMB_P}':f=tf:r=d:e=dbl:n=0,volume=0.22[w];"
    "[d][w]amerge=inputs=2,pan=mono|c0=c0+c1"
)


def stale(src: str, out: str) -> bool:
    return not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(src)


def robot(name: str) -> None:
    src = os.path.join(SRC, "c", name)
    out = os.path.join(DST, "c", name[:-4] + ".bin")
    if not stale(src, out):
        return
    tmp = out + ".tmp"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", src, "-filter_complex", ROBOT,
         "-c:a", "libmp3lame", "-b:a", "48k", "-f", "mp3", tmp],
        check=True,
    )
    os.replace(tmp, out)


def main() -> int:
    man_path = os.path.join(SRC, "manifest.json")
    if not os.path.exists(man_path):
        print("pack-voice: no public/voice/manifest.json, the app ships without commentary", file=sys.stderr)
        return 0
    os.makedirs(os.path.join(DST, "c"), exist_ok=True)
    with open(man_path) as fh:
        man = json.load(fh)
    # every take of every line the robot speaks (no clip is shared between voices)
    robot_clips = sorted({f[0] for l in man["lines"] if l["v"] == "r" for f in l["f"]})
    metal = shutil.which("ffmpeg") is not None
    if metal:
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(robot, robot_clips))
    else:
        print("pack-voice: WARNING no ffmpeg, the robot's clips ship without their metal", file=sys.stderr)
    skip = set(robot_clips) if metal else set()
    for name in os.listdir(os.path.join(SRC, "c")):
        if not name.endswith(".mp3") or name in skip:
            continue
        src = os.path.join(SRC, "c", name)
        out = os.path.join(DST, "c", name[:-4] + ".bin")
        if stale(src, out):
            shutil.copyfile(src, out)
    shutil.copyfile(man_path, os.path.join(DST, "manifest.json"))
    n = len(os.listdir(os.path.join(DST, "c")))
    size = sum(os.path.getsize(os.path.join(DST, "c", f)) for f in os.listdir(os.path.join(DST, "c")))
    print(f"pack-voice: {n} clips, {size / 1e6:.1f} MB ({len(robot_clips)} robot clips{'' if metal else ', dry'})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
