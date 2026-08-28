"""
Turn a piece of character art into a product package, like the old
Snowstar Music Library boxes.

The box is what makes it read as a product rather than a picture: a front face,
a spine turned slightly away, a top edge, and a reflection under it. All of that
is a perspective transform, which Pillow can do exactly — no 3D, no renderer.

The character art is generated separately and passed in. This file only does the
packaging, so the art can be replaced, regenerated or hand-drawn without any of
the box geometry changing.
"""
import io, os, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SC = '/private/tmp/claude-501/-Users-kayma-Desktop/5de9b6e0-aa6d-4b73-9d49-b7b84b13433e/scratchpad'
ANTON = SC + '/fonts/Anton-Regular.ttf'
SORA = SC + '/fonts/Sora[wght].ttf'

W, H = 1400, 1000
CREAM = (243, 238, 230)
GRAD_A, GRAD_B = (255, 214, 92), (232, 84, 62)


def sora(size, weight=500):
    f = ImageFont.truetype(SORA, size)
    try: f.set_variation_by_axes([weight])
    except Exception: pass
    return f


def coeffs(src, dst):
    """Perspective coefficients mapping dst quad -> src quad, which is the
       direction PIL's transform wants."""
    m = []
    for (x, y), (u, v) in zip(dst, src):
        m.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        m.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    import numpy as np
    A = np.matrix(m, dtype=float)
    B = np.array(src).reshape(8)
    return np.array(np.dot(np.linalg.inv(A.T * A) * A.T, B)).reshape(8)


def warp(img, quad, size):
    """Place `img` into an RGBA canvas of `size` so its corners land on `quad`
       (tl, tr, br, bl)."""
    w, h = img.size
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    out = img.convert('RGBA').transform(
        size, Image.PERSPECTIVE, coeffs(src, quad), Image.BICUBIC)
    return out


def shade(img, amount):
    """Darken a face so the box has a light direction."""
    if amount <= 0: return img
    d = Image.new('RGBA', img.size, (0, 0, 0, int(255 * amount)))
    d.putalpha(Image.eval(img.split()[3], lambda a: int(a * amount)))
    return Image.alpha_composite(img, d)


def spine_from(front, width):
    """A spine built from a blurred, darkened slice of the front, so it always
       shares the artwork's palette without needing a second image."""
    w, h = front.size
    strip = front.crop((0, 0, max(2, w // 8), h)).resize((width, h), Image.LANCZOS)
    return strip.filter(ImageFilter.GaussianBlur(6))


def make_box(art_path, title, subtitle, out_path, kicker='SNOWSTAR MUSIC LIBRARY'):
    art = Image.open(art_path).convert('RGB')
    # Crop to the tall box proportion the reference uses.
    tw, th = 620, 880
    ar = art.width / art.height
    want = tw / th
    if ar > want:
        nw = int(art.height * want)
        art = art.crop(((art.width - nw) // 2, 0, (art.width + nw) // 2, art.height))
    else:
        nh = int(art.width / want)
        art = art.crop((0, 0, art.width, nh))
    art = art.resize((tw, th), Image.LANCZOS)

    face = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
    face.paste(art, (0, 0))
    d = ImageDraw.Draw(face)

    # Type block over a gradient scrim, so a busy image never eats the title.
    scrim = Image.new('RGBA', (tw, 300), (0, 0, 0, 0))
    sd = ImageDraw.Draw(scrim)
    for i in range(300):
        sd.line([(0, i), (tw, i)], fill=(8, 7, 10, int(235 * (i / 300) ** 1.5)))
    face.alpha_composite(scrim, (0, th - 300))

    size = 76
    while size > 30:
        f = ImageFont.truetype(ANTON, size)
        if d.textlength(title.upper(), font=f) <= tw - 76: break
        size -= 2
    f = ImageFont.truetype(ANTON, size)
    d.text((38, th - 96 - size), title.upper(), font=f, fill=CREAM)
    if subtitle:
        d.text((40, th - 76), subtitle.upper(), font=sora(18, 600), fill=(198, 190, 200))
    d.text((40, th - 142 - size), kicker, font=sora(15, 600), fill=GRAD_A)
    for i in range(90):
        d.rectangle([38 + i, th - 164 - size, 39 + i, th - 160 - size],
                    fill=tuple(round(a + (b - a) * (i / 89)) for a, b in zip(GRAD_A, GRAD_B)))

    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))

    # Perspective: the front turned a little, the spine catching the rest.
    x0, top, bot = 520, 52, 948
    front_q = [(x0, top + 30), (x0 + 540, top), (x0 + 540, bot), (x0, bot - 30)]
    spine_q = [(x0 - 178, top + 116), (x0, top + 30), (x0, bot - 30), (x0 - 178, bot - 116)]

    sp = shade(warp(spine_from(art, 150), spine_q, (W, H)), 0.42)
    fr = warp(face, front_q, (W, H))
    canvas.alpha_composite(sp)
    canvas.alpha_composite(fr)

    # Reflection: the same box flipped, faded, and squashed.
    refl = canvas.transpose(Image.FLIP_TOP_BOTTOM).resize((W, H // 2), Image.LANCZOS)
    mask = Image.linear_gradient('L').rotate(180).resize((W, H // 2))
    refl.putalpha(Image.eval(mask, lambda a: int(a * 0.22)))

    bg = Image.new('RGBA', (W, H + H // 2), (12, 11, 15, 255))
    bd = ImageDraw.Draw(bg)
    for i in range(H + H // 2):                     # a soft vertical wash
        t = i / (H + H // 2)
        bd.line([(0, i), (W, i)], fill=(int(12 + 26 * (1 - t)), int(11 + 20 * (1 - t)),
                                        int(15 + 30 * (1 - t)), 255))
    bg.alpha_composite(canvas, (0, 0))
    bg.alpha_composite(refl, (0, H - 40))

    bg.convert('RGB').crop((150, 0, W - 130, H + 300)).save(out_path, quality=92, optimize=True)
    return out_path


if __name__ == '__main__':
    import sys
    make_box(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else '', sys.argv[4])
    print('written', sys.argv[4])
