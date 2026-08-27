/**
 * The search agent — turning a brief into catalogue facets.
 *
 * The old parser was a hand-written dictionary of about a hundred words. It
 * worked for "sad piano" and fell over on everything a real client actually
 * says. "Bar mitzvah entrance, big, celebratory" returned nothing at all,
 * because the dictionary knew "celebration" and not "celebratory". A brief
 * about an unsettling true-crime title sequence came back with EPIC FAST
 * DRUMS. The failure mode was never a missing feature — it was that a fixed
 * word list cannot cover the open set of things people say about music.
 *
 * So the understanding step moves to a model, and only the understanding step.
 * The model's single job is to map a sentence onto the vocabulary the
 * catalogue already uses; it never picks tracks, never invents a tag, and its
 * output is intersected against the real vocabulary before it is trusted.
 * Ranking stays where it was — deterministic, local, inspectable — because a
 * user who cannot see why a track was suggested has no way to correct it.
 *
 * If the model is unavailable, slow, or returns nonsense, this endpoint says
 * so and the browser falls back to the old dictionary. Degraded search beats
 * no search.
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/* Model choice is a latency decision as much as a quality one: this sits in
   front of a search box. The 70B fp8 "fast" build answers a prompt this small
   in about a second and reads situations ("hospital fundraiser", "sneaker
   drop") far better than the 8B, which is the whole reason for doing this. If
   it is ever unavailable the endpoint fails cleanly and the page falls back. */
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MAX_BRIEF = 1200;

/* Facets the model may return, and the shape each must take. Everything the
   model produces is checked against the vocabulary the page actually sent, so
   a hallucinated "Vaporwave" genre is dropped rather than silently producing
   zero results downstream. */
const LIST_FIELDS = ['moods', 'genres', 'instruments'];

const SYSTEM = `You are a music supervisor for a production-music catalogue.

You are given a brief from a film-maker, editor or brand, and the EXACT list of
tags this catalogue uses. Map the brief onto those tags.

Rules:
- Only ever return tags from the provided lists, copied character for character.
- Pick the 2-4 tags per list that a supervisor would actually reach for. Do not
  return every tag that is loosely related; precision matters more than recall.
- Infer mood from the situation, not just from adjectives. A hospital
  fundraising film wants something restrained and warm even if the brief never
  says "emotional". A sneaker drop wants confidence and a hard beat.
- Honour negations: "nothing cheesy", "no vocals", "shouldn't pull focus".
- bpm: a [min,max] range only when the brief implies tempo (slow, driving,
  "builds slowly", a named bpm). Otherwise null.
- vocal: "Instrumental" if the music must not sing (voiceover beds, podcasts,
  anything under dialogue), "Vocals" if a song with a singer is wanted, else null.
- keywords: 1-4 distinctive words from the brief worth matching against track
  titles - a theme, a place, a reference. Empty array if none.
- avoid: the tags that would be WRONG for this brief - moods and genres a
  supervisor would reject on hearing. This matters as much as the positive
  tags: a hospital fundraising film is not just calm, it is actively not
  aggressive and not tense. Be decisive, 2-5 moods.
- summary: one short sentence, under 18 words, saying what you are looking for.
  Write it to the user, in plain English. No preamble.

Return ONLY a JSON object, no markdown fence, with exactly these keys:
{"moods":[],"genres":[],"instruments":[],"bpm":null,"vocal":null,"keywords":[],
 "avoid":{"moods":[],"genres":[]},"summary":""}`;

function clampList(v, allowed, max = 5) {
  if (!Array.isArray(v)) return [];
  const ok = new Set(allowed);
  return [...new Set(v.filter((x) => typeof x === 'string' && ok.has(x)))].slice(0, max);
}

function clampBpm(v) {
  if (!Array.isArray(v) || v.length !== 2) return null;
  let [a, b] = v.map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a > b) [a, b] = [b, a];
  a = Math.max(0, Math.min(300, a));
  b = Math.max(0, Math.min(300, b));
  return b - a < 4 ? [a - 6, b + 6] : [a, b];
}

/** Models like to wrap JSON in prose or a fence however firmly you ask them not to. */
function extractJson(text) {
  if (!text) return null;
  const s = String(text);
  try { return JSON.parse(s); } catch { /* keep digging */ }
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch { /* keep digging */ } }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* give up */ } }
  return null;
}

