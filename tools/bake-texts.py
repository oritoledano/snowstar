#!/usr/bin/env python3
"""
Write the site editor's stored text back into a page's own HTML.

WHY A PAGE HAS TO CARRY THE EDITOR'S MARKUP
-------------------------------------------
js/site-edit.js runs for every visitor, not only for an admin. On every load it
fetches /api/texts and, for every stored row whose key matches an element on the
page, does `el.innerHTML = cleanStr(html)` — unconditionally, with no comparison
against what the file already says. That assignment happens after first paint.

So when a stored row differs from the file, the visitor sees the file's sentence
for a moment and then watches it change. That flash is the whole bug this tool
exists to remove, and the only cure is for the file to say exactly what the row
says. Everything editor-shaped that this tool writes into a page — a
`<span class="se-fs" style="font-size: 125%;">`, a frozen px size, an &nbsp; —
is there on purpose. Tidying it up re-creates the flash, because the row would
once again differ from the file.

The rows are also the user's safety net: a row always wins, so a wrong bake can
only ever fail to remove the flash. It can never lose the user's text. This tool
preserves that property — it never writes to D1, and it never asks to.

WHAT IT DOES
------------
  python3 tools/bake-texts.py apps/audioctor.html --from-file rows.json --dry-run
  python3 tools/bake-texts.py apps/audioctor.html --from-file rows.json
  python3 tools/bake-texts.py apps/audioctor.html --from-url

* Splices ONLY the inner source range of the element carrying each `data-txt`
  key. Every other byte of the file is left alone, so the diff stays reviewable.
* Applies the `rows.removed.<path>` selectors by deleting the elements they
  match, with three refusals that each come from a real way this goes wrong
  (see `plan_removals`).
* Refuses, loudly and per key, anything it cannot prove safe: a key no element
  carries, a key two elements carry, stored markup the HTML parser would not put
  back where the editor had it, and an `auto.` key whose words cannot change
  without renumbering a sibling row onto a different block.
* Never touches `layout.<path>` or `sections.hidden.<path>`. Those are painted by
  a generated stylesheet and by `style.display`, not by innerHTML, so they are
  reported for a hand decision instead.

The input is a saved copy of GET /api/texts — either `{"texts": {...}}` or the
flat `{key: html}` map. --from-file is the default because a bake should be
reproducible; --from-url reads the live site.
"""
import argparse
import bisect
import html as htmlmod
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = 'https://snowstar.company/api/texts'

# ── the HTML parsing rules this tool needs to agree with a browser ────────────
# html.parser is a tokeniser, not a tree builder, so the tree below is built by
# hand. Only the implicit-close rules that actually occur in these pages are
# implemented; anything else is reported rather than guessed at.
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
        'meta', 'param', 'source', 'track', 'wbr'}
# A start tag in this set closes an open <p>. That is not a nicety: the page had
# a <div> written inside a <p class="reels-sub">, and the browser moves that div
# out to be the p's SIBLING — which is what one of the stored removal selectors
# addresses. A tree that kept the div inside the p would not match that selector
# and would splice over it.
CLOSES_P = {'address', 'article', 'aside', 'blockquote', 'center', 'details',
            'dialog', 'dir', 'div', 'dl', 'fieldset', 'figcaption', 'figure',
            'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
            'hgroup', 'hr', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'search',
            'section', 'summary', 'table', 'ul'}
# <li><li> and friends: a start tag closes an open sibling of the same kind.
AUTO_CLOSE = {'li': {'li'}, 'dt': {'dt', 'dd'}, 'dd': {'dt', 'dd'},
              'option': {'option'}, 'tr': {'tr'}, 'td': {'td', 'th'},
              'th': {'td', 'th'}, 'thead': {'tbody', 'tfoot'},
              'tbody': {'tbody', 'tfoot'}, 'p': {'p'}}
HEADINGS = {'h1', 'h2', 'h3', 'h4', 'h5', 'h6'}
END_TAG = re.compile(r'</\s*[a-zA-Z][^>]*>')


class Unsupported(Exception):
    """A selector shape this tool does not implement. Never skipped silently."""


