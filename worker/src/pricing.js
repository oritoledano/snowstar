/**
 * What a licence costs.
 *
 * This file is the single authority. The browser computes the same numbers to
 * show a price before you click, but nothing it sends is trusted — the server
 * re-derives every figure from (buyer band × coverage × term) and the track's
 * own overrides. The amount is the one field worth forging.
 *
 * ── The change this file represents ──────────────────────────────────────────
 *
 * Mutra used to price on ONE axis: where the music runs. Seven tiers, digital
 * through TV commercial. That axis is real but it is not where the money is.
 *
 * Musicbed prices on a different axis first — WHO is buying, and whose name is
 * on the finished video — and only then asks where it runs. Observed on their
 * live funnel: the same track, same distribution, same everything, is $69 to a
 * wedding filmmaker and $349 when a brand's name is on it. A 5x spread on a
 * question Mutra never asked.
 *
 * So the seven where-it-runs tiers collapse into two COVERAGE bands, and the
 * price differentiation moves onto six BUYER bands. Under the old scheme a
 * 400-person insurer and a two-person studio both paid ILS 630 for a corporate
 * video. Now they don't.
 *
 * ── What is deliberately NOT copied ─────────────────────────────────────────
 *
 * Musicbed's licences are perpetual: "they never expire — even if the
 * subscription is not renewed". Mutra's term is HARD, and the renewal is the
 * business. Importing their perpetuity would have deleted the revenue model in
 * one sentence, so the term survives the funnel copy untouched.
 *
 * Subscriptions are not built. Every branch here ends in a per-track price.
 */

/* Buyer bands. The number is the TWELVE-month price for Standard coverage, in
   shekels, ex-VAT — the base term moved from six months to twelve so the
   headline figure is an annual one, the way buyers think about it. */
export const BUYERS = {
  'individual-own': {
    label: 'Individual — my own channel or work',
    short: 'My own work',
    base: 180,
    note: 'The video is yours. No client’s name on it, no client paying for it.',
  },
  'wedding': {
    // Weddings are one occasion among several here — bar and bat mitzvahs,
    // brit milah, birthdays, sweet sixteens are the same job, the same buyer
    // and the same budget, and a wedding-only label sends them to the wrong
    // band or out of the funnel entirely.
    label: 'Ceremony filmmaker — families only',
    short: 'Ceremony films',
    base: 250,
    note: 'Weddings, bar and bat mitzvahs, brit milah, birthdays, sweet sixteens.',
  },
  'individual-client': {
    label: 'Individual — client work',
    short: 'Client work',
    base: 450,
    note: 'Someone else commissioned it, or someone else’s brand appears in it.',
  },
  'business-small': {
    label: 'Business — end client up to 100 staff',
    short: 'Business · 0–100',
    base: 650,
    note: 'The company whose name appears in the video.',
  },
  'business-mid': {
    label: 'Business — end client 101–250 staff',
    short: 'Business · 101–250',
    base: 1200,
    note: 'The company whose name appears in the video.',
  },
  'business-large': {
    label: 'Business — end client over 250 staff',
    short: 'Business · 250+',
    base: null,            // quote: above this size the deal is negotiated
    note: 'Priced per campaign.',
  },
};

/**
 * PRICE CLASS — the second axis, after the buyer band.
 *
 * The band asks who is buying. The class asks what the track is worth. A
 * signature vocal cut and a fifteen-second logo sting are not the same asset
 * and should never have carried the same price, but until now the only way to
 * say so was to hand-edit six band prices per track across 374 tracks.
 *
 * C is the catalogue as it stands — every existing price is a C price and
 * nothing moves when this ships. B and A multiply the WHOLE ladder: every band,
 * every term, together, so the relationships that were solved once stay solved.
 *
 * A also flips the track to the quote lane by default. That is the point of an
 * A rather than just a bigger number: the tracks worth the most are the ones
 * where the deal has terms in it, and a self-serve card payment is the wrong
 * shape for them.
 *
 * The multipliers live in `meta` so they can be tuned from the dashboard as
 * percentages without a deploy. These are only the fallbacks.
 */
