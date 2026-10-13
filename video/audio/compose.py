#!/usr/bin/env python3
"""Compose and mix the original score for the Mise launch film.

Everything is synthesized here and timed from src/timeline.json, so musical
sections, transitions and UI sound effects land on the same frames as the video.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from pedalboard import (
    Chorus,
    Compressor,
    Delay,
    Gain,
    HighpassFilter,
    HighShelfFilter,
    Limiter,
    LowpassFilter,
    LowShelfFilter,
    Pedalboard,
    Reverb,
)
from scipy.signal import butter, resample_poly, sosfilt, sosfiltfilt

ROOT = Path(__file__).resolve().parents[1]
TL = json.loads((ROOT / "src" / "timeline.json").read_text())

SR = 48_000
BPM = TL["bpm"]
BEAT = 60 / BPM
BAR = BEAT * 4
DUR = TL["duration"]
N = int(SR * DUR)
rng = np.random.default_rng(7)


def bars(b: float) -> float:
    return b * BAR


class Bus:
    def __init__(self) -> None:
        self.buf = np.zeros((2, N), dtype=np.float32)

    def add(self, start: float, sig: np.ndarray, gain: float = 1.0, pan: float = 0.0) -> None:
        if sig.ndim == 1:
            l = sig * np.sqrt((1 - pan) / 2) * np.sqrt(2)
            r = sig * np.sqrt((1 + pan) / 2) * np.sqrt(2)
            sig = np.stack([l, r])
        lo = int(round(start * SR))
        if lo >= N:
            return
        if lo < 0:
            sig = sig[:, -lo:]
            lo = 0
        hi = min(N, lo + sig.shape[1])
        self.buf[:, lo:hi] += (sig[:, : hi - lo] * gain).astype(np.float32)


def midi(n: float) -> float:
    return 440.0 * 2 ** ((n - 69) / 12)


NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def n(name: str) -> int:
    pitch, octave = name[:-1], int(name[-1])
    return 12 * (octave + 1) + NOTE[pitch]


def tvec(d: float) -> np.ndarray:
    return np.arange(int(d * SR)) / SR


def adsr(d: float, a: float, dcy: float, s: float, r: float) -> np.ndarray:
    t = tvec(d + r)
    env = np.ones_like(t) * s
    env[t < a] = t[t < a] / max(a, 1e-4)
    m = (t >= a) & (t < a + dcy)
    env[m] = 1 - (1 - s) * (t[m] - a) / max(dcy, 1e-4)
    rel = t >= d
    env[rel] = s * np.exp(-(t[rel] - d) / max(r / 4, 1e-4))
    return env


def lp(sig: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    sos = butter(order, min(cutoff, SR * 0.45), "low", fs=SR, output="sos")
    return sosfilt(sos, sig)


def hp(sig: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    sos = butter(order, cutoff, "high", fs=SR, output="sos")
    return sosfilt(sos, sig)


def bp(sig: np.ndarray, lo_hz: float, hi_hz: float, order: int = 2) -> np.ndarray:
    sos = butter(order, [lo_hz, min(hi_hz, SR * 0.45)], "band", fs=SR, output="sos")
    return sosfilt(sos, sig)


def saw(f: float, d: float, detune_cents: float = 0.0, phase: float | None = None) -> np.ndarray:
    """Oversampled naive saw, decimated to tame aliasing."""
    os = 2
    t = np.arange(int(d * SR * os)) / (SR * os)
    ff = f * 2 ** (detune_cents / 1200)
    ph = rng.random() if phase is None else phase
    s = 2 * ((t * ff + ph) % 1.0) - 1
    return resample_poly(s, 1, os)[: int(d * SR)]


def supersaw(f: float, d: float, voices: int = 7, spread: float = 22.0) -> np.ndarray:
    out = np.zeros(int(d * SR))
    for i in range(voices):
        c = (i - (voices - 1) / 2) / ((voices - 1) / 2) * spread
        out += saw(f, d, c)
    return out / voices


def stereo_supersaw(f: float, d: float, voices: int = 6, spread: float = 24.0) -> np.ndarray:
    l = np.zeros(int(d * SR))
    r = np.zeros(int(d * SR))
    for i in range(voices):
        c = (i - (voices - 1) / 2) / ((voices - 1) / 2) * spread
        s = saw(f, d, c)
        if i % 2:
            l += s * 0.8
            r += s * 0.35
        else:
            r += s * 0.8
            l += s * 0.35
    return np.stack([l, r]) / voices


def additive(f: float, d: float, partials: int = 24, bright: float = 1.0, decay: float = 3.0, hdecay: float = 0.6, inharm: float = 0.0) -> np.ndarray:
    """Plucked tone: upper harmonics decay faster, like a real string or a filter envelope."""
    t = tvec(d)
    out = np.zeros_like(t)
    for k in range(1, partials + 1):
        fk = f * k * np.sqrt(1 + inharm * k * k)
        if fk > SR * 0.45:
            break
        amp = (1 / k) ** (1.2 / bright)
        out += amp * np.sin(2 * np.pi * fk * t + k * 0.3) * np.exp(-t * (decay + hdecay * k * k / bright))
    return out


def noise(d: float) -> np.ndarray:
    return rng.normal(0, 1, int(d * SR))


# ----------------------------------------------------------------------------- instruments


def kick(vel: float = 1.0, long: bool = False) -> np.ndarray:
    d = 0.55 if long else 0.38
    t = tvec(d)
    f = 44 + 120 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * (5.5 if long else 8.5))
    click = hp(noise(d), 2500) * np.exp(-t * 420) * 0.35
    return np.tanh((body + click) * 1.8) * 0.9 * vel


def clap(vel: float = 1.0) -> np.ndarray:
    d = 0.45
    t = tvec(d)
    nz = bp(noise(d), 900, 3200)
    env = np.zeros_like(t)
    for off in (0.0, 0.011, 0.023):
        m = t >= off
        env[m] += np.exp(-(t[m] - off) * 160) * 0.8
    env += np.exp(-np.maximum(t - 0.03, 0) * 14) * (t >= 0.03) * 0.45
    return nz * env * 0.55 * vel


def snare(vel: float = 1.0) -> np.ndarray:
    d = 0.3
    t = tvec(d)
    tone = np.sin(2 * np.pi * (185 + 40 * np.exp(-t * 40)) * t) * np.exp(-t * 28)
    nz = bp(noise(d), 1200, 8000) * np.exp(-t * 22)
    return (tone * 0.5 + nz * 0.6) * vel


def hat(vel: float = 1.0, open_: bool = False) -> np.ndarray:
    d = 0.35 if open_ else 0.07
    t = tvec(d)
    metal = sum(np.sign(np.sin(2 * np.pi * f * t)) for f in (3140, 4270, 5510, 6830, 8120)) / 5
    sig = hp(noise(d) * 0.6 + metal * 0.5, 7200)
    return sig * np.exp(-t * (11 if open_ else 70)) * 0.2 * vel


def shaker(vel: float = 1.0) -> np.ndarray:
    d = 0.08
    t = tvec(d)
    env = np.minimum(1, t / 0.008) * np.exp(-t * 55)
    return bp(noise(d), 5000, 11000) * env * 0.22 * vel


def tom(freq: float, vel: float = 1.0) -> np.ndarray:
    d = 0.4
    t = tvec(d)
    f = freq * (1 + 0.6 * np.exp(-t * 25))
    return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * 1.4) * 0.55 * vel


def crash(vel: float = 1.0, d: float = 2.4) -> np.ndarray:
    t = tvec(d)
    metal = sum(np.sin(2 * np.pi * f * t + rng.random() * 6) for f in (3870, 5120, 6340, 7710, 9230, 10420)) / 6
    sig = hp(noise(d) * 0.7 + metal * 0.4, 4200)
    return lp(sig, 12000) * np.exp(-t * 1.9) * np.minimum(1, t / 0.002) * 0.2 * vel


def boom(d: float = 2.2) -> np.ndarray:
    t = tvec(d)
    f = 30 + 70 * np.exp(-t * 6)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2)
    nz = lp(noise(d), 900) * np.exp(-t * 7) * 0.35
    return np.tanh((body + nz) * 1.6) * 0.8


def riser(d: float, top: float = 9000) -> np.ndarray:
    count = int(d * SR)
    out = np.zeros(count)
    nz = noise(d)
    chunk = int(0.02 * SR)
    for i in range(0, count, chunk):
        p = i / count
        center = 300 * (top / 300) ** (p**1.6)
        seg = nz[max(0, i - 512) : i + chunk]
        filt = bp(seg, center * 0.7, center * 1.4)
        out[i : i + chunk] = filt[-min(chunk, count - i) :]
    env = np.linspace(0, 1, count) ** 2.2
    pitch = 2 * np.pi * np.cumsum(110 * 2 ** (np.linspace(0, 3, count))) / SR
    tone = np.sign(np.sin(pitch)) * 0.06 * env
    return out * env * 0.6 + lp(tone, 4000)


def whoosh(d: float = 0.7, up: bool = True) -> np.ndarray:
    count = int(d * SR)
    out = np.zeros(count)
    nz = noise(d)
    chunk = int(0.015 * SR)
    for i in range(0, count, chunk):
        p = i / count
        p = p if up else 1 - p
        center = 400 * (6000 / 400) ** p
        seg = nz[max(0, i - 512) : i + chunk]
        out[i : i + chunk] = bp(seg, center * 0.6, center * 1.6)[-min(chunk, count - i) :]
    env = np.sin(np.pi * np.linspace(0, 1, count)) ** 2
    return out * env * 0.5


def reverse_crash(d: float = 1.2) -> np.ndarray:
    return crash(1.0, d)[::-1] * np.linspace(0.2, 1, int(d * SR)) ** 2


def ui_click(vel: float = 1.0) -> np.ndarray:
    d = 0.05
    t = tvec(d)
    tone = np.sin(2 * np.pi * 2300 * t) * np.exp(-t * 160)
    tick = hp(noise(d), 4000) * np.exp(-t * 600) * 0.6
    return (tone * 0.5 + tick) * 0.5 * vel


def ui_pop(base: float = 620, vel: float = 1.0) -> np.ndarray:
    d = 0.16
    t = tvec(d)
    f = base * (1 + 0.7 * (1 - np.exp(-t * 60)))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 26) * np.minimum(1, t / 0.002)
    return s * 0.45 * vel


def bell(f: float, d: float = 1.6, vel: float = 1.0) -> np.ndarray:
    t = tvec(d)
    out = np.zeros_like(t)
    for ratio, amp, dec in ((1, 1, 2.6), (2.0, 0.5, 4), (2.76, 0.35, 5), (5.4, 0.18, 8), (8.93, 0.08, 12)):
        out += amp * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t * dec)
    return out * np.minimum(1, t / 0.002) * 0.22 * vel


def type_tick() -> np.ndarray:
    d = 0.03
    t = tvec(d)
    return bp(noise(d), 1800, 6000) * np.exp(-t * 300) * 0.18


def pluck(note: int, d: float = 0.5, bright: float = 1.0, vel: float = 1.0) -> np.ndarray:
    f = midi(note)
    s = additive(f, d + 0.3, partials=28, bright=bright, decay=5.0, hdecay=0.35)
    s += 0.5 * additive(f * 1.003, d + 0.3, partials=20, bright=bright, decay=5.0, hdecay=0.35)
    env = adsr(d, 0.003, 0.05, 0.9, 0.3)[: len(s)]
    return s[: len(env)] * env * 0.4 * vel


def keys(note: int, d: float, vel: float = 1.0) -> np.ndarray:
    f = midi(note)
    s = additive(f, d + 0.8, partials=16, bright=0.8, decay=1.4, hdecay=0.25, inharm=0.0002)
    env = adsr(d, 0.004, 0.3, 0.7, 0.8)[: len(s)]
    return s[: len(env)] * env * 0.32 * vel


def pad(notes: list[int], d: float, cutoff: float = 2400, vel: float = 1.0) -> np.ndarray:
    total = d + 1.2
    st = np.zeros((2, int(total * SR)))
    for note in notes:
        st += stereo_supersaw(midi(note), total, voices=6, spread=18)
    env = adsr(d, 0.35, 0.4, 0.85, 1.2)[: st.shape[1]]
    st = st[:, : len(env)] * env
    st = np.stack([lp(st[0], cutoff, 2), lp(st[1], cutoff, 2)])
    return st * 0.32 * vel / max(1, len(notes) ** 0.5)


def stab(notes: list[int], d: float, cutoff: float = 5200, vel: float = 1.0) -> np.ndarray:
    total = d + 0.25
    st = np.zeros((2, int(total * SR)))
    for note in notes:
        st += stereo_supersaw(midi(note), total, voices=6, spread=26)
    t = tvec(total)
    env = adsr(d, 0.004, 0.12, 0.55, 0.22)[: st.shape[1]]
    st = st[:, : len(env)] * env
    # filter envelope approximated by blending bright attack into darker body
    bright = np.stack([lp(st[0], cutoff), lp(st[1], cutoff)])
    dark = np.stack([lp(st[0], cutoff * 0.35), lp(st[1], cutoff * 0.35)])
    mix = np.exp(-t[: st.shape[1]] * 9)
    return (bright * mix + dark * (1 - mix)) * 0.4 * vel / max(1, len(notes) ** 0.5)


def bass(note: int, d: float, cutoff: float = 900, vel: float = 1.0, grit: float = 1.0) -> np.ndarray:
    f = midi(note)
    total = d + 0.06
    t = tvec(total)
    sub = np.sin(2 * np.pi * f * t)
    body = saw(f, total, 0, 0.0) * 0.6 + saw(f, total, 7, 0.25) * 0.4
    body = lp(body, cutoff * (1 + 2.5 * np.exp(-t[: len(body)] * 18)).mean())
    env = adsr(d, 0.004, 0.08, 0.85, 0.06)[: len(t)]
    sig = (sub[: len(env)] * 0.75 + body[: len(env)] * 0.55 * grit) * env
    return np.tanh(sig * 1.3) * 0.5 * vel


def lead(note: int, d: float, vel: float = 1.0, bright: float = 4200) -> np.ndarray:
    f = midi(note)
    total = d + 0.25
    t = tvec(total)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(1, t / 0.25)
    ph = np.cumsum(f * vib) / SR
    sq = np.sign(np.sin(2 * np.pi * ph)) * 0.35 + (2 * (ph % 1) - 1) * 0.65
    sq2 = 2 * ((ph * 1.006 + 0.3) % 1) - 1
    s = lp(sq * 0.7 + sq2 * 0.3, bright)
    env = adsr(d, 0.006, 0.1, 0.75, 0.2)[: len(t)]
    return s[: len(env)] * env * 0.24 * vel


# ----------------------------------------------------------------------------- arrangement

drums = Bus()
bassbus = Bus()
music = Bus()
leadbus = Bus()
fx = Bus()
ui = Bus()

kicks: list[float] = []


def K(t: float, vel: float = 1.0, long: bool = False) -> None:
    drums.add(t, kick(vel, long), 1.0)
    kicks.append(t)


S = TL["scenes"]

# Chords in F major. Voicings stay in the mid register so the pad never muddies the bass.
F_ = [n("F3"), n("A3"), n("C4"), n("E4")]
C_ = [n("E3"), n("G3"), n("C4"), n("D4")]
Dm = [n("D3"), n("F3"), n("A3"), n("C4")]
Bb = [n("D3"), n("F3"), n("Bb3"), n("C4")]
Gm = [n("D3"), n("G3"), n("Bb3"), n("D4")]
Am = [n("C3"), n("E3"), n("A3"), n("C4")]
ROOTS = {"F": n("F1"), "C": n("C2"), "Dm": n("D2"), "Bb": n("Bb1"), "Gm": n("G1"), "Am": n("A1")}
CH = {"F": F_, "C": C_, "Dm": Dm, "Bb": Bb, "Gm": Gm, "Am": Am}

# ---- 1. Logo motif (0 to 4s). Each mark lands on a note, the brand square lands on a chord.
motif = [n("C5"), n("F5"), n("A5")]
for t0, note in zip(TL["intro"]["dots"], motif):
    music.add(t0, pluck(note, 0.6, 1.4, 1.0), 0.9, pan=-0.2 + 0.2 * motif.index(note))
    ui.add(t0, ui_pop(700 + 80 * motif.index(note), 0.6))
music.add(TL["intro"]["brand"], pluck(n("C6"), 0.9, 1.6, 1.0), 0.9)
music.add(TL["intro"]["brand"], pad(F_ + [n("C5")], 2.0, 1800, 0.9), 0.8)
music.add(0.0, pad([n("F3"), n("C4"), n("A4")], 2.0, 900, 0.55), 0.7)
drums.add(TL["intro"]["brand"], boom(1.6) * 0.5, 0.8)
fx.add(TL["intro"]["brand"], crash(0.5, 2.0), 0.6)
fx.add(TL["intro"]["word"] - 0.1, whoosh(0.5), 0.35, pan=-0.3)
for i, t0 in enumerate(np.arange(2.0, 4.0, BEAT / 2)):
    drums.add(t0, shaker(0.5 + 0.3 * (i % 2)), 0.8, pan=0.3)
K(2.0, 0.8)
K(3.0, 0.7)
fx.add(3.0, reverse_crash(1.0), 0.5)

# ---- 2. FlexForce today (4 to 10s). Dark, tense, filtered, ticking.
tense = [("Dm", 4.0), ("Bb", 6.0), ("Gm", 8.0)]
for name, t0 in tense:
    music.add(t0, pad(CH[name], 2.0, 700, 0.9), 0.85)
for i, t0 in enumerate(np.arange(4.0, 9.0, BEAT / 4)):
    drums.add(t0, hat(0.2 + 0.2 * (i % 4 == 0)), 0.45, pan=0.25)
for i, t0 in enumerate(np.arange(4.0, 9.0, BEAT / 2)):
    root = ROOTS[[c for c, s in tense if s <= t0][-1]]
    bassbus.add(t0, bass(root + 12, BEAT / 2 * 0.45, 300, 0.5, 0.4), 0.55)
for i, t0 in enumerate(TL["oldway"]["cards"]):
    drums.add(t0, tom(70 + (i % 3) * 8, 0.8), 0.9, pan=(-0.3 if i % 2 else 0.3))
    ui.add(t0 + 0.02, bell(midi(n("A5") - (i % 3)), 0.6, 0.35), 0.6, pan=(0.4 if i % 2 else -0.4))
for t0 in (4.0, 6.0, 8.0):
    K(t0, 0.7)
# Build into the drop: snare roll, riser, everything sucks inward.
roll = np.concatenate([np.arange(8.0, 9.0, BEAT / 2), np.arange(9.0, 9.5, BEAT / 4), np.arange(9.5, 9.875, BEAT / 8)])
for i, t0 in enumerate(roll):
    drums.add(t0, snare(0.25 + 0.6 * i / len(roll)), 0.8)
fx.add(8.0, riser(1.9), 0.75)
fx.add(TL["oldway"]["implode"], reverse_crash(1.0), 0.7)

# ---- Groove helpers


def four_floor(t0: float, t1: float, vel: float = 1.0) -> None:
    for t in np.arange(t0, t1 - 1e-6, BEAT):
        K(t, vel)


def backbeat(t0: float, t1: float, vel: float = 1.0) -> None:
    for t in np.arange(t0 + BEAT, t1 - 1e-6, BEAT * 2):
        drums.add(t, clap(vel), 0.85)


def hats(t0: float, t1: float, density: int = 2, vel: float = 1.0, swing: float = 0.0) -> None:
    step = BEAT / density
    for i, t in enumerate(np.arange(t0, t1 - 1e-6, step)):
        off = i % density != 0
        v = (0.55 if off else 0.3) * vel * (0.85 + 0.3 * rng.random())
        drums.add(t + (swing * step if (i % 2) else 0), hat(v, open_=(density == 2 and off and i % 8 == 7)), 0.9, pan=0.2)


def chord_prog(t0: float, prog: list[str], style: str, vel: float = 1.0, cutoff: float = 5200) -> None:
    for i, name in enumerate(prog):
        bt = t0 + i * BAR
        notes = CH[name]
        if style == "pad":
            music.add(bt, pad(notes, BAR, cutoff, vel), 0.8)
        elif style == "stab":
            for off, d in ((0, 0.35), (0.75, 0.2), (1.5, 0.35), (2.5, 0.2), (3.0, 0.35)):
                music.add(bt + off * BEAT, stab(notes, d * BEAT * 2, cutoff, vel), 0.75)
        elif style == "keys":
            for off in (0, 1.5, 2.5):
                for k, note in enumerate(notes):
                    music.add(bt + off * BEAT + k * 0.008, keys(note + 12, BEAT * 1.2, vel * 0.8), 0.7, pan=(k - 1.5) * 0.2)


def bassline(t0: float, prog: list[str], pattern: str, vel: float = 1.0) -> None:
    for i, name in enumerate(prog):
        bt = t0 + i * BAR
        r = ROOTS[name] + 12
        if pattern == "offbeat":
            for b in range(4):
                bassbus.add(bt + b * BEAT + BEAT / 2, bass(r, BEAT / 2 * 0.8, 900, vel), 0.9)
                if b in (1, 3):
                    bassbus.add(bt + b * BEAT + BEAT * 0.75, bass(r + 12, BEAT / 4 * 0.7, 1200, vel * 0.7), 0.7)
        elif pattern == "rolling":
            seq = [0, 0, 12, 0, 7, 0, 12, 10]
            for k in range(16):
                bassbus.add(bt + k * BEAT / 4, bass(r + seq[k % 8], BEAT / 4 * 0.75, 1100, vel * (1 if k % 4 == 0 else 0.75)), 0.85)
        elif pattern == "funk":
            hits = [(0, 0, 0.4), (0.75, 12, 0.2), (1.5, 0, 0.25), (2.0, 7, 0.4), (2.75, 10, 0.2), (3.25, 12, 0.2), (3.5, 7, 0.25)]
            for off, iv, d in hits:
                bassbus.add(bt + off * BEAT, bass(r + iv, d * BEAT * 2, 1400, vel, 1.3), 0.9)
        elif pattern == "drive":
            for k in range(8):
                bassbus.add(bt + k * BEAT / 2, bass(r + (12 if k % 2 else 0), BEAT / 2 * 0.85, 1300, vel), 0.9)


def melody(t0: float, notes: list[tuple[float, str, float]], inst: str = "pluck", vel: float = 1.0) -> None:
    for beat_off, name, length in notes:
        tt = t0 + beat_off * BEAT
        if inst == "pluck":
            leadbus.add(tt, pluck(n(name), length * BEAT, 1.5, vel), 0.9)
        elif inst == "lead":
            leadbus.add(tt, lead(n(name), length * BEAT, vel), 0.9)
        elif inst == "bell":
            leadbus.add(tt, bell(midi(n(name)), length * BEAT + 0.8, vel), 0.8)


# ---- 3. Drop A: request (10 to 18s)
a0, a1 = S["request"]
drums.add(a0, boom(1.6), 0.9)
fx.add(a0, crash(1.0), 0.8)
four_floor(a0, a1)
backbeat(a0, a1)
hats(a0, a1, 2)
chord_prog(a0, ["F", "C", "Dm", "Bb"], "stab")
bassline(a0, ["F", "C", "Dm", "Bb"], "offbeat")
hookA = [(0, "A4", 0.5), (0.5, "C5", 0.5), (1.5, "F5", 0.75), (2.5, "E5", 0.5), (3, "C5", 1),
         (4, "G4", 0.5), (4.5, "C5", 0.5), (5.5, "E5", 0.75), (6.5, "D5", 0.5), (7, "C5", 1),
         (8, "A4", 0.5), (8.5, "D5", 0.5), (9.5, "F5", 0.75), (10.5, "E5", 0.5), (11, "D5", 1),
         (12, "D5", 0.5), (12.5, "F5", 0.5), (13.5, "Bb5", 0.5), (14, "A5", 0.5), (14.5, "G5", 0.5), (15, "F5", 1)]
melody(a0, hookA, "pluck", 0.8)
# typing and chips
rq = TL["request"]
for t0 in np.arange(rq["typeStart"], rq["typeEnd"], 0.055):
    ui.add(t0 + rng.random() * 0.01, type_tick(), 0.5, pan=rng.uniform(-0.2, 0.2))
for i, t0 in enumerate(rq["chips"]):
    ui.add(t0, ui_pop(560 + i * 70, 0.8), 0.8, pan=-0.3 + i * 0.15)
ui.add(rq["click"], ui_click(1.0), 1.0)
fx.add(rq["click"] - 0.05, whoosh(0.5), 0.3)
scale = ["F5", "G5", "A5", "C6", "D6", "F6"]
for i, t0 in enumerate(rq["pros"]):
    ui.add(t0, ui_pop(520 + (i % 6) * 60, 0.55), 0.7, pan=-0.5 + (i % 6) * 0.2)
ui.add(rq["done"], bell(midi(n("C6")), 1.4, 0.8), 0.8)
ui.add(rq["done"] + 0.08, bell(midi(n("F6")), 1.4, 0.6), 0.7)
fx.add(a1 - 0.5, whoosh(0.55), 0.4, pan=0.3)

# ---- 4. Section B: schedule (18 to 24s). Arpeggio leads, bass rolls.
b0, b1 = S["schedule"]
fx.add(b0, crash(0.6), 0.6)
four_floor(b0, b1)
backbeat(b0, b1, 0.9)
hats(b0, b1, 4, 0.7)
for t0 in np.arange(b0, b1, BEAT / 2):
    drums.add(t0 + BEAT / 4, shaker(0.6), 0.7, pan=-0.35)
progB = ["Dm", "Bb", "F"]
chord_prog(b0, progB, "pad", 0.75, 2600)
bassline(b0, progB, "rolling", 0.85)
arp_tones = {"Dm": ["D5", "F5", "A5", "C6"], "Bb": ["Bb4", "D5", "F5", "A5"], "F": ["F5", "A5", "C6", "E6"]}
for i, name in enumerate(progB):
    tones = arp_tones[name]
    order = [0, 1, 2, 3, 2, 1, 2, 3] if i != 2 else [0, 2, 1, 3, 2, 3, 1, 3]
    for k in range(16):
        tt = b0 + i * BAR + k * BEAT / 4
        leadbus.add(tt, pluck(n(tones[order[k % 8]]), BEAT / 4, 1.2, 0.55 + 0.25 * (k % 4 == 0)), 0.75, pan=(-0.35 if k % 2 else 0.35))
sc = TL["schedule"]
for i in range(sc["fillCount"]):
    tt = sc["fillStart"] + i * sc["fillStep"]
    ui.add(tt, ui_pop(600 + (i % 5) * 50, 0.3), 0.55, pan=-0.6 + (i % 7) * 0.2)
for t0 in sc["toasts"]:
    ui.add(t0, bell(midi(n("E6")), 0.9, 0.5), 0.7, pan=0.4)
for i, t0 in enumerate([23.0, 23.25, 23.5, 23.75]):
    drums.add(t0, tom(140 - i * 22, 0.8), 0.8, pan=0.3 - i * 0.2)

# ---- 5. Section C: approvals (24 to 30s). Funk bass, piano stabs, hook up an octave.
c0, c1 = S["approvals"]
drums.add(c0, boom(1.2) * 0.6, 0.7)
fx.add(c0, crash(0.8), 0.7)
four_floor(c0, c1)
backbeat(c0, c1)
hats(c0, c1, 4, 0.8, swing=0.12)
progC = ["F", "Am", "Bb"]
chord_prog(c0, progC, "keys", 1.0)
chord_prog(c0, progC, "pad", 0.45, 1800)
bassline(c0, progC, "funk", 0.95)
hookC = [(0.5, "C6", 0.5), (1, "A5", 0.5), (1.5, "C6", 0.5), (2, "D6", 1), (3.5, "C6", 0.5),
         (4.5, "E6", 0.5), (5, "C6", 0.5), (5.5, "A5", 1), (7, "G5", 0.5),
         (8.5, "F5", 0.5), (9, "A5", 0.5), (9.5, "C6", 0.5), (10, "D6", 0.75), (11, "F6", 1)]
melody(c0, hookC, "bell", 0.8)
ap = TL["approvals"]
for i, t0 in enumerate(ap["clicks"]):
    ui.add(t0, ui_click(0.9), 0.9)
    fx.add(t0 + 0.03, whoosh(0.45), 0.35, pan=0.5)
ui.add(ap["clear"], bell(midi(n("F6")), 1.6, 0.8), 0.8)
ui.add(ap["clear"] + 0.1, bell(midi(n("A6")), 1.6, 0.6), 0.7)
ui.add(ap["clear"] + 0.2, bell(midi(n("C7")), 1.6, 0.5), 0.6)

# ---- 6. Section D: timesheets (30 to 36s). New progression, countermelody, tom fills.
d0, d1 = S["timesheets"]
fx.add(d0, crash(0.6), 0.6)
four_floor(d0, d1)
backbeat(d0, d1)
hats(d0, d1, 2, 0.9)
progD = ["Gm", "Bb", "C"]
chord_prog(d0, progD, "stab", 0.85, 4200)
bassline(d0, progD, "offbeat", 0.9)
counter = [(0, "D5", 1.5), (1.5, "F5", 0.5), (2, "G5", 2),
           (4, "F5", 1.5), (5.5, "D5", 0.5), (6, "F5", 2),
           (8, "G5", 1), (9, "A5", 1), (10, "C6", 2)]
melody(d0, counter, "lead", 0.7)
ts = TL["timesheets"]
for i in range(ts["rows"]):
    tt = ts["scanStart"] + i * ts["checkStep"] * 2
    if i == ts["flagRow"]:
        ui.add(tt, bell(midi(n("Bb4")), 0.6, 0.6), 0.7)
    else:
        ui.add(tt, ui_pop(760 + i * 30, 0.45), 0.6, pan=-0.3 + i * 0.07)
fx.add(ts["zoom"] - 0.15, whoosh(0.6), 0.45)
ui.add(ts["click"], ui_click(1.0), 1.0)
ui.add(ts["click"] + 0.1, bell(midi(n("C6")), 1.0, 0.7), 0.8)
fx.add(ts["release"] - 0.1, whoosh(0.6, up=False), 0.4)
for i, t0 in enumerate([35.0, 35.25, 35.5, 35.625, 35.75, 35.875]):
    drums.add(t0, tom(170 - i * 18, 0.85), 0.85, pan=-0.4 + i * 0.16)

# ---- 7. Breakdown and build: tips (36 to 40s)
e0, e1 = S["tips"]
fx.add(e0, crash(0.7, 3.0), 0.7)
drums.add(e0, boom(2.0) * 0.6, 0.7)
music.add(e0, pad(Dm + [n("A4")], BAR, 1600, 0.9), 0.85)
music.add(e0 + BAR, pad(Bb + [n("F4")], BAR, 2200, 0.9), 0.85)
for k, off in enumerate([0, 1.5, 3, 4, 5.5, 7]):
    chord = Dm if off < 4 else Bb
    for j, note in enumerate(chord):
        music.add(e0 + off * BEAT + j * 0.01, keys(note + 12, BEAT * 1.5, 0.75), 0.7, pan=(j - 1.5) * 0.25)
tp = TL["tips"]
coins = ["F6", "A6", "C7", "A6", "D7", "F7"]
for t0, note in zip(tp["splits"], coins):
    ui.add(t0, bell(midi(n(note)), 0.9, 0.55), 0.7, pan=rng.uniform(-0.5, 0.5))
ui.add(tp["pool"], ui_pop(500, 0.7), 0.8)
ui.add(tp["matched"], ui_click(1.0), 0.9)
ui.add(tp["matched"] + 0.02, boom(0.6) * 0.3, 0.6)
build = np.concatenate([np.arange(38.0, 39.0, BEAT / 2), np.arange(39.0, 39.5, BEAT / 4), np.arange(39.5, 39.875, BEAT / 8)])
for i, t0 in enumerate(build):
    drums.add(t0, snare(0.3 + 0.7 * i / len(build)), 0.85)
for t0 in np.arange(38.0, 39.875, BEAT / 2):
    K(t0, 0.55 + 0.4 * (t0 - 38) / 2)
fx.add(37.5, riser(2.4, 11000), 0.8)
fx.add(39.0, reverse_crash(1.0), 0.75)

# ---- 8. Chorus: comparison and montage (40 to 50s). Biggest section, new hook.
f0, f1 = S["compare"][0], S["montage"][1]
drums.add(f0, boom(2.0), 1.0)
fx.add(f0, crash(1.1, 3.0), 0.9)
four_floor(f0, f1, 1.05)
backbeat(f0, f1, 1.1)
for t in np.arange(f0 + BEAT, f1, BEAT * 2):
    drums.add(t + 0.012, snare(0.5), 0.6)
hats(f0, f1, 4, 0.95)
for t in np.arange(f0, f1, BEAT):
    drums.add(t + BEAT / 2, hat(0.5, True), 0.5, pan=-0.2)
progF = ["F", "C", "Dm", "Bb", "F"]
chord_prog(f0, progF, "stab", 1.1, 6800)
chord_prog(f0, progF, "pad", 0.5, 3200)
bassline(f0, progF, "drive", 1.0)
hookF = [(0, "F5", 0.75), (0.75, "G5", 0.75), (1.5, "A5", 0.5), (2, "C6", 1.5), (3.5, "A5", 0.5),
         (4, "G5", 0.75), (4.75, "A5", 0.75), (5.5, "G5", 0.5), (6, "E5", 1.5), (7.5, "C5", 0.5),
         (8, "D5", 0.75), (8.75, "F5", 0.75), (9.5, "A5", 0.5), (10, "C6", 1), (11, "D6", 1),
         (12, "D6", 0.75), (12.75, "C6", 0.75), (13.5, "Bb5", 0.5), (14, "A5", 1), (15, "F5", 1),
         (16, "C6", 0.5), (16.5, "A5", 0.5), (17, "F5", 0.5), (17.5, "A5", 0.5), (18, "C6", 1), (19, "F6", 1)]
melody(f0, hookF, "lead", 0.95)
melody(f0, [(b, nm[:-1] + str(int(nm[-1]) - 1), ln) for b, nm, ln in hookF], "pluck", 0.45)
cp = TL["compare"]
for t0 in cp["rows"]:
    drums.add(t0, boom(0.8) * 0.4, 0.6)
    ui.add(t0 + 0.5, ui_pop(680, 0.6), 0.7)
for t0 in (44.0,):
    fx.add(t0, crash(0.6), 0.6)
for i, t0 in enumerate(TL["montage"]["cuts"]):
    fx.add(t0 - 0.35, whoosh(0.45), 0.45, pan=(-0.4 if i % 2 else 0.4))
    drums.add(t0, boom(0.7) * 0.45, 0.7)
fx.add(46.0, crash(0.8), 0.7)
for i, t0 in enumerate([49.0, 49.25, 49.5, 49.625, 49.75, 49.875]):
    drums.add(t0, tom(180 - i * 20, 0.9), 0.9, pan=-0.4 + i * 0.16)
fx.add(49.0, reverse_crash(1.0), 0.7)

# ---- 9. Outro (50 to 55.5s): hit, logo motif returns, ring out.
g0 = S["end"][0]
drums.add(g0, boom(3.0), 1.0)
K(g0, 1.0, long=True)
fx.add(g0, crash(1.0, 4.0), 0.9)
music.add(g0, pad(F_ + [n("A4"), n("C5")], 3.5, 2600, 1.0), 0.9)
music.add(g0, stab(F_ + [n("F4")], 0.6, 6000, 1.0), 0.8)
bassbus.add(g0, bass(n("F1") + 12, 2.5, 600, 0.9), 0.9)
for i, (t0, note) in enumerate(zip([50.5, 51.0, 51.5, 52.0], ["C5", "F5", "A5", "C6"])):
    leadbus.add(t0, pluck(n(note), 0.8, 1.4, 0.75), 0.8, pan=-0.3 + i * 0.2)
leadbus.add(52.0, bell(midi(n("F6")), 3.0, 0.6), 0.7)
ui.add(TL["end"]["word"] - 0.1, whoosh(0.5), 0.3)
fx.add(49.55, whoosh(0.5, up=False), 0.45)
for i in range(3):
    ui.add(g0 + i * 0.07, ui_pop(760 + i * 90, 0.6), 0.7, pan=-0.2 + i * 0.2)
music.add(52.0, pad([n("F3"), n("C4"), n("A4"), n("E5")], 3.0, 1500, 0.7), 0.7)

# ----------------------------------------------------------------------------- mixing

t_all = np.arange(N) / SR
duck = np.ones(N, dtype=np.float32)
for k in kicks:
    lo = int(k * SR)
    hi = min(N, lo + int(0.32 * SR))
    tt = (np.arange(hi - lo) / SR).astype(np.float32)
    curve = 1 - 0.62 * np.exp(-tt / 0.09) * np.minimum(1, tt / 0.004 + 0.6)
    duck[lo:hi] = np.minimum(duck[lo:hi], curve)


def process(bus: Bus, board: Pedalboard) -> np.ndarray:
    return board(bus.buf, SR)


drums_out = process(drums, Pedalboard([HighpassFilter(28), Compressor(threshold_db=-14, ratio=3, attack_ms=8, release_ms=90), Reverb(room_size=0.18, wet_level=0.06, dry_level=1.0)]))
bass_out = process(bassbus, Pedalboard([HighpassFilter(30), LowpassFilter(5000), Compressor(threshold_db=-16, ratio=4, attack_ms=5, release_ms=80)])) * duck
music_out = process(music, Pedalboard([HighpassFilter(200), Chorus(rate_hz=0.4, depth=0.18, mix=0.25), Reverb(room_size=0.62, damping=0.45, wet_level=0.22, dry_level=0.85, width=1.0)])) * duck
lead_out = process(leadbus, Pedalboard([HighpassFilter(220), Delay(delay_seconds=BEAT * 0.75, feedback=0.28, mix=0.18), Reverb(room_size=0.55, wet_level=0.2, dry_level=0.9)])) * (0.55 + 0.45 * duck)
fx_out = process(fx, Pedalboard([HighpassFilter(60), Reverb(room_size=0.8, wet_level=0.25, dry_level=0.9)]))
ui_out = process(ui, Pedalboard([HighpassFilter(250), Reverb(room_size=0.35, wet_level=0.14, dry_level=1.0)]))

mix = drums_out * 0.8 + bass_out * 0.5 + music_out * 0.85 + lead_out * 0.95 + fx_out * 0.5 + ui_out * 0.8

# Section dynamics so the drop and chorus actually lift.
levels = [(0, 0.66), (4, 0.55), (9.0, 0.58), (10, 0.76), (18, 0.74), (24, 0.78), (30, 0.78), (36, 0.6), (38, 0.66), (39.9, 0.95), (40, 1.0), (50, 0.9)]
lv_t = np.array([p[0] for p in levels])
lv_v = np.array([p[1] for p in levels])
idx = np.searchsorted(lv_t, t_all, side="right") - 1
section_gain = lv_v[idx]
# Ramps: the old-way build swells into the drop, the tips build swells into the chorus.
section_gain = np.where((t_all >= 9.0) & (t_all < 10), 0.58 + 0.16 * (t_all - 9.0), section_gain)
section_gain = np.where((t_all >= 38) & (t_all < 39.9), 0.6 + 0.3 * ((t_all - 38) / 1.9) ** 2, section_gain)
k = int(0.03 * SR)
section_gain = np.convolve(section_gain, np.ones(k) / k, mode="same")
mix = mix * section_gain

# Master envelope: soft open, clean ring-out.
env = np.minimum(1, t_all / 0.05)
fade_start = DUR - 1.6
env *= np.where(t_all > fade_start, np.cos(np.clip((t_all - fade_start) / 1.6, 0, 1) * np.pi / 2) ** 1.5, 1)
mix = mix * env

master = Pedalboard([
    HighpassFilter(25),
    LowShelfFilter(cutoff_frequency_hz=180, gain_db=-2.5),
    HighShelfFilter(cutoff_frequency_hz=8000, gain_db=-2.0),
    LowpassFilter(16000),
    Compressor(threshold_db=-14, ratio=1.8, attack_ms=25, release_ms=180),
    Gain(gain_db=2.0),
    Limiter(threshold_db=-1.0, release_ms=120),
])
mix = master(mix.astype(np.float32), SR)
peak = float(np.max(np.abs(mix)))
mix = mix / max(peak, 1e-9) * 0.93

out = ROOT / "public" / "score.wav"
out.parent.mkdir(parents=True, exist_ok=True)
pcm = (np.clip(mix.T, -1, 1) * 32767).astype("<i2")
import wave

with wave.open(str(out), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())

rms = float(np.sqrt(np.mean(mix**2)))
print(f"wrote {out} peak={peak:.3f} rms_dbfs={20*np.log10(rms):.1f}")