class Node:
    __slots__ = ('tag', 'attrs', 'parent', 'children', 'open_start', 'open_end',
                 'close_start', 'close_end', 'implicit', 'synthetic', 'kids')

    def __init__(self, tag, attrs, parent=None):
        self.tag, self.attrs, self.parent = tag, attrs, parent
        self.children = []
        self.open_start = self.open_end = 0
        self.close_start = self.close_end = 0
        self.implicit = False      # closed by a start tag, not by its own end tag
        self.synthetic = False     # the browser would create it; the source has none
        self.kids = []             # children AND text, in document order

    # The element's own source, and the source between its tags.
    def span(self):
        return self.open_start, self.close_end

    def inner(self):
        return self.open_end, self.close_start

    def where(self, lines):
        return bisect.bisect_right(lines, self.open_start)

    def text_content(self):
        """Node.textContent: every descendant's text, in order, comments left out."""
        return ''.join(k if isinstance(k, str) else k.text_content()
                       for k in self.kids)

    def closest(self, pred):
        n = self
        while n is not None and n.tag != '#document':
            if pred(n):
                return n
            n = n.parent
        return None

    def has_descendant(self, pred):
        for c in self.children:
            if pred(c) or c.has_descendant(pred):
                return True
        return False

    def contains(self, other):
        n = other
        while n is not None:
            if n is self:
                return True
            n = n.parent
        return False

    def hidden_chain(self):
        n = self
        while n is not None:
            if 'hidden' in n.attrs:
                return n
            n = n.parent
        return None

    def desc(self):
        bits = self.tag
        if self.attrs.get('id'):
            bits += '#' + self.attrs['id']
        if self.attrs.get('class'):
            bits += '.' + '.'.join(self.attrs['class'].split())
        return bits


class Tree(HTMLParser):
    def __init__(self, src):
        super().__init__(convert_charrefs=False)
        self.src = src
        self.lines = []
        off = 0
        for part in src.split('\n'):          # html.parser counts \n only
            self.lines.append(off)
            off += len(part) + 1
        self.root = Node('#document', {})
        self.stack = [self.root]
        self.elements = []
        self.textnodes = []        # (owner, string) in document order
        self.notes = []
        self.feed(src)
        if len(self.stack) > 1:
            left = ', '.join(n.desc() for n in self.stack[1:])
            self.notes.append('still open at end of file: ' + left)

    def at(self):
        line, col = self.getpos()
        return self.lines[line - 1] + col

    def _open(self, tag, attrs, start, end):
        node = Node(tag, {k: (v if v is not None else '') for k, v in attrs},
                    self.stack[-1])
        node.open_start, node.open_end = start, end
        node.close_start = node.close_end = end
        self.stack[-1].children.append(node)
        self.stack[-1].kids.append(node)
        self.elements.append(node)
        return node

    def _close_to(self, idx, at):
        for n in self.stack[idx:]:
            if n.close_end == n.open_end:      # not closed yet
                n.close_start = n.close_end = at
                n.implicit = True
        del self.stack[idx:]

    def handle_starttag(self, tag, attrs):
        start = self.at()
        raw = self.get_starttag_text()
        if self.src[start:start + len(raw)] != raw:
            raise SystemExit('bake-texts: parser desync at offset %d' % start)
        # implicit closes, innermost first
        while len(self.stack) > 1:
            top = self.stack[-1].tag
            if tag in CLOSES_P and top == 'p':
                self._close_to(len(self.stack) - 1, start)
                continue
            if top in AUTO_CLOSE.get(tag, ()):
                self._close_to(len(self.stack) - 1, start)
                continue
            break
        node = self._open(tag, attrs, start, start + len(raw))
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        start = self.at()
        raw = self.get_starttag_text()
        self._open(tag, attrs, start, start + len(raw))

    def handle_endtag(self, tag):
        start = self.at()
        m = END_TAG.match(self.src, start)
        end = m.end() if m else start
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                node = self.stack[i]
                self._close_to(i + 1, start)
                node.close_start, node.close_end = start, end
                node.implicit = False
                del self.stack[i:]
                return
        # A stray </p> is not ignored by a browser: it opens and closes an empty
        # <p>. The page has one (the </p> left over after that misplaced <div>),
        # and it counts for :nth-of-type, so the tree has to carry it.
        if tag == 'p':
            node = self._open('p', [], start, start)
            node.close_start = node.close_end = end
            node.synthetic = True
        else:
            self.notes.append('stray </%s> ignored at offset %d' % (tag, start))

    def _data(self, s):
        owner = self.stack[-1]
        # The DOM merges adjacent character data into one text node; autoKeys
        # walks text NODES, so entity refs have to join the run beside them.
        if owner.kids and isinstance(owner.kids[-1], str):
            owner.kids[-1] += s
            self.textnodes[-1] = (owner, owner.kids[-1])
        else:
            owner.kids.append(s)
            self.textnodes.append((owner, s))

    def handle_data(self, data):
        self._data(data)

    def handle_entityref(self, name):
        self._data(htmlmod.unescape('&' + name + ';'))

    def handle_charref(self, name):
        self._data(htmlmod.unescape('&#' + name + ';'))


