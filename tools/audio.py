"""Builds the full soundtrack (voices via Piper TTS, synthesized SFX + music) and lines.json for captions.
Usage: python3 tools/audio.py <piper_voice_dir>
"""
import json, sys, wave, io, re, os, subprocess
import numpy as np
from scipy import signal
from piper import PiperVoice, SynthesisConfig

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VD = sys.argv[1]
SR = 44100
S = json.load(open(f"{ROOT}/film/script.json"))
SC = {s["id"]: s for s in S["scenes"]}
DUR = S["scenes"][-1]["end"]
N = int(DUR * SR)
mix = np.zeros((N, 2))
rs = np.random.RandomState(7)

def absT(sid, u): return SC[sid]["start"] + u
def noise(n): return rs.randn(n)
def bp(x, lo, hi, o=2): return signal.sosfilt(signal.butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
def lp(x, f, o=2): return signal.sosfilt(signal.butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return signal.sosfilt(signal.butter(o, f, 'high', fs=SR, output='sos'), x)
def env(n, a=0.01, r=0.1):
    e = np.ones(n); na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e
def tt(d): return np.arange(int(d * SR)) / SR
IR = {}
def reverb(x, size=1.5, wet=0.3):
    if size not in IR:
        n = int(size * SR); IR[size] = noise(n) * np.exp(-np.arange(n) / SR * 6.9 / size); IR[size] /= np.sqrt((IR[size] ** 2).sum())
    y = signal.fftconvolve(x, IR[size])[:len(x) + int(size * SR)]
    out = np.zeros(len(y)); out[:len(x)] += x * (1 - wet); out += y * wet
    return out
def put(x, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N: return
    x = x[: N - i]
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    mix[i:i + len(x), 0] += x * gain * l * 1.41
    mix[i:i + len(x), 1] += x * gain * r * 1.41
def norm(x, p=1.0): m = np.abs(x).max(); return x / m * p if m > 0 else x

# ------------------------------------------------------------------ voices
voices = {}
def V(name):
    if name not in voices:
        f = {"ryan": "en-us-ryan-high/en-us-ryan-high.onnx", "libri": "en-us-libritts-high/en-us-libritts-high.onnx"}[name]
        voices[name] = PiperVoice.load(f"{VD}/{f}")
    return voices[name]
def tts(text, voice, rate=1.0, spk=None):
    b = io.BytesIO()
    with wave.open(b, "wb") as w:
        V(voice).synthesize_wav(text, w, syn_config=SynthesisConfig(speaker_id=spk, length_scale=rate, noise_scale=0.6, noise_w_scale=0.7))
    b.seek(0); w = wave.open(b); sr = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float) / 32768
    x = signal.resample_poly(x, SR, sr)
    nz = np.where(np.abs(x) > 0.02)[0]
    return x[max(0, nz[0] - 200): nz[-1] + 2000] if len(nz) else x

def chunks(text, dur, t0):
    words = text.split()
    groups, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) >= 4 or re.search(r"[.,!?]$", w) and len(cur) >= 2:
            groups.append(" ".join(cur)); cur = []
    if cur:
        if groups and len(cur) == 1: groups[-1] += " " + cur[0]
        else: groups.append(" ".join(cur))
    tot = sum(len(g) + 3 for g in groups); out, t = [], t0
    for g in groups:
        d = dur * (len(g) + 3) / tot; out.append({"t": round(t, 3), "d": round(d, 3), "text": g}); t += d
    return out

lines_out = []
for L in S["lines"]:
    sid, u, v, text = L[0], L[1], L[2], L[3]
    rate = L[4] if len(L) > 4 else 1.0
    spk = L[5] if len(L) > 5 else None
    t0 = absT(sid, u)
    if v in ("nar", "man"):
        x = tts(text, "ryan", rate)
        if v == "man":
            x = reverb(x, 0.6, 0.15); g = 0.9
        else:
            g = 0.85
        put(norm(x), t0, g)
    else:
        x = tts(text, "libri", rate, spk)
        if v == "news":
            x = bp(x, 250, 5000) ; x = reverb(x, 0.8, 0.25); g = 0.45; pan = 0.35
        else:
            x = np.tanh(bp(x, 400, 3000) * 3) * 0.5
            x = x * (1 - 0.6 * (lp(noise(len(x)), 3) > 0.012))
            g = 0.55; pan = -0.1
        put(norm(x), t0, g, pan)
    d = len(x) / SR
    lines_out.append({"t": round(t0, 3), "d": round(d, 3), "v": v, "text": text, "chunks": chunks(text, d * 0.97, t0)})
    print(f"{t0:7.2f} {d:5.2f} {v}: {text}")
# overlap check
lo = sorted(lines_out, key=lambda l: l["t"])
for a, b in zip(lo, lo[1:]):
    if a["t"] + a["d"] > b["t"] + 0.05: print("OVERLAP", a["text"], "->", b["text"])
json.dump(lines_out, open(f"{ROOT}/film/lines.json", "w"), indent=0)

# ------------------------------------------------------------------ sfx
def scream_syn(d=1.2, f0=650):
    t = tt(d); f = f0 * (1 + 0.25 * np.sin(np.pi * t / d)) * (1 + 0.02 * np.sin(2 * np.pi * 6 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR; x = signal.sawtooth(ph) + 0.3 * noise(len(t))
    y = bp(x, 700, 1300) + 0.7 * bp(x, 2300, 3200) + 0.3 * bp(x, 3500, 4500)
    return norm(y * env(len(t), 0.08, 0.5))
def groan_syn(d=1.6):
    t = tt(d); f = 95 + 25 * np.sin(np.pi * t / d) + 6 * np.sin(2 * np.pi * 7 * t)
    x = signal.sawtooth(2 * np.pi * np.cumsum(f) / SR) * (1 + 0.5 * noise(len(t)) * 0.3)
    y = bp(x, 200, 600) + 0.6 * bp(x, 900, 1300) + 0.2 * bp(noise(len(t)), 300, 1500)
    return norm(y * env(len(t), 0.2, 0.6))
def thump(f=60, d=0.5, k=30):
    t = tt(d); return np.sin(2 * np.pi * f * t * (1 + np.exp(-t * 20))) * np.exp(-t * k / d / 6)
def step(soft=1.0):
    x = thump(80, 0.12); x[:int(0.08 * SR)] += lp(noise(int(0.08 * SR)), 900) * np.exp(-tt(0.08) * 50); return norm(x) * soft
def click():
    return norm(hp(noise(int(0.02 * SR)), 2000) * np.exp(-tt(0.02) * 300) + 0.5 * np.sin(2 * np.pi * 3200 * tt(0.02)) * np.exp(-tt(0.02) * 200))

def heli_syn(d, far=0.0):
    t = tt(d); rate = 19
    puls = (np.sin(2 * np.pi * rate * t) > 0.7).astype(float)
    x = lp(noise(len(t)), 500) * (0.4 + puls * 1.6) + 0.15 * np.sin(2 * np.pi * 2200 * t) * (1 - far)
    x = lp(x, 2500 - far * 2000)
    return norm(x)

def sfx(name, t0, d=1.0, **kw):
    if name == "wind":
        x = lp(noise(int(d * SR)), 400) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.13 * tt(d) + rs.rand() * 6)); put(norm(x) * env(len(x), 1.5, 1.5), t0, 0.16)
    elif name == "roomtone":
        x = lp(noise(int(d * SR)), 200) + 0.3 * np.sin(2 * np.pi * 60 * tt(d)); put(norm(x) * env(len(x), 0.5, 0.5), t0, 0.05)
    elif name == "tvshow":
        x = np.zeros(int(d * SR)); notes = [523, 659, 784, 1046, 784, 659]
        for i in range(int(d * 6)):
            n = tt(0.15); s = np.sign(np.sin(2 * np.pi * notes[i % 6] * n)) * np.exp(-n * 12); j = int(i / 6 * SR); x[j:j + len(s)] += s[: len(x) - j]
        x += 0.3 * bp(noise(len(x)), 800, 4000) * (np.sin(2 * np.pi * 0.4 * tt(d)) > 0.6)
        put(bp(x, 300, 4000) * env(len(x), 0.05, 0.2), t0, 0.1, 0.35)
    elif name == "alert":
        x = np.concatenate([(np.sin(2 * np.pi * 853 * tt(0.4)) + np.sin(2 * np.pi * 960 * tt(0.4)))] * 2); put(norm(x) * env(len(x), 0.01, 0.05), t0, 0.25, 0.35)
    elif name in ("sirens", "sirens_far"):
        far = name == "sirens_far"; x = np.zeros(int(d * SR))
        for k in range(3):
            t = tt(d); f = 900 + 350 * np.sin(2 * np.pi * (0.18 + 0.07 * k) * t + k)
            s = np.sin(2 * np.pi * np.cumsum(f) / SR) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.05 * t + k * 2))
            x += s
        x = lp(x, 1800 if far else 3000); x = reverb(x, 2.5, 0.6)[: len(x)]
        put(norm(x) * env(len(x), 2, 2), t0, 0.06 if far else 0.14, 0.2)
    elif name == "crowd":
        x = bp(noise(int(d * SR)), 300, 2000) * 0.3
        for i in range(int(d * 1.2)):
            sc = scream_syn(0.6 + rs.rand(), 450 + rs.rand() * 500); j = int(rs.rand() * (len(x) - len(sc)))
            x[j:j + len(sc)] += sc * (0.3 + rs.rand() * 0.5)
        x = reverb(lp(x, 2500), 2.0, 0.5)[: len(x)]; put(norm(x) * env(len(x), 1, 2), t0, 0.12, -0.2)
    elif name == "crash":
        n = int(2.5 * SR); t = tt(2.5)
        x = lp(noise(n), 3000) * np.exp(-t * 6) + 0.8 * thump(50, 2.5)
        for f in (430, 670, 1240, 2210): x += 0.3 * np.sin(2 * np.pi * f * t) * np.exp(-t * 4)
        x += hp(noise(n), 5000) * (rs.rand(n) > 0.995) * np.exp(-t * 2) * 3
        put(reverb(norm(x), 2.0, 0.45), t0, 0.5, 0.1)
    elif name == "carhorn":
        t = tt(d); x = np.sign(np.sin(2 * np.pi * 410 * t)) + np.sign(np.sin(2 * np.pi * 520 * t)); put(reverb(lp(x, 1800), 2, 0.5)[: len(t)] * env(len(t), 0.02, 1), t0, 0.05, 0.1)
    elif name in ("heli", "heli_far", "heli_near"):
        x = heli_syn(d, 0.7 if name == "heli_far" else 0)
        if name == "heli": e = np.sin(np.pi * np.clip(tt(d) / d, 0, 1)) ** 1.5; pan = np.linspace(-0.8, 0.8, len(x)); g = 0.45
        elif name == "heli_far": e = np.linspace(0.05, 1, len(x)) ** 2; pan = np.zeros(len(x)) - 0.3; g = 0.3
        else: e = env(len(x), 0.1, 1.5); pan = np.zeros(len(x)); g = 0.6
        x = x * e
        for c, side in ((0, -1), (1, 1)):
            i = int(t0 * SR); y = x[: N - i] * np.sqrt(0.5 * (1 + side * pan[: N - i])) * g; mix[i:i + len(y), c] += y
    elif name == "scream":
        put(reverb(lp(scream_syn(1.4, 600 + rs.rand() * 200), 2500), 2.5, 0.55), t0, 0.22, -0.3)
    elif name == "groan":
        put(reverb(lp(groan_syn(1.8), 1500), 1.8, 0.5), t0, 0.3, 0.2)
    elif name == "fridge":
        put(norm(lp(noise(int(0.3 * SR)), 1500) * np.exp(-tt(0.3) * 15)), t0, 0.2)
    elif name == "fridgehum":
        t = tt(d); put((np.sin(2 * np.pi * 120 * t) + 0.3 * np.sin(2 * np.pi * 240 * t)) * env(len(t), 0.3, 0.5), t0, 0.03)
    elif name in ("steps", "footsteps"):
        iv = 0.32 if kw.get("run") else (0.95 if name == "footsteps" else 0.5)
        for k in range(int(d / iv)):
            s = step()
            if name == "footsteps": s = reverb(lp(s, 400), 1.2, 0.5)
            put(s, t0 + k * iv + rs.rand() * 0.04, 0.25 if name == "steps" else 0.35, 0.1)
    elif name == "lock":
        put(click(), t0, 0.5); put(click(), t0 + 0.12, 0.4)
    elif name == "scrape":
        t = tt(d); x = bp(noise(len(t)), 150, 1200) * (0.6 + 0.4 * np.abs(np.sin(2 * np.pi * 2.3 * t))) * (0.7 + 0.3 * (lp(noise(len(t)), 20) > 0))
        put(norm(x) * env(len(t), 0.1, 0.2), t0, 0.35)
    elif name == "thud":
        put(norm(thump(55, 0.8) + 0.3 * lp(noise(int(0.8 * SR)), 600) * np.exp(-tt(0.8) * 10)), t0, 0.7)
    elif name == "tvstatic":
        t = tt(d); put(hp(noise(len(t)), 1500) * env(len(t), 0.1, 0.05), t0, 0.04, 0.35)
    elif name == "flicker":
        t = tt(1.0); x = (np.sin(2 * np.pi * 100 * t) + 0.5 * noise(len(t))) * (np.sin(2 * np.pi * 13 * t) > 0); put(x, t0, 0.08)
    elif name == "powerdown":
        t = tt(1.5); f = 120 * np.exp(-t * 2); x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2); put(norm(x), t0, 0.3); put(norm(thump(45, 0.6)), t0, 0.5)
    elif name == "click":
        put(click(), t0, 0.35)
    elif name == "stairs":
        for k in range(int(d / 1.1)):
            put(reverb(lp(step(), 300), 2.5, 0.7), t0 + k * 1.1 + rs.rand() * 0.3, 0.3, 0.3)
            if rs.rand() > 0.7: put(reverb(lp(thump(70, 0.4), 300), 2.5, 0.7), t0 + k * 1.1 + 0.5, 0.25, 0.3)
    elif name == "heartbeat":
        for k in range(int(d / 0.85)):
            put(thump(45, 0.25), t0 + k * 0.85, 0.35); put(thump(40, 0.25), t0 + k * 0.85 + 0.22, 0.25)
    elif name == "scratch":
        t = tt(d); x = hp(noise(len(t)), 2500) * (np.sin(2 * np.pi * 2.7 * t) > 0.2) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 9 * t)))
        put(reverb(lp(x, 5000), 0.8, 0.3)[: len(t)], t0, 0.18, 0.15)
    elif name == "bang":
        x = thump(50, 1.0) + 0.6 * lp(noise(int(SR)), 700) * np.exp(-tt(1.0) * 9)
        x += 0.2 * np.sin(2 * np.pi * 180 * tt(1.0)) * np.exp(-tt(1.0) * 6)
        put(reverb(norm(x), 1.0, 0.3), t0, 0.95)
    elif name == "rain":
        t = tt(d); x = bp(noise(len(t)), 600, 7000) * 0.6 + lp(noise(len(t)), 300) * 0.5
        x += hp(noise(len(t)), 3000) * (rs.rand(len(t)) > 0.998) * 4
        put(norm(x) * env(len(t), 1.5, 1.5), t0, 0.22)
    elif name == "thunder":
        t = tt(6); x = lp(noise(len(t)), 200) * np.exp(-t * 0.6) * (1 + 0.5 * lp(noise(len(t)), 3) * 30) + lp(noise(len(t)), 2000) * 2 * np.exp(-t * 8)
        put(reverb(norm(x), 3.0, 0.4), t0 + 0.3, 0.9)
    elif name == "tap":
        t = tt(0.6); put(norm(np.sin(2 * np.pi * (900 + 400 * t) * t) * np.exp(-t * 6)), t0, 0.12)
        for k in range(4): put(norm(np.sin(2 * np.pi * 1400 * tt(0.05)) * np.exp(-tt(0.05) * 90)), t0 + 0.8 + k * 0.6 + rs.rand() * 0.2, 0.25)
    elif name in ("dooropen", "slam"):
        if name == "slam": put(reverb(norm(thump(70, 0.6) + 0.4 * lp(noise(int(0.6 * SR)), 900) * np.exp(-tt(0.6) * 14)), 2.0, 0.6), t0, 0.35, -0.3)
        else:
            t = tt(1.2); x = signal.sawtooth(2 * np.pi * np.cumsum(180 + 60 * np.sin(t * 9)) / SR) * env(len(t), 0.1, 0.3); put(reverb(bp(x, 300, 2000), 2, 0.6), t0, 0.06, -0.3)
    elif name == "slide":
        t = tt(1.2); put(norm(bp(noise(len(t)), 200, 1500)) * env(len(t), 0.1, 0.3), t0, 0.25)
    elif name == "static":
        t = tt(d); x = hp(noise(len(t)), 800) * 0.5 + hp(noise(len(t)), 3000) * (rs.rand(len(t)) > 0.997) * 3
        put(bp(x, 300, 6000) * env(len(t), 0.2, 0.5), t0, 0.07, -0.1)

