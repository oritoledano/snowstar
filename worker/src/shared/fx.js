/** Exchange rates, so the catalogue can be priced in dollars.
 *
 * ── What this does NOT change ───────────────────────────────────────────────
 *
 * The shekel stays the unit of account. pricing.js computes in shekels, the
 * licence row stores shekels, Green Invoice issues in shekels, and HYP charges
 * in shekels — hyp.js sends Coin:'1' and its VERIFY step rejects a reply in any
 * other currency outright. Nothing here touches any of that.
 *
 * What it changes is what a buyer READS. A Tel Aviv price list is a closed door
 * to somebody in Chicago, and the fix for that is presentation, not settlement:
 * the figure on the card page is still the shekel figure, and every screen that
 * commits somebody to paying says so in as many words.
 *
 * Moving settlement itself to dollars is a different job and not a code one —
 * HYP documents Coin=2 for USD and Coin=3 for EUR, but whether THIS terminal is
 * enabled for them is a question for HYP, and charging a non-Israeli buyer 18%
 * Israeli VAT is a question for an accountant. Both are decisions to take
 * before anybody writes that, and neither is assumed here.
 */

const now = () => Math.floor(Date.now() / 1000);

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

/* Only what is actually offered. A rate table of 160 currencies would be a
   bigger payload than the catalogue page it is decorating. */
export const CURRENCIES = ['ILS', 'USD', 'EUR'];

/* The floor under everything. If the rate service is down, if the table is
   empty on a cold start, if the fetch is still in flight on a first visit —
   prices still render, and they render close enough that nobody is misled.
   Updated whenever it is noticed to have drifted; the live rate wins the
   moment there is one. */
export const FALLBACK = { ILS: 1, USD: 0.3252, EUR: 0.2884 };
const FALLBACK_AT = 1790900000;   // when the figures above were last looked at

const KEY = 'fx:rates';
/* A day, plus slack. The daily cron is what normally refreshes this; the
   staleness check exists for the case where the cron has not run since a
   deploy, not as the mechanism. */
const STALE_AFTER = 36 * 3600;

/** Read what we have. Never throws, never fetches — a page render must not wait
 *  on a third party, and a missing table must not be an error. */
export async function cachedRates(env) {
  try {
    const row = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind(KEY).first();
    if (row && row.v) {
      const d = JSON.parse(row.v);
      if (d && d.rates && d.rates.USD) return d;
    }
  } catch { /* fall through to the baked table */ }
  return { base: 'ILS', ts: FALLBACK_AT, rates: { ...FALLBACK }, source: 'fallback' };
}

/**
 * Pull today's rates. Called from the daily cron.
 *
 * open.er-api.com needs no key and no account, which is the whole reason it is
 * here: a rate feed that needs a secret is a rate feed that breaks the day the
 * secret rotates and nobody remembers this file exists.
 */
export async function refreshRates(env, force = false) {
  try {
    if (!force) {
      const have = await cachedRates(env);
      if (have.source !== 'fallback' && now() - (have.ts || 0) < STALE_AFTER) return have;
    }
    const r = await fetch('https://open.er-api.com/v6/latest/ILS', {
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!r.ok) return cachedRates(env);
    const d = await r.json();
    if (!d || d.result !== 'success' || !d.rates) return cachedRates(env);

    const rates = { ILS: 1 };
    for (const c of CURRENCIES) {
      const v = Number(d.rates[c]);
      // A rate that is zero, negative or absurd would silently reprice the
      // whole catalogue, so it is simply not accepted.
      if (c !== 'ILS' && Number.isFinite(v) && v > 0.0001 && v < 1000) rates[c] = v;
    }
    if (!rates.USD) return cachedRates(env);

    const out = { base: 'ILS', ts: now(), rates, source: 'open.er-api.com' };
    await env.DB.prepare(
      'INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v'
    ).bind(KEY, JSON.stringify(out)).run();
    return out;
  } catch {
    return cachedRates(env);
  }
}

/** GET /api/fx — read by every page that shows a price. */
export async function fxEndpoint(req, env, ctx) {
  const d = await cachedRates(env);
  /* Refresh behind the response rather than in front of it. A visitor waiting
     on a currency API to load a track list is the tail wagging the dog. */
  if (ctx && now() - (d.ts || 0) > STALE_AFTER) ctx.waitUntil(refreshRates(env).catch(() => null));
  return json({ ...d, currencies: CURRENCIES }, 200, {
    // Rates move slowly; prices must not flicker between two tabs opened a
    // minute apart. An hour at the edge, a day in the browser.
    'cache-control': 'public, max-age=86400, s-maxage=3600',
  });
}