# ── the editor's own key arithmetic, ported verbatim ─────────────────────────
def fnv1a36(s):
    """js/site-edit.js autoKeys: FNV-1a over UTF-16 code units, base 36."""
    h = 2166136261
    for ch in s:
        for unit in ([ord(ch)] if ord(ch) < 0x10000 else
                     [0xD800 + ((ord(ch) - 0x10000) >> 10),
                      0xDC00 + ((ord(ch) - 0x10000) & 0x3FF)]):
            h ^= unit
            h = (h * 16777619) & 0xFFFFFFFF
    digits = '0123456789abcdefghijklmnopqrstuvwxyz'
    if h == 0:
        return '0'
    out = ''
    while h:
        out = digits[h % 36] + out
        h //= 36
    return out


def words_of(text):
    return re.sub(r'\s+', ' ', text).strip()[:400]


assert fnv1a36('9:41') == '1wwpj1t', 'FNV port does not match the editor'

# js/site-edit.js autoKeys, ported line for line. Half the rows on these pages
# have no key in the HTML at all: a page whose <main> carries data-autotxt gets
# "auto.<page>.<hash of the block's own words>" on every unkeyed text block, at
# runtime. A tool that only read data-txt attributes would call all of those
# rows dead and walk straight past the flash they cause.
AUTO_BLOCK = {'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'figcaption',
              'summary', 'dt', 'dd', 'td', 'th', 'blockquote', 'a', 'button',
              'label'}
AUTO_LIVE_TAGS = {'input', 'select', 'textarea', 'video', 'canvas', 'script'}
AUTO_LIVE_ATTRS = ('data-txt', 'data-usd', 'data-ils', 'data-cur', 'id')
AUTO_SKIP = {'svg', 'script', 'style'}


def is_live(n):
    return n.tag in AUTO_LIVE_TAGS or any(a in n.attrs for a in AUTO_LIVE_ATTRS)


def auto_keys(tree, page_url):
    """key -> node, exactly as autoKeys would assign them on this page."""
    main = next((n for n in tree.elements
                 if n.tag == 'main' and 'data-autotxt' in n.attrs), None)
    if main is None:
        return {}
    slug = re.sub(r'^-|-$', '', re.sub(r'[^a-z0-9]+', '-',
                  re.sub(r'\.html$', '', page_url.lower())))[-40:] or 'home'
    picked = []
    for owner, text in tree.textnodes:
        if not text.strip():
            continue
        if owner.closest(lambda n: n.tag in AUTO_SKIP or 'data-txt' in n.attrs
                         or 'contenteditable' in n.attrs):
            continue
        el = owner.closest(lambda n: n.tag in AUTO_BLOCK) or owner
        if (not main.contains(el) or el is main or el in picked
                or el.attrs.get('id') or el.has_descendant(is_live)
                or el.closest(lambda n: 'data-txt' in n.attrs)):
            continue
        picked.append(el)
    out, seen = {}, {}
    for el in picked:
        base = 'auto.' + slug + '.' + fnv1a36(words_of(el.text_content()))
        k = seen.get(base, 0) + 1
        seen[base] = k
        out[base + ('-%d' % k if k > 1 else '')] = el
    return out


# ── selectors: #id, tag, :nth-of-type(n), child ">" only ─────────────────────
TOKEN = re.compile(r'([a-zA-Z][a-zA-Z0-9]*)|#([A-Za-z][-\w]*)|:nth-of-type\((\d+)\)')


class Compound:
    def __init__(self, text):
        self.tag = self.cid = self.nth = None
        pos = 0
        while pos < len(text):
            m = TOKEN.match(text, pos)
            if not m:
                raise Unsupported(text)
            tag, cid, nth = m.groups()
            if tag:
                if self.tag or pos:
                    raise Unsupported(text)
                self.tag = tag.lower()
            elif cid:
                if self.cid:
                    raise Unsupported(text)
                self.cid = cid
            else:
                if self.nth:
                    raise Unsupported(text)
                self.nth = int(nth)
            pos = m.end()


