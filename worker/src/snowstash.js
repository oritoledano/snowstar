/**
 * Snowstash — the royalty recovery desk.
 *
 * Everything runs inside this Worker, on the D1 and the HYP terminal that Mutra
 * and StreamDAW already pay for. A scan is a handful of outbound fetches to
 * three free, keyless APIs (MusicBrainz, Credits.fm, Deezer) — there is no
 * container to keep warm and no per-scan cost beyond a Worker request.
 *
 * The honesty rules the scanner is built around, learned the hard way:
 *
 *  1. Never guess which artist you are. The caller confirms a MusicBrainz id
 *     from a candidate list before anything is scanned.
 *  2. A guest appearance on somebody else's record is never counted against
 *     you. Findings are tiered claimable / attention / info, and only the
 *     first two touch the score.
 *  3. Order by what is actually being listened to, and say nothing about money.
 *     Deezer's rank is recency-weighted, not stream-proportional, so it can
 *     rank a new album track above a career hit — fine for "fix this first",
 *     useless for "you are owed $X".
 *
 * Money: the report is a one-off. A coupon is applied on the SERVER, and a code
 * that takes the price to zero is honoured as a free grant that skips HYP
 * entirely, because a card gateway refuses a zero authorisation.
 */
import { applyCoupon, couponProblem, normCode } from './coupons.js';
import { parseHyp, verifyReturn } from './hyp.js';
import { sendMail } from './mail.js';

const SITE = 'https://snowstar.company';
const BASE = 'https://pay.hyp.co.il/cgi-bin/yaadpay/yaadpay3ds.pl';
const PRICE_GROSS = 6900;          // agorot incl VAT — the full report
const MAX_ISRC_CHECKS = 20;        // per scan; own releases first
const UA = 'Snowstash/2.0 ( https://snowstar.company/snowstash.html )';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const now = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shortId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 10);
const hypConfigured = (env) => !!(env.HYP_TERMINAL && env.HYP_API_KEY && env.HYP_PASSP);

/* MusicBrainz rate-limits by IP and answers 503 when it does — and a Worker's
   egress IP is shared with every other Cloudflare customer, so throttling is
   routine rather than exceptional. Retry 429 AND 5xx with growing backoff, and
   distinguish "the lookup failed" from "there are no results": returning an
   empty list for a throttled request told people their artist did not exist. */
class LookupFailed extends Error {}

async function getJSON(url, { headers = {}, tries = 4, soft = false } = {}) {
  let lastStatus = 0;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': UA, ...headers } });
      if (r.status === 404) return null;                       // genuinely absent
      lastStatus = r.status;
      if (r.status === 429 || r.status >= 500) {
        if (i < tries - 1) { await sleep(700 * (i + 1) + Math.floor(Math.random() * 300)); continue; }
        break;
      }
      if (!r.ok) break;
      return await r.json();
    } catch {
      if (i === tries - 1) break;
      await sleep(500 * (i + 1));
    }
  }
  if (soft) return null;                                        // caller treats absence as a finding
  throw new LookupFailed(`lookup failed (${lastStatus || 'network'})`);
}

/* ── name matching ─────────────────────────────────────────────────────────
   "Matt Berninger" and "MATTHEW D. BERNINGER" are one person; "Phoebe
   Bridgers" and "Aaron Brooking Dessner" are not. Diacritics folded, initials
   and middle names tolerated. */
const normName = (s) => (s || '')
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function namesSimilar(a, b) {
  const ta = normName(a).split(' ').filter(Boolean);
  const tb = normName(b).split(' ').filter(Boolean);
  if (!ta.length || !tb.length) return false;
  const sa = new Set(ta), sb = new Set(tb);
  const subset = (x, y) => [...x].every((t) => y.has(t));
  if (subset(sa, sb) || subset(sb, sa)) return true;
  if (ta[ta.length - 1] === tb[tb.length - 1] && ta[0].length >= 3 && tb[0].length >= 3)
    return ta[0].startsWith(tb[0].slice(0, 3)) || tb[0].startsWith(ta[0].slice(0, 3));
  return false;
}

const normIpi = (v) => String(v == null ? '' : v).trim().replace(/^0+/, '');