export async function interpretBrief(req, env) {
  if (!env.AI) return json({ ok: false, reason: 'no_ai_binding' }, 503);

  const body = await req.json().catch(() => ({}));
  const brief = String(body.brief || '').trim().slice(0, MAX_BRIEF);
  if (brief.length < 3) return json({ ok: false, reason: 'empty' }, 400);

  // The page sends its own vocabulary, so this stays correct when the
  // catalogue is retagged without anyone remembering to update the Worker.
  const vocab = body.vocab || {};
  const allowed = {
    moods: Array.isArray(vocab.moods) ? vocab.moods.slice(0, 80) : [],
    genres: Array.isArray(vocab.genres) ? vocab.genres.slice(0, 80) : [],
    instruments: Array.isArray(vocab.instruments) ? vocab.instruments.slice(0, 80) : [],
  };
  if (!allowed.moods.length || !allowed.genres.length) {
    return json({ ok: false, reason: 'no_vocab' }, 400);
  }

  const user = `CATALOGUE TAGS
moods: ${allowed.moods.join(' | ')}
genres: ${allowed.genres.join(' | ')}
instruments: ${allowed.instruments.join(' | ')}

BRIEF
${brief}`;

  let out;
  try {
    // A short ceiling on both sides: this sits in front of a search box, and a
    // model that thinks for eight seconds is worse than the dictionary that
    // answers instantly.
    out = await Promise.race([
      env.AI.run(MODEL, {
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
        max_tokens: 320,
        temperature: 0.2,
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 9000)),
    ]);
  } catch (e) {
    return json({ ok: false, reason: 'ai_failed', detail: String(e && e.message || e).slice(0, 120) }, 502);
  }

  // Workers AI has moved this field around between model families, so take the
  // first string that looks like a reply rather than betting on one shape.
  const pick = (o) => {
    if (typeof o === 'string') return o;
    if (!o || typeof o !== 'object') return '';
    for (const k of ['response', 'result', 'output_text', 'text', 'content']) {
      if (typeof o[k] === 'string') return o[k];
      if (o[k] && typeof o[k] === 'object') { const s = pick(o[k]); if (s) return s; }
    }
    if (Array.isArray(o.choices) && o.choices[0]) return pick(o.choices[0].message || o.choices[0]);
    if (Array.isArray(o.output)) { for (const x of o.output) { const s = pick(x); if (s) return s; } }
    return '';
  };
  const raw = pick(out);
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== 'object') {
    return json({ ok: false, reason: 'unparseable',
                  raw: String(raw || JSON.stringify(out)).slice(0, 400) }, 502);
  }

  const want = {
    moods: clampList(parsed.moods, allowed.moods),
    genres: clampList(parsed.genres, allowed.genres),
    instruments: clampList(parsed.instruments, allowed.instruments),
    bpm: clampBpm(parsed.bpm),
    vocal: parsed.vocal === 'Vocals' || parsed.vocal === 'Instrumental' ? parsed.vocal : null,
    keywords: Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k) => typeof k === 'string' && k.length > 2 && k.length < 30)
          .map((k) => k.toLowerCase()).slice(0, 4)
      : [],
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 160) : '',
    // Negative evidence. Knowing a hospital film must not sound aggressive
    // removes far more wrong answers than knowing it should sound calm adds
    // right ones — most of the catalogue is calm-adjacent, very little of it
    // is calm AND not tense.
    avoid: {
      moods: clampList(parsed.avoid && parsed.avoid.moods, allowed.moods, 6)
        .filter((m) => !clampList(parsed.moods, allowed.moods).includes(m)),
      genres: clampList(parsed.avoid && parsed.avoid.genres, allowed.genres, 6)
        .filter((g) => !clampList(parsed.genres, allowed.genres).includes(g)),
    },
  };

  // A reply with nothing usable in it is a failure dressed as a success — the
  // caller should fall back rather than show an empty result set.
  if (!want.moods.length && !want.genres.length && !want.instruments.length
      && !want.bpm && !want.vocal && !want.keywords.length) {
    return json({ ok: false, reason: 'nothing_matched', summary: want.summary }, 200);
  }

  return json({ ok: true, want });
}
