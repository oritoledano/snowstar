#!/usr/bin/env python3
"""
Cover art for a track that arrived without any.

An artist uploads audio. Almost none of them upload artwork, and a catalogue
row with a broken image reads as a broken catalogue — so the choice is between
inventing a picture and shipping a hole. This invents as little as possible: a
ground, one light, and the track's own name. It says nothing about the music
that the music did not say, which matters here because the rule on this project
is not to fill in information we are not sure about.

Consistency is the point. Every track in one family gets the SAME card, seeded
from the family name, so five stems of GENTLE look like five stems of one
creation rather than five unrelated releases. Two different songs get two
different palettes, because the seed is the title.

    python3 make-track-art.py "GENTLE" out.jpg [seed]
"""
import hashlib
import math
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageFont

S = 640                      # square; the site renders it at 160 and up

# Palettes pulled from the site's own skins rather than invented: the covers
# have to sit next to the brand, not argue with it.
PALETTES = [
    ((18, 22, 34), (96, 128, 196), (226, 236, 255)),    # cold blue
    ((26, 18, 30), (176, 112, 168), (250, 236, 248)),   # violet
    ((30, 20, 16), (214, 138, 86), (255, 240, 226)),    # coral / brand
    ((16, 26, 24), (96, 176, 152), (228, 250, 242)),    # sea
    ((24, 20, 14), (198, 168, 88), (252, 246, 224)),    # brass
    ((20, 16, 24), (128, 120, 208), (238, 236, 255)),   # indigo
]

FONTS = [
    '/System/Library/Fonts/Supplemental/Futura.ttc',
    '/System/Library/Fonts/HelveticaNeue.ttc',
    '/System/Library/Fonts/Helvetica.ttc',
]


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def font_at(size):
    for path in FONTS:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def card(title, seed_text=None, palette=None):
    seed = int(hashlib.sha256((seed_text or title).encode()).hexdigest()[:8], 16)
    # Hashing the title spread the palettes badly — six families, three of them
    # the same blue. The caller knows the whole set, so it picks; the hash only
    # decides the things that can safely collide (light position, band angle).
    ground, light, ink = PALETTES[(palette if palette is not None else seed) % len(PALETTES)]

    # The light sits off-centre, in one of four places, so a shelf of covers has
    # some rhythm instead of every card being lit identically down the middle.
    gx = (0.30 + 0.40 * ((seed >> 4) % 3) / 2) * S
    gy = (0.26 + 0.34 * ((seed >> 8) % 3) / 2) * S

    img = Image.new('RGB', (S, S), ground)
    d = ImageDraw.Draw(img)
    for y in range(S):
        d.line([(0, y), (S, y)], fill=lerp(lerp(ground, light, .10), ground, (y / S) ** .8))

    # Bloom built small and blurred up — a per-pixel radial at this size is slow
    # and looks no different once it is soft.
    s = 8
    lay = Image.new('RGB', (S // s, S // s), (0, 0, 0))
    ld = ImageDraw.Draw(lay)
    r = int(S * 0.52)
    for i in range(r // s, 0, -2):
        t = 1 - i / (r / s)
        ld.ellipse([gx // s - i, gy // s - i, gx // s + i, gy // s + i],
                   fill=lerp((0, 0, 0), light, t ** 2.2))
    img = ImageChops.add(img, lay.resize((S, S), Image.LANCZOS).filter(ImageFilter.GaussianBlur(18)))

    # One diagonal band of the accent, angled by the seed. Enough geometry to
    # read as designed rather than as a default gradient.
    band = Image.new('RGB', (S, S), (0, 0, 0))
    bd = ImageDraw.Draw(band)
    ang = math.radians(18 + (seed >> 12) % 3 * 14)
    off = S * (0.52 + ((seed >> 16) % 5) * 0.06)
    w = S * 0.07
    dx, dy = math.cos(ang) * S * 2, math.sin(ang) * S * 2
    bd.line([(off - dx, -dy), (off + dx, dy)], fill=lerp((0, 0, 0), light, .55), width=int(w))
    bd.line([(off - dx + w * 2.2, -dy), (off + dx + w * 2.2, dy)],
            fill=lerp((0, 0, 0), light, .22), width=int(w * .45))
    img = ImageChops.add(img, band.filter(ImageFilter.GaussianBlur(2)))

    # Grain, so the gradient does not band on a wide screen.
    n = Image.effect_noise((S, S), 7).convert('L').point(lambda v: v // 6)
    img = ImageChops.add(img, Image.merge('RGB', (n, n, n)))

    # The name, wrapped by width rather than by word count, bottom-left, with
    # the words the artist actually used. Nothing else is claimed on the card.
    d = ImageDraw.Draw(img)
    size = 58 if len(title) < 15 else (46 if len(title) < 26 else 36)
    f = font_at(size)
    words, lines, cur = title.upper().split(), [], ''
    for wd in words:
        t = (cur + ' ' + wd).strip()
        if d.textlength(t, font=f) > S - 88 and cur:
            lines.append(cur)
            cur = wd
        else:
            cur = t
    if cur:
        lines.append(cur)
    lines = lines[:4]

    lh = size * 1.16
    y = S - 54 - lh * len(lines)
    for ln in lines:
        d.text((46, y), ln, font=f, fill=lerp(ink, light, .10))
        y += lh
    return img


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit('usage: make-track-art.py "TITLE" out.jpg [seed-text] [palette-index]')
    out = card(sys.argv[1],
               sys.argv[3] if len(sys.argv) > 3 else None,
               int(sys.argv[4]) if len(sys.argv) > 4 else None)
    out.save(sys.argv[2], 'JPEG', quality=90, optimize=True, progressive=True)
    print(sys.argv[2])
