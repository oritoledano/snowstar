/**
 * Artist intake — the machine work on a pile of new uploads.
 *
 * Two jobs a person should not be doing by hand when thirty tracks land at
 * once:
 *
 *   1. LYRICS. Whisper on the audio, through the Workers AI binding, so a
 *      vocal track arrives with its words already searchable instead of
 *      waiting for somebody to type them.
 *
 *   2. VERSIONS. Deciding which of thirty files are really one song — an edit,
 *      an instrumental, a playback, a long cut — and which are separate
 *      creations. This is done with arithmetic and titles rather than a model,
 *      on purpose: the rule is inspectable, it explains itself in the UI, and
 *      it cannot hallucinate a relationship between two tracks that share
 *      nothing. Where it is unsure it says so and the owner decides.
 */

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/* ── 1. lyrics ─────────────────────────────────────────────────────────────
   Whisper wants raw bytes. Submissions live in MEDIA under their file_key, so
   the audio never leaves Cloudflare — no third party, no upload step. */
export async function transcribeSubmission(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  if (!env.AI) return json({ error: 'no_ai_binding' }, 503);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!Number.isInteger(id)) return json({ error: 'bad_id' }, 400);

  const row = await env.DB.prepare('SELECT id, title, file_key, meta FROM submissions WHERE id = ?')
    .bind(id).first();
  if (!row || !row.file_key) return json({ error: 'not_found' }, 404);

  const obj = await env.MEDIA.get(row.file_key);
  if (!obj) return json({ error: 'file_missing' }, 404);
  const buf = await obj.arrayBuffer();
  /* Whisper's practical ceiling here is a few minutes of audio; a long master
     is truncated rather than refused, because the first minutes carry the
     verse and chorus that make lyrics searchable. */
  const MAX = 24 * 1024 * 1024;
  const bytes = [...new Uint8Array(buf.byteLength > MAX ? buf.slice(0, MAX) : buf)];

  let out;
  try {
    out = await env.AI.run('@cf/openai/whisper', { audio: bytes });
  } catch (e) {
    return json({ error: 'transcribe_failed', detail: String((e && e.message) || e).slice(0, 200) }, 502);
  }
  const text = String((out && out.text) || '').trim();
  const truncated = buf.byteLength > MAX;

  /* An instrumental transcribes to noise — a few stray words, or nothing.
     Below a real word count we report "no lyrics found" rather than saving
     hallucinated fragments onto a track. */
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const looksVocal = words >= 12;

  let meta = {};
  try { meta = row.meta ? JSON.parse(row.meta) : {}; } catch { meta = {}; }
  if (looksVocal) {
    meta.lyrics = text.slice(0, 8000);
    meta.lyrics_source = 'whisper';
    meta.lyrics_at = now();
    if (truncated) meta.lyrics_partial = true;
    await env.DB.prepare('UPDATE submissions SET meta = ? WHERE id = ?')
      .bind(JSON.stringify(meta).slice(0, 20000), id).run();
  }
  return json({ ok: true, words, saved: looksVocal, truncated,
                lyrics: looksVocal ? meta.lyrics : '', text: looksVocal ? '' : text.slice(0, 400) });
}

/* ── 2. versions of the same song ──────────────────────────────────────────
   What actually distinguishes a version from a different track:

     · the titles agree once the version words are stripped
       ("X", "X (Long Ver)", "X - INSTRUMENTAL", "X PLAYBACK" are one song)
     · or the titles are near-identical by edit distance (typos, spacing)

   Duration is deliberately NOT a requirement — an edit and its long cut differ
   by minutes — but a large BPM gap is treated as evidence against, because two
   tracks at 92 and 147 sharing a name are usually a coincidence of words. */

/* Parts of one creation — a stem is not a version. "GENTLE - BELLS" is not a
   different edit of GENTLE, it is one instrument out of it, and calling those
   versions of each other would publish nine half-tracks. */
