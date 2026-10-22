#!/usr/bin/env python3
"""The films' sound: the real stems, mixed exactly as the app's faders mix them.

Reads film/spec.json and the engine's own output (ch_<Part>.wav from audioctor-cli enhance), applies the
timeline's faders, solos and BEFORE/AFTER, and writes, per film:
  <id>-audio.wav   48 kHz stereo, what the film plays
  <id>-film.json   the timeline the capture script films, plus the waveform peaks and the meter levels
                   (one frame every 50 ms, peak per channel, as the app's meters read them)
"""
import json, os, subprocess, sys
import numpy as np, soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
AC = os.path.dirname(HERE)
SR = 48000
FRAME = 0.05                      # the meters' frame, the app's own 20 Hz position events
XFADE = 0.03                      # solo / A-B switches, so nothing clicks


def decode(path, seconds=None):
    """Any file the Mac plays -> 48 kHz stereo float, through ffmpeg (the app uses Core Audio for the same)."""
    cmd = ['ffmpeg', '-v', 'error', '-i', path, '-map', 'a:0', '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype='<f4').reshape(-1, 2).astype(np.float32)
    return x if seconds is None else x[:int(seconds * SR)]


def peaks(x, n=900):
    """The scope's waveform: n buckets over the whole file, each the bucket's peak."""
    m = np.abs(x).max(1) if x.ndim > 1 else np.abs(x)
    k = max(1, len(m) // n)
    return [round(float(v), 4) for v in m[:k * n].reshape(-1, k).max(1)]


def ramp_env(film, ch, t):
    """dB over film time t for one channel: the spec's level, bent by each ramp."""
    db = np.full(len(t), float(film['gains'].get(ch, 0.0)))
    for ev in film['automation']:
        if 'ramp' not in ev or ch not in ev['ramp']:
            continue
        t0, t1, target = float(ev['rampFrom']), float(ev['t']), float(ev['ramp'][ch])
        start = db[np.searchsorted(t, t0)] if t0 > t[0] else db[0]
        u = np.clip((t - t0) / max(1e-6, t1 - t0), 0, 1)
        u = u * u * (3 - 2 * u)                                  # the hand on the fader, not a jump
        db = np.where(t >= t0, start + (target - start) * u, db)
    return db


def smooth_gate(t, events, is_open):
    """A 0/1 gate with a 30 ms edge: solo masks and the A/B switch."""
    g = np.zeros(len(t), dtype=np.float32)
    state = is_open(None)
    edges = [(t[0], state)]
    for ev in events:
        state = is_open(ev)
        edges.append((float(ev['t']), state))
    for i, (t0, st) in enumerate(edges):
        t1 = edges[i + 1][0] if i + 1 < len(edges) else t[-1] + 1
        g[(t >= t0) & (t < t1)] = 1.0 if st else 0.0
    k = max(1, int(XFADE * SR))
    return np.convolve(g, np.hanning(k) / np.hanning(k).sum(), mode='same').astype(np.float32)


def build(film):
    d = os.path.join(AC, film['dir'])
    chans = film['channels']
    ready, dur = float(film['ready']), float(film['duration'])
    play_s = dur - ready                                         # how long the app plays in the film
    n = int(round(play_s * SR))
    t = np.arange(n, dtype=np.float64) / SR + ready               # film time, per sample

    # the parts, as the engine wrote them, from where the film starts playing
    start = int(round(float(film['playFrom']) * SR))
    parts = {}
    for c in chans:
        x, sr = sf.read(os.path.join(d, f'ch_{c}.wav'), dtype='float32', always_2d=True)
        assert sr == SR, f'{c}: {sr} Hz'
        seg = x[start:start + n]
        parts[c] = np.pad(seg, ((0, n - len(seg)), (0, 0)))
        if len(seg) < n:
            print(f'  ! {film["id"]}: {c} ran out {((n - len(seg)) / SR):.2f} s early', file=sys.stderr)

    # the input, for BEFORE and for the scope's grey waveform
    src_all = decode(film['source'])
    src = src_all[start:start + n]
    src = np.pad(src, ((0, n - len(src)), (0, 0)))

    # faders: dB, then the solo gate
    solo_evs = [e for e in film['automation'] if 'solo' in e]
    gain = {}
    for c in chans:
        db = ramp_env(film, c, t)
        lin = np.where(db <= -59.9, 0.0, 10 ** (db / 20)).astype(np.float32)
        if solo_evs:
            def open_for(ev, c=c):
                cur = None if ev is None else ev['solo']
                return True if cur is None else cur == c
            lin = lin * smooth_gate(t, solo_evs, open_for)
        gain[c] = lin[:, None]

    mixed = np.zeros((n, 2), dtype=np.float32)
    for c in chans:
        mixed += parts[c] * gain[c]

    # BEFORE / AFTER: the app plays the file itself on BEFORE
    ab_evs = [e for e in film['automation'] if 'ab' in e]
    if ab_evs:
        after_gate = smooth_gate(t, ab_evs, lambda ev: True if ev is None else ev['ab'] == 'after')[:, None]
        out = mixed * after_gate + src * (1 - after_gate)
    else:
        after_gate = np.ones((n, 1), dtype=np.float32)
        out = mixed

    # the meters, one frame every 50 ms: peak per channel after its fader, master last
    fn = int(round(play_s / FRAME))
    w = int(FRAME * SR)
    levels = []
    for i in range(fn):
        a, b = i * w, min(n, (i + 1) * w)
        row = []
        for c in chans:
            seg = parts[c][a:b] * gain[c][a:b]
            row.append([round(float(np.abs(seg[:, 0]).max() if b > a else 0), 4),
                        round(float(np.abs(seg[:, 1]).max() if b > a else 0), 4)])
        m = out[a:b]
        row.append([round(float(np.abs(m[:, 0]).max() if b > a else 0), 4),
                    round(float(np.abs(m[:, 1]).max() if b > a else 0), 4)])
        levels.append(row)

    # the film's track: quiet until the app plays, then this, then out
    head = np.zeros((int(round(ready * SR)), 2), dtype=np.float32)
    f0, f1 = [float(v) for v in film['fadeOut']]
    fade = np.clip((f1 - (t)) / max(1e-6, f1 - f0), 0, 1)[:, None].astype(np.float32)
    track = np.concatenate([head, out * fade])
    peak = float(np.abs(track).max())
    if peak > 0.98:
        track *= 0.98 / peak
    sf.write(os.path.join(HERE, f'{film["id"]}-audio.wav'), track, SR, subtype='PCM_24')

    # the whole file's waveform, before and after, for the scope
    mix_all = np.zeros_like(src_all)
    for c in chans:
        x, _ = sf.read(os.path.join(d, f'ch_{c}.wav'), dtype='float32', always_2d=True)
        g = 10 ** (float(film['gains'].get(c, 0)) / 20)
        k = min(len(mix_all), len(x))
        mix_all[:k] += x[:k] * g

    out_json = dict(film)
    out_json['peaksBefore'] = peaks(src_all)
    out_json['peaksAfter'] = peaks(mix_all)
    out_json['levels'] = levels
    out_json['frame'] = FRAME
    out_json['audio'] = f'{film["id"]}-audio.wav'
    with open(os.path.join(HERE, f'{film["id"]}-film.json'), 'w') as f:
        json.dump(out_json, f)
    print(f'{film["id"]}: {dur:.1f} s film, {play_s:.1f} s playing, {len(levels)} meter frames, '
          f'peak {20 * np.log10(peak + 1e-9):.1f} dBFS -> {film["id"]}-audio.wav')


if __name__ == '__main__':
    spec = json.load(open(os.path.join(HERE, 'spec.json')))
    want = sys.argv[1:] or [f['id'] for f in spec['films']]
    for film in spec['films']:
        if film['id'] in want:
            build(film)
