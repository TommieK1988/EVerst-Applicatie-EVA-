# Componeert een rustige, warme muziekbedding (offline, deterministisch). Gebruik: python3 -I scripts/muziek.py <seconden> <uit.wav>
import sys, numpy as np, wave
SR = 44100; LEN = float(sys.argv[1]); OUT = sys.argv[2]
BPM = 96; beat = 60 / BPM; bar = 4 * beat
N = int(LEN * SR); L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(7)
def hz(m): return 440 * 2 ** ((m - 69) / 12)
# Akkoorden (midi), elk 2 maten: Am7 – Fmaj7 – C(add9) – G6
CH = [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 62, 64], [55, 59, 62, 64]]
ROOT = [45, 41, 48, 43]
def env(n, a, r):
    e = np.ones(n); ai = min(int(a * SR), n); ri = min(int(r * SR), n - ai)
    e[:ai] = np.linspace(0, 1, ai); e[n - ri:] *= np.linspace(1, 0, ri); return e
def add(sig, start, pan=0.0, gain=1.0):
    i = int(start * SR); j = min(N, i + len(sig))
    if j <= i: return
    s = sig[: j - i] * gain
    L[i:j] += s * np.sqrt((1 - pan) / 2) * 1.414; R[i:j] += s * np.sqrt((1 + pan) / 2) * 1.414
def lp(x, a):  # eenvoudige eenpolige laagdoorlaat
    y = np.empty_like(x); acc = 0.0
    for k in range(len(x)): acc += a * (x[k] - acc); y[k] = acc
    return y
def pad(freqs, dur):
    n = int(dur * SR); t = np.arange(n) / SR; s = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.12):
            ff = f * 2 ** (det / 12)
            for h, amp in ((1, 1), (2, .35), (3, .15), (4, .07)):
                s += amp * np.sin(2 * np.pi * ff * h * t + rng.uniform(0, 6.28))
    s *= env(n, 1.6, 1.8) * (0.85 + 0.15 * np.sin(2 * np.pi * 0.15 * t))
    return s / (len(freqs) * 4)
def pluck(f, dur=1.2):
    n = int(dur * SR); t = np.arange(n) / SR
    s = (np.sin(2*np.pi*f*t) + .4*np.sin(2*np.pi*2*f*t)*np.exp(-t*6) + .15*np.sin(2*np.pi*3*f*t)*np.exp(-t*9))
    return s * np.exp(-t * 3.2) * env(n, 0.004, 0.05)
def bass(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    return (np.sin(2*np.pi*f*t) + .25*np.sin(2*np.pi*2*f*t)) * env(n, 0.01, 0.15) * np.exp(-t * 1.2)
def kick():
    n = int(0.35 * SR); t = np.arange(n) / SR; f = 50 + 70 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
def shaker():
    n = int(0.09 * SR); x = rng.standard_normal(n); x = x - lp(x, 0.35)
    return x * np.exp(-np.arange(n) / SR * 45)
KICK = kick()
nbars = int(LEN / bar) + 1
for b in range(nbars):
    t0 = b * bar; c = (b // 2) % 4
    if b % 2 == 0: add(pad([hz(m) for m in CH[c]], 2 * bar + 1.5), t0, 0, 0.55)
    late = t0 > LEN - 7
    if t0 >= 2 * bar and not late:
        for k in range(4): add(bass(hz(ROOT[c]), beat * 0.95), t0 + k * beat, 0, 0.32 if k % 2 == 0 else 0.2)
    if t0 >= 4 * bar and not late:
        tones = CH[c] + [CH[c][1] + 12, CH[c][2] + 12]
        pat = [0, 2, 4, 3, 1, 4, 5, 2]
        for k, p in enumerate(pat): add(pluck(hz(tones[p] + 12)), t0 + k * beat / 2, (-0.35 if k % 2 else 0.35), 0.11)
    if t0 >= 8 * bar and not late:
        for k in (0, 2): add(KICK, t0 + k * beat, 0, 0.28)
        for k in range(8):
            if k % 2: add(shaker(), t0 + k * beat / 2, 0.2, 0.05)
mix = np.stack([L, R], 1)
fade_in = int(1.5 * SR); fade_out = int(5 * SR)
mix[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]; mix[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
mix = np.tanh(mix * 1.2) / np.tanh(1.2)
mix *= 0.7 / np.max(np.abs(mix))
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())
print('ok', LEN)
