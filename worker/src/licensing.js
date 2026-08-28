/**
 * Licensing — requests in, licences out, with a human in the middle.
 *
 * Payments arrive by bank transfer, Bit or Paybox, so nothing can be automatic
 * yet: the owner confirms the money landed and then releases the track. That
 * makes the grant the single dangerous operation in this file, and most of
 * what follows exists to make it hard to do carelessly.
 *
 * The seam that matters for later: grantLicence() takes an `actor`. The
 * dashboard button passes the owner's id; a payment-gateway webhook will pass
 * 'system:grow' or 'system:payplus'. Nothing else has to change when card
 * payments arrive — which is the point of building it this way now rather than
 * wiring the button straight into an INSERT.
 */

import { priceFor, isBuyer, isCoverage, isTerm, BUYERS, loadClasses } from './pricing.js';
import { sendMail } from './mail.js';
import { alert } from './analytics.js';

const now = () => Math.floor(Date.now() / 1000);
import { accrueEarnings } from './earnings.js';
import { findCoupon, couponProblem, couponAllowsClass, applyCoupon, burnCoupon } from './coupons.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const clean = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const SLUG_RE = /^[a-z0-9][a-z0-9:-]{0,120}$/;

/** Tiers, and how long each lasts. Perpetual where the catalogue copy promises
 *  "no end date"; a real term only where the blurb states one. Getting this
 *  wrong in the generous direction is a promise you cannot walk back. */
export const TIER_TERMS = {
  digital:   { label: 'Digital — web & social',    months: null },
  corporate: { label: 'Business & corporate',      months: null },
  // Six months everywhere now: the term is chosen at checkout and carried on
  // the request. These are only the fallback for rows written before durations
  // existed, and 'paid' moved to a six-month base price with the price ladder.
  paid:      { label: 'Digital — paid campaign',   months: 6 },
  tvshow:    { label: 'TV show / series',          months: null },
  film:      { label: 'Film',                      months: null },
  radio:     { label: 'Radio',                     months: 6 },
  tvc:       { label: 'TV commercial',             months: null },
};

export const PAY_METHODS = ['bank', 'bit', 'paybox', 'cash', 'card', 'waived'];
const GRANT_REASONS = ['paid', 'comp', 'contra', 'internal'];

/** The licence wording, frozen per grant. Same contract as rights_texts:
 *  INSERT OR IGNORE and never edit — changing the words means a new id. */
export const LICENCE_TEXTS = {
  // v1 is kept, never edited: licences already granted resolve to these words.
  'lic.v1':
`This licence permits the licensee named above to synchronise the track named above with their own
content, for the use tier named above and no wider. It is granted to that person or business only,
is not transferable, and may not be resold, sub-licensed or included in another library.
The recording and the composition remain the property of their rights holders.
The full terms in force are published at snowstar.company/terms.html under the version recorded
against this licence.`,

  // v2 adds the term, now that the buyer chooses one, and says plainly that the
  // term is HARD: expiry ends use of published material too. That is the point
  // of a non-exclusive time-limited licence — it is a rental, and the renewal
  // is the business. Saying so here, in the licence itself, is what stops it
  // being a surprise later.
  'lic.v3':
`This licence permits the licensee named above to synchronise the track named above with their own
content, for the ONE PROJECT named on this licence and for no other. Using the track in a second
project requires a second licence, even where the track, the licensee and the end client are the
same. It is granted to that person or business only, is not transferable, and may not be resold,
sub-licensed or included in another library.

Where the term is shown as "no end date", the permission granted is for organic use only: the
licensee's own site, social pages and channels. It does not cover paid promotion of the project —
promoted posts, pre-roll, display or paid influencer placement — which requires a dated term.
The recording and the composition remain the property of their rights holders.

The licence runs for the term shown above, from the grant date. When the term ends the permission
granted here ends with it, including for material already published: any use of the track must be
covered by a licence in force for as long as that use continues. Renewing before the end date
leaves no gap, and renewal is offered at a lower rate than the original term. Where no end date is
shown, the licence does not expire.

The full terms in force are published at snowstar.company/terms.html under the version recorded
against this licence.`,
};