/* ── MusicBrainz ─────────────────────────────────────────────────────────── */
const MB = 'https://musicbrainz.org/ws/2';

export async function mbSearchArtists(name, limit = 5) {
  const d = await getJSON(`${MB}/artist?query=${encodeURIComponent(name)}&limit=${limit}&fmt=json`);
  return (d?.artists || []).map((a) => ({
    mbid: a.id,
    name: a.name,
    disambiguation: a.disambiguation || '',
    country: a.country || '',
    type: a.type || '',
    score: a.score || 0,
    ipis: a.ipis || [],
    isnis: a.isnis || [],
  }));
}

async function mbArtist(mbid) {
  const a = await getJSON(`${MB}/artist/${mbid}?fmt=json`);
  return a && { mbid: a.id, name: a.name, disambiguation: a.disambiguation || '',
                country: a.country || '', ipis: a.ipis || [], isnis: a.isnis || [] };
}

/** Recordings with ISRCs, flagged primary (your own release) vs guest spot. */
async function mbRecordings(mbid, maxPages = 4) {
  const out = [];
  for (let page = 0; page < maxPages; page++) {
    const d = await getJSON(
      `${MB}/recording?artist=${mbid}&inc=isrcs+artist-credits&limit=100&offset=${page * 100}&fmt=json`);
    const batch = d?.recordings || [];
    for (const r of batch) {
      const credits = r['artist-credit'] || [];
      const firstId = credits[0]?.artist?.id || null;
      out.push({
        title: r.title,
        isrcs: r.isrcs || [],
        isPrimary: firstId === mbid,
      });
    }
    if (batch.length < 100 || (page + 1) * 100 >= (d?.['recording-count'] || 0)) break;
    await sleep(1100);                       // MusicBrainz: one request a second
  }
  return out;
}

/* ── Credits.fm ──────────────────────────────────────────────────────────
   Two quirks, both found the hard way: the search endpoint wants +-encoded
   spaces, and a non-lowercase query 30x-redirects to a broken internal
   localhost URL. Lowercase everything before sending. */
const CFM = 'https://credits.fm/api';

async function cfmIsrc(isrc) {
  return getJSON(`${CFM}/isrc/${encodeURIComponent(isrc)}`, { soft: true });
}

async function cfmSearch(q) {
  return getJSON(`${CFM}/search?q=${encodeURIComponent(q.toLowerCase()).replace(/%20/g, '+')}`, { soft: true });
}

/* ── Deezer: ordering only, never money ──────────────────────────────────── */
async function deezerRank(isrc) {
  const d = await getJSON(`https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`, { soft: true });
  return d && !d.error ? (d.rank || 0) : null;
}

/* ── classification ──────────────────────────────────────────────────────── */
const CLAIMABLE = 'claimable', ATTENTION = 'attention', INFO = 'info', OK = 'ok';
const ORDER = [OK, INFO, ATTENTION, CLAIMABLE];

function classify(data, { title, artistName, ipis, isPrimary }) {
  const reasons = [];
  if (!data) {
    return { tier: isPrimary ? ATTENTION : INFO, writerMatch: false, matchStatus: 'not_found', reasons: [] };
  }
  const songwriters = data.songwriters || [];
  let writerMatch = songwriters.some((sw) => namesSimilar(artistName, sw.name || ''));
  if (!writerMatch && ipis?.length) {
    const mine = new Set(ipis.map(normIpi));
    writerMatch = songwriters.some((sw) => mine.has(normIpi(sw.ipi || sw.ipiNumber)));
  }
  const yours = isPrimary || writerMatch;
  const status = data.matchStatus || 'unknown';
  let tier = OK;
  const bump = (t) => { if (ORDER.indexOf(t) > ORDER.indexOf(tier)) tier = t; };

  if (status === 'unmatched') {
    if (yours) { tier = CLAIMABLE; reasons.push('NOT MATCHED at the MLC — US mechanical royalties for this recording are likely being held. Claimable.'); }
    else { bump(INFO); reasons.push("Unmatched at the MLC, but you don't appear as a writer — someone else's claim."); }
  }
  if ((data.missing_fields || []).some((m) => String(m).toLowerCase() === 'iswc') && isPrimary) {
    bump(ATTENTION);
    reasons.push("No ISWC on file — the composition isn't linked to the recording, which blocks matching.");
  }
  if (!songwriters.length) {
    bump(isPrimary ? ATTENTION : INFO);
    reasons.push(isPrimary ? "No songwriters registered — publishing royalties can't route anywhere."
                           : 'No songwriters registered (guest appearance).');
  } else {
    for (const sw of songwriters) {
      const gaps = [];
      if (!sw.publishers || !sw.publishers.length) gaps.push('no publisher registered');
      if (sw.sharePercentage == null) gaps.push('no share percentage');
      if (!gaps.length) continue;
      if (namesSimilar(artistName, sw.name || '')) {
        bump(ATTENTION); reasons.push(`Your writer credit '${sw.name}' has ${gaps.join(' and ')}.`);
      } else {
        bump(INFO); reasons.push(`Co-writer '${sw.name}' has ${gaps.join(' and ')} (their problem, FYI).`);
      }
    }
  }
  return { tier, writerMatch, matchStatus: status, reasons };
}