export const CLASSES = {
  A: { label: 'A', mult: 3.2, note: 'Signature tracks. The top of the ladder.' },
  B: { label: 'B', mult: 1.8, note: 'Strong catalogue. Between A and the baseline.' },
  C: { label: 'C', mult: 1.0, note: 'The baseline — every price in the catalogue today is a C price.' },
  // Half the baseline. Lands on ILS 49 for a creator's own six-month use and
  // ILS 179 for a small business's — both round exactly, which is why 50% is
  // the number rather than something near it.
  D: { label: 'D', mult: 0.5, note: 'Entry. Beds, stings, short cues — volume rather than margin.' },
};

/**
 * CLASS AND LANE ARE DIFFERENT AXES, and conflating them was a mistake worth
 * naming here so it does not come back.
 *
 * The class is a PRICE decision: what is this track worth. All three classes
 * are self-serve — an expensive track is still a track somebody can buy with a
 * card, and making A quote-only put a wall in front of the highest-margin
 * sales for no reason.
 *
 * The lane is a RIGHTS decision: may we sell this at all without asking
 * somebody first. It comes from the signed declaration — a named controller, a
 * co-owner whose approval is required — and where it does, it is LOCKED: an
 * owner cannot click past a legal fact. Where no declaration forces it, the
 * lane is a free toggle, because plenty of tracks are quote-worthy for
 * commercial reasons that have nothing to do with rights.
 */
export function laneLocked(track) {
  if (!track) return false;
  const d = track.decl || {};
  const controllers = Array.isArray(d.controllers) ? d.controllers : [];
  return !!(controllers.length || d.approval === 'all' || d.shared_rights);
}

/** The multiplier a track actually prices at, and what to call it.
 *  A per-track percentage overrides the class outright — the letter is a
 *  preset, not a cage. When the number matches no preset it is "custom", shown
 *  as a mark rather than a letter so a glance down the list still reads. */
export function gradeOf(track, classes) {
  const CL = classes || CLASSES;
  const pct = Number(track && track.pct);
  if (Number.isFinite(pct) && pct > 0) {
    const hit = Object.entries(CL).find(([, c]) => Math.abs(c.mult * 100 - pct) < 0.5);
    return hit
      ? { letter: hit[0], mult: hit[1].mult, custom: false }
      : { letter: '◈', mult: pct / 100, custom: true, pct };
  }
  const c = String((track && track.cls) || 'C').toUpperCase();
  const cfg = CL[c] || CL.C;
  return { letter: CL[c] ? c : 'C', mult: cfg.mult, custom: false };
}

export const isClass = (c) => Object.prototype.hasOwnProperty.call(CLASSES, String(c || '').toUpperCase());

/** Reads the tuned multipliers, falling back to the defaults above. Called on
 *  every price, so it is cached per request rather than per call. */
export async function loadClasses(env) {
  const out = JSON.parse(JSON.stringify(CLASSES));
  try {
    const r = await env.DB.prepare("SELECT v FROM meta WHERE k = 'pricing:classes'").first();
    if (r && r.v) {
      const tuned = JSON.parse(r.v);
      for (const k of Object.keys(out)) {
        if (Number.isFinite(tuned[k]?.mult) && tuned[k].mult > 0) out[k].mult = tuned[k].mult;
      }
    }
  } catch { /* a corrupt setting must never take the catalogue offline */ }
  return out;
}

/* Coverage. Standard is self-serve; Extended is always quoted, because
   broadcast and cinema deals turn on territory, flight dates and media weight
   that no form can capture. The floors are published anyway — a blank price on
   a ILS 2,200 licence loses the buyer to someone who showed a number. */
export const COVERAGE = {
  standard: {
    label: 'Standard',
    blurb: 'Web, social, podcast, internal and industrial video.',
    quote: false,
  },
  extended: {
    label: 'Extended',
    blurb: 'TV, cinema, VOD and OTT, film festivals, radio, commercials.',
    quote: true,
    floors: {
      broadcast: 1600,   // TV show, VOD, OTT, CTV
      cinema: 2200,      // feature, short, documentary, festival
      radio: 2200,       // radio and streaming audio
      tvc: null,         // TV commercial — always bespoke
    },
  },
};