for sid, u, name, *rest in S["sfx"]:
    d = rest[0] if rest else 1.0
    sfx(name, absT(sid, u), d, run=(sid == "day30" and name == "steps"))

# ------------------------------------------------------------------ music
def pad(freqs, d, bright=800):
    t = tt(d); x = np.zeros(len(t))
    for f in freqs:
        for det in (-0.6, 0.6): x += signal.sawtooth(2 * np.pi * (f + det) * t)
    return lp(x, bright) / len(freqs)
def piano(f, d=2.5):
    t = tt(d); return sum(np.sin(2 * np.pi * f * h * t) / h ** 1.5 for h in (1, 2, 3, 4)) * np.exp(-t * 1.8)
NOTE = lambda n: 440 * 2 ** ((n - 69) / 12)
for sid, mood in S["music"]:
    s = SC[sid]; t0, d = s["start"], s["end"] - s["start"]
    if mood in ("none", "silence"):
        if mood == "silence":  # only a low sub drone
            put(norm(np.sin(2 * np.pi * 41 * tt(d))) * env(int(d * SR), 3, 3), t0, 0.06)
        continue
    x = np.zeros(int(d * SR))
    if mood == "calm":
        chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
        for i in range(int(d / 4) + 1):
            c = pad([NOTE(n) for n in chords[i % 4]], 4.4, 900); j = int(i * 4 * SR); x[j:j + len(c)] += (c * env(len(c), 1, 1.5))[: len(x) - j]
        g = 0.07
    elif mood in ("tense", "dark"):
        x += pad([NOTE(33), NOTE(40), NOTE(44 if mood == "dark" else 45)], d, 400) * (0.7 + 0.3 * np.sin(2 * np.pi * 0.25 * tt(d)))
        pulse = (np.sin(2 * np.pi * 1.6 * tt(d)) > 0.9) * np.sin(2 * np.pi * 55 * tt(d)); x += 0.6 * lp(pulse, 200)
        g = 0.09
    elif mood == "sad":
        x += 0.5 * pad([NOTE(45), NOTE(52)], d, 500)
        mel = [69, 67, 64, 62, 64, 60, 62, 57]
        for i in range(int(d / 2.2)):
            p = piano(NOTE(mel[i % len(mel)])); j = int(i * 2.2 * SR); x[j:j + len(p)] += p[: len(x) - j] * 0.8
        g = 0.09
    elif mood == "hope":
        chords = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]
        for i in range(int(d / 4) + 1):
            c = pad([NOTE(n) for n in chords[i % 4]], 4.4, 1200); j = int(i * 4 * SR); x[j:j + len(c)] += (c * env(len(c), 1, 1.5))[: len(x) - j]
            p = piano(NOTE(chords[i % 4][2] + 12), 3.5); x[j:j + len(p)] += p[: len(x) - j] * 0.6
        g = 0.08
    elif mood == "climax":
        t = tt(d); rise = np.clip(t / d, 0, 1)
        x += pad([NOTE(45), NOTE(52), NOTE(57), NOTE(60)], d, 600) * (0.4 + rise)
        drum = np.zeros(len(t))
        for k in range(int(d / 0.75)):
            if k * 0.75 > 20: dm = thump(50, 0.5); j = int(k * 0.75 * SR); drum[j:j + len(dm)] += dm[: len(drum) - j]
        x += drum * (0.3 + rise)
        g = 0.09
    put(norm(x) * env(len(x), 2, 2.5), t0, g)

# ------------------------------------------------------------------ master
for i in range(2): mix[:, i] = np.tanh(mix[:, i] * 1.2) * 0.9
# end stinger: hard cut to silence at fade to black then hit
os.makedirs(f"{ROOT}/film/audio", exist_ok=True)
wav = f"{ROOT}/output/soundtrack.wav"; os.makedirs(f"{ROOT}/output", exist_ok=True)
with wave.open(wav, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(mix, -1, 1) * 32767).astype(np.int16).tobytes())
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-b:a", "160k", f"{ROOT}/film/audio/soundtrack.mp3"], check=True)
print("done", DUR, "s")
