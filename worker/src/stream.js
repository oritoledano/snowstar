/**
 * Clean playback.
 *
 * The catalogue plays the CLEAN master and downloads the WATERMARKED preview —
 * the opposite way round from where this started, and deliberately so. A
 * watermark on the player is a tax on the person deciding whether to buy: they
 * cannot hear what they would be getting, so they hear a worse track than the
 * one we are selling. The watermark belongs on the file that leaves the site,
 * because that is the file that can end up in someone's edit unlicensed.
 *
 * Which means the clean audio must be reachable by a browser but not by a
 * script pointed at the catalogue. Three things do that, and none of them
 * pretends to be unbreakable:
 *
 *   1. The master never has a public URL. It lives in the private bucket and is
 *      only ever streamed through here, so there is no link to copy.
 *   2. The request must look like a page playing audio — a same-origin fetch
 *      from our own document. curl and yt-dlp do not send that by default.
 *   3. Breadth is capped per IP. One person auditioning tracks is nowhere near
 *      the limit; something walking 359 slugs hits it in under a minute.
 *
 * A determined individual can still capture one track, exactly as they can at
 * any streaming service — they could also point a recorder at the speakers. The
 * threat worth engineering against is bulk enumeration of the catalogue, and
 * that is what the cap stops. Trying to beat the single-track case would cost
 * every honest listener their playback.
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const now = () => Math.floor(Date.now() / 1000);

/** Distinct tracks one IP may start in an hour before we stop serving masters.
 *  Sized off real listening: auditioning for a brief is tens of tracks, and a
 *  scraper wants all 359. Anyone over this is not choosing music. */
const BREADTH_LIMIT = 90;
const BREADTH_WINDOW = 3600;

/**
 * Does this look like our own page playing audio, rather than a script?
 *
 * Media elements do not send Origin, so Referer and the Sec-Fetch-* hints are
 * what there is. Both are trivially forgeable — the point is not that they
 * cannot be faked, it is that faking them is a deliberate act rather than the
 * default behaviour of every download tool.
 */
function looksLikePlayback(req) {
  const site = req.headers.get('sec-fetch-site');
  const dest = req.headers.get('sec-fetch-dest');
  // Chromium and Firefox both send these for <audio>. Safari sends neither, so
  // absence cannot fail the check — only a WRONG value can.
  if (site && site !== 'same-origin' && site !== 'same-site') return false;
  if (dest && dest !== 'audio' && dest !== 'empty' && dest !== 'video') return false;

  const ref = req.headers.get('referer') || '';
  if (!ref) return !!site;                      // Safari: allow, having passed above
  try {
    const h = new URL(ref).hostname;
    return h === 'snowstar.company' || h === 'www.snowstar.company' || h.endsWith('.pages.dev');
  } catch { return false; }
}

/** Rolling count of DISTINCT slugs per IP. Counting requests would punish
 *  seeking, which fires a fresh Range request for every scrub. */
async function breadthExceeded(env, ip, slug) {
  if (!ip) return false;
  const t = now();
  try {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO stream_breadth (ip, slug, ts) VALUES (?, ?, ?)'
    ).bind(ip, slug, t).run();
    const r = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM stream_breadth WHERE ip = ? AND ts > ?'
    ).bind(ip, t - BREADTH_WINDOW).first();
    return (r?.n || 0) > BREADTH_LIMIT;
  } catch {
    // The limiter must never be the reason music stops. If the table is missing
    // or D1 is having a moment, serve the audio.
    return false;
  }
}

/**
 * GET /stream?slug=…  — the clean master, with Range support.
 *
 * Range matters more than it looks: without a 206 the browser cannot seek, and
 * a three-minute track becomes un-scrubbable. R2 does the slicing, so we are
 * only translating headers.
 */
export async function handleStream(req, env) {
  const url = new URL(req.url);
  const slug = url.searchParams.get('slug') || '';
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return json({ error: 'invalid_slug' }, 400);

  if (!looksLikePlayback(req)) return json({ error: 'forbidden' }, 403);

  const row = await env.DB.prepare('SELECT audio_key FROM tracks WHERE slug = ?').bind(slug).first();
  if (!row || !row.audio_key) return json({ error: 'not_found' }, 404);

  const ip = req.headers.get('cf-connecting-ip') || '';
  if (await breadthExceeded(env, ip, slug)) {
    // Fall back to the watermarked preview rather than a wall of 429s. Someone
    // enumerating gets a catalogue of watermarked files, which is the correct
    // outcome, and a false positive still hears music.
    const pre = await env.MEDIA.get(row.audio_key);
    if (!pre) return json({ error: 'rate_limited' }, 429);
    return serve(req, pre, 'preview');
  }

  const rangeHeader = req.headers.get('range');
  const range = parseRange(rangeHeader);
  let obj = await env.MASTERS.get(row.audio_key, range ? { range } : undefined);
  let which = 'master';
  if (!obj) {                                  // not every track has a master yet
    obj = await env.MEDIA.get(row.audio_key, range ? { range } : undefined);
    which = 'preview';
  }
  if (!obj) return json({ error: 'missing_file' }, 404);
  return serve(req, obj, which, range);
}

/** "bytes=1024-" and "bytes=0-1023" are the only forms a media element sends. */
function parseRange(h) {
  if (!h) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim());
  if (!m) return null;
  const [, a, b] = m;
  if (a === '' && b === '') return null;
  if (a === '') return { suffix: Number(b) };
  return b === '' ? { offset: Number(a) } : { offset: Number(a), length: Number(b) - Number(a) + 1 };
}

function serve(req, obj, which, range) {
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('accept-ranges', 'bytes');
  // Never cached by a shared cache, and never written to disk as a file the
  // visitor can find. inline (not attachment) is what makes it play rather
  // than download.
  headers.set('cache-control', 'private, no-store');
  headers.set('content-disposition', 'inline');
  headers.set('x-mutra-audio', which);
  if (!headers.get('content-type')) headers.set('content-type', 'audio/mpeg');

  // R2 fills in obj.range even for a whole-object get, so the CLIENT's header
  // is what decides this — replying 206 to a request that carried no Range is
  // a spec violation, and Safari's media stack is the one that notices.
  if (range && obj.range && obj.size != null) {
    const start = obj.range.offset ?? (obj.size - (obj.range.suffix || 0));
    const len = obj.range.length ?? (obj.size - start);
    headers.set('content-range', `bytes ${start}-${start + len - 1}/${obj.size}`);
    headers.set('content-length', String(len));
    return new Response(obj.body, { status: 206, headers });
  }
  if (obj.size != null) headers.set('content-length', String(obj.size));
  return new Response(obj.body, { status: range ? 206 : 200, headers });
}
