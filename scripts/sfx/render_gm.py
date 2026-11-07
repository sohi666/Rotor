#!/usr/bin/env python3
"""
Rotor's musical sounds (bells, fanfare, coins, stars), rendered from real instrument
samples in the FluidR3 General MIDI sound bank (Frank Wen, MIT licence; see
assets/sfx/LICENSE-FluidR3.txt). Mechanical clicks come from make_sfx.py.

Needs: fluidsynth + fluid-soundfont-gm (apt), mido (pip).
Run:   python3 scripts/sfx/make_sfx.py && python3 scripts/sfx/render_gm.py

Chorus is off (it detunes and makes bells sound wobbly); reverb is FluidSynth's own,
kept small and dry so sounds stay crisp on phone speakers.
"""
import subprocess
import tempfile
from pathlib import Path

import mido
import numpy as np
from scipy.io import wavfile

SF2 = "/usr/share/sounds/sf2/FluidR3_GM.sf2"
SR = 44100
OUT = Path(__file__).resolve().parents[2] / "assets" / "sfx"

# General MIDI programs (0-based) and drum keys (channel 10).
CELESTA, GLOCK, MUSICBOX, VIBES, MARIMBA, TUBULAR = 8, 9, 10, 11, 12, 14
TRUMPET, TROMBONE, HORN, BRASS = 56, 57, 60, 61
TIMPANI, ORCH_HIT = 47, 55
DRUM = "drum"
CRASH, SPLASH, TRIANGLE, CHIMES, HI_WOOD, LO_WOOD, RIDE_BELL = 49, 55, 81, 84, 76, 77, 53


def note(name: str) -> int:
    """'C5' -> 72 (C4 = middle C = 60)."""
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    pitch, octave = name[:-1], int(name[-1])
    return 12 * (octave + 1) + names[pitch]


def render(events, tail=2.5, gain=0.45, reverb=0.28):
    """events: (start_s, instrument, midi_note, velocity, duration_s). Returns mono float audio."""
    instruments = sorted({e[1] for e in events if e[1] != DRUM})
    chan = {ins: i if i < 9 else i + 1 for i, ins in enumerate(instruments)}
    chan[DRUM] = 9
    mid = mido.MidiFile(ticks_per_beat=480)
    track = mido.MidiTrack()
    mid.tracks.append(track)
    track.append(mido.MetaMessage("set_tempo", tempo=500000, time=0))  # 120 bpm: 960 ticks per second
    for ins in instruments:
        track.append(mido.Message("program_change", channel=chan[ins], program=ins, time=0))
        track.append(mido.Message("control_change", channel=chan[ins], control=93, value=0, time=0))  # no chorus send
    msgs = []
    for start, ins, n, vel, dur in events:
        c = chan[ins]
        msgs.append((start, mido.Message("note_on", channel=c, note=n, velocity=vel)))
        msgs.append((start + dur, mido.Message("note_off", channel=c, note=n, velocity=0)))
    end = max(t for t, _ in msgs) + tail
    msgs.append((end, mido.Message("control_change", channel=0, control=7, value=100)))
    msgs.sort(key=lambda m: m[0])
    now = 0
    for t, m in msgs:
        ticks = int(round(t * 960))
        track.append(m.copy(time=ticks - now))
        now = ticks
    with tempfile.TemporaryDirectory() as d:
        mpath, wpath = Path(d) / "s.mid", Path(d) / "s.wav"
        mid.save(mpath)
        subprocess.run(
            ["fluidsynth", "-ni", "-q", "-C", "0", "-R", "1", "-g", str(gain), "-r", str(SR),
             "-o", "synth.reverb.room-size=0.32", "-o", "synth.reverb.damp=0.5",
             "-o", "synth.reverb.width=0.6", "-o", f"synth.reverb.level={reverb}",
             "-F", str(wpath), SF2, str(mpath)],
            check=True,
        )
        sr, x = wavfile.read(wpath)
    x = x.astype(np.float64)
    if x.ndim == 2:
        x = x.mean(axis=1)
    return x / 32768.0


