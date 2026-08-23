#!/usr/bin/env python3
"""
Mutra preview watermark.

A voice tag alone is worthless — Demucs strips voice from music in about four
minutes, free. What buys anything is the DUCK: ~12 dB of gain reduction under
each tag leaves a hole that no separator can refill, because the music was
destroyed at render time rather than masked.

Two details that are easy to get wrong and quietly ruin it:

  * The sidechain key must be a CONSTANT-level copy of the tag. If you scale
    the tag before splitting, the key gets scaled too and a quiet track ducks
    far less than a loud one — exactly backwards.
  * Tag spacing is jittered. A fixed period is trivially scriptable to cut out.
"""
import json, random, subprocess, sys
from pathlib import Path

FIRST, PERIOD, JITTER = 4.0, 12.0, 1.5
TAG_UNDER_TRACK_LU = 3.0          # tag sits this far below the track's own loudness
DUCK_RATIO, DUCK_ATTACK, DUCK_RELEASE, PRE_OPEN_MS = 4.5, 20, 350, 45


def run(args):
    return subprocess.run(args, capture_output=True, text=True)


def loudness(path):
    r = run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-af', 'ebur128', '-f', 'null', '-'])
    val = None
    for line in r.stderr.splitlines():
        s = line.strip()
        if s.startswith('I:') and 'LUFS' in s:
            val = float(s.split()[1])
    return val


def duration(path):
    r = run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)])
    return float(r.stdout.strip())


def offsets(dur, seed, tag_len):
    """Tag placement. Returns [] only when the track is too short to carry one.

    The catalogue has SFX stings from 0.6s upward. The normal schedule starts
    at 4s, so anything under ~5.6s produced an EMPTY list and then a malformed
    filter graph. Short items get one tag instead of none — except the ones
    shorter than the tag itself, where a watermark would be longer than the
    thing it protects and there is nothing sensible to do.
    """
    if dur < tag_len + 0.6:
        return []                       # shorter than the tag: leave it alone
    rnd = random.Random(seed)           # per-track seed => deterministic re-runs
    if dur < FIRST + tag_len + 1.0:     # too short for the 4s downbeat
        return [round(max(0.15, (dur - tag_len) * 0.35), 3)]
    t, out = FIRST, []
    while t < dur - tag_len * 0.7:
        out.append(round(t, 3))
        t += PERIOD + rnd.uniform(-JITTER, JITTER)
    return out or [round((dur - tag_len) * 0.35, 3)]


def watermark(src, tag, dst):
    dur, integ = duration(src), loudness(src)
    if integ is None:
        integ = -14.0
    gain = round(integ + (14.0 - TAG_UNDER_TRACK_LU), 1)   # tag normalised to -14 LUFS
    tag_len = duration(tag)
    offs = offsets(dur, abs(hash(Path(src).name)) % 10**6, tag_len)
    if not offs:
        # nothing sensible to overlay — re-encode the original as the preview
        # so the public object is still a fresh render, and say so in the log
        ext = Path(dst).suffix.lower()
        if ext == '.mp3':
            run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-c:a', 'libmp3lame',
                 '-b:a', '128k', '-ar', '44100', '-ac', '2', str(dst)]) if False else \
            run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-ar', '44100', '-ac', '2',
                 str(Path(dst).with_suffix('.tmp.wav'))])
            run(['lame', '--quiet', '-b', '128', '-h',
                 str(Path(dst).with_suffix('.tmp.wav')), str(dst)])
            Path(dst).with_suffix('.tmp.wav').unlink(missing_ok=True)
        else:
            run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-c:a', 'aac', '-b:a', '128k',
                 '-ar', '44100', '-ac', '2', '-movflags', '+faststart', str(dst)])
        return {'ok': Path(dst).exists(), 'tags': 0, 'too_short': True,
                'duration': dur, 'out_bytes': Path(dst).stat().st_size if Path(dst).exists() else 0}

    # 1. the bed: tag copies on an explicit silent canvas of the right length
    inputs, filters, labels = [], [], []
    for i, off in enumerate(offs, start=1):
        ms = int(off * 1000)
        inputs += ['-i', str(tag)]
        filters.append(f'[{i}:a]adelay={ms}|{ms}[t{i}]')
        labels.append(f'[t{i}]')
    bed = Path(dst).with_suffix('.bed.wav')
    # [0:a] — the silent canvas — MUST be in the mix. Without it the mix length
    # comes from the first tag, and the bed ends seconds in.
    run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-t', f'{dur}',
         '-i', 'anullsrc=r=44100:cl=stereo', *inputs,
         '-filter_complex', ';'.join(filters) + ';[0:a]' + ''.join(labels)
         + f'amix=inputs={len(offs) + 1}:normalize=0:duration=first[bed]',
         '-map', '[bed]', '-ar', '44100', '-ac', '2', str(bed)])

    # 2. duck the music under a constant-level key, mix the gained tag on top
    fc = (
        '[1:a]asplit=2[key][tagv];'
        f'[tagv]volume={gain}dB,adelay={PRE_OPEN_MS}|{PRE_OPEN_MS}[tagd];'
        f'[0:a][key]sidechaincompress=threshold=0.03:ratio={DUCK_RATIO}:'
        f'attack={DUCK_ATTACK}:release={DUCK_RELEASE}:makeup=1:level_sc=1[duck];'
        '[duck][tagd]amix=inputs=2:normalize=0:duration=first[mix];'
        '[mix]alimiter=limit=0.95:level=disabled[out]'
    )
    # Encode to match the KEY's extension. The public objects are overwritten in
    # place, so an .mp3 key has to receive real MP3 — serving AAC bytes from a
    # .mp3 URL is the kind of mismatch that works in one browser and not another.
    ext = Path(dst).suffix.lower()
    if ext == '.mp3':
        wav = Path(dst).with_suffix('.mix.wav')
        r = run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-i', str(bed),
                 '-filter_complex', fc, '-map', '[out]',
                 '-ar', '44100', '-ac', '2', str(wav)])
        if r.returncode == 0:
            r = run(['lame', '--quiet', '-b', '128', '-h', str(wav), str(dst)])
        wav.unlink(missing_ok=True)
    else:
        r = run(['ffmpeg', '-v', 'error', '-y', '-i', str(src), '-i', str(bed),
                 '-filter_complex', fc, '-map', '[out]',
                 '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
                 '-movflags', '+faststart', str(dst)])
    bed.unlink(missing_ok=True)
    if r.returncode != 0:
        return {'ok': False, 'err': r.stderr[-300:]}
    return {'ok': True, 'tags': len(offs), 'integrated': integ, 'tag_gain_db': gain,
            'duration': dur, 'out_bytes': Path(dst).stat().st_size}


if __name__ == '__main__':
    print(json.dumps(watermark(sys.argv[1], sys.argv[2], sys.argv[3]), indent=1))