/* Relative to this artist's own catalogue, so the label means the same thing
   for a bedroom producer and a stadium act. */
const PRI_LABEL = { high: 'Most played', medium: 'Steady plays', low: 'Quiet' };

function prioritise(items) {
  const ranked = items.filter((i) => i.rank);
  if (!ranked.length) return { ranked: 0, high: 0 };
  ranked.sort((a, b) => b.rank - a.rank);
  const n = ranked.length;
  ranked.forEach((item, i) => {
    const band = n < 3 ? (i === 0 ? 'high' : 'medium')
               : i < n / 3 ? 'high' : i < (2 * n) / 3 ? 'medium' : 'low';
    item.priority = band;
    item.priority_label = PRI_LABEL[band];
  });
  items.sort((a, b) => (b.rank || -1) - (a.rank || -1));
  return { ranked: n, high: ranked.filter((i) => i.priority === 'high').length };
}

/* ── the scan ────────────────────────────────────────────────────────────── */
export async function runScan(env, scanId, { mbid, artistName }) {
  try {
    const artist = (await mbArtist(mbid)) || { mbid, name: artistName, ipis: [], isnis: [], country: '' };
    await sleep(1100);
    const recordings = await mbRecordings(mbid);

    // primary wins when the same ISRC appears on both a release and a guest spot
    const map = new Map();
    for (const rec of recordings) {
      for (const isrc of rec.isrcs) {
        const prev = map.get(isrc);
        if (!prev || (rec.isPrimary && !prev.isPrimary)) map.set(isrc, { title: rec.title, isPrimary: rec.isPrimary });
      }
    }
    const primary = [...map.entries()].filter(([, v]) => v.isPrimary).map(([k]) => k).sort();
    const guest = [...map.entries()].filter(([, v]) => !v.isPrimary).map(([k]) => k).sort();
    const list = [...primary, ...guest].slice(0, MAX_ISRC_CHECKS);   // own releases first

    const tiers = { claimable: [], attention: [], info: [], ok: [] };
    for (const isrc of list) {
      const meta = map.get(isrc);
      const data = await cfmIsrc(isrc);
      const c = classify(data, { title: meta.title, artistName: artist.name, ipis: artist.ipis, isPrimary: meta.isPrimary });

      // Before alarming on a missing own-release, check whether the recording
      // exists under a different identifier — that is a mismatch to reconcile,
      // not a registration void.
      if (c.matchStatus === 'not_found') {
        if (meta.isPrimary) {
          const s = await cfmSearch(meta.title || '');
          const hit = (s?.isrcs || []).find((h) =>
            namesSimilar(h.recordingTitle || '', meta.title || '') ||
            normName(h.recordingTitle || '').includes(normName(meta.title || '')));
          c.reasons.push(hit
            ? `A recording with this title exists under ISRC ${hit.isrc} (credited to ${(hit.artistNames || []).join(', ') || 'another artist'}). If that's your release it's an identifier mismatch to reconcile, not a registration void.`
            : 'Not in the identifier databases we can check — may be a registration gap, may just be database coverage. Worth verifying.');
        } else {
          c.reasons.push("Guest appearance not found in the databases — the primary artist's issue, not yours.");
        }
      }

      tiers[c.tier].push({
        isrc,
        title: (data?.recordingTitle && data.recordingTitle !== 'Unknown') ? data.recordingTitle : meta.title,
        iswc: data?.iswc || null,
        is_primary: meta.isPrimary,
        writer_match: c.writerMatch,
        match_status: c.matchStatus,
        reasons: c.reasons,
        rank: null,
      });
      await sleep(350);
    }

    // ordering, on the findings that are the user's own problem
    let ranked = 0, high = 0;
    for (const key of [CLAIMABLE, ATTENTION]) {
      const own = tiers[key].filter((i) => i.is_primary);
      for (const i of own.slice(0, 12)) i.rank = await deezerRank(i.isrc);
      const p = prioritise(own);
      ranked += p.ranked; high += p.high;
      tiers[key] = [...own, ...tiers[key].filter((i) => !i.is_primary)];
    }

    const nClaim = tiers.claimable.length, nAtt = tiers.attention.length;
    const health = Math.max(0, Math.min(100, 100 - 12 * nClaim - Math.min(40, 4 * nAtt)));
    const result = {
      artist_name: artist.name,
      artist_country: artist.country || '',
      artist_ipis: artist.ipis || [],
      isrcs_checked: list.length,
      total_isrcs: map.size,
      primary_isrc_count: primary.length,
      guest_isrc_count: guest.length,
      health,
      health_status: nClaim ? 'Money on the table — you likely have claimable royalties'
                   : nAtt ? 'Fixable gaps — metadata issues on your own tracks'
                   : list.length ? 'Looking clean — checked recordings are properly matched'
                   : 'Nothing checked yet',
      sources: ['MusicBrainz', 'Credits.fm', 'Deezer'],
      priority_ranked: ranked,
      priority_high: high,
      claimable_count: nClaim,
      attention_count: nAtt,
      info_count: tiers.info.length,
      ok_count: tiers.ok.length,
      tiers,
    };

    await env.DB.prepare(
      `UPDATE snowstash_scans SET status='complete', result_json=?, health=?, claimable=?, attention=? WHERE id=?`
    ).bind(JSON.stringify(result), health, nClaim, nAtt, scanId).run();
  } catch (e) {
    await env.DB.prepare(`UPDATE snowstash_scans SET status='error', error=? WHERE id=?`)
      .bind(String(e && e.message || e).slice(0, 300), scanId).run().catch(() => {});
  }
}

