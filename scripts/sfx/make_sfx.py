#!/usr/bin/env python3
"""
Rotor's mechanical sounds (detent clicks, ratchet, tumbler catch), synthesized here.
The musical sounds come from render_gm.py (real instrument samples). Run both:
    python3 scripts/sfx/make_sfx.py && python3 scripts/sfx/render_gm.py
Relative loudness is baked into the files (peak dBFS below).
"""
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter, sosfilt

SR = 44100
OUT = Path(__file__).resolve().parents[2] / "assets" / "sfx"
rng = np.random.default_rng(7)

# Pitches (Hz)
C5, E5, G5 = 523.25, 659.26, 783.99
C6, D6, E6, G6, A6 = 1046.5, 1174.66, 1318.51, 1567.98, 1760.0
C7, D7, E7, G7 = 2093.0, 2349.32, 2637.02, 3135.96


def tt(d):
    return np.arange(int(SR * d)) / SR


def buf(d):
    return np.zeros(int(SR * d))


def place(dst, sig, at, gain=1.0):
    i = int(SR * at)
    n = min(len(sig), len(dst) - i)
    if n > 0:
        dst[i : i + n] += sig[:n] * gain
    return dst


def band(x, lo, hi, order=2):
    sos = butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return sosfilt(sos, x)


def lowpass(x, f, order=2):
    sos = butter(order, f, btype="low", fs=SR, output="sos")
    return sosfilt(sos, x)


def highpass(x, f, order=2):
    sos = butter(order, f, btype="high", fs=SR, output="sos")
    return sosfilt(sos, x)


def attack(sig, ms):
    n = max(1, int(SR * ms / 1000))
    sig[:n] *= np.linspace(0, 1, n) ** 1.5
    return sig


def fade_tail(sig, ms=25):
    n = min(len(sig), int(SR * ms / 1000))
    sig[-n:] *= np.linspace(1, 0, n) ** 2
    return sig


# --- instruments ---------------------------------------------------------------

def bell(f, d=1.2, bright=1.0, decay=1.0):
    """Struck bell: inharmonic partials, upper ones die faster, slight beating."""
    t = tt(d)
    parts = [(0.5, 0.25, 1.4), (1.0, 1.0, 0.9), (1.19, 0.25, 0.6), (2.0, 0.55, 0.45),
             (2.76, 0.42 * bright, 0.28), (4.07, 0.22 * bright, 0.16), (5.43, 0.12 * bright, 0.1)]
    s = np.zeros_like(t)
    for r, a, tau in parts:
        fr = f * r
        if fr > SR * 0.45:
            continue
        s += a * np.sin(2 * np.pi * fr * t + rng.uniform(0, 6)) * np.exp(-t / (tau * decay))
    # strike transient
    strike = highpass(rng.standard_normal(len(t)), 3000) * np.exp(-t / 0.0025) * 0.25
    return attack(s + strike, 1.5)


def marimba(f, d=0.7):
    t = tt(d)
    s = (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.32)
         + 0.35 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t / 0.05)
         + 0.12 * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t / 0.015))
    mallet = lowpass(rng.standard_normal(len(t)), 2500) * np.exp(-t / 0.004) * 0.3
    return attack(s + mallet, 2)


def brass(f, d, swell=0.12, vib=True):
    """Soft brass: additive harmonics whose brightness follows the envelope."""
    t = tt(d)
    env = np.minimum(1, t / swell) ** 1.6
    rel = 0.18
    env *= np.clip((d - t) / rel, 0, 1)
    # Vibrato as integrated phase (multiplying t by a varying factor makes the depth grow over time).
    depth = 0.0035 * np.clip((t - 0.18) / 0.2, 0, 1) if vib else np.zeros_like(t)
    phase = 2 * np.pi * np.cumsum(f * (1 + depth * np.sin(2 * np.pi * 5.3 * t))) / SR
    s = np.zeros_like(t)
    for n in range(1, 14):
        if f * n > SR * 0.45:
            break
        amp = (1 / n ** 1.05) * env ** (1 + 0.35 * n)  # brighter as it swells
        s += amp * np.sin(n * phase)
    breath = band(rng.standard_normal(len(t)), f * 2, f * 6) * env * 0.02
    return s + breath


def click(res=2800, d=0.035, body=180, level=1.0, noise=1.0):
    """Mechanical detent click: noise transient + damped metal resonances + small body."""
    t = tt(d)
    tr = band(rng.standard_normal(len(t)), 1500, 9000) * np.exp(-t / 0.0012) * noise
    ring = (np.sin(2 * np.pi * res * t) * np.exp(-t / 0.006)
            + 0.5 * np.sin(2 * np.pi * res * 1.63 * t) * np.exp(-t / 0.004))
    thud = np.sin(2 * np.pi * body * t) * np.exp(-t / 0.008) * 0.6
    return (tr * 0.8 + ring * 0.5 + thud) * level


