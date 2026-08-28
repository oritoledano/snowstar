/**
 * What a licence earned, and who it is owed to.
 *
 * Two separate problems live here, and only one of them is software.
 *
 * The software problem is the LEDGER. When a licence is paid, every person with
 * a share in that track has earned something, and until now nothing recorded
 * it. Splits existed (collaborators.share_bp) and payments existed, but nothing
 * joined them, so "what do I owe Omri" was a question you answered by reading
 * old emails. Every paid grant now writes one row per shareholder: what the
 * licence was, what the whole thing came to, what fraction is theirs, and what
 * that is in agorot. Accrued until somebody marks it paid, with a reference.
 *
 * The other problem is MOVING THE MONEY, and this file deliberately does not do
 * that. Paying a person is a regulated act with tax consequences on both sides,
 * and an automated transfer that fires off a database row is exactly the kind
 * of thing that is wrong at 2am and irreversible by morning. What this gives is
 * the number, the evidence behind it, and a place to record that a human paid
 * it. See PAYOUTS.md for the recommendation on how.
 *
 * Money is in agorot as INTEGER throughout, like everywhere else here. Shares
 * are basis points, so a 33.33% split is 3333 and not a float that drifts.
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const now = () => Math.floor(Date.now() / 1000);

/* The house keeps this much of a licence before splits. Held here as one
   named constant rather than sprinkled through the arithmetic, because it is
   the number most likely to be renegotiated and the one it would be worst to
   have three copies of. */
export const ARTIST_SHARE_BP = 5000;         // 50% of net to the rights holders

/**
 * Record what a paid licence earned for each shareholder, and tell them.
 *
 * Called after the licence row exists, and deliberately never throws into the
 * caller: a licence that is granted and paid for must not fail because the
 * bookkeeping did. A missing ledger row is recoverable; a refused grant on
 * money already taken is not.
 */
export async function accrueEarnings(env, { slug, licence_id, amount_agorot, reason }) {
  if (reason !== 'paid' || !amount_agorot || amount_agorot <= 0) return null;

  // Who has a share. Collaborators are attached to the SUBMISSION, so the
  // track has to be traced back to the upload it came from.
  const sub = await env.DB.prepare(
    'SELECT id, user_id FROM submissions WHERE published_slug = ?'
  ).bind(slug).first().catch(() => null);
  if (!sub) return null;                     // catalogue track, wholly the house's

  const rows = await env.DB.prepare(
    `SELECT c.name, c.email, c.share_bp, c.user_id, u.email AS account_email, u.name AS account_name
       FROM collaborators c
       LEFT JOIN users u ON u.id = c.user_id
      WHERE c.submission_id = ? AND c.status != 'rejected'`
  ).bind(sub.id).all().catch(() => ({ results: [] }));

  let shares = (rows.results || []).filter((r) => Number(r.share_bp) > 0);

  // No declared split means the uploader holds all of it. That is the honest
  // default: they are the only person who has claimed the track.
  if (!shares.length) {
    const u = await env.DB.prepare('SELECT id, email, name FROM users WHERE id = ?')
      .bind(sub.user_id).first().catch(() => null);
    if (!u || !u.email) return null;
    shares = [{ name: u.name, email: u.email, account_email: u.email, share_bp: 10000, user_id: u.id }];
  }

  const pool = Math.round((amount_agorot * ARTIST_SHARE_BP) / 10000);
  const total = shares.reduce((s, r) => s + Number(r.share_bp), 0) || 10000;

  const written = [];
  for (const r of shares) {
    // Divided against the DECLARED total rather than assuming it sums to 100%,
    // so a half-filled split sheet pays the right ratio instead of quietly
    // paying out less than was collected.
    const amount = Math.round((pool * Number(r.share_bp)) / total);
    if (amount <= 0) continue;
    const to = r.account_email || r.email;
    if (!to) continue;

    await env.DB.prepare(
      `INSERT INTO earnings (licence_id, slug, user_id, email, name, share_bp,
                             gross_agorot, amount_agorot, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'accrued', ?)`
    ).bind(licence_id || null, slug, r.user_id || null, to, r.name || r.account_name || null,
           Number(r.share_bp), amount_agorot, amount, now()).run().catch(() => null);

    const ils = (n) => '₪' + (n / 100).toFixed(2);
    await env.DB.prepare(
      `INSERT INTO mail_outbox (to_email, to_name, subject, body, kind, created_at)
       VALUES (?, ?, ?, ?, 'licensing', ?)`
    ).bind(to, r.name || r.account_name || null, 'Your track was licensed',
      `Hello${r.name ? ' ' + r.name : ''},\n\n`
      + `"${slug}" has just been licensed.\n\n`
      + `  Licence value:   ${ils(amount_agorot)}\n`
      + `  Your share:      ${(Number(r.share_bp) / 100).toFixed(2)}% of the artist pool\n`
      + `  Earned:          ${ils(amount)}\n\n`
      + `This is now on your balance. We settle balances on request once they pass ₪250 — `
      + `reply to this email when you would like to be paid and we will send the paperwork.\n\n`
      + `Snowstar`,
      now()).run().catch(() => null);

    written.push({ to, amount });
  }
  return { pool, written };
}