async function freezeText(env, id) {
  if (!LICENCE_TEXTS[id]) throw new Error('unknown_licence_text');
  await env.DB.prepare('INSERT OR IGNORE INTO licence_texts (id, body, created_at) VALUES (?, ?, ?)')
    .bind(id, LICENCE_TEXTS[id], now()).run();
}

const SITE = 'https://snowstar.company';

/** An all-day Google Calendar event on the expiry date. A link, not an API:
 *  no OAuth, no scopes, works from any mail client, and the licensee stays in
 *  control of their own calendar. */
function calendarLink(slug, ref, expires) {
  if (!expires) return null;
  const ymd = (ts) => new Date(ts * 1000).toISOString().slice(0, 10).replace(/-/g, '');
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Mutra licence expires — ${slug}`,
    dates: `${ymd(expires)}/${ymd(expires + 86400)}`,
    details: `Licence ${ref} for "${slug}" expires today.\n\n`
      + 'Renew before this date to keep using the track, including in work already published.\n'
      + `${SITE}/mutra.html?license=${encodeURIComponent(slug)}`,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

async function sendGrantMail(env, o) {
  if (!o.email) return;
  const cal = calendarLink(o.slug, o.ref, o.expires);
  const ends = o.expires
    ? new Date(o.expires * 1000).toLocaleDateString('en-GB',
        { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const body = `
    <p>Your licence is live.</p>
    <table style="border-collapse:collapse;margin:18px 0">
      <tr><td style="padding:4px 18px 4px 0;color:#8a8072">Track</td><td><b>${clean(o.slug, 120)}</b></td></tr>
      ${o.project ? `<tr><td style="padding:4px 18px 4px 0;color:#8a8072">Project</td><td>${clean(o.project, 200)}</td></tr>` : ''}
      <tr><td style="padding:4px 18px 4px 0;color:#8a8072">Reference</td><td>${clean(o.ref, 80)}</td></tr>
      <tr><td style="padding:4px 18px 4px 0;color:#8a8072">Term</td><td>${ends ? 'until ' + ends : 'no end date'}</td></tr>
    </table>
    <p>
      <a href="${SITE}/api/download?slug=${encodeURIComponent(o.slug)}"
         style="display:inline-block;background:#1a1712;color:#fff;padding:11px 20px;border-radius:99px;text-decoration:none">Download the clean file</a>
    </p>
    <p style="margin-top:14px">
      <a href="${SITE}/api/licence/certificate?ref=${encodeURIComponent(o.ref)}">Licence certificate</a>
      ${cal ? ` &nbsp;·&nbsp; <a href="${cal}">Add the renewal date to your calendar</a>` : ''}
    </p>
    ${ends ? `<p style="color:#6a6055;font-size:13px;line-height:1.6">This licence covers the one
      project named above. When it ends on ${ends}, so does the right to use the track — including
      in material you have already published. We'll email you 30 days before.</p>`
    : `<p style="color:#6a6055;font-size:13px;line-height:1.6">This licence covers the one project
      named above and does not expire. It covers organic use; paid promotion of the project needs a
      dated term.</p>`}
    <p style="color:#6a6055;font-size:13px">Everything is also in your account under
      <a href="${SITE}/mutra.html">My licences</a>.</p>`;

  /* The file goes WITH the email. A download link behind a login is one more
     step between someone who has paid and the thing they paid for, and the
     commonest support message any library gets is "where is my file". Resend
     takes attachments up to 40MB; a three-minute master is about four, so the
     only real risk is an unusually long track — and that falls back to the
     link rather than failing the mail. */
  let attachments;
  try {
    const row = await env.DB.prepare('SELECT audio_key, title FROM tracks WHERE slug = ?')
      .bind(o.slug).first();
    if (row && row.audio_key) {
      const obj = await env.MASTERS.get(row.audio_key);
      if (obj && obj.size && obj.size < 18 * 1024 * 1024) {
        const buf = await obj.arrayBuffer();
        let bin = '';
        const bytes = new Uint8Array(buf);
        // chunked, because String.fromCharCode(...wholeFile) blows the stack
        for (let i = 0; i < bytes.length; i += 0x8000) {
          bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        const ext = row.audio_key.split('.').pop().toLowerCase();
        const safe = String(row.title || o.slug)
          .replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);
        attachments = [{ filename: `${safe}.${ext}`, content: btoa(bin) }];
      }
    }
  } catch { /* the licence is granted either way — the link is still in the body */ }

  await sendMail(env, {
    to: o.email,
    subject: `Your Mutra licence — ${clean(o.slug, 60)} (${clean(o.ref, 60)})`,
    html: body,
    attachments,
  });
}

async function logAdmin(env, actor, action, subject, detail) {
  try {
    await env.DB.prepare(
      'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
    ).bind(String(actor), action, clean(subject, 120), clean(detail, 1000), now()).run();
  } catch { /* the log must never be able to fail the operation it records */ }
}

/** MU-YYMM-NNNN. The whole reconciliation strategy: it goes in the bank
 *  transfer reference and the Bit note, so money can be matched to a request
 *  without guessing from the amount. */
function makeRef(id, slug) {
  // The track name goes in the reference because a human reads it: on a bank
  // statement, in a Bit note, and when the owner reconciles by eye. The number
  // stays because two people can licence the same track on the same day.
  const name = String(slug || 'track').toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18) || 'TRACK';
  return `MUTRA-${name}-${String(id).padStart(4, '0')}`;
}

/* ═══════════ member side ═══════════ */

/** A visitor asks to license a track. Replaces the mailto. */
export async function createRequest(req, env, user) {
  const b = await req.json().catch(() => ({}));
  const slug = clean(b.slug, 120);
  if (!SLUG_RE.test(slug)) return json({ error: 'bad_slug' }, 400);

  // The funnel sends a BUYER BAND, not one of the seven old use tiers. `tier`
  // survives as a column because granted licences reference it and the queue
  // renders it, so it is derived here rather than demanded from the caller —
  // requiring a field the current client has no concept of is how an endpoint
  // quietly stops accepting the traffic it was rebuilt for.
  const rawTier = clean(b.tier, 30);
  const coverageIn = clean(b.coverage, 20) || 'standard';
  const tier = TIER_TERMS[rawTier] ? rawTier
             : coverageIn === 'extended' ? 'tvshow' : 'digital';

  const email = clean(user ? user.email : b.email, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'email_required' }, 400);

  // The buyer band is the new price axis, and it arrives from the browser — so
  // it is validated here and the AMOUNT is re-derived from it. Nothing about
  // the figure travels from the client.
  const buyer = clean(b.buyer, 30);
  const coverage = coverageIn;
  if (buyer && !isBuyer(buyer)) return json({ error: 'bad_buyer' }, 400);
  if (!isCoverage(coverage)) return json({ error: 'bad_coverage' }, 400);

  // The price is looked up server-side and snapshotted. Never trust an amount
  // that arrived from the browser — it is the one field worth forging.
  const ov = await env.DB.prepare('SELECT patch FROM track_overrides WHERE slug = ?').bind(slug).first();
  let lane = 'instant', listAgorot = null;
  let couponCode = null, couponOff = 0;
  if (ov) {
    try {
      const p = JSON.parse(ov.patch);
      if (p.lane === 'quote') lane = 'quote';
      const shek = Number.isFinite(p?.prices?.[tier]) ? p.prices[tier]
                 : Number.isFinite(p?.fee) ? p.fee : null;
      if (shek != null) listAgorot = Math.round(shek * 100);
    } catch { /* a corrupt override must not block a sale */ }
  }
  // Price from the band. The track record the browser sees is rebuilt here from
  // the override so the same inputs give the same number on both sides.
  if (buyer) {
    let tr = { lane, prices: {}, fee: null, cls: 'C' };
    if (ov) {
      try {
        const p = JSON.parse(ov.patch);
        tr = { lane, prices: p.prices || {}, fee: p.fee, cls: p.cls || 'C' };
      } catch { /* corrupt override */ }
    }
    const classes = await loadClasses(env);
    const pr = priceFor(tr, buyer, coverage, clean(b.duration, 8) || '12m', !!b.paid_media, classes);
    listAgorot = pr.quote ? null : pr.amount * 100;
    if (pr.quote) lane = 'quote';

    /* The discount comes off HERE, after pricePoint has snapped the ladder to
       a sales figure and before the number is snapshotted — the only place a
       self-serve price is ever created. Applying it earlier would let the
       rounding rule eat part of the discount; applying it in the browser would
       make it forgeable. There is nothing to discount on a quote. */
    if (listAgorot != null && clean(b.coupon, 40)) {
      const c = await findCoupon(env, b.coupon);
      const bad = couponProblem(c, listAgorot);
      if (!bad && couponAllowsClass(c, pr.grade)) {
        const res = applyCoupon(listAgorot, c);
        if (res.off > 0) {
          listAgorot = res.amount;
          couponCode = c.code;
          couponOff = res.off;
        }
      }
    }
  }

  const t = now();
  const r = await env.DB.prepare(
    `INSERT INTO licence_requests
       (ref, user_id, email, slug, tier, lane, list_amount, currency, status,
        licensee_name, licensee_tax_id, use_where, use_territory, use_duration, note,
        months, duration_id, project_name, created_at)
     VALUES ('', ?, ?, ?, ?, ?, ?, 'ILS', 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(user ? user.id : null, email, slug, tier, lane, listAgorot,
         clean(b.licensee_name, 200), clean(b.licensee_tax_id, 40),
         clean(b.use_where, 500), clean(b.use_territory, 120),
         clean(b.use_duration, 120),
         // The code rides along in the note so "why was this cheaper" has an
         // answer on the request itself, without a schema change.
         (couponCode ? `[coupon ${couponCode} -₪${(couponOff / 100).toFixed(0)}] ` : '') + clean(b.note, 1000),
         // The chosen term, bounded — it decides expires_at at grant time.
         // 'perp' is the one legitimate way to arrive with no months: it means
         // no end date, so it must pass through as NULL rather than be
         // defaulted to six months and quietly expire on a perpetual sale.
         clean(b.duration, 8) === 'perp' ? null
           : [6, 12, 24, 36].includes(Number(b.months)) ? Number(b.months) : 6,
         clean(b.duration, 8) || '6m',
         // The project is what makes "one track, one project" enforceable, and
         // what a renewal email needs in order to name the video rather than
         // just the track.
         clean(b.project_name, 200), t).run();

  const id = r.meta.last_row_id;
  const ref = makeRef(id, slug);
  await env.DB.prepare('UPDATE licence_requests SET ref = ? WHERE id = ?').bind(ref, id).run();

  // A request is what the site exists to produce. It used to land in D1 and
  // wait to be noticed, which for a one-person catalogue means the reply time
  // is however long until someone opens the dashboard.
  try {
    const shek = listAgorot != null ? (listAgorot / 100).toFixed(2) : null;
    await alert(env, 'request',
      `Mutra: ${lane === 'quote' ? 'quote request' : 'licence request'} — ${slug}`,
      `${ref}\n\n`
      + `Track:    ${slug}\n`
      + `Buyer:    ${buyer ? (BUYERS[buyer] ? BUYERS[buyer].label : buyer) : tier}\n`
      + `Coverage: ${coverage}\n`
      + `Term:     ${clean(b.duration, 8) || '12m'}\n`
      + (shek ? `Price:    ILS ${shek} ex VAT\n` : `Price:    quoted\n`)
      + `From:     ${email}\n`
      + (clean(b.project_name, 200) ? `Project:  ${clean(b.project_name, 200)}\n` : '')
      + (clean(b.licensee_name, 200) ? `Client:   ${clean(b.licensee_name, 200)}\n` : '')
      + `\nQueue: https://snowstar.company/dashboard.html\n`);
  } catch { /* the request is saved either way */ }

  return json({
    ok: true, ref, id, lane,
    amount_ex_vat: listAgorot,
    vat_rate: 18,
    // What the payer needs, with the ref baked in. If the ref does not travel
    // with the money, reconciliation is amount-matching and guesswork.
    pay: {
      reference: ref,
      note: `Mutra licence ${ref}`,
    },
  });
}

/** A member's own licences and requests, for the account drawer. */
export async function myLicences(env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const reqs = await env.DB.prepare(
    `SELECT id, ref, slug, tier, lane, status, list_amount, quoted_amount, created_at, decline_note
       FROM licence_requests WHERE user_id = ? OR email = ? ORDER BY id DESC LIMIT 100`
  ).bind(user.id, user.email).all();
  const lics = await env.DB.prepare(
    `SELECT id, ref, slug, tier, amount, granted_at, starts_at, expires_at, revoked_at, scope_text
       FROM licences WHERE user_id = ? OR email = ? ORDER BY id DESC LIMIT 100`
  ).bind(user.id, user.email).all();
  return json({ requests: reqs.results || [], licences: lics.results || [] });
}

/**
 * Is this member entitled to the clean master of this track?
 * Any live, unexpired licence on any tier qualifies — the tier governs what
 * they may DO with it, not which file they receive.
 */
export async function hasLiveLicence(env, user, slug) {
  if (!user) return null;
  const t = now();
  return env.DB.prepare(
    `SELECT id, ref, tier FROM licences
      WHERE (user_id = ? OR email = ?) AND slug = ?
        AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
      LIMIT 1`
  ).bind(user.id, user.email, slug, t).first();
}

/* ═══════════ owner side ═══════════ */

export async function listQueue(env, user, url) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const status = clean(url.searchParams.get('status') || 'new', 20);
  // A granted request stops being a request — it becomes a licence, with an
  // expiry, a certificate and a revoke button. Listing licence_requests under
  // "granted" would show the paperwork rather than the thing itself, so that
  // tab reads the licences table instead.
  const rows = status === 'granted'
    ? await env.DB.prepare(
        `SELECT l.*, u.name AS user_name
           FROM licences l LEFT JOIN users u ON u.id = l.user_id
          ORDER BY l.id DESC LIMIT 200`).all()
    : await env.DB.prepare(
        `SELECT r.*, u.name AS user_name
           FROM licence_requests r LEFT JOIN users u ON u.id = r.user_id
          WHERE r.status = ? ORDER BY r.id ASC LIMIT 200`).bind(status).all();

  // payments with money not yet applied to any licence — the "arrived,
  // unassigned" queue, which is where reconciliation actually happens
  const unapplied = await env.DB.prepare(
    `SELECT p.*, COALESCE((SELECT SUM(applied) FROM licence_payments lp WHERE lp.payment_id = p.id), 0) AS used
       FROM payments p WHERE p.status = 'received' ORDER BY p.id DESC LIMIT 100`
  ).all();

  const counts = await env.DB.prepare(
    `SELECT status, COUNT(*) n FROM licence_requests GROUP BY status`
  ).all();

  return json({
    kind: status === 'granted' ? 'licences' : 'requests',
    requests: rows.results || [],
    payments: (unapplied.results || []).map((p) => ({ ...p, unapplied: p.amount - p.used })),
    counts: Object.fromEntries((counts.results || []).map((r) => [r.status, r.n])),
    tiers: TIER_TERMS, methods: PAY_METHODS,
  });
}

