/**
 * Discount codes.
 *
 * The rule that shapes this file: a coupon is applied on the SERVER, at the one
 * place a self-serve price is created and snapshotted, and nowhere else. The
 * browser has its own copy of the pricing maths for display, and it is not
 * trusted with money — a discount computed there would be forgeable by anyone
 * who can open dev tools.
 *
 * Order of operations is deliberate. The class-and-term ladder produces a
 * price, pricePoint() snaps it to a sales figure, and only THEN does the
 * discount come off, rounded to whole agorot. Discounting before the snap
 * would let the rounding rule quietly eat part of the discount; snapping again
 * afterwards would turn "20% off" into "about 20% off". A customer who is
 * promised a fifth off should be charged exactly a fifth less.
 *
 * Percentages are integers. Fixed amounts are agorot, like every other sum in
 * this system, and never take a price below zero — a coupon worth more than the
 * licence makes it free, not negative.
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const now = () => Math.floor(Date.now() / 1000);
const clean = (v, n = 120) => String(v == null ? '' : v).trim().slice(0, n);

/* Ambiguous glyphs are out of the alphabet. These get read off a screenshot,
   typed from a printed card, and dictated down a phone — I/1, O/0 and the rest
   cost more in failed redemptions than the extra entropy is worth. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeCode(prefix, len = 6) {
  const buf = crypto.getRandomValues(new Uint8Array(len));
  const body = Array.from(buf, (b) => ALPHABET[b % ALPHABET.length]).join('');
  const p = clean(prefix, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return p ? `${p}-${body}` : body;
}

export const normCode = (v) => clean(v, 40).toUpperCase().replace(/\s+/g, '');

/**
 * Apply a coupon to a price in agorot. Pure, so the same arithmetic is used to
 * preview a code and to charge for it — a preview that computes the discount
 * differently from the checkout is a support ticket waiting to happen.
 */
export function applyCoupon(amountAgorot, c) {
  if (!c || !Number.isFinite(amountAgorot) || amountAgorot <= 0) return { amount: amountAgorot, off: 0 };
  const off = c.kind === 'percent'
    ? Math.round((amountAgorot * Math.min(100, Math.max(0, c.value))) / 100)
    : Math.min(amountAgorot, Math.max(0, c.value));
  return { amount: Math.max(0, amountAgorot - off), off };
}

/** Why a code cannot be used, in the order a person would ask. */
export function couponProblem(c, atAgorot) {
  if (!c) return 'No such code.';
  if (!c.active) return 'That code has been switched off.';
  if (c.expires_at && c.expires_at < now()) return 'That code has expired.';
  if (c.max_uses && c.used >= c.max_uses) return 'That code has been fully used.';
  if (c.min_amount && atAgorot != null && atAgorot < c.min_amount) {
    return `That code applies from ₪${(c.min_amount / 100).toFixed(0)} upwards.`;
  }
  return null;
}

export async function findCoupon(env, code) {
  const c = normCode(code);
  if (!c) return null;
  return env.DB.prepare(
    `SELECT id, code, kind, value, min_amount, max_uses, used, expires_at, active, note, classes
       FROM coupons WHERE code = ?`
  ).bind(c).first().catch(() => null);
}

/** A coupon may be limited to certain price classes — the same instinct as
 *  perpetual being C and D only: discount the cheap work, negotiate the dear. */
export function couponAllowsClass(c, letter) {
  const allowed = clean(c && c.classes, 20).toUpperCase().replace(/[^ABCD]/g, '');
  return !allowed || allowed.includes(String(letter || 'C').toUpperCase());
}

/** POST /coupons/check — { code, amount, cls } → what it would do. Public, so
 *  the funnel can show the new price before anyone commits to anything. */
export async function checkCoupon(req, env) {
  const b = await req.json().catch(() => ({}));
  const amount = Number(b.amount);
  const c = await findCoupon(env, b.code);
  const problem = couponProblem(c, Number.isFinite(amount) ? amount : null);
  if (problem) return json({ ok: false, reason: problem });
  if (!couponAllowsClass(c, b.cls)) {
    return json({ ok: false, reason: 'That code does not apply to this track.' });
  }
  const { amount: after, off } = applyCoupon(amount, c);
  return json({ ok: true, code: c.code, kind: c.kind, value: c.value,
                off, amount: after, label: c.kind === 'percent'
                  ? `${c.value}% off` : `₪${(c.value / 100).toFixed(0)} off` });
}

/** GET /coupons — owner view. */
export async function listCoupons(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const r = await env.DB.prepare(
    `SELECT id, code, kind, value, min_amount, max_uses, used, expires_at, active, note,
            classes, created_at
       FROM coupons ORDER BY created_at DESC LIMIT 300`
  ).all().catch(() => ({ results: [] }));
  return json({ coupons: r.results || [] });
}

/** POST /coupons — create, or toggle/delete an existing one. */
export async function saveCoupon(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));

  if (b.remove) {
    await env.DB.prepare('DELETE FROM coupons WHERE id = ?').bind(Number(b.remove)).run();
    return json({ ok: true, removed: Number(b.remove) });
  }
  if (b.toggle) {
    await env.DB.prepare('UPDATE coupons SET active = 1 - active WHERE id = ?')
      .bind(Number(b.toggle)).run();
    return json({ ok: true, toggled: Number(b.toggle) });
  }

  const kind = b.kind === 'amount' ? 'amount' : 'percent';
  let value = Math.round(Number(b.value));
  if (!Number.isFinite(value) || value <= 0) return json({ error: 'bad_value' }, 400);
  if (kind === 'percent' && value > 100) return json({ error: 'percent_over_100' }, 400);
  if (kind === 'amount') value = value * 100;             // entered in shekels, stored in agorot

  const code = normCode(b.code) || makeCode(b.prefix);
  const exists = await env.DB.prepare('SELECT 1 FROM coupons WHERE code = ?').bind(code).first().catch(() => null);
  if (exists) return json({ error: 'code_taken', code }, 409);

  await env.DB.prepare(
    `INSERT INTO coupons (code, kind, value, min_amount, max_uses, used, expires_at,
                          active, note, classes, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, 0, ?, 1, ?, ?, ?, ?)`
  ).bind(code, kind, value,
         Math.max(0, Math.round(Number(b.min_amount) || 0) * 100),
         Math.max(0, Math.round(Number(b.max_uses) || 0)),
         Number(b.expires_at) || null,
         clean(b.note, 200), clean(b.classes, 8).toUpperCase().replace(/[^ABCD]/g, ''),
         now(), user.email || 'owner').run();

  return json({ ok: true, code });
}

/** Called once a licence is actually granted, never at preview time. */
export async function burnCoupon(env, code) {
  const c = normCode(code);
  if (!c) return;
  await env.DB.prepare('UPDATE coupons SET used = used + 1 WHERE code = ?').bind(c).run().catch(() => null);
}
