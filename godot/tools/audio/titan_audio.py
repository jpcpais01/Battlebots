"""Synthesizes the titan battles' own sounds (godot/assets/audio/titan): sub-bass booms under
the blows, footfall thumps, a body's rumble, ships' horns, car alarms, the city's evening bed.
numpy only; ffmpeg encodes to Ogg Vorbis. Deterministic (fixed seeds).

    python3 godot/tools/audio/titan_audio.py godot/assets/audio/titan
"""
import numpy as np, subprocess, sys, os

SR = 44100
OUT = sys.argv[1]


def t_of(d):
    return np.arange(int(d * SR)) / SR


def band(x, lo, hi):
    """Brick-ish band-pass by FFT with soft edges."""
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    X = np.fft.rfft(x)
    m = np.ones_like(f)
    if lo > 0:
        m *= 1 / (1 + (lo / np.maximum(f, 1e-3)) ** 4)
    if hi > 0:
        m *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * m, n)


def env(t, a, tau, delay=0.0):
    tt = t - delay
    e = np.where(tt < 0, 0.0, np.minimum(1.0, tt / max(a, 1e-4)) * np.exp(-np.maximum(tt - a, 0) / tau))
    return e


def glide(t, f0, f1, k):
    """phase of a tone gliding f0 -> f1 exponentially (rate k)."""
    f = f1 + (f0 - f1) * np.exp(-t * k)
    return 2 * np.pi * np.cumsum(f) / SR


def conv(x, ir):
    n = len(x) + len(ir) - 1
    N = 1 << (n - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(ir, N), N)[:len(x)]
    return y


def outdoor_ir(rng, d=1.6, early=((0.19, 0.5), (0.27, 0.35), (0.36, 0.3), (0.47, 0.2)), lp=1800):
    """The square's buildings answering: a few slaps, then a soft decaying tail."""
    t = t_of(d)
    ir = np.zeros_like(t)
    ir[0] = 1.0
    for at, g in early:
        i = int(at * SR)
        ir[i:i + 40] += g * np.hanning(40) * 0.25
    tail = rng.standard_normal(len(t)) * np.exp(-t / 0.4) * 0.007 * (t > 0.12)
    ir += band(tail, 60, lp)
    return ir


def norm(x, peak=0.89):
    return x / (np.max(np.abs(x)) + 1e-9) * peak


def fade(x, a=0.002, b=0.05):
    n = len(x)
    ia, ib = int(a * SR), int(b * SR)
    w = np.ones(n)
    if ia > 0:
        w[:ia] = np.linspace(0, 1, ia)
    if ib > 0:
        w[-ib:] = np.linspace(1, 0, ib)
    return x * w


def save(name, x):
    x = np.clip(x, -1, 1)
    raw = (x * 32767).astype('<i2').tobytes()
    path = os.path.join(OUT, name + '.ogg')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'libvorbis', '-q:a', '4', path], input=raw, check=True)
    print(name, '%.2f s' % (len(x) / SR))


def boom(seed):
    """A blow landing on a 30 m body: the sub drop, the low body of it, a short crack."""
    rng = np.random.default_rng(seed)
    t = t_of(2.4)
    f0 = 52 + seed * 4
    sub = np.sin(glide(t, f0 * 1.6, f0 * 0.55, 4.5)) * env(t, 0.004, 0.62)
    sub += 0.35 * np.sin(glide(t, f0 * 2.4, f0 * 0.9, 6.0)) * env(t, 0.003, 0.28)
    low = band(rng.standard_normal(len(t)), 25, 170) * env(t, 0.01, 0.85) * 1.6
    crack = band(rng.standard_normal(len(t)), 250, 2600) * env(t, 0.001, 0.035) * 0.5
    x = np.tanh((sub * 1.1 + low * 0.9 + crack) * 1.6)
    x = conv(x, outdoor_ir(rng, lp=900))
    return fade(norm(x), 0.0, 0.3)


def step(seed):
    """A titan's foot coming down on the steel deck: a thump you feel, a grind of grit."""
    rng = np.random.default_rng(100 + seed)
    t = t_of(1.1)
    f0 = 64 + seed * 6
    sub = np.sin(glide(t, f0 * 1.4, f0 * 0.6, 7.0)) * env(t, 0.006, 0.2)
    low = band(rng.standard_normal(len(t)), 30, 220) * env(t, 0.01, 0.22) * 1.3
    grit = band(rng.standard_normal(len(t)) * (rng.random(len(t)) < 0.02), 900, 5000) * env(t, 0.004, 0.09) * 1.6
    x = np.tanh((sub + low * 0.8 + grit * 0.35) * 1.5)
    x = conv(x, outdoor_ir(rng, d=1.0, lp=700))
    return fade(norm(x, 0.85), 0.0, 0.2)