const STEM_WORDS = [
  'bells', 'bell', 'gtr', 'gtrs', 'guitar', 'guitars', 'piano', 'keys', 'key', 'strings',
  'string', 'bass', 'drums', 'drum', 'perc', 'percussion', 'synth', 'synths', 'pad', 'pads',
  'vox', 'vocal', 'vocals', 'lead', 'rythm', 'rhythm', 'arp', 'fx', 'mando', 'mandolin',
  'brass', 'horns', 'flute', 'cello', 'violin', 'organ', 'rhodes', 'sub', 'kick', 'snare',
  'hats', 'hat', 'shaker', 'tops', 'claps', 'clap', 'swar', 'reversw', 'reverse', 'x',
];
const FULL_WORDS = ['full', 'mix', 'mixx', 'fullmix', 'master', 'main'];

const VERSION_WORDS = [
  'instrumental', 'inst', 'playback', 'pb', 'radio edit', 'radio', 'edit', 'short', 'shortened',
  'long', 'long ver', 'long version', 'full', 'extended', 'loop', 'sting', 'bed', 'underscore',
  'alt', 'alternate', 'alternative', 'version', 'ver', 'mix', 'remix', 'remaster', 'remastered',
  'no vocals', 'novox', 'no vox', 'vocal', 'vocals', 'acapella', 'a capella', 'stem', 'stems',
  'clean', 'dry', 'wet', 'demo', 'draft', 'rough', 'final', 'master', 'mastered', 'cut',
  'seconds', 'sec', 'secs', 'minute', 'min', 'aggressive', 'organic', 'tamed', 'original',
];

/** The song under the version: lowercase, no bracketed suffixes, no version
 *  words, no punctuation, no trailing numbers. */
export function songKey(title) {
  let t = String(title || '').toLowerCase();
  t = t.replace(/\.[a-z0-9]{2,4}$/, '');            // a stray file extension
  t = t.replace(/[\(\[\{][^\)\]\}]*[\)\]\}]/g, ' '); // (long ver), [instrumental]
  t = t.replace(/[-–—_|/]+/g, ' ');
  t = t.replace(/[^a-z0-9֐-׿ ]+/g, ' ');   // keep Hebrew
  let words = t.split(/\s+/).filter(Boolean);
  /* Dates in a filename are a session stamp, never part of the song:
     "GENTLE - 25.6.26 - BELLS" is GENTLE. Dropped anywhere in the string,
     because they sit in the middle as often as at the end. */
  words = words.filter((w, i) => !(/^\d{1,4}$/.test(w) && i > 0 && looksDateRun(words, i)));
  // strip version, stem and full-mix words from the END only: "take 2" is a
  // version, but "25 booms" is a title that starts with a number
  const isTail = (w) => VERSION_WORDS.includes(w) || STEM_WORDS.includes(w)
    || FULL_WORDS.includes(w) || /^\d{1,3}$/.test(w) || /^v\d+$/.test(w);
  while (words.length > 1 && isTail(words[words.length - 1])) words.pop();
  return words.join(' ').trim();
}

/** True when the number at i belongs to a run of 2–3 small numbers — a date
 *  like 25 6 26 once the dots became spaces. */
function looksDateRun(words, i) {
  let run = 0;
  for (let k = i; k < words.length && /^\d{1,4}$/.test(words[k]); k++) run++;
  for (let k = i - 1; k >= 0 && /^\d{1,4}$/.test(words[k]); k--) run++;
  return run >= 2;
}

/** Levenshtein, capped — only ever run on short titles. */
function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * GET /intake/versions?user_id=… — group a person's uploads into likely songs.
 * Returns groups of two or more, each with the reason it was grouped, so the
 * owner is agreeing with an argument rather than trusting a verdict.
 */