def parse_selector(sel):
    s = re.sub(r'\s*>\s*', '>', sel.strip())
    if re.search(r'[\s,+~\[\].*|^$"\']', s):
        raise Unsupported(sel)
    if ':' in s and not re.fullmatch(r'[^:]*(:nth-of-type\(\d+\)[^:]*)*', s):
        raise Unsupported(sel)
    parts = s.split('>')
    if any(p == '' for p in parts):
        raise Unsupported(sel)
    return [Compound(p) for p in parts]


def match(node, c, gone):
    if c.tag and node.tag != c.tag:
        return False
    if c.cid and node.attrs.get('id') != c.cid:
        return False
    if c.nth is not None:
        sibs = [s for s in node.parent.children
                if s.tag == node.tag and id(s) not in gone]
        if node not in sibs or sibs.index(node) + 1 != c.nth:
            return False
    return True


def select(tree, sel, gone=frozenset()):
    comps = parse_selector(sel)
    cur = [n for n in tree.elements if id(n) not in gone and match(n, comps[0], gone)]
    for c in comps[1:]:
        cur = [k for n in cur for k in n.children
               if id(k) not in gone and match(k, c, gone)]
    return cur


# ── comparing a stored row with what the file already says ───────────────────
AUTO_ATTR = re.compile(r'\s+data-txt="auto\.[^"]*"')
EMPTY_ATTR = re.compile(r'([a-zA-Z-]+)=""')


def normalise(h):
    """What the browser would show, with the differences hydration itself makes.

    Hydration re-injects an `auto.` key onto a keyed child (cleanStr keeps those
    on purpose), and serialises a bare attribute as attr="". Two rows on this
    page differ from the file in exactly those two ways and nothing else, so
    they render identically and must NOT be baked: writing a child data-txt into
    the file would make autoKeys' LIVE filter match, and the parent block would
    silently lose its own auto key and stop being editable.
    """
    h = AUTO_ATTR.sub('', h)
    h = EMPTY_ATTR.sub(r'\1', h)
    h = h.replace('&nbsp;', ' ')
    return h.strip()


def loose(h):
    # ASCII whitespace only: an &nbsp; where the file has a space is a real
    # difference in where a line may break, not a formatting one.
    return re.sub(r'[ \t\r\n\f\v]+', ' ', normalise(h))


# ── planning ─────────────────────────────────────────────────────────────────
NOTE = '<!-- /api/texts row "%s" wins on every load; this is that row, so first paint already matches it. -->'
# An auto key is the hash of the block's own words, so writing the row's words in
# changes the key and the row stops matching — which is the mechanism working as
# designed, not a loss: the words are now the page's.
AUTO_NOTE = '<!-- the editor\'s stored text for this block (was %s); an auto key is a hash of the words, so that row retires itself. -->'


def line_bounds(src, i):
    a = src.rfind('\n', 0, i) + 1
    b = src.find('\n', i)
    return a, (len(src) if b < 0 else b)


def widen(src, a, b):
    """Swallow a deleted element's own line, so no blank line is left behind."""
    la, _ = line_bounds(src, a)
    _, lb = line_bounds(src, max(b - 1, a))
    if src[la:a].strip() == '' and src[b:lb].strip() == '':
        return la, min(lb + 1, len(src))
    return a, b