/** Record money that arrived. Separate from granting, deliberately — the money
 *  and the permission are different facts and one can exist without the other. */
export async function recordPayment(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const agorot = Math.round(Number(b.amount) * 100);
  if (!Number.isFinite(agorot) || agorot < 0 || agorot > 1e9) return json({ error: 'bad_amount' }, 400);
  const method = clean(b.method, 20);
  if (!PAY_METHODS.includes(method)) return json({ error: 'bad_method' }, 400);

  const r = await env.DB.prepare(
    `INSERT INTO payments (user_id, email, amount, vat_amount, currency, method, status, reference, payer_note, ts, recorded_by)
     VALUES (?, ?, ?, ?, 'ILS', ?, 'received', ?, ?, ?, ?)`
  ).bind(clean(b.user_id, 60) || null, clean(b.email, 254).toLowerCase() || null,
         agorot, Number.isFinite(b.vat_amount) ? Math.round(b.vat_amount * 100) : null,
         method, clean(b.reference, 60), clean(b.payer_note, 500), now(), user.id).run();

  await logAdmin(env, user.id, 'payment.record', String(r.meta.last_row_id),
                 `${(agorot / 100).toFixed(2)} ILS by ${method} ref ${clean(b.reference, 60)}`);
  return json({ ok: true, id: r.meta.last_row_id });
}