/* ── routes ──────────────────────────────────────────────────────────────── */

/** POST /snowstash/artists — { q } → candidates. Public: the scan is the hook. */
export async function stashArtists(req, env) {
  const b = await req.json().catch(() => ({}));
  const q = String(b.q || '').trim();
  if (!q) return json({ error: 'empty' }, 400);
  try {
    return json({ candidates: await mbSearchArtists(q) });
  } catch {
    return json({ error: 'lookup_unavailable' }, 503);
  }
}

/** POST /snowstash/scan — { mbid, artist } → { scan_id }. Sign-in required, so
 *  every scan lands in an account and the funnel has somewhere to go. */
export async function stashScanStart(req, env, ctx, user) {
  if (!user) return json({ error: 'sign_in_required' }, 401);
  const b = await req.json().catch(() => ({}));
  const mbid = String(b.mbid || '').trim();
  const artistName = String(b.artist || '').trim().slice(0, 120);
  if (!/^[0-9a-f-]{36}$/i.test(mbid)) return json({ error: 'pick_an_artist' }, 400);

  const id = shortId();
  await env.DB.prepare(
    `INSERT INTO snowstash_scans (id, user_id, artist_name, mbid, kind, status, created_at)
     VALUES (?, ?, ?, ?, 'artist', 'running', ?)`
  ).bind(id, user.id, artistName || 'Unknown', mbid, now()).run();
  ctx.waitUntil(runScan(env, id, { mbid, artistName }));
  return json({ scan_id: id, status: 'running' });
}

