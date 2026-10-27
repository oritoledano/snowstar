/* StreamDAW sold as products (2026-10-27). One app, one installer; what a buyer owns is a list of
   products, and each Mac's key names that list (key format 4, streamdaw-keys.js). The split and its
   prices were decided by Ori on 2026-10-25 (STREAMDAW repo: wip/product-split-2026-10-25.md):

     Master   free (no key needed)
     Splits   $99 a year        Station  $119 a year      Record  $129 a year
     Compare  $49 once          Party    $79 a year       All     $199 a year

   Prices are US dollars including VAT, charged in shekels at the site's daily rate (fx.js), as Pro
   Monthly is. A year is one payment for 365 days (no card kept, nothing charged by itself); buying
   the same product again adds a year to what is left. Monthly prices are listed but not sold yet:
   they need HYP's token charges (streamdaw-subs.js), and checkout refuses them.

   Every key carries the account's WHOLE list, so a new key never takes away a product held before
   (the app refuses such a key: streamDAWProductsLost). Pro bought before the split ('lifetime',
   Pro Monthly, a pass) counts as every product, until it ends.

   Checkout sells products only while STREAMDAW_PRODUCTS_OPEN=1; until then it sells Pro as before.
   This module is pure apart from the rate, so the STREAMDAW repo's tests load it as is. */

import { cachedRates, FALLBACK } from './fx.js';

export const PAID = ['splits', 'station', 'record', 'compare', 'party'];     // in the app's order; master is free
export const NAMES = { splits: 'Splits', station: 'Station', record: 'Record', compare: 'Compare', party: 'Party', all: 'All products' };
export const CATALOG = {      // US cents, VAT included
  splits:  { year: 9900, month: 1200 },
  station: { year: 11900, month: 1499 },
  record:  { year: 12900, month: 1500 },
  compare: { once: 4900, month: 500 },
  party:   { year: 7900, month: 900 },
  all:     { year: 19900, month: 1999 },
};
export const PERIOD_WORDS = { year: 'one year', once: 'for good', month: 'a month' };
export const PRODUCTS_MIN_APP = '0.7.1';       // the first app that reads a key naming its products
const YEAR = 365 * 86400;
const LEGACY = new Set(['lifetime', 'monthly', 'pass', 'annual']);   // Pro before the split: every product

export const productsOpen = (env) => String((env && env.STREAMDAW_PRODUCTS_OPEN) || '') === '1';

/** 'splits:year' → { id: 'splits', period: 'year' }; anything else → null. */
export function parsePlan(plan) {
  const m = /^([a-z]+):(year|once|month)$/.exec(String(plan || ''));
  return m && CATALOG[m[1]] && CATALOG[m[1]][m[2]] ? { id: m[1], period: m[2] } : null;
}
export const isProductPlan = (plan) => !!parsePlan(plan);

/** The shekel price (agorot) of one product for one period, today. */
export async function priceOf(env, id, period) {
  const usdCents = CATALOG[id] && CATALOG[id][period];
  if (!usdCents) return null;
  const r = await cachedRates(env).catch(() => null);
  let usd = Number(r && r.rates && r.rates.USD);
  if (!(usd > 0.2 && usd < 0.5)) usd = FALLBACK.USD;     // a broken feed, not the market
  return { amount: Math.round(usdCents / usd), usdCents, rate: usd };
}

/** What a set of entitlement rows ({plan, expires_at}) holds at `nowSec`: id → end in seconds
 *  (0 = for good). For good beats any end; of two ends, the later. */
export function holdings(rows, nowSec) {
  const out = {};
  for (const r of rows || []) {
    const end = r.expires_at ? Number(r.expires_at) : 0;
    if (end && end <= nowSec) continue;
    const p = parsePlan(r.plan);
    const ids = LEGACY.has(r.plan) || (p && p.id === 'all') ? PAID : p ? [p.id] : [];
    for (const id of ids) {
      if (!(id in out)) out[id] = end;
      else if (out[id] !== 0 && (end === 0 || end > out[id])) out[id] = end;
    }
  }
  return out;
}

/** The key an account's rows call for: null when only Pro from before the split is held (the key
 *  is made as before, format 2 or 3), { none: true } when nothing is held now, else the format-4
 *  list: "all" when every product is for good, otherwise "splits,compare@<hex ms>" in the app's order. */
export function keyList(rows, nowSec) {
  const live = (rows || []).filter((r) => !(r.expires_at && Number(r.expires_at) <= nowSec));
  if (!live.some((r) => isProductPlan(r.plan))) return live.length ? null : { none: true };
  const h = holdings(live, nowSec);
  if (PAID.every((id) => h[id] === 0)) return null;           // everything for good: a plain Pro key, which every app reads
  const list = PAID.filter((id) => id in h).map((id) => (h[id] ? `${id}@${(h[id] * 1000).toString(16)}` : id));
  return list.length ? { products: list.join(',') } : { none: true };
}

/** When a new purchase of `plan` ends (seconds), or null for good: a year from now, or from the
 *  end of what the account still holds of it (a renewal never loses the days left). */
export function endFor(plan, rows, nowSec) {
  const p = parsePlan(plan);
  if (!p || p.period === 'once') return null;
  const h = holdings(rows, nowSec);
  const ids = p.id === 'all' ? PAID : [p.id];
  const from = Math.max(nowSec, ...ids.map((id) => (h[id] > 0 ? h[id] : 0)));
  return from + (p.period === 'month' ? 31 * 86400 : YEAR);
}

/** Why `plan` cannot be bought by an account holding `rows`, or '' when it can. */
export function cannotBuy(plan, rows, nowSec) {
  const p = parsePlan(plan);
  if (!p) return 'There is no such product.';
  const h = holdings(rows, nowSec);
  const ids = p.id === 'all' ? PAID : [p.id];
  if (ids.every((id) => h[id] === 0)) return `You already have ${p.id === 'all' ? 'every product' : NAMES[p.id]} for good.`;
  return '';
}

/** A list in words, for receipts and key emails: "Splits until 2027-10-27, Compare for good". */
export function describe(list) {
  if (!list || list === 'all') return 'every product, for good';
  return list.split(',').map((e) => {
    const [id, hex] = e.split('@');
    return `${NAMES[id] || id} ${hex ? `until ${new Date(parseInt(hex, 16)).toISOString().slice(0, 10)}` : 'for good'}`;
  }).join(', ');
}

/** One order line: "StreamDAW Splits, one year". */
export function itemName(plan) {
  const p = parsePlan(plan);
  return p ? `StreamDAW ${NAMES[p.id]}, ${PERIOD_WORDS[p.period]}` : 'StreamDAW Pro';
}

/** What the sale pages and the app show: each product's price today, and whether checkout sells it. */
export async function catalogFor(env) {
  const out = { open: productsOpen(env), monthlyOpen: false, products: {} };
  for (const id of Object.keys(CATALOG)) {
    out.products[id] = { name: NAMES[id] };
    for (const period of Object.keys(CATALOG[id])) {
      const pr = await priceOf(env, id, period);
      out.products[id][period] = { usdCents: pr.usdCents, amount: pr.amount };
    }
  }
  return out;
}