/**
 * THE dangerous operation. Grants a licence and, where money is involved,
 * ties it to the payment that justifies it.
 *
 * Called by the dashboard today and by a payment webhook later — hence `actor`
 * and `reason` as parameters rather than assumptions.
 */
export async function grantLicence(env, opts) {
  const {
    request_id, user_id, email, slug, tier, amount, reason, actor,
    payment_id, licensee_name, licensee_tax_id, scope_text,
    controller_cleared, starts_at,
  } = opts;

  if (!TIER_TERMS[tier]) return { ok: false, error: 'bad_tier' };
  if (!GRANT_REASONS.includes(reason)) return { ok: false, error: 'bad_reason' };

  const reqRow = request_id
    ? await env.DB.prepare('SELECT * FROM licence_requests WHERE id = ?').bind(request_id).first()
    : null;

  // A quote-lane track means someone else has a say in its commercial use.
  // Refusing here is the difference between a refund and a rights claim.
  const lane = reqRow ? reqRow.lane : null;
  if (lane === 'quote' && !controller_cleared) {
    return { ok: false, error: 'controller_not_cleared' };
  }

  await freezeText(env, 'lic.v3');
  const t = now();
  const starts = Number.isFinite(starts_at) ? starts_at : t;
  // The buyer chooses the term now, so it wins over the tier's old default.
  // Falling back to the tier only covers rows created before durations existed.
  // A request that named a duration is authoritative, INCLUDING when it named
  // 'perp' and therefore has no months. Falling through to the tier default
  // there would turn a perpetual sale into a term one.
  const months = Number.isFinite(opts.months) ? opts.months
               : (reqRow && reqRow.duration_id) ? (reqRow.months || null)
               : TIER_TERMS[tier].months;
  const expires = months ? starts + Math.round(months * 30.44 * 86400) : null;

  let id, ref;
  try {
    const r = await env.DB.prepare(
      `INSERT INTO licences
         (ref, request_id, user_id, email, slug, tier, terms_id, scope_text,
          licensee_name, licensee_tax_id, amount, currency, grant_reason,
          controller_cleared, granted_by, granted_at, starts_at, expires_at, project_name)
       VALUES ('', ?, ?, ?, ?, ?, 'lic.v3', ?, ?, ?, ?, 'ILS', ?, ?, ?, ?, ?, ?, ?)`
    ).bind(request_id || null, user_id || null, String(email || '').toLowerCase(),
           slug, tier, clean(scope_text, 1000), clean(licensee_name, 200),
           clean(licensee_tax_id, 40), Math.round(amount || 0), reason,
           controller_cleared ? 1 : 0, String(actor), t, starts, expires,
           // carried from the request so the certificate and the renewal email
           // can both name the project this licence was actually bought for
           clean(opts.project_name || (reqRow && reqRow.project_name), 200)).run();
    id = r.meta.last_row_id;
    ref = reqRow ? reqRow.ref : makeRef(id, slug);
    await env.DB.prepare('UPDATE licences SET ref = ? WHERE id = ?').bind(ref, id).run();

    // Tell them. Until now a grant was silent: the licence existed, the file
    // unlocked, and the buyer had no way of knowing unless they went looking.
    // Three things go in the mail because they are the three things somebody
    // needs after paying — the file, something to show a client, and a warning
    // before it lapses.
    try {
      await alert(env, 'payment',
        `Mutra: licence granted — ${slug} (${ref})`,
        `${ref}\n\nTrack:   ${slug}\nTo:      ${email}\n`
        + `Amount:  ILS ${((amount || 0) / 100).toFixed(2)} ex VAT\n`
        + `Reason:  ${reason}\nBy:      ${actor}\n`
        + `Term:    ${expires ? new Date(expires * 1000).toISOString().slice(0, 10) : 'no end date'}\n`);
    } catch { /* never let an alert fail a grant */ }

    try {
      await sendGrantMail(env, {
        email, ref, slug, expires,
        licensee: clean(licensee_name, 200),
        project: clean(opts.project_name || (reqRow && reqRow.project_name), 200),
      });
    } catch { /* a licence that was granted must not fail because mail did */ }
  } catch (e) {
    // idx_lic_live: one live licence per (member, track, tier). A double-click,
    // or a webhook delivered twice, lands here rather than granting twice.
    if (String(e.message || e).includes('UNIQUE')) return { ok: false, error: 'already_licensed' };
    return { ok: false, error: 'insert_failed', detail: String(e.message || e).slice(0, 200) };
  }

  if (payment_id) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO licence_payments (licence_id, payment_id, applied) VALUES (?, ?, ?)'
    ).bind(id, payment_id, Math.round(amount || 0)).run().catch(() => {});
  }
  if (request_id) {
    await env.DB.prepare(
      `UPDATE licence_requests SET status = 'granted', decided_by = ?, decided_at = ? WHERE id = ?`
    ).bind(String(actor), t, request_id).run();
  }
  await logAdmin(env, actor, 'licence.grant', ref,
                 `${slug} / ${tier} / ${((amount || 0) / 100).toFixed(2)} ILS / ${reason}`);
  return { ok: true, id, ref, expires_at: expires };
}