/** Free preview vs unlocked report — the paywall lives here, on the server. */
function shape(result, unlocked) {
  const t = result.tiers || {};
  const trim = (arr, n) => (arr || []).slice(0, n).map((i) => ({
    title: i.title, isrc: i.isrc, iswc: i.iswc, is_primary: i.is_primary,
    reasons: unlocked ? i.reasons : (i.reasons || []).slice(0, 1),
    priority: i.priority, priority_label: i.priority_label,
  }));
  const n = unlocked ? 999 : 3;
  return {
    artist: result.artist_name,
    summary: {
      health_score: result.health, health_status: result.health_status,
      claimable: result.claimable_count, attention: result.attention_count,
      info: result.info_count, ok: result.ok_count,
      isrcs_checked: result.isrcs_checked, total_isrcs: result.total_isrcs,
      primary_isrcs: result.primary_isrc_count, guest_isrcs: result.guest_isrc_count,
      priority_ranked: result.priority_ranked, priority_high: result.priority_high,
      sources: result.sources, country: result.artist_country,
    },
    claimable: trim(t.claimable, n),
    attention: trim(t.attention, n),
    info: unlocked ? trim(t.info, 999) : [],
    unlocked,
    price: { agorot: PRICE_GROSS, label: `₪${(PRICE_GROSS / 100).toFixed(0)}` },
  };
}

/** GET /snowstash/scan?id= */
export async function stashScanGet(req, env, user) {
  const id = new URL(req.url).searchParams.get('id') || '';
  const row = await env.DB.prepare(`SELECT * FROM snowstash_scans WHERE id=?`).bind(id).first();
  if (!row) return json({ error: 'not_found' }, 404);
  if (row.status !== 'complete') return json({ status: row.status, error: row.error || null });
  const unlock = await env.DB.prepare(`SELECT 1 FROM snowstash_unlocks WHERE scan_id=?`).bind(id).first();
  const mine = user && row.user_id === user.id;
  return json({ status: 'complete', scan_id: id, mine: !!mine, ...shape(JSON.parse(row.result_json), !!unlock) });
}

