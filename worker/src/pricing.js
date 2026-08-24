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
export function priceFor(track, buyerId, coverageId, termId, paidMedia) {
  const buyer = BUYERS[buyerId];
  const cov = COVERAGE[coverageId];
  const term = termById(termId);

  if (!buyer || !cov) return { amount: null, quote: true, reason: 'unknown_selection' };
  if (track && track.lane === 'quote') return { amount: null, quote: true, reason: 'co_owned' };
  if (cov.quote) return { amount: null, quote: true, reason: 'extended_coverage' };
  if (buyer.base == null) return { amount: null, quote: true, reason: 'large_client' };
  if (term.mult == null) return { amount: null, quote: true, reason: 'exclusive' };
  // Paid media and a perpetual term are mutually exclusive, and the funnel
  // should not be able to produce the pair even by a crafted request.
  if (term.noPaid && paidMedia) return { amount: null, quote: true, reason: 'perp_no_paid' };

  // A per-band override on the track wins outright — that is the owner saying
  // "this one is worth more to a business" and it must not be second-guessed
  // by the legacy digital-price factor.
  const over = track && track.prices && track.prices[buyerId];
  const base = Number.isFinite(over) && over > 0 ? over : buyer.base * trackFactor(track);
  return { amount: pricePoint(base * term.mult), quote: false, reason: null };
}

/** Valid ids, for request validation. */
export const isBuyer = (id) => Object.prototype.hasOwnProperty.call(BUYERS, id);
export const isCoverage = (id) => Object.prototype.hasOwnProperty.call(COVERAGE, id);
export const isTerm = (id) => TERMS.some((t) => t.id === id);