def plan_texts(tree, src, rows, page_url, notes_on):
    by_key = {}
    for n in tree.elements:
        k = n.attrs.get('data-txt')
        if k:
            by_key.setdefault(k, []).append(n)
    autos = auto_keys(tree, page_url)
    for k, n in autos.items():
        by_key.setdefault(k, [n])

    # Every block that shares a base with another one: their -N suffixes are
    # positional, so changing one block's words renumbers the rest.
    groups = {}
    for k in autos:
        groups.setdefault(re.sub(r'-\d+$', '', k), []).append(k)

    splices, skipped, refused, missing = [], [], [], []
    for key, stored in sorted(rows.items()):
        if key.startswith(('rows.removed.', 'sections.hidden.', 'layout.',
                           'properties')):
            continue
        hit = by_key.get(key)
        if not hit:
            missing.append(key)
            continue
        if len(hit) > 1:
            refused.append((key, '%d elements carry this key; which one the row '
                                 'lands on is table order' % len(hit)))
            continue
        el = hit[0]
        a, b = el.inner()
        have = src[a:b]
        if normalise(have) == normalise(stored):
            skipped.append((key, 'file already matches the row'))
            continue
        if loose(have) == loose(stored):
            skipped.append((key, 'differs from the row only in whitespace; '
                                 'nothing visible changes at hydration'))
            continue
        # Markup the parser would not put back where the editor had it.
        if el.tag in HEADINGS and re.search(r'<\s*h[1-6]\b', stored, re.I):
            refused.append((key, 'the row is <h*> inside <%s>: legal for innerHTML, '
                                 'but the document parser closes the <%s> at the first '
                                 '<h*>, so the block would parse EMPTY. Settle it by '
                                 'hand: write the row\'s rendered text into the block.'
                            % (el.tag, el.tag)))
            continue
        if el.tag == 'p' and re.search(r'<\s*(%s)\b' % '|'.join(sorted(CLOSES_P)),
                                       stored, re.I):
            refused.append((key, 'the row holds a block-level element inside a <p>, '
                                 'which the document parser moves out of it'))
            continue
        if el.tag in VOID:
            refused.append((key, '<%s> has no inner range' % el.tag))
            continue
        auto = key.startswith('auto.')
        if auto:
            group = [k for k in groups.get(re.sub(r'-\d+$', '', key), [])
                     if k != key]
            others = sorted(k for k in group if k in rows)
            if others:
                refused.append((key, 'an auto key is the hash of the block\'s own '
                                     'words, and the -N suffix is positional among '
                                     'the blocks that share them. Writing these words '
                                     'in renumbers the rest, so the row(s) still '
                                     'stored for %s would repaint onto a DIFFERENT '
                                     'block. Take these blocks out of autoKeys by '
                                     'hand (give each an id, as #remixBeats does) and '
                                     'write the words in that same edit.'
                                % ', '.join(others)))
                continue
        splices.append((a, b, stored, el, key))
        if notes_on:
            note = (AUTO_NOTE if auto else NOTE) % key
            la, _ = line_bounds(src, el.open_start)
            if note not in src:
                pad = src[la:el.open_start]
                if pad.strip() == '':
                    splices.append((la, la, pad + note + '\n', None, key))
                else:
                    splices.append((el.open_start, el.open_start, note + ' ', None, key))
    return splices, skipped, refused, missing


def plan_removals(tree, src, sels, text_spans):
    out, skipped, refused = [], [], []
    for sel in sels:
        hits = select(tree, sel)              # raises Unsupported: never skipped
        if not hits:
            skipped.append((sel, 'matches nothing: the row is already dead'))
            continue
        for el in hits:
            a, b = el.span()
            if el.synthetic:
                refused.append((sel, 'matches an element the parser creates, not '
                                     'one in the source'))
                continue
            if any(a >= s and b <= e for s, e, *_ in text_spans):
                skipped.append((sel, 'inside %s, which a baked row rewrites whole: '
                                     'it goes with that splice' % el.desc()))
                continue
            left = select(tree, sel, gone={id(x) for x in hits})
            if left:
                refused.append((sel, 'self-consuming: with %s gone the same selector '
                                     'matches %s, so the next load would delete THAT '
                                     'for every visitor. Leave the element in the file.'
                                % (el.desc(), ', '.join(x.desc() for x in left))))
                continue
            h = el.hidden_chain()
            if h is not None:
                skipped.append((sel, '%s is already hidden (%s[hidden]), so nothing '
                                     'flashes; deleting it only makes the selector a '
                                     'landmine for the next element in that slot'
                                % (el.desc(), h.desc())))
                continue
            out.append((*widen(src, a, b), '', el, sel))
    return out, skipped, refused