/** GET /snowstash/mine — the dashboard list. */
export async function stashMine(env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.artist_name, s.kind, s.status, s.health, s.claimable, s.attention, s.created_at,
            (SELECT 1 FROM snowstash_unlocks u WHERE u.scan_id = s.id) AS unlocked
       FROM snowstash_scans s WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 50`
  ).bind(user.id).all();
  return json({ scans: results || [] });
}

/** GET /snowstash/admin — the dashboard view: every scan, every order. */
export async function stashAdmin(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const scans = await env.DB.prepare(
    `SELECT s.id, s.artist_name, s.status, s.health, s.claimable, s.attention, s.created_at,
            u.email AS email,
            (SELECT 1 FROM snowstash_unlocks x WHERE x.scan_id = s.id) AS unlocked
       FROM snowstash_scans s LEFT JOIN users u ON u.id = s.user_id
      ORDER BY s.created_at DESC LIMIT 200`).all();
  const orders = await env.DB.prepare(
    `SELECT ref, email, amount, status, coupon, created_at FROM snowstash_orders
      ORDER BY created_at DESC LIMIT 200`).all();
  return json({ scans: scans.results || [], orders: orders.results || [] });
}

/* ── coupons (own table; math reused from coupons.js) ────────────────────── */
const findCoupon = (env, code) => env.DB.prepare(
  `SELECT id, code, kind, value, min_amount, max_uses, used, expires_at, active
     FROM snowstash_coupons WHERE code = ?`).bind(normCode(code)).first().catch(() => null);

const burnCoupon = (env, code) =>
  env.DB.prepare('UPDATE snowstash_coupons SET used = used + 1 WHERE code = ?').bind(code).run().catch(() => null);

/** POST /snowstash/coupon/check — { code } → what it does to the price. */
export async function stashCouponCheck(req, env) {
  const b = await req.json().catch(() => ({}));
  const c = await findCoupon(env, b.code);
  const problem = couponProblem(c, PRICE_GROSS);
  if (problem) return json({ ok: false, reason: problem });
  const { amount, off } = applyCoupon(PRICE_GROSS, c);
  return json({
    ok: true, code: c.code, off, amount, free: amount <= 0,
    label: c.kind === 'percent' ? `${c.value}% off` : `₪${(c.value / 100).toFixed(0)} off`,
  });
}

/** POST /snowstash/coupon — owner creates / toggles / removes a code. */
export async function stashCouponCreate(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  if (b.list) {
    const { results } = await env.DB.prepare(
      `SELECT id, code, kind, value, max_uses, used, expires_at, active, note, created_at
         FROM snowstash_coupons ORDER BY created_at DESC`).all();
    return json({ coupons: results || [] });
  }
  if (b.remove) { await env.DB.prepare('DELETE FROM snowstash_coupons WHERE id = ?').bind(Number(b.remove)).run(); return json({ ok: true }); }
  if (b.toggle) { await env.DB.prepare('UPDATE snowstash_coupons SET active = 1 - active WHERE id = ?').bind(Number(b.toggle)).run(); return json({ ok: true }); }

  const kind = b.kind === 'amount' ? 'amount' : 'percent';
  let value = Math.round(Number(b.value));
  if (!Number.isFinite(value) || value <= 0) return json({ error: 'bad_value' }, 400);
  if (kind === 'percent' && value > 100) return json({ error: 'percent_over_100' }, 400);
  if (kind === 'amount') value = value * 100;

  const code = normCode(b.code) || ('STASH-' + shortId().toUpperCase().slice(0, 6));
  const exists = await env.DB.prepare('SELECT 1 FROM snowstash_coupons WHERE code = ?').bind(code).first().catch(() => null);
  if (exists) return json({ error: 'code_taken', code }, 409);
  await env.DB.prepare(
    `INSERT INTO snowstash_coupons (code, kind, value, min_amount, max_uses, used, expires_at, active, note, created_at)
     VALUES (?, ?, ?, 0, ?, 0, ?, 1, ?, ?)`
  ).bind(code, kind, value, Math.max(0, Math.round(Number(b.max_uses) || 0)),
         Number(b.expires_at) || null, String(b.note || '').slice(0, 200), now()).run();
  return json({ ok: true, code, kind, value });
}

/* ── checkout: coupon first, then free grant or HYP ──────────────────────── */
async function unlockScan(env, scanId, userId, source, ref) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO snowstash_unlocks (scan_id, user_id, source, ref, created_at) VALUES (?, ?, ?, ?, ?)`
  ).bind(scanId, userId || null, source, ref || null, now()).run();
}

