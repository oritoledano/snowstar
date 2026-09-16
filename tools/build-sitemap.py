#!/usr/bin/env python3
"""
Build sitemap.xml, including a URL for every track.

The sitemap listed nine pages while the catalogue held 402 tracks, and the only
per-track address — /t/<slug> — served a meta-refresh with a canonical pointing
at the catalogue, so Google was told the real page was somewhere else and
indexed none of them. Hundreds of pages of the thing people actually search for
("cinematic build 90bpm", a track title, an artist name) had no organic surface
at all.

Now /t/<slug> is a real page, so the sitemap has to say so. Deleted tracks are
excluded: pointing a crawler at a 404 is worse than not pointing at it.

    python3 tools/build-sitemap.py
"""
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://snowstar.company'

# The pages that are not tracks, with the weight they had before.
STATIC = [
    ('/',                     'weekly',  '1.0'),
    ('/mutra.html',           'weekly',  '0.9'),
    ('/apps/streamdaw.html',  'monthly', '0.8'),
    ('/snowstash.html',       'monthly', '0.8'),
    ('/artists.html',         'monthly', '0.7'),
    ('/contact.html',         'yearly',  '0.4'),
    ('/terms.html',           'yearly',  '0.2'),
    ('/privacy.html',         'yearly',  '0.2'),
    ('/refund.html',          'yearly',  '0.2'),
]


def catalogue():
    raw = (ROOT / 'js' / 'mutra-data.js').read_text()
    data = json.loads(raw[raw.index('{'):raw.rindex('}') + 1])
    return data['tracks']


def deleted_slugs():
    """Tracks taken down. A sitemap entry for one is a crawl budget spent on a 404."""
    try:
        out = subprocess.run(
            ['npx', 'wrangler', 'd1', 'execute', 'snowstar-members', '--remote', '--json',
             '--command', 'SELECT slug FROM deleted_tracks;'],
            cwd=ROOT / 'worker', capture_output=True, text=True, timeout=180).stdout
        rows = json.loads(out[out.index('['):])[0]['results']
        return {r['slug'] for r in rows}
    except Exception as e:
        print(f'  could not read deleted_tracks ({e}); including everything', file=sys.stderr)
        return set()


def main():
    today = date.today().isoformat()
    tracks = catalogue()
    gone = deleted_slugs()
    live = [t for t in tracks if t.get('slug') and t['slug'] not in gone]

    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for path, freq, pri in STATIC:
        lines.append(f'  <url><loc>{SITE}{path}</loc><lastmod>{today}</lastmod>'
                     f'<changefreq>{freq}</changefreq><priority>{pri}</priority></url>')
    # One per track. monthly because a track's page changes when its tags or
    # artwork do, which is neither daily nor never.
    for t in sorted(live, key=lambda x: x['slug']):
        loc = f"{SITE}/t/{escape(t['slug'])}"
        lines.append(f'  <url><loc>{loc}</loc><lastmod>{today}</lastmod>'
                     f'<changefreq>monthly</changefreq><priority>0.6</priority></url>')
    lines.append('</urlset>')

    (ROOT / 'sitemap.xml').write_text('\n'.join(lines) + '\n')
    print(f'  {len(STATIC)} pages + {len(live)} tracks'
          f'{f" ({len(gone)} deleted, excluded)" if gone else ""} -> sitemap.xml')


if __name__ == '__main__':
    main()
