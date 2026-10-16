# Fits render/garage/garage_sky.gdshader's room fill to three's studio environment: reads what
# garage3d_env.ts prints (a white matte surface's radiance for 64 normals at environmentIntensity 1),
# takes away what the softbox panels already give (integrated here, as the shader draws them) and
# fits the rest with order-2 spherical harmonics, turned from irradiance into sky radiance.
#   node godot/tools/bake/web/run.mjs garage3d_env | grep '^ok' > env64.txt
#   python3 godot/tools/bake/web/garage3d_env.py env64.txt
# Prints the GLSL for the fill.
import sys
import numpy as np


def ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def box(px, py, cx, cy, hx, hy):
    return 1 - ss(0.0, 0.03, np.maximum(np.abs(px - cx) - hx, np.abs(py - cy) - hy))


def panels(d):
    x, y, z = d
    az = np.arctan2(z, x)
    el = np.arcsin(np.clip(y, -1, 1))
    light = 3.0 * ss(0.93, 0.97, y)
    for i in range(6):
        a = i * 1.0472 + 0.3
        light = light + 2.2 * box(np.mod(az - a + np.pi, 2 * np.pi) - np.pi, el, 0, 0.85, 0.18, 0.08)
    light = light + 1.6 * box(np.mod(az - 0.4 + np.pi, 2 * np.pi) - np.pi, el, 0, 0.2, 0.35, 0.16)
    light = light + 1.2 * box(np.mod(az - 3.6 + np.pi, 2 * np.pi) - np.pi, el, 0, 0.25, 0.25, 0.2)
    # (grey: the panels' warm tint is left out of the fit)
    return light * 0.963


def basis(n):
    x, y, z = n
    return np.stack([np.ones_like(x), x, y, z, x * y, y * z, 3 * y * y - 1, x * z, x * x - z * z])


BAND = np.array([1.0, 2 / 3, 2 / 3, 2 / 3, 0.25, 0.25, 0.25, 0.25, 0.25])

rows = open(sys.argv[1]).read().strip()[3:].split(';')
data = np.array([[float(v) for v in r.split(',')] for r in rows])
n = data[:, :3].T
web = data[:, 3:6].mean(axis=1)

rng = np.random.default_rng(1)
v = rng.normal(size=(3, 400000))
v /= np.linalg.norm(v, axis=0)
L = panels(v)
pan = np.array([(L * np.maximum(0, n[:, i] @ v)).mean() * 4 for i in range(n.shape[1])])

res = web - pan
A = basis(n).T
c, *_ = np.linalg.lstsq(A, res, rcond=None)
fit = A @ c
print('irradiance rms error %.3f (web %.2f..%.2f)' % (np.sqrt(((fit - res) ** 2).mean()), web.min(), web.max()))
r = c / BAND
names = ['1.0', 'd.x', 'd.y', 'd.z', 'd.x * d.y', 'd.y * d.z', '(3.0 * d.y * d.y - 1.0)', 'd.x * d.z', '(d.x * d.x - d.z * d.z)']
print('float fill = ' + ' + '.join('%.4f * %s' % (k, nm) if nm != '1.0' else '%.4f' % k for k, nm in zip(r, names)).replace('+ -', '- ') + ';')
# the fill as a sky can't go below zero
d = v
fill = basis(d).T @ r
print('fill radiance range %.3f..%.3f' % (fill.min(), fill.max()))