/** POST /snowstash/checkout — { scan_id, coupon? } */
export async function stashCheckout(req, env, user) {
  if (!user) return json({ error: 'sign_in_required' }, 401);
  const b = await req.json().catch(() => ({}));
  const scanId = String(b.scan_id || '').trim();
  const scan = await env.DB.prepare(`SELECT id, user_id, artist_name, status FROM snowstash_scans WHERE id=?`).bind(scanId).first();
  if (!scan || scan.status !== 'complete') return json({ error: 'scan_not_ready' }, 404);

  const already = await env.DB.prepare(`SELECT 1 FROM snowstash_unlocks WHERE scan_id=?`).bind(scanId).first();
  if (already) return json({ ok: true, free: true, already: true, redirect: `${SITE}/snowstash.html?report=${scanId}` });

  const email = user.email;
  let amount = PRICE_GROSS, couponCode = null;
  if (b.coupon && String(b.coupon).trim()) {
    const c = await findCoupon(env, b.coupon);
    const problem = couponProblem(c, PRICE_GROSS);
    if (problem) return json({ error: 'coupon', reason: problem }, 400);
    ({ amount } = applyCoupon(PRICE_GROSS, c));
    couponCode = c.code;
  }

  const ref = 'ST-' + shortId().toUpperCase().slice(0, 8);

  // ── free (a coupon covered the whole price): unlock now, no HYP ──
  if (amount <= 0) {
    await env.DB.prepare(
      `INSERT INTO snowstash_orders (ref, user_id, email, scan_id, amount, status, coupon, created_at, settled_at)
       VALUES (?, ?, ?, ?, 0, 'granted', ?, ?, ?)`
    ).bind(ref, user.id, email, scanId, couponCode, now(), now()).run();
    await unlockScan(env, scanId, user.id, 'coupon', ref);
    if (couponCode) await burnCoupon(env, couponCode);
    return json({ ok: true, free: true, ref, redirect: `${SITE}/snowstash.html?report=${scanId}&free=1` });
  }

  if (!hypConfigured(env)) return json({ error: 'hyp_not_configured' }, 503);
  await env.DB.prepare(
    `INSERT INTO snowstash_orders (ref, user_id, email, scan_id, amount, status, coupon, created_at)
     VALUES (?, ?, ?, ?, ?, 'started', ?, ?)`
  ).bind(ref, user.id, email, scanId, amount, couponCode, now()).run();

  const shekels = (amount / 100).toFixed(2);
  const p = new URLSearchParams({
    action: 'APISign', What: 'SIGN',
    Masof: env.HYP_TERMINAL, KEY: env.HYP_API_KEY, PassP: env.HYP_PASSP,
    Amount: shekels, Coin: '1',
    Info: `Snowstash report — ${scan.artist_name}`.slice(0, 60), Order: ref,
    UTF8: 'True', UTF8out: 'True', signMe: '1', MoreData: 'True',
    PageLang: 'ENG', tmp: '1', ClientName: email, email,
    SendHesh: 'True', Postpone: 'False', J5: 'False',
  });
  const res = await fetch(`${BASE}?${p.toString()}`);
  const text = await res.text();
  if (/^\s*</.test(text)) return json({ error: 'hyp_system_error' }, 502);
  const d = parseHyp(text);
  if (!d.signature) return json({ error: 'hyp_sign_failed', ccode: d.CCode || null }, 502);
  return json({ ok: true, url: `${BASE}?${text.trim()}`, ref, amount_gross: amount });
}

/** The verified return (dispatched from hyp.js by the ST- prefix). */
export async function stashReturn(req, env, raw, q) {
  const ref = String(q.Order || '');
  const back = (qs) => Response.redirect(`${SITE}/snowstash.html?${qs}`, 302);
  const order = await env.DB.prepare(`SELECT * FROM snowstash_orders WHERE ref=?`).bind(ref).first();
  if (!order) return back('pay=failed&reason=unknown_ref');

  if (q.CCode !== '0') {
    await env.DB.prepare(`UPDATE snowstash_orders SET status='declined' WHERE ref=?`).bind(ref).run().catch(() => {});
    return back('pay=failed&reason=declined');
  }
  if (order.status === 'granted') return back(`report=${order.scan_id}`);

  const v = await verifyReturn(env, raw);
  if (!v.ok) {
    const paid = Math.round(parseFloat(String(q.Amount || '0')) * 100);
    const looksCharged = /^[0-9]{4,}$/.test(String(q.ACode || '')) && paid === order.amount;
    if (looksCharged) {
      await env.DB.prepare(`UPDATE snowstash_orders SET status='charged_unverified', hyp_id=? WHERE ref=?`)
        .bind(String(q.Id || ''), ref).run().catch(() => {});
      await sendMail(env, { to: env.ALERT_TO || 'oritoledano@gmail.com',
        subject: 'Snowstash: card charged but not verified',
        text: `Order ${ref}: HYP Id ${q.Id || ''}, auth ${q.ACode || ''}, ${q.Amount || ''} ILS.\nCharged but VERIFY did not confirm — report NOT unlocked automatically. Reconcile in HYP.` }).catch(() => {});
      return back(`pay=confirming&ref=${encodeURIComponent(ref)}`);
    }
    await env.DB.prepare(`UPDATE snowstash_orders SET status='verify_failed' WHERE ref=?`).bind(ref).run().catch(() => {});
    return back('pay=failed&reason=verify');
  }

  await env.DB.prepare(`UPDATE snowstash_orders SET status='granted', hyp_id=?, settled_at=? WHERE ref=?`)
    .bind(String(q.Id || ''), now(), ref).run();
  await unlockScan(env, order.scan_id, order.user_id, 'paid', ref);
  if (order.coupon) await burnCoupon(env, order.coupon);
  return back(`report=${order.scan_id}&bought=1`);
}