export async function suggestVersions(env, user, url) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const uid = String(url.searchParams.get('user_id') || '').trim();
  const status = String(url.searchParams.get('status') || '').trim();

  let q = `SELECT id, title, meta, status, published_slug FROM submissions`;
  const where = [], vals = [];
  if (uid) { where.push('user_id = ?'); vals.push(uid); }
  if (status) { where.push('status = ?'); vals.push(status); }
  if (where.length) q += ' WHERE ' + where.join(' AND ');
  q += ' ORDER BY id';
  const r = await env.DB.prepare(q).bind(...vals).all().catch(() => ({ results: [] }));
  const rows = (r.results || []).map((x) => {
    let m = {};
    try { m = x.meta ? JSON.parse(x.meta) : {}; } catch { m = {}; }
    return { id: x.id, title: x.title || '', status: x.status, slug: x.published_slug,
             bpm: Number(m.bpm) || null, dur: Number(m.duration) || null, key: songKey(x.title) };
  });

  // exact key first, then fold in near-identical keys
  const byKey = new Map();
  for (const t of rows) {
    if (!t.key) continue;
    if (!byKey.has(t.key)) byKey.set(t.key, []);
    byKey.get(t.key).push(t);
  }
  const keys = [...byKey.keys()];
  const merged = new Set();
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i], b = keys[j];
      if (merged.has(b) || a.length < 5 || b.length < 5) continue;
      const d = editDistance(a, b);
      /* Two ways one key belongs under another:
         · near-identical (typos, spacing)
         · one is a PREFIX of the other — "spliting between us" under
           "spliting between us olgal". A trailing name or take word we do not
           know is still a suffix on the same song, and refusing to merge it
           was leaving obvious pairs apart. Bounded to a short tail so
           "gentle" never swallows "gentle giant orchestra". */
      const short = a.length <= b.length ? a : b;
      const long = a.length <= b.length ? b : a;
      const isPrefix = long.startsWith(short + ' ') && short.length >= 8
        && long.slice(short.length + 1).split(' ').length <= 2;
      if (d <= Math.max(1, Math.floor(Math.min(a.length, b.length) * 0.12)) || isPrefix) {
        byKey.get(a).push(...byKey.get(b));
        merged.add(b);
      }
    }
  }
  for (const k of merged) byKey.delete(k);

  const groups = [];
  for (const [key, items] of byKey) {
    if (items.length < 2) continue;
    const bpms = items.map((t) => t.bpm).filter(Boolean);
    const spread = bpms.length > 1 ? Math.max(...bpms) - Math.min(...bpms) : 0;
    // wildly different tempos under one name is usually coincidence, not a mix
    /* Two different relationships, and they must not be confused:
       STEMS  — one full mix plus parts of it (bells, gtr, vox). Not sellable
                on their own; the full mix is the track.
       VERSIONS — edits of one finished song (instrumental, long, playback).
       The tail word of each title is what separates them. */
    const tailOf = (t) => {
      const w = String(t.title || '').toLowerCase()
        .replace(/[\(\)\[\]]/g, ' ').replace(/[-–—_|/.]+/g, ' ')
        .split(/\s+/).filter(Boolean);
      return w[w.length - 1] || '';
    };
    const stemish = items.filter((t) => STEM_WORDS.includes(tailOf(t)));
    const fullish = items.filter((t) => FULL_WORDS.includes(tailOf(t)));
    const kind = (stemish.length >= 2 && fullish.length >= 1) ? 'stems' : 'versions';

    const confidence = kind === 'stems'
      ? 'high'
      : (spread > 25 ? 'low' : (items.length > 5 ? 'medium' : 'high'));
    const why = kind === 'stems'
      ? [`one full mix plus ${stemish.length} instrument parts`]
      : [`titles reduce to “${key}”`];
    if (kind !== 'stems' && bpms.length > 1) {
      why.push(spread <= 4 ? 'same tempo' : `tempo spread ${spread} BPM`);
    }
    groups.push({
      key,
      kind,
      confidence,
      why: why.join(' · '),
      /* Stems hang off the full mix; versions hang off the longest cut. */
      parent: kind === 'stems'
        ? fullish[0]
        : items.slice().sort((a, b) => (b.dur || 0) - (a.dur || 0))[0],
      stems: kind === 'stems' ? stemish.map((t) => t.id) : [],
      items,
    });
  }
  groups.sort((a, b) => b.items.length - a.items.length);
  return json({ groups, scanned: rows.length });
}