/* Term, rebased so twelve months is 1.0. The RATIOS are unchanged from the
   ladder that was solved for a constant ~80% prepay break-even; only the
   reference point moved. Recomputing them would have quietly re-opened a
   decision that was already made. */
export const TERMS = [
  { id: '6m',   label: '6 months',    months: 6,    mult: 0.55, note: '' },
  { id: '12m',  label: '12 months',   months: 12,   mult: 1.00, note: '' },
  { id: '24m',  label: '24 months',   months: 24,   mult: 1.65, note: 'save 25%' },
  { id: '36m',  label: '36 months',   months: 36,   mult: 2.15, note: 'save 35%' },
  // No end date is ORGANIC ONLY. A licence with no expiry and no cap on paid
  // media is an unlimited advertising buy sold once, at a price set for a
  // website and a social page. The two things cannot travel together, so the
  // rung carries the restriction rather than the price trying to cover it.
  { id: 'perp', label: 'No end date', months: null, mult: 4.40,
    note: 'organic only', noPaid: true },
  { id: 'excl', label: 'Exclusive rights', months: null, mult: null, note: 'by arrangement' },
];

export const termById = (id) => TERMS.find((t) => t.id === id) || TERMS[1];

/**
 * Nearest ten minus one. ILS 149 was a chosen figure; ILS 297.30 is not.
 *
 * Below ILS 20 the rule is switched off and the figure passes through to the
 * agora. Rounding to "nearest ten minus one" turns anything under ILS 5 into
 * ILS 0 — round(0.1/10)*10-1 is -1, clamped to zero — so a deliberately cheap
 * track, or a test charge, would have been silently given away for nothing.
 * The shape only matters at prices a buyer reads as a price.
 */
export const pricePoint = (n) =>
  n < 20 ? Math.max(0, Math.round(n * 100) / 100)
         : Math.max(0, Math.round(n / 10) * 10 - 1);

/* The old per-tier defaults, kept ONLY to read forward the price overrides
   that already exist on individual tracks. A track edited to ILS 199 when the
   catalogue said 149 was marked up 1.34x by hand, and that intent should
   survive the restructure rather than being silently flattened. */
const LEGACY_DEFAULT_DIGITAL = 149;

/**
 * A track's own multiplier against the catalogue, or 1 if it has none.
 * Reads the legacy `prices.digital` / `fee` overrides, since those are what
 * exists today. New per-track overrides use `prices.band.<buyer>`.
 */
export function trackFactor(track) {
  if (!track) return 1;
  const p = track.prices || {};
  const legacy = Number.isFinite(p.digital) ? p.digital
               : Number.isFinite(track.fee) ? track.fee
               : null;
  if (legacy == null || legacy <= 0) return 1;
  const f = legacy / LEGACY_DEFAULT_DIGITAL;
  // Bound it. A fat-fingered ILS 14900 override should not become a ILS 65,000
  // business licence without anyone looking at it.
  return Math.min(Math.max(f, 0.2), 8);
}

/**
 * THE function. Returns { amount, quote, reason } where amount is in whole
 * shekels ex-VAT, or quote:true when there is no self-serve price.
 *
 * quote wins in four separate cases, and they are different things:
 *   - the track is co-owned, so someone else has a say         (lane)
 *   - the buyer is above the self-serve size                   (band)
 *   - the use is broadcast/cinema/radio                        (coverage)
 *   - the buyer wants exclusivity                              (term)
 */
