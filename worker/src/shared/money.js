/**
 * Money — every real transaction across every vertical, in one list.
 *
 * The owner asked whether a combined screen was needed. It is, and not for
 * tidiness. Income arrives in three shapes that live in different tables and
 * disagree about what counts as real:
 *
 *   Mutra        payments           is_test, a flag somebody sets
 *   the apps     *_orders           status, where 'started' means an abandoned cart
 *   Creem        *_subs             env, where only 'creem-live' took a card
 *
 * Each screen that reads one of them tells a different story, and all three
 * have already misled: streamdaw_orders sums ₪3,735 of carts nobody completed,
 * the Audioctor dashboard showed no subscribers while a live monthly was being
 * billed, and three Mutra payments are flagged is_test = 0 while the invoice
 * pipeline skipped them with the reason "test payment". The owner cannot tell
 * what he has actually sold, which is the whole complaint.
 *
 * So one rule, applied once, stated per row. Nothing here is summed unless it
 * can say why it believes the money moved, and anything that fails the rule is
 * still shown - under Rehearsals, with the reason - because a transaction that
 * silently vanishes is how you end up trusting the wrong total.
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const now = () => Math.floor(Date.now() / 1000);

export async function moneyAll(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);

  const url = new URL(req.url);
  const days = Math.min(3650, Math.max(1, parseInt(url.searchParams.get('days') || '365', 10)));
  const since = now() - days * 86400;

  const soft = async (sql, ...binds) => {
    try { return (await env.DB.prepare(sql).bind(...binds).all()).results || []; }
    catch { return []; }
  };

  const rows = [];

  /* ── Mutra: a card payment, and the licence it paid for ──────────────────
     The invoice row is the second opinion. When the invoice pipeline skipped a
     payment with the reason "test payment" it knew something the is_test flag
     on the payment did not, and those three are exactly the ones the owner
     half-remembered as real. Both are reported rather than picking a winner. */
  for (const p of await soft(
    `SELECT p.id, p.email, p.amount, p.currency, p.method, p.status, p.reference,
            p.is_test, p.ts,
            u.name AS who,
            (SELECT COUNT(*) FROM licence_payments lp WHERE lp.payment_id = p.id) AS linked,
            (SELECT i.status FROM invoices i WHERE i.licence_ref = p.reference ORDER BY i.ts DESC LIMIT 1) AS inv_status,
            (SELECT i.last_error FROM invoices i WHERE i.licence_ref = p.reference ORDER BY i.ts DESC LIMIT 1) AS inv_why,
            (SELECT 1 FROM licences l WHERE l.ref = p.reference LIMIT 1) AS has_licence
       FROM payments p
       LEFT JOIN users u ON u.id = p.user_id
      WHERE p.ts >= ? AND p.status = 'received'
      ORDER BY p.ts DESC LIMIT 300`, since)) {
    const calledTest = p.is_test ? 'the payment is flagged as a test'
      : (p.inv_status === 'skipped' && /test/i.test(p.inv_why || '')
        ? 'the invoice was skipped as a test payment' : null);
    rows.push({
      vertical: 'Mutra', when: p.ts, who: p.who || p.email, what: p.reference || 'licence',
      amount: p.amount || 0, currency: p.currency || 'ILS',
      source: 'payments', real: !calledTest, why: calledTest,
      /* Said out loud because both have bitten: an invoice that failed is
         money taken with no tax document, and a payment with no licence row
         linked is money taken with nothing recorded against it. */
      flags: [
        p.inv_status === 'failed' ? `invoice failed: ${(p.inv_why || '').slice(0, 60)}` : null,
        !p.linked && p.has_licence ? 'licence exists but is not linked to this payment' : null,
        !p.has_licence ? 'no licence with this reference' : null,
      ].filter(Boolean),
    });
  }

  /* ── The apps, before Creem: an order only counts once it was granted ────
     'started' is somebody who reached the payment page and did not come back.
     Twenty-one of those carry a list price and sum to thousands; none of it
     was ever charged, and summing them is the single most misleading number
     in the old dashboard. */
  for (const [table, vertical] of [['streamdaw_orders', 'StreamDAW'], ['audioctor_orders', 'Audioctor']]) {
    for (const o of await soft(
      `SELECT o.ref, o.email, o.plan, o.amount, o.currency, o.status, o.coupon, o.created_at,
              u.name AS who
         FROM ${table} o LEFT JOIN users u ON u.id = o.user_id
        WHERE o.created_at >= ?
        ORDER BY o.created_at DESC LIMIT 300`, since)) {
      const notReal = o.status !== 'granted' ? `checkout was ${o.status}, never completed`
        : !(o.amount || 0) ? 'granted at no charge' : null;
      rows.push({
        vertical, when: o.created_at, who: o.who || o.email, what: o.plan || o.ref,
        amount: o.amount || 0, currency: o.currency || 'ILS',
        source: table, real: !notReal, why: notReal,
        flags: o.coupon ? [`coupon ${o.coupon}`] : [],
      });
    }
  }

  /* ── Creem: the subscriptions, which is where the money is now ───────────
     env is the only honest signal here: 'creem-live' took a real card and
     everything else is a rehearsal: Creem's test mode, or a row from the store
     being tried out in October.
     The amount is not in this table - Creem holds it - so these are listed as
     subscriptions rather than given a figure this Worker cannot stand behind. */
  for (const [table, vertical] of [['streamdaw_subs', 'StreamDAW'], ['audioctor_subs', 'Audioctor']]) {
    for (const s of await soft(
      `SELECT s.sub_id, s.env, s.email, s.plan, s.status, s.created_at, s.next_billed_at, s.cancel_at,
              u.name AS who
         FROM ${table} s LEFT JOIN users u ON u.id = s.user_id
        WHERE s.created_at >= ?
        ORDER BY s.created_at DESC LIMIT 300`, since)) {
      const live = String(s.env || '').toLowerCase() === 'creem-live';
      rows.push({
        vertical, when: s.created_at, who: s.who || s.email, what: `${s.plan} subscription`,
        amount: null, currency: null,
        source: table, real: live, why: live ? null : `${s.env} — not a real card`,
        subscription: true,
        flags: [
          s.status && s.status !== 'active' ? s.status : null,
          s.cancel_at ? 'renewal switched off' : null,
          live && !s.cancel_at && s.next_billed_at ? `next charge ${new Date(s.next_billed_at * 1000).toISOString().slice(0, 10)}` : null,
        ].filter(Boolean),
      });
    }
  }

  rows.sort((a, b) => b.when - a.when);
  const real = rows.filter((r) => r.real);
  const rehearsals = rows.filter((r) => !r.real);

  /* Only shekels are added up. Mixing ILS and USD into one figure would be a
     number that is true of nothing; the apps' Creem income is in dollars and
     is counted as subscriptions, not as a total this Worker invents. */
  const ils = real.filter((r) => r.amount && (r.currency || 'ILS') === 'ILS');
  return json({
    days,
    real,
    rehearsals,
    totals: {
      takenIls: ils.reduce((n, r) => n + r.amount, 0),
      paidTransactions: ils.length,
      liveSubscriptions: real.filter((r) => r.subscription).length,
      rehearsals: rehearsals.length,
      /* The two that mean somebody is owed something. */
      invoiceFailures: real.filter((r) => r.flags.some((f) => f.startsWith('invoice failed'))).length,
      unlinked: real.filter((r) => r.flags.some((f) => f.includes('not linked'))).length,
    },
  });
}