/* ═══════════ Genres and moods ══════════════════════════════════════════════
   Every track published from a submission arrived with none. That was the
   honest default — a genre is a claim about the music, and the rule here is not
   to fill in what we are not sure about — but an untagged track is invisible to
   every filter on the catalogue, so "honest" quietly meant "unfindable".

   This is the middle path: the model proposes, from the catalogue's OWN
   vocabulary, using only what we actually know about the track, and the owner
   sees it before it is saved. Nothing is invented outside the list, because a
   tag the filter does not offer is a tag no buyer can search for — the exact
   failure that made 'Mandolin' and 'Keys' useless on Gal Lev's stems.

   Stems inherit rather than being classified. A stem of GENTLE is GENTLE: the
   same song, the same genre, the same mood. Asking a model to classify a lone
   bell track produces a confident answer about nothing.                        */

export const VOCAB = {
  genres: ['Electronic', 'Dance', 'Cinematic', 'House & Techno', 'Ambient', 'Rock',
    'Indie', 'Classical', 'Chill / Lo-Fi', 'Pop', 'Funk & Soul', 'World', 'Hip Hop',
    'SFX', 'Jazz & Blues', 'Folk & Acoustic', 'Trap', 'Latin', 'Metal', 'Holiday',
    'Retro 8-Bit'],
  moods: ['Reflective', 'Fun', 'Playful', 'Suspenseful', 'Hopeful', 'Tense',
    'Uplifting', 'Calm', 'Chill', 'Quirky', 'Happy', 'Romantic', 'Sad', 'Inspiring',
    'Angry', 'Scary'],
  characteristics: ['Building', 'Minimal', 'Dancey', 'Dark', 'Upbeat', 'Mellow',
    'Intense', 'Dynamic', 'Atmospheric', 'Chaotic', 'Droning', 'Cruising', 'Dreamy',
    'Retro', 'Beautiful', 'Rebellious', 'Aggressive', 'Soaring', 'Epic', 'Soulful',
    'Sophisticated', 'Childlike', 'Warm'],
  instruments: ['Drums', 'Synth', 'Bass', 'Percussion', 'Guitar', 'Ambient Tones',
    'Piano', 'Strings', 'Samples', 'Rhodes', 'Horns', 'Whistling', 'Choir',
    'Woodwinds', 'Accordion', 'Flute'],
};

const TAG_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const TAG_SYSTEM = `You tag production music for a licensing catalogue.

Choose ONLY from the lists you are given. Never invent a tag, never return one
that is not in the list character for character. If a list offers nothing that
fits, return fewer tags — an empty list is correct and useful, a wrong tag is
not, because a buyer filters by these and a mis-tag wastes their time.

Return between 1 and 3 genres, 1 and 3 moods, and 2 and 4 characteristics.
Reply with ONLY a JSON object: {"genres":[],"moods":[],"characteristics":[]}
No prose, no code fence, no explanation.`;

/** Everything we legitimately know about a track, as a prompt. */
function tagFacts(t) {
  const f = [];
  if (t.title) f.push(`Title: ${t.title}`);
  if (t.artist) f.push(`Artist: ${t.artist}`);
  if (t.bpm) f.push(`Tempo: ${t.bpm} BPM`);
  if (t.key) f.push(`Key: ${t.key}${t.scale ? ' ' + t.scale : ''}`);
  if (t.vocal) f.push(`${t.vocal === 'Vocals' ? 'Has sung vocals' : 'Instrumental — no vocals'}`);
  if (t.duration) f.push(`Length: ${Math.floor(t.duration / 60)}m${t.duration % 60}s`);
  if (t.instruments && t.instruments.length) f.push(`Instruments heard: ${t.instruments.join(', ')}`);
  if (t.tags && t.tags.length) f.push(`The artist's own words for it: ${t.tags.join(', ')}`);
  if (t.stems && t.stems.length) f.push(`Delivered with stems: ${t.stems.join(', ')}`);
  if (t.lyrics) f.push(`Lyrics:\n${String(t.lyrics).slice(0, 1400)}`);
  return f.join('\n');
}