def rumble(seed):
    """A body the size of a building coming down: the ground rolling, debris pattering after."""
    rng = np.random.default_rng(200 + seed)
    t = t_of(3.6)
    roll = band(rng.standard_normal(len(t)), 22, 120) * env(t, 0.12, 1.25) * 2.0
    roll *= 1 + 0.35 * np.sin(2 * np.pi * (3.1 + seed) * t)
    dens = 0.004 * np.exp(-t / 1.1)
    deb = band(rng.standard_normal(len(t)) * (rng.random(len(t)) < dens), 700, 6000) * 1.4
    x = np.tanh((roll + deb * 0.4) * 1.3)
    x = conv(x, outdoor_ir(rng, d=1.8, lp=1200))
    return fade(norm(x, 0.85), 0.05, 0.6)


def horn():
    """Two ships across the harbour sounding their horns: deep, a fifth apart, far off."""
    rng = np.random.default_rng(300)
    t = t_of(6.5)
    x = np.zeros_like(t)
    for f, at, d, g in ((73.4, 0.0, 3.4, 1.0), (110.0, 0.45, 2.9, 0.7), (73.4, 4.3, 1.2, 0.6)):
        tt = t - at
        on = (tt > 0) & (tt < d + 1.0)
        e = np.clip(tt / 0.25, 0, 1) * np.clip((d - tt) / 0.7 + 1, 0, 1) * on
        ph = 2 * np.pi * np.cumsum(f * (1 + 0.004 * np.sin(2 * np.pi * 4.5 * t) - 0.02 * np.exp(-np.maximum(tt, 0) / 0.15))) / SR
        h = sum((1 / n ** 0.8) * np.sin(n * ph + n * 0.7) for n in range(1, 24))
        x += g * h * e
    x = band(x, 40, 950)
    rv = rng.standard_normal(int(3.0 * SR)) * np.exp(-t_of(3.0) / 0.9) * 0.02
    rv[0] = 1.0
    x = conv(x, band(rv, 50, 1400))
    return fade(norm(x, 0.8), 0.01, 0.8)


def alarm():
    """Car alarms going off somewhere in the press pen: two-tone chirps, a whoop, far off."""
    rng = np.random.default_rng(400)
    t = t_of(5.0)
    f = np.where((np.floor(t * 5.0) % 2) < 1, 1150.0, 1520.0)
    f = np.where(t > 2.4, 900 + 700 * np.abs(((t * 1.6) % 1.0) * 2 - 1), f)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sign(np.sin(ph)) * 0.6 + np.sin(ph) * 0.4
    x2 = np.sin(2 * np.pi * np.cumsum(np.where((np.floor((t + 0.13) * 3.0) % 2) < 1, 980.0, 760.0)) / SR) * (t > 0.6)
    x = band(x * 0.8 + x2 * 0.5, 500, 2600) * np.clip(t / 0.05, 0, 1)
    x = conv(x, outdoor_ir(rng, d=1.2, lp=2400))
    return fade(norm(x, 0.7), 0.01, 0.8)


def city():
    """The city's evening round the square: traffic far off, the harbour, a breeze, a siren."""
    rng = np.random.default_rng(500)
    d = 26.0
    t = t_of(d)
    traffic = band(rng.standard_normal(len(t)), 30, 380) * (0.8 + 0.2 * np.sin(2 * np.pi * t / 13.0))
    wind = band(rng.standard_normal(len(t)), 180, 1100) * (0.35 + 0.3 * np.sin(2 * np.pi * t / 8.7 + 1.0) ** 2) * 0.35
    lap = band(rng.standard_normal(len(t)), 300, 2400) * (0.5 + 0.5 * np.sin(2 * np.pi * t * 0.31) ** 8) * 0.08
    # a siren somewhere across town, coming and going
    sf = 820 + 380 * np.sin(2 * np.pi * t / 3.6)
    siren = np.sin(2 * np.pi * np.cumsum(sf) / SR)
    siren = band(siren, 400, 1600) * np.clip(np.sin(np.pi * (t - 9.0) / 11.0), 0, 1) ** 2 * 0.05
    x = traffic + wind + lap + siren
    # loops: the last 3 s faded under the first 3 s
    k = int(3.0 * SR)
    w = np.linspace(0, 1, k)
    head = x[:k] * w + x[-k:] * (1 - w)
    x = np.concatenate([head, x[k:-k]])
    return norm(x, 0.6)


for i in range(3):
    save('titan_boom_%d' % i, boom(i))
    save('titan_step_%d' % i, step(i))
for i in range(2):
    save('titan_rumble_%d' % i, rumble(i))
save('titan_horn', horn())
save('titan_alarm', alarm())
save('titan_city', city())
