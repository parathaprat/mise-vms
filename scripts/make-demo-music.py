#!/usr/bin/env python3
"""Generate the original, beat-aligned soundtrack for the Mise launch reel."""

from pathlib import Path
import wave

import numpy as np

SAMPLE_RATE = 48_000
DURATION = 43.5
BEAT = 60 / 108
TRANSITIONS = [0.0, 3.8, 9.0, 14.5, 20.0, 25.5, 30.0, 35.0, 39.3]

rng = np.random.default_rng(42)
samples = int(SAMPLE_RATE * DURATION)
left = np.zeros(samples, dtype=np.float64)
right = np.zeros(samples, dtype=np.float64)


def add_tone(
    start: float,
    duration: float,
    frequency: float,
    amplitude: float,
    attack: float = 0.02,
    release: float = 0.3,
    pan: float = 0.0,
    harmonics: tuple[tuple[float, float], ...] = (),
) -> None:
    lo = max(0, int(start * SAMPLE_RATE))
    hi = min(samples, lo + int(duration * SAMPLE_RATE))
    if hi <= lo:
        return
    t = np.arange(hi - lo) / SAMPLE_RATE
    envelope = np.minimum(1.0, t / max(attack, 0.001))
    envelope *= np.minimum(1.0, (duration - t) / max(release, 0.001))
    signal = np.sin(2 * np.pi * frequency * t)
    for ratio, gain in harmonics:
        signal += gain * np.sin(2 * np.pi * frequency * ratio * t)
    signal *= envelope * amplitude
    left[lo:hi] += signal * np.sqrt((1 - pan) / 2)
    right[lo:hi] += signal * np.sqrt((1 + pan) / 2)


def add_noise(
    start: float,
    duration: float,
    amplitude: float,
    pan: float = 0.0,
    rise: bool = False,
) -> None:
    lo = max(0, int(start * SAMPLE_RATE))
    hi = min(samples, lo + int(duration * SAMPLE_RATE))
    if hi <= lo:
        return
    count = hi - lo
    noise = rng.normal(0, 1, count)
    noise = np.concatenate(([0.0], np.diff(noise)))
    phase = np.linspace(0, 1, count)
    envelope = np.sin(np.pi * phase) ** 1.5
    if rise:
        envelope *= phase**1.5
    signal = noise * envelope * amplitude
    left[lo:hi] += signal * np.sqrt((1 - pan) / 2)
    right[lo:hi] += signal * np.sqrt((1 + pan) / 2)


# Warm, restrained harmonic bed. Each chord follows a product scene.
chords = [
    (0.0, 3.8, [130.81, 164.81, 196.00, 246.94]),
    (3.8, 9.0, [130.81, 164.81, 196.00, 246.94]),
    (9.0, 14.5, [110.00, 130.81, 164.81, 196.00]),
    (14.5, 20.0, [87.31, 130.81, 164.81, 196.00]),
    (20.0, 25.5, [98.00, 130.81, 146.83, 196.00]),
    (25.5, 30.0, [82.41, 123.47, 164.81, 196.00]),
    (30.0, 35.0, [87.31, 130.81, 164.81, 220.00]),
    (35.0, 39.3, [98.00, 146.83, 196.00, 246.94]),
    (39.3, 43.5, [130.81, 164.81, 196.00, 246.94]),
]

for start, end, notes in chords:
    for index, note in enumerate(notes):
        add_tone(
            start,
            end - start + 0.5,
            note,
            0.022 if index == 0 else 0.014,
            attack=0.55,
            release=0.8,
            pan=(index - 1.5) * 0.18,
            harmonics=((2.0, 0.16),),
        )

# A minimal pulse gives forward motion without becoming a jingle.
beat = 3.8
step = 0
scale = [261.63, 329.63, 392.00, 493.88, 392.00, 329.63]
while beat < 39.3:
    note = scale[step % len(scale)]
    add_tone(
        beat,
        0.34,
        note,
        0.036,
        attack=0.005,
        release=0.28,
        pan=(-0.28 if step % 2 == 0 else 0.28),
        harmonics=((2.0, 0.25), (3.0, 0.08)),
    )
    if step % 2 == 0:
        add_tone(beat, 0.24, 54.0, 0.055, attack=0.003, release=0.2)
    if step % 2 == 1:
        add_noise(beat, 0.08, 0.012, pan=0.18)
    beat += BEAT
    step += 1

# Exact scene accents make the soundtrack land with the camera movement.
for index, cut in enumerate(TRANSITIONS):
    if cut > 0:
        add_noise(cut - 0.34, 0.4, 0.015, pan=(-0.35 if index % 2 else 0.35), rise=True)
    add_tone(
        cut,
        0.65,
        48.0 if index < len(TRANSITIONS) - 1 else 65.41,
        0.11,
        attack=0.003,
        release=0.55,
        harmonics=((2.0, 0.18),),
    )
    add_tone(cut + 0.02, 0.45, 523.25, 0.018, attack=0.002, release=0.4, pan=0.35)

# A gentle opening bloom and a clean resolve.
add_noise(0.0, 2.2, 0.012, rise=True)
for index, note in enumerate([261.63, 329.63, 392.00, 493.88]):
    add_tone(39.5 + index * 0.22, 3.5 - index * 0.22, note, 0.025, attack=0.06, release=1.25, pan=(index - 1.5) * 0.2)

# Smooth master envelope, light saturation and conservative loudness.
timeline = np.arange(samples) / SAMPLE_RATE
master = np.minimum(1.0, timeline / 0.8)
master *= np.minimum(1.0, (DURATION - timeline) / 1.15)
left = np.tanh(left * master * 1.7)
right = np.tanh(right * master * 1.7)
peak = max(np.max(np.abs(left)), np.max(np.abs(right)), 1e-9)
gain = 0.78 / peak
stereo = np.stack((left * gain, right * gain), axis=1)
pcm = (np.clip(stereo, -1, 1) * 32767).astype("<i2")

output = Path("/tmp/mise-reel/mise_launch_score.wav")
output.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(output), "wb") as wav:
    wav.setnchannels(2)
    wav.setsampwidth(2)
    wav.setframerate(SAMPLE_RATE)
    wav.writeframes(pcm.tobytes())

print(output)