/** GET /earnings — the owner's view: who is owed what, worst first. */
export async function listEarnings(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const r = await env.DB.prepare(
    `SELECT email, MAX(name) AS name,
            SUM(CASE WHEN status='accrued' THEN amount_agorot ELSE 0 END) AS owed,
            SUM(CASE WHEN status='paid'    THEN amount_agorot ELSE 0 END) AS paid,
            COUNT(*) AS lines, MAX(created_at) AS last_at
       FROM earnings GROUP BY email ORDER BY owed DESC`
  ).all().catch(() => ({ results: [] }));
  const recent = await env.DB.prepare(
    `SELECT id, slug, email, amount_agorot, gross_agorot, share_bp, status, created_at
       FROM earnings ORDER BY created_at DESC LIMIT 60`
  ).all().catch(() => ({ results: [] }));
  return json({ people: r.results || [], recent: recent.results || [] });
}

/**
 * POST /earnings/settle — record that a person has been paid.
 *
 * Records, not pays. It takes a reference because a settlement with no evidence
 * behind it is indistinguishable from a mistake six months later, and the
 * reference is what makes the ledger auditable against a bank statement.
 */
export async function settleEarnings(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase();
  const ref = String(b.reference || '').trim().slice(0, 120);
  if (!email) return json({ error: 'no_email' }, 400);
  if (!ref) return json({ error: 'reference_required',
                          detail: 'Record how it was paid — an invoice number or transfer ref. '
                                + 'A settlement with no evidence is unauditable.' }, 400);

  const sum = await env.DB.prepare(
    `SELECT SUM(amount_agorot) t, COUNT(*) n FROM earnings
      WHERE lower(email) = ? AND status = 'accrued'`).bind(email).first().catch(() => null);
  if (!sum || !sum.n) return json({ error: 'nothing_owed' }, 404);

  await env.DB.prepare(
    `UPDATE earnings SET status='paid', paid_at=?, payout_ref=?
      WHERE lower(email)=? AND status='accrued'`).bind(now(), ref, email).run();

  await env.DB.prepare(
    'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
  ).bind(user.email || 'owner', 'settle_earnings', email,
         `${sum.t} agorot over ${sum.n} lines, ref ${ref}`, now()).run().catch(() => null);

  return json({ ok: true, email, settled_agorot: sum.t, lines: sum.n, reference: ref });
}

/** GET /earnings/mine — an artist's own balance. */
export async function myEarnings(env, user) {
  if (!user || !user.email) return json({ error: 'forbidden' }, 403);
  const r = await env.DB.prepare(
    `SELECT slug, amount_agorot, share_bp, status, created_at, paid_at
       FROM earnings WHERE lower(email) = ? ORDER BY created_at DESC LIMIT 200`
  ).bind(String(user.email).toLowerCase()).all().catch(() => ({ results: [] }));
  const lines = r.results || [];
  return json({
    owed: lines.filter((x) => x.status === 'accrued').reduce((s, x) => s + x.amount_agorot, 0),
    paid: lines.filter((x) => x.status === 'paid').reduce((s, x) => s + x.amount_agorot, 0),
    lines,
  });
}