/** Dashboard wrapper: validates what a human typed, then delegates. */
export async function grantFromDashboard(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const request_id = Number(b.request_id);
  if (!Number.isInteger(request_id)) return json({ error: 'bad_request_id' }, 400);

  const r = await env.DB.prepare('SELECT * FROM licence_requests WHERE id = ?').bind(request_id).first();
  if (!r) return json({ error: 'not_found' }, 404);
  if (r.status === 'granted') return json({ error: 'already_granted' }, 409);

  const agorot = Math.round(Number(b.amount) * 100);
  if (!Number.isFinite(agorot) || agorot < 0) return json({ error: 'bad_amount' }, 400);

  const reason = clean(b.reason, 20) || 'paid';
  // A comp is the only way to grant without money, and it has to be said out
  // loud rather than fallen into by leaving the payment blank.
  if (reason === 'paid' && !b.payment_id) return json({ error: 'payment_required' }, 400);

  const out = await grantLicence(env, {
    request_id, user_id: r.user_id, email: r.email, slug: r.slug, tier: r.tier,
    amount: agorot, reason, actor: user.id,
    payment_id: Number(b.payment_id) || null,
    licensee_name: b.licensee_name || r.licensee_name,
    licensee_tax_id: b.licensee_tax_id || r.licensee_tax_id,
    scope_text: b.scope_text,
    controller_cleared: !!b.controller_cleared,
  });
  /* The money has already moved by this point, so the ledger is written
     after the grant and never allowed to fail it. A missing earnings row can
     be backfilled; a refused grant on a taken payment cannot be undone. */
  if (out.ok) {
    try {
      await accrueEarnings(env, { slug: r.slug, licence_id: out.licence_id || out.id,
                                  amount_agorot: agorot, reason });
    } catch { /* deliberately swallowed — see above */ }
  }
  return out.ok ? json(out) : json(out, out.error === 'already_licensed' ? 409 : 400);
}