def finish(x, peak_db, max_s=2.0, lead_ms=2):
    """Trim silence, cap the length (sounds overlap in play; long tails smear), fade, set the peak."""
    thresh = np.max(np.abs(x)) * 10 ** (-48 / 20)
    idx = np.where(np.abs(x) > thresh)[0]
    start = max(0, idx[0] - int(SR * lead_ms / 1000))
    x = x[start : min(idx[-1] + 1, start + int(SR * max_s))].copy()
    n = min(len(x), int(SR * min(0.25, max_s / 3)))
    x[-n:] *= np.linspace(1, 0, n) ** 2
    return x / (np.max(np.abs(x)) or 1) * 10 ** (peak_db / 20)


def write(name, x):
    wavfile.write(OUT / f"{name}.wav", SR, np.int16(np.clip(x, -1, 1) * 32767))
    return name, len(x) / SR


def make():
    out = []
    N = note

    # Spoke unlock: one clear bell, glockenspiel on top for sparkle.
    out.append(write("unlock", finish(render([(0, TUBULAR, N("E5"), 104, 1.2), (0.004, GLOCK, N("E6"), 70, 0.6)]), -3, 1.5)))

    # Combos: the bells climb.
    out.append(write("combo2", finish(render([
        (0, TUBULAR, N("E5"), 100, 1.0), (0.004, GLOCK, N("E6"), 64, 0.4),
        (0.1, TUBULAR, N("G5"), 108, 1.2), (0.104, GLOCK, N("G6"), 72, 0.6),
    ]), -2.5, 1.7)))
    out.append(write("combo3", finish(render([
        (0.00, TUBULAR, N("C5"), 96, 0.8), (0.07, TUBULAR, N("E5"), 100, 0.8), (0.14, TUBULAR, N("G5"), 104, 0.9),
        (0.21, TUBULAR, N("C6"), 112, 1.4),
        (0.00, GLOCK, N("C6"), 60, 0.3), (0.07, GLOCK, N("E6"), 64, 0.3), (0.14, GLOCK, N("G6"), 68, 0.3), (0.21, GLOCK, N("C7"), 80, 0.8),
        (0.21, DRUM, TRIANGLE, 70, 0.5),
    ]), -2, 2.0)))

    # Key picked up: quick glockenspiel lift + triangle.
    out.append(write("key", finish(render([
        (0, GLOCK, N("G6"), 84, 0.2), (0.06, GLOCK, N("C7"), 96, 0.5), (0.06, DRUM, TRIANGLE, 56, 0.4),
    ]), -6, 1.0)))

    # Coins: a bright "ting" each, rising C7 D7 E7 G7.
    for name, n in (("coin1", "C7"), ("coin2", "D7"), ("coin3", "E7"), ("coin4", "G7")):
        out.append(write(name, finish(render([(0, GLOCK, N(n), 100, 0.4), (0, DRUM, TRIANGLE, 44, 0.3)], tail=1.2, reverb=0.18), -8, 0.8)))

    # Stars: do - mi - sol on glockenspiel and vibraphone.
    for name, n in (("star1", "C6"), ("star2", "E6"), ("star3", "G6")):
        out.append(write(name, finish(render([(0, GLOCK, N(n), 100, 0.5), (0, VIBES, N(n[:-1] + str(int(n[-1]) - 1)), 90, 0.8)], tail=1.5), -4, 1.2)))

    # Win: "ta-da!" Short brass pickup, then the full chord with trumpets, a timpani hit,
    # a crash cymbal and a glockenspiel run on top.
    ta, da = 0.0, 0.17
    ev = []
    for n in ("G3", "B3", "D4", "G4"):
        ev.append((ta, BRASS, N(n), 100, 0.12))
    for n in ("D5", "G5"):
        ev.append((ta, TRUMPET, N(n), 96, 0.12))
    for n in ("C3", "G3", "C4", "E4", "G4", "C5"):
        ev.append((da, BRASS, N(n), 112, 0.95))
    for n in ("E5", "G5", "C6"):
        ev.append((da, TRUMPET, N(n), 110, 0.95))
    ev += [(da, TIMPANI, N("C2"), 118, 0.6), (da, DRUM, CRASH, 100, 1.5)]
    for i, n in enumerate(("C6", "E6", "G6", "C7")):
        ev.append((da + 0.03 + i * 0.06, GLOCK, N(n), 76 + i * 6, 0.5))
    out.append(write("win", finish(render(ev, tail=2.0, reverb=0.3), -1, 2.6)))

    # 3 stars: rising sparkle over the confetti shower.
    ev = [(i * 0.045, CELESTA, N(n), 80 + i * 4, 0.4) for i, n in enumerate(("C6", "D6", "E6", "G6", "A6", "C7", "E7", "G7"))]
    ev += [(i * 0.045 + 0.02, GLOCK, N(n), 60, 0.3) for i, n in enumerate(("C7", "E7", "G7", "C8"))]
    ev.append((0.32, DRUM, TRIANGLE, 70, 0.6))
    out.append(write("sparkle", finish(render(ev), -6, 1.5)))

    # Vault jackpot: a shower of coin tings over a bell chord.
    rng = np.random.default_rng(3)
    pent = [N(n) for n in ("C7", "D7", "E7", "G7", "A7", "C8")]
    ev = [(0, TUBULAR, N("C5"), 100, 1.4), (0, TUBULAR, N("G5"), 96, 1.4), (0, DRUM, CRASH, 70, 1.4)]
    for i in range(18):
        ev.append((0.03 + i * 0.045 + rng.uniform(0, 0.02), GLOCK, int(rng.choice(pent)), int(70 + rng.integers(0, 40)), 0.25))
    out.append(write("jackpot", finish(render(ev), -2.5, 2.4)))

    # Blocked ring: two soft low wood knocks (no bell).
    out.append(write("deny", finish(render([(0, DRUM, LO_WOOD, 90, 0.1), (0.1, DRUM, LO_WOOD, 70, 0.1)], tail=0.6, reverb=0.1), -8)))

    # Buttons: a light high wood tap.
    out.append(write("tap", finish(render([(0, DRUM, HI_WOOD, 70, 0.08)], tail=0.3, reverb=0.05), -12)))

    # Safe door: low timpani + bell as the door swings (the latch clunk is mixed in below).
    out.append(write("safeopen_music", finish(render([
        (0.05, TIMPANI, N("G1"), 110, 0.8), (0.12, TUBULAR, N("G4"), 96, 1.6), (0.12, DRUM, CRASH, 50, 1.2),
    ]), -3, 2.2)))
    return out


def mix_safeopen():
    """Latch clunk from make_sfx's palette + the rendered timpani/bell."""
    import importlib.util

    spec = importlib.util.spec_from_file_location("make_sfx", Path(__file__).with_name("make_sfx.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    sr, music = wavfile.read(OUT / "safeopen_music.wav")
    music = music.astype(np.float64) / 32768
    clunk = m.clunk(65, (380, 1050), 0.35, heavy=2.0)
    b = np.zeros(max(len(music) + int(SR * 0.1), len(clunk)))
    b[: len(clunk)] += clunk * 0.6
    b[int(SR * 0.08) : int(SR * 0.08) + len(music)] += music
    (OUT / "safeopen_music.wav").unlink()
    return write("safeopen", finish(b, -2, 2.4))


if __name__ == "__main__":
    for name, secs in make():
        if name != "safeopen_music":
            print(f"{name:9s} {secs:5.2f}s")
    name, secs = mix_safeopen()
    print(f"{name:9s} {secs:5.2f}s")