export function priceFor(track, buyerId, coverageId, termId, paidMedia, classes) {
  const buyer = BUYERS[buyerId];
  const cov = COVERAGE[coverageId];
  const term = termById(termId);

  const grade = gradeOf(track, classes);

  if (!buyer || !cov) return { amount: null, quote: true, reason: 'unknown_selection' };
  // The LANE is the only thing that makes a track quote-only. The class never
  // does — every class is self-serve, however dear.
  if (track && track.lane === 'quote') return { amount: null, quote: true, reason: 'co_owned' };
  if (cov.quote) return { amount: null, quote: true, reason: 'extended_coverage' };
  if (buyer.base == null) return { amount: null, quote: true, reason: 'large_client' };
  if (term.mult == null) return { amount: null, quote: true, reason: 'exclusive' };
  // Paid media and a perpetual term are mutually exclusive, and the funnel
  // should not be able to produce the pair even by a crafted request.
  if (term.noPaid && paidMedia) return { amount: null, quote: true, reason: 'perp_no_paid' };

  /* A perpetual licence is only ever self-serve on the cheap classes.
   *
   * Selling "no end date" on an A or a B means signing away, for a card
   * payment, the one thing that could turn out to be worth a major buyout
   * later — and it is precisely the good tracks where that happens. The
   * cheaper the track, the less there is to lose and the more sense it makes
   * to take the money now; so C and D can be bought outright and A and B get
   * a conversation. This is a rights decision, not a pricing one, which is
   * why it sits here rather than in a multiplier. */
  if (term.noPaid && (grade.letter === 'A' || grade.letter === 'B')) {
    return { amount: null, quote: true, reason: 'perp_high_class', grade: grade.letter };
  }

  // A per-band override on the track wins outright — that is the owner saying
  // "this one is worth more to a business" and it must not be second-guessed
  // by the legacy digital-price factor.
  const over = track && track.prices && track.prices[buyerId];
  const base = Number.isFinite(over) && over > 0 ? over : buyer.base * trackFactor(track);
  // The class multiplies the whole ladder — every band, every term, together —
  // so the relationships solved once stay solved.
  return { amount: pricePoint(base * grade.mult * term.mult), quote: false, reason: null,
           grade: grade.letter };
}

/** Valid ids, for request validation. */
export const isBuyer = (id) => Object.prototype.hasOwnProperty.call(BUYERS, id);
export const isCoverage = (id) => Object.prototype.hasOwnProperty.call(COVERAGE, id);
export const isTerm = (id) => TERMS.some((t) => t.id === id);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/** GET /pricing/classes — the tuned multipliers, plus what they produce. */
export async function getClasses(env, user) {
  const classes = await loadClasses(env);
  /* The multipliers are public on purpose: the funnel prices with them in the
     browser, so hiding them guaranteed that a tuned class showed one price and
     charged another. A multiplier is not a secret — every displayed price
     already reveals it. The shekel preview and band bases stay owner-only. */
  if (!user || !user.admin) return json({ classes });
  // Show the owner the actual shekels, not just the ratio. A multiplier is not
  // a price and "1.8x" tells nobody whether the result is sane.
  const preview = {};
  for (const [c, cfg] of Object.entries(classes)) {
    preview[c] = {};
    for (const [bid, band] of Object.entries(BUYERS)) {
      preview[c][bid] = band.base == null ? null : pricePoint(band.base * cfg.mult);
    }
  }
  return json({ classes, preview, buyers: BUYERS });
}

/**
 * POST /pricing/classes — tune them as percentages.
 * Body: { A: {pct: 320, quote: true}, B: {pct: 180}, C: {pct: 100} }
 *
 * Percent rather than a raw multiplier because that is how the owner asked,
 * and because "180%" reads as a decision where "1.8" reads as a constant.
 */
export async function setClasses(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const next = await loadClasses(env);
  for (const k of Object.keys(next)) {
    if (!b[k]) continue;
    const pct = Number(b[k].pct);
    // Bounded: a class multiplier is applied to every band and every term at
    // once, so a fat-fingered 10000 would put the whole catalogue out of reach
    // and a 0 would give it away.
    if (Number.isFinite(pct) && pct >= 10 && pct <= 2000) next[k].mult = pct / 100;
  }
  await env.DB.prepare(
    "INSERT INTO meta (k, v) VALUES ('pricing:classes', ?) ON CONFLICT(k) DO UPDATE SET v = ?"
  ).bind(JSON.stringify(next), JSON.stringify(next)).run();
  return json({ ok: true, classes: next });
}