/** Corrections are revoke-and-regrant. The row is never edited, so the history
 *  of what was permitted at any past moment stays readable. */
export async function revokeLicence(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!Number.isInteger(id)) return json({ error: 'bad_id' }, 400);
  const reason = clean(b.reason, 300);
  const row = await env.DB.prepare('SELECT ref, granted_at FROM licences WHERE id = ? AND revoked_at IS NULL')
    .bind(id).first();
  if (!row) return json({ error: 'not_found' }, 404);
  // an undo within half an hour needs no explanation; after that, say why
  if (now() - row.granted_at > 1800 && !reason) return json({ error: 'reason_required' }, 400);
  await env.DB.prepare('UPDATE licences SET revoked_at = ?, revoke_reason = ? WHERE id = ?')
    .bind(now(), reason, id).run();
  await logAdmin(env, user.id, 'licence.revoke', row.ref, reason);
  return json({ ok: true });
}

export async function declineRequest(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!Number.isInteger(id)) return json({ error: 'bad_id' }, 400);
  await env.DB.prepare(
    `UPDATE licence_requests SET status = 'declined', decided_by = ?, decided_at = ?, decline_note = ?
      WHERE id = ? AND status != 'granted'`
  ).bind(user.id, now(), clean(b.note, 1000), id).run();
  await logAdmin(env, user.id, 'request.decline', String(id), clean(b.note, 300));
  return json({ ok: true });
}