def thump(f=90, d=0.18, tau=0.05, drop=0.9):
    t = tt(d)
    fi = f * (1 + drop * np.exp(-t / 0.012))
    ph = 2 * np.pi * np.cumsum(fi) / SR
    return np.sin(ph) * np.exp(-t / tau)


def clunk(f=85, metal=(620, 1710), d=0.22, heavy=1.0):
    """Bolt/latch: low thump, filtered impact noise, short metallic ring."""
    t = tt(d)
    s = thump(f, d, 0.05 * heavy) * 1.0
    s += band(rng.standard_normal(len(t)), 700, 3500) * np.exp(-t / 0.006) * 0.7
    for m, a, tau in ((metal[0], 0.35, 0.05), (metal[1], 0.22, 0.03)):
        s += a * np.sin(2 * np.pi * m * t) * np.exp(-t / tau)
    return s


def ching(f=C7, d=0.55):
    """Coin: tiny clink then a bright inharmonic ring."""
    t = tt(d)
    s = np.zeros_like(t)
    for r, a, tau in ((1.0, 1.0, 0.22), (1.47, 0.6, 0.15), (2.09, 0.45, 0.1), (2.56, 0.3, 0.07), (3.1, 0.2, 0.05)):
        fr = f * r
        if fr > SR * 0.45:
            continue
        s += a * np.sin(2 * np.pi * fr * t + rng.uniform(0, 6)) * np.exp(-t / tau)
    s = attack(s, 1)
    pre = click(res=f * 1.9, d=0.02, body=900, level=0.35)
    out = np.zeros(len(t))
    place(out, pre, 0)
    place(out, s, 0.012)
    return out


def reverb(x, wet=0.18, size=1.0, tail=0.6):
    """Small Schroeder reverb (4 combs + 2 allpasses); appends a tail."""
    x = np.concatenate([x, np.zeros(int(SR * tail))])
    combs = [int(SR * s * size) for s in (0.0297, 0.0371, 0.0411, 0.0437)]
    y = np.zeros_like(x)
    for D, g in zip(combs, (0.78, 0.76, 0.74, 0.72)):
        a = np.zeros(D + 1)
        a[0], a[-1] = 1, -g
        y += lfilter([1], a, x)
    for D, g in ((int(SR * 0.005), 0.7), (int(SR * 0.0017), 0.7)):
        b = np.zeros(D + 1)
        b[0], b[-1] = -g, 1
        a = np.zeros(D + 1)
        a[0], a[-1] = 1, -g
        y = lfilter(b, a, y)
    y = lowpass(y, 6500)
    return x * (1 - wet) + y * wet * 0.35


def finish(x, peak_db, trim=True):
    x = x - np.mean(x)
    if trim:
        thresh = np.max(np.abs(x)) * 10 ** (-60 / 20)
        idx = np.where(np.abs(x) > thresh)[0]
        x = x[: idx[-1] + 1] if len(idx) else x
    x = fade_tail(x, 30)
    peak = np.max(np.abs(x)) or 1
    return x / peak * 10 ** (peak_db / 20)


def write(name, x):
    data = np.int16(np.clip(x, -1, 1) * 32767)
    wavfile.write(OUT / f"{name}.wav", SR, data)
    return name, len(data) / SR


# --- the set ---------------------------------------------------------------------

def make():
    """Mechanical sounds only. The musical ones (bells, fanfare, coins, stars) are rendered
    from real instrument samples by render_gm.py, which runs after this script."""
    out = []

    # Ring detents: three slightly different clicks so spinning doesn't sound looped.
    for i, (res, body) in enumerate(((2900, 190), (3150, 175), (2700, 205))):
        out.append(write(["notch", "notch2", "notch3"][i], finish(click(res, 0.04, body), -7)))

    # Victory lap: ratchet cascade that spins up and settles.
    b = buf(0.75)
    times, x, gap = [], 0.0, 0.055
    for i in range(16):
        times.append(x)
        gap = gap * (0.86 if i < 9 else 1.18)
        x += max(0.018, gap)
    for i, at in enumerate(times):
        res = 2700 + i * 35 + rng.uniform(-60, 60)
        place(b, click(res, 0.04, 170 + rng.uniform(-15, 15), level=0.55 + 0.45 * np.sin(np.pi * i / 15)), at)
    out.append(write("ratchet", finish(b, -6)))

    # Safecracker: the tumbler catch, a deeper, heavier click than a dial tick.
    b = buf(0.25)
    place(b, click(980, 0.12, 110, level=1.0, noise=0.6), 0)
    place(b, thump(95, 0.16, 0.035, 0.7), 0.004, 0.8)
    out.append(write("tumbler", finish(b, -3)))
    return out


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, secs in make():
        print(f"{name:9s} {secs:5.2f}s")