def load_rows(args):
    if args.from_url:
        # A default urllib User-Agent is refused by the edge with a 403, and the
        # header is no place for who is running this, so it says only what it is.
        req = urllib.request.Request(args.from_url, headers={
            'User-Agent': 'bake-texts/1', 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read().decode())
        except Exception as e:
            raise SystemExit('bake-texts: could not read %s (%s). Save it to a '
                             'file and pass --from-file instead.' % (args.from_url, e))
    else:
        data = json.loads(Path(args.from_file).read_text())
    rows = data.get('texts', data) if isinstance(data, dict) else {}
    if not isinstance(rows, dict):
        raise SystemExit('bake-texts: expected {"texts": {...}} or {key: html}')
    return {k: v for k, v in rows.items() if isinstance(v, str)}


def main():
    ap = argparse.ArgumentParser(description='Bake stored editor text into a page.')
    ap.add_argument('page', help='page path relative to site/, e.g. apps/audioctor.html')
    ap.add_argument('--from-file', help='a saved copy of GET /api/texts (the default input)')
    ap.add_argument('--from-url', nargs='?', const=API, default=None,
                    help='read the rows from the live site instead (default %s)' % API)
    ap.add_argument('--dry-run', action='store_true', help='print the plan, write nothing')
    ap.add_argument('--no-notes', action='store_true',
                    help='do not write the one-line comment above a baked block')
    ap.add_argument('-v', '--verbose', action='store_true')
    args = ap.parse_args()
    if not args.from_file and not args.from_url:
        ap.error('pass --from-file <saved /api/texts> or --from-url')

    path = (ROOT / args.page).resolve()
    if not str(path).startswith(str(ROOT)) or not path.is_file():
        raise SystemExit('bake-texts: no such page under site/: %s' % args.page)
    rel = path.relative_to(ROOT).as_posix()
    page_url = '/' if rel == 'index.html' else '/' + rel

    src = path.read_text()
    tree = Tree(src)
    rows = load_rows(args)
    for n in tree.notes:
        print('  parser note: %s' % n)

    splices, tskip, trefuse, missing = plan_texts(
        tree, src, rows, page_url, not args.no_notes)
    text_spans = [(a, b) for a, b, *_ in splices if a != b]
    try:
        rm, rskip, rrefuse = plan_removals(
            tree, src, json.loads(rows.get('rows.removed.' + page_url, '[]')),
            text_spans)
    except Unsupported as e:
        raise SystemExit('bake-texts: selector shape not implemented: %s\n'
                         '  only #id, tag, :nth-of-type(n) and ">" are. Nothing was '
                         'written.' % e)

    print('\n%s  (rows for this page: %d)' % (rel, len(rows)))
    print('\nBAKE  %d' % len([s for s in splices if s[3] is not None]))
    for a, b, new, el, key in splices:
        if el is None:
            continue
        print('  %-34s line %-4d %s' % (key, el.where(tree.lines), el.desc()))
        if args.verbose:
            print('      was: %s' % src[a:b][:160])
            print('      now: %s' % new[:160])
    print('\nDELETE  %d' % len(rm))
    for a, b, _, el, sel in rm:
        print('  %-46s line %-4d %s' % (sel, el.where(tree.lines), el.desc()))

    for title, items in (('SKIPPED', tskip + rskip), ('REFUSED', trefuse + rrefuse)):
        print('\n%s  %d' % (title, len(items)))
        for what, why in items:
            print('  %s\n      %s' % (what, why))

    if missing:
        print('\nNO ELEMENT ON THIS PAGE CARRIES THIS KEY  %d  (another page\'s row, '
              'or a dead one; D1 is never written to either way)' % len(missing))
        line = '  '
        for k in sorted(missing):
            if len(line) + len(k) > 96:
                print(line.rstrip(', ')); line = '  '
            line += k + ', '
        print(line.rstrip(', '))

    hand = []
    for k, v in sorted(rows.items()):
        if k == 'layout.' + page_url:
            try:
                for key, look in json.loads(v).items():
                    if key in {n.attrs.get('data-txt') for n in tree.elements}:
                        hand.append('layout %s %s — painted by <style id="se-look"> '
                                    'after the fetch, never by innerHTML. Carry it '
                                    'into the page\'s own CSS or markup by hand.'
                                    % (key, look))
            except ValueError:
                pass
        if k == 'sections.hidden.' + page_url:
            try:
                for sid in json.loads(v):
                    if any(n.attrs.get('id') == sid for n in tree.elements):
                        hand.append('sections.hidden #%s — set by style.display '
                                    'after the fetch. Hide it in the file by hand.'
                                    % sid)
            except ValueError:
                pass
    print('\nBY HAND  %d' % len(hand))
    for h in hand:
        print('  %s' % h)

    edits = splices + rm
    if not edits:
        print('\nnothing to write.')
        return
    if args.dry_run:
        print('\n--dry-run: nothing written.')
        return
    out = src
    for a, b, new, *_ in sorted(edits, key=lambda e: e[0], reverse=True):
        out = out[:a] + new + out[b:]
    path.write_text(out)
    print('\nwrote %s  (%d bytes -> %d)' % (rel, len(src), len(out)))


if __name__ == '__main__':
    main()
