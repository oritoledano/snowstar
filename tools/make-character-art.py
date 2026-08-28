"""
Character art without an image model.

The old Snowstar boxes were graphic, not photographic — flat shapes, one strong
light, a colour that told you the genre before you read the word. That register
is reachable with primitives, and it has two advantages over a generated
photograph here: it costs nothing, and it is consistent, so eight characters
look like one set rather than eight unrelated stock images.

A character is a silhouette plus a light plus a palette. The silhouette says
who, the light says how it feels, the palette says which shelf it belongs on.
"""
import math, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

W, H = 900, 1200


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def backdrop(top, bottom, glow, gx, gy, gr):
    """Vertical wash plus one light source, which is what gives the flat shapes
       somewhere to sit."""
    img = Image.new('RGB', (W, H), bottom)
    d = ImageDraw.Draw(img)
    for y in range(H):
        d.line([(0, y), (W, y)], fill=lerp(top, bottom, (y / H) ** 0.85))
    # Bloom built small and scaled — a per-pixel radial at 900px is slow and
    # looks no different once blurred.
    s = 6
    lay = Image.new('RGB', (W // s, H // s), (0, 0, 0))
    ld = ImageDraw.Draw(lay)
    for i in range(gr // s, 0, -2):
        t = 1 - i / (gr / s)
        ld.ellipse([gx // s - i, gy // s - i, gx // s + i, gy // s + i],
                   fill=lerp((0, 0, 0), glow, t ** 2))
    lay = lay.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(30))
    return ImageChops.add(img, lay)


def grain(img, amount=9):
    """A little noise so flat gradients do not band on a big print."""
    n = Image.effect_noise((W, H), amount).convert('L')
    return ImageChops.add(img, Image.merge('RGB', (n, n, n)), scale=6)


def vignette(img, strength=0.42):
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).ellipse([-W * 0.35, -H * 0.22, W * 1.35, H * 1.22], fill=255)
    m = m.filter(ImageFilter.GaussianBlur(190))
    dark = Image.new('RGB', (W, H), (0, 0, 0))
    return Image.composite(img, Image.blend(img, dark, strength), m)


def figure(d, cx, base, scale, kind, ink):
    """A stylised standing figure. Deliberately simple: at poster size and
       backlit, a silhouette reads as a person from the proportions alone, and
       detail only makes it look like a bad drawing."""
    s = scale
    head_r = 34 * s
    head_y = base - 330 * s
    if kind == 'agent':
        # long coat, shoulders squared, one arm hanging with a pistol
        d.polygon([(cx - 78 * s, head_y + 52 * s), (cx + 78 * s, head_y + 52 * s),
                   (cx + 96 * s, base - 40 * s), (cx - 96 * s, base - 40 * s)], fill=ink)
        d.rectangle([cx - 96 * s, base - 60 * s, cx - 62 * s, base], fill=ink)
        d.rectangle([cx + 62 * s, base - 60 * s, cx + 96 * s, base], fill=ink)
        d.polygon([(cx + 78 * s, head_y + 70 * s), (cx + 104 * s, head_y + 70 * s),
                   (cx + 112 * s, base - 150 * s), (cx + 86 * s, base - 150 * s)], fill=ink)
        d.rectangle([cx + 96 * s, base - 168 * s, cx + 150 * s, base - 150 * s], fill=ink)  # pistol
        d.ellipse([cx - head_r, head_y - head_r, cx + head_r, head_y + head_r], fill=ink)
        d.polygon([(cx - 58 * s, head_y - 16 * s), (cx + 58 * s, head_y - 16 * s),
                   (cx + 34 * s, head_y - 40 * s), (cx - 34 * s, head_y - 40 * s)], fill=ink)  # brim
    elif kind == 'creature':
        # round, small, two tall ears — reads as friendly at any size
        body_r = 108 * s
        d.ellipse([cx - body_r, base - body_r * 2, cx + body_r, base], fill=ink)
        for sx in (-1, 1):
            d.polygon([(cx + sx * 44 * s, base - body_r * 1.9),
                       (cx + sx * 20 * s, base - body_r * 3.1),
                       (cx + sx * 74 * s, base - body_r * 2.2)], fill=ink)
        d.ellipse([cx - 30 * s, base - body_r * 1.5, cx - 8 * s, base - body_r * 1.2], fill=(0, 0, 0))
        d.ellipse([cx + 8 * s, base - body_r * 1.5, cx + 30 * s, base - body_r * 1.2], fill=(0, 0, 0))
    elif kind == 'hero':
        # cape, wide stance
        d.polygon([(cx - 96 * s, head_y + 40 * s), (cx + 96 * s, head_y + 40 * s),
                   (cx + 150 * s, base), (cx - 150 * s, base)], fill=ink)
        d.polygon([(cx - 60 * s, head_y + 46 * s), (cx + 60 * s, head_y + 46 * s),
                   (cx + 74 * s, base - 20 * s), (cx - 74 * s, base - 20 * s)],
                  fill=lerp(ink, (255, 255, 255), 0.06))
        d.ellipse([cx - head_r, head_y - head_r, cx + head_r, head_y + head_r], fill=ink)


PRESETS = {
    'agent':    dict(top=(16, 20, 44), bottom=(6, 6, 12), glow=(70, 110, 210), kind='agent'),
    'creature': dict(top=(58, 26, 74), bottom=(14, 8, 22), glow=(230, 130, 90), kind='creature'),
    'hero':     dict(top=(60, 22, 18), bottom=(10, 6, 8), glow=(240, 150, 60), kind='hero'),
}


def make(preset, out_path, doorway=True):
    p = PRESETS[preset]
    gx, gy, gr = W // 2, int(H * 0.42), int(W * 0.9)
    img = backdrop(p['top'], p['bottom'], p['glow'], gx, gy, gr)
    d = ImageDraw.Draw(img)

    if doorway:
        # A bright rectangle behind the figure: instant depth, and it is what
        # makes a flat silhouette read as backlit rather than pasted on.
        dw, dh = int(W * 0.56), int(H * 0.70)
        dx, dy = (W - dw) // 2, int(H * 0.10)
        door = Image.new('RGB', (dw, dh), (0, 0, 0))
        dd = ImageDraw.Draw(door)
        for y in range(dh):
            dd.line([(0, y), (dw, y)], fill=lerp(lerp(p['glow'], (255,255,255), .35), p['bottom'], (y / dh) ** 1.15))
        img.paste(door, (dx, dy))
        img = img.filter(ImageFilter.GaussianBlur(1.2))
        d = ImageDraw.Draw(img)

    figure(d, W // 2, int(H * 0.88), 1.9, p['kind'], (5, 5, 10))
    img = vignette(grain(img))
    img.save(out_path, quality=94)
    return out_path


if __name__ == '__main__':
    import sys
    make(sys.argv[1], sys.argv[2])
    print('written', sys.argv[2])