const inVocab = (list, allowed, max) => {
  const ok = [];
  for (const v of Array.isArray(list) ? list : []) {
    const hit = allowed.find((a) => a.toLowerCase() === String(v).trim().toLowerCase());
    if (hit && !ok.includes(hit)) ok.push(hit);
  }
  return ok.slice(0, max);
};

/**
 * POST /intake/tags — { id } a submission, or { slug } a published track,
 * or { ids: [] } for a batch. Returns suggestions; saves nothing.
 *
 * Suggesting and saving are deliberately separate calls. These are guesses
 * about somebody's music, and the owner reading them before they go live is
 * the whole reason it is safe to guess at all.
 */
export async function suggestTags(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter(Boolean).slice(0, 40)
            : (b.id ? [Number(b.id)] : []);
  if (!ids.length && !b.slug) return json({ error: 'nothing_to_tag' }, 400);

  /* A submission carries the artist's own metadata; a published slug carries
     the catalogue's. Both end up in the same shape so the prompt does not care
     which door the track came through. */
  let rows = [];
  if (ids.length) {
    const qs = ids.map(() => '?').join(',');
    const r = await env.DB.prepare(
      `SELECT s.id, s.title, s.meta, s.published_slug, u.artist_name, u.name
         FROM submissions s LEFT JOIN users u ON u.id = s.user_id
        WHERE s.id IN (${qs})`).bind(...ids).all();
    rows = (r.results || []).map((x) => {
      let m = {};
      try { m = JSON.parse(x.meta || '{}') || {}; } catch { /* none */ }
      return { id: x.id, slug: x.published_slug, title: x.title,
               artist: x.artist_name || x.name || '', bpm: m.bpm, key: m.key,
               scale: m.scale, vocal: m.vocal, duration: m.duration,
               instruments: m.instruments || [], tags: m.tags || [], lyrics: m.lyrics || '' };
    });
  } else {
    const t = await env.DB.prepare('SELECT slug, title FROM tracks WHERE slug = ?')
      .bind(String(b.slug)).first();
    if (!t) return json({ error: 'not_found' }, 404);
    rows = [{ slug: t.slug, title: t.title }];
  }

  const out = [];
  for (const t of rows) {
    let res;
    try {
      res = await Promise.race([
        env.AI.run(TAG_MODEL, {
          messages: [
            { role: 'system', content: TAG_SYSTEM },
            { role: 'user', content:
              `Genres available: ${VOCAB.genres.join(' | ')}\n`
              + `Moods available: ${VOCAB.moods.join(' | ')}\n`
              + `Characteristics available: ${VOCAB.characteristics.join(' | ')}\n\n`
              + `The track:\n${tagFacts(t)}` },
          ],
          max_tokens: 200, temperature: 0.1,
        }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000)),
      ]);
    } catch (e) {
      out.push({ id: t.id, slug: t.slug, title: t.title, error: 'ai_failed' });
      continue;
    }
    // Workers AI moves this field around between model families.
    let text = '';
    const pick = (o) => {
      if (typeof o === 'string') return o;
      if (!o || typeof o !== 'object') return '';
      for (const k of ['response', 'result', 'output_text', 'text', 'content']) {
        if (typeof o[k] === 'string') return o[k];
        if (o[k] && typeof o[k] === 'object') { const s = pick(o[k]); if (s) return s; }
      }
      return '';
    };
    text = pick(res);
    let parsed = null;
    const m = text && text.match(/\{[\s\S]*\}/);
    if (m) { try { parsed = JSON.parse(m[0]); } catch { parsed = null; } }
    if (!parsed) {
      out.push({ id: t.id, slug: t.slug, title: t.title, error: 'unparsable' });
      continue;
    }
    out.push({
      id: t.id, slug: t.slug, title: t.title,
      genres: inVocab(parsed.genres, VOCAB.genres, 3),
      moods: inVocab(parsed.moods, VOCAB.moods, 3),
      characteristics: inVocab(parsed.characteristics, VOCAB.characteristics, 4),
    });
  }
  return json({ ok: true, suggestions: out, vocab: VOCAB });
}
