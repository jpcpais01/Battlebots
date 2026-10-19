"""Bakes the robots' value-noise lattice (assets/bots/noise3d.bin, read by BotModel.noise3d):
64^3 random bytes, x fastest, then y, then z. Sampled with linear filtering and wrapping at eased
offsets (bot_damage.gdshaderinc dmg_noise_t), one fetch gives the smooth trilinear value noise
that eight hashes and seven mixes did.
    python3 godot/tools/bake/noise3d.py
"""
import math
import os

N = 64


def h(x, y, z):
    p = [x * 0.3183099 + 0.11, y * 0.3183099 + 0.17, z * 0.3183099 + 0.13]
    p = [(v - math.floor(v)) * 17.0 for v in p]
    v = p[0] * p[1] * p[2] * (p[0] + p[1] + p[2])
    return v - math.floor(v)


out = bytearray(N * N * N)
for z in range(N):
    for y in range(N):
        for x in range(N):
            out[(z * N + y) * N + x] = min(255, max(0, round(h(x, y, z) * 255.0)))
path = os.path.join(os.path.dirname(__file__), "..", "..", "assets", "bots", "noise3d.bin")
with open(path, "wb") as f:
    f.write(out)
print("wrote", os.path.normpath(path), len(out), "bytes")
