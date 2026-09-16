/**
 * Clearing test data, as a tool rather than a one-off.
 *
 * The platform gets demonstrated. Demonstrating it means signing up, uploading,
 * requesting a licence and paying for it, and every one of those leaves rows
 * that make the real numbers unreadable. Asking for a script each time is how a
 * live account gets caught in one, so this is a screen you drive yourself: pick
 * what to clear, read exactly what would go, confirm against a count the server
 * produced.
 *
 * Three rules it will not break.
 *
 *   1. AN EMAIL IS NEVER LOST. Every account is written to people_archive
 *      before it is removed — including the people who only ever came to try
 *      StreamDAW and never touched the site again. Clearing a demo must not
 *      cost a contact.
 *
 *   2. MONEY IS ARCHIVED, NOT DELETED. A payment row is the only record on this
 *      side that a card was charged at HYP; deleting it does not un-charge
 *      anything, it just means nobody can match the transaction later. Test
 *      payments get is_test = 1 and leave the money screens.
 *
 *   3. SOLD AND PUBLISHED ARE REFUSED. If a licence was granted against a
 *      track, that track and its owner stay — the same guard deleteArtist
 *      already enforces, reused rather than reimplemented.
 *
 * The hard part is not the deleting, it is the finding. Every user_id foreign
 * key is ON DELETE SET NULL, so removing an account anonymises ids and leaves
 * the EMAIL behind in sixteen tables. Two more — track_overrides and
 * track_stacks — have no user column at all and are reachable only through a
 * published slug. And hyp_checkouts has neither: it hangs off the request, so
 * deleting the request first orphans it permanently.
 */
import { trashObject } from './trash.js';

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/** Tables holding an email with no foreign key to enforce anything. */
const EMAIL_TABLES = [
  ['artist_terms', 'email'], ['collaborators', 'email'], ['download_tokens', 'email'],
  ['earnings', 'email'], ['entitlements', 'email'], ['licence_requests', 'email'],
  ['licences', 'email'], ['mail_outbox', 'to_email'], ['messages', 'email'],
  ['payments', 'email'], ['snowstash_orders', 'email'], ['streamdaw_orders', 'email'],
  ['waitlist', 'email'],
];
/** Account-local, keyed by id, safe to remove with the account. */
const ID_TABLES = [
  ['sessions', 'user_id'], ['favorites', 'user_id'], ['identities', 'user_id'],
  ['downloads', 'user_id'], ['password_resets', 'user_id'], ['channels', 'user_id'],
  ['handoffs', 'user_id'], ['artist_managers', 'user_id'], ['events', 'user_id'],
  ['snowstash_scans', 'user_id'], ['snowstash_registrations', 'user_id'],
  ['snowstash_unlocks', 'user_id'],
];

const soft = async (env, sql, ...b) => {
  try { return (await env.DB.prepare(sql).bind(...b).all()).results || []; }
  catch { return []; }
};
const softRun = async (env, sql, ...b) => {
  try { await env.DB.prepare(sql).bind(...b).run(); return true; } catch { return false; }
};
const lc = (s) => String(s || '').trim().toLowerCase();

/**
 * What clearing this account would actually touch.
 *
 * Counted per table rather than totalled, because "47 rows" tells you nothing
 * and "3 licence requests, 11 uploads, 1 payment" tells you whether to press
 * the button.
 */
export async function resetPreview(env, user, url) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const email = lc(url.searchParams.get('email'));
  if (!email) return json({ error: 'email_required' }, 400);

  const acct = await env.DB.prepare(
    'SELECT id, email, name, artist_name, signup_source, created_at FROM users WHERE lower(email) = ?'
  ).bind(email).first().catch(() => null);
  const uid = acct ? acct.id : null;

  const subs = await soft(env,
    `SELECT id, title, file_key, published_slug, status FROM submissions WHERE user_id = ?`, uid || '');
  const slugs = subs.map((s) => s.published_slug).filter(Boolean);

  /* The refusal, computed before anything else so the answer is never "we
     deleted most of it and then stopped". */
  let sold = [];
  if (slugs.length) {
    const qs = slugs.map(() => '?').join(',');
    sold = (await soft(env,
      `SELECT DISTINCT slug FROM licences WHERE slug IN (${qs}) AND revoked_at IS NULL`, ...slugs))
      .map((r) => r.slug);
  }

  const counts = {};
  const bump = (k, n) => { if (n) counts[k] = (counts[k] || 0) + n; };

  for (const [t, col] of EMAIL_TABLES) {
    const r = await soft(env, `SELECT COUNT(*) n FROM ${t} WHERE lower(${col}) = ?`, email);
    bump(t, r.length ? r[0].n : 0);
  }
  if (uid) {
    for (const [t, col] of ID_TABLES) {
      const r = await soft(env, `SELECT COUNT(*) n FROM ${t} WHERE ${col} = ?`, uid);
      bump(t, r.length ? r[0].n : 0);
    }
    const rd = await soft(env, 'SELECT COUNT(*) n FROM rights_decls WHERE signer_user_id = ?', uid);
    bump('rights_decls', rd.length ? rd[0].n : 0);
  }
  bump('submissions', subs.length);

  /* No user column anywhere on these — only a slug. */
  let overrides = 0, stacks = 0;
  if (slugs.length) {
    const qs = slugs.map(() => '?').join(',');
    const o = await soft(env, `SELECT COUNT(*) n FROM track_overrides WHERE slug IN (${qs})`, ...slugs);
    overrides = o.length ? o[0].n : 0;
    const st = await soft(env,
      `SELECT COUNT(*) n FROM track_stacks WHERE child_slug IN (${qs}) OR parent_slug IN (${qs})`,
      ...slugs, ...slugs);
    stacks = st.length ? st[0].n : 0;
  }
  bump('track_overrides', overrides);
  bump('track_stacks', stacks);

  /* Reachable only through the request it belongs to. */
  const refs = (await soft(env, 'SELECT ref FROM licence_requests WHERE lower(email) = ?', email))
    .map((r) => r.ref).filter(Boolean);
  let checkouts = 0;
  if (refs.length) {
    const qs = refs.map(() => '?').join(',');
    const c = await soft(env, `SELECT COUNT(*) n FROM hyp_checkouts WHERE ref IN (${qs})`, ...refs);
    checkouts = c.length ? c[0].n : 0;
  }
  bump('hyp_checkouts', checkouts);

  const money = await soft(env,
    `SELECT COUNT(*) n, COALESCE(SUM(amount), 0) total FROM payments
      WHERE lower(email) = ? AND is_test = 0`, email);

  /* A Mutra licence is not the only thing somebody can have bought. An active
     StreamDAW entitlement is the key to an app they installed — clearing the
     account would delete it and break software they own, which is a worse
     outcome than a messy dashboard. Caught here rather than discovered later. */
  const owns = await soft(env,
    `SELECT product, plan, status FROM entitlements
      WHERE lower(email) = ? AND status = 'active' AND revoked_at IS NULL`, email);

  return json({
    ok: true,
    account: acct || null,
    counts,
    published: slugs,
    sold,
    money: money.length ? { rows: money[0].n, agorot: money[0].total } : { rows: 0, agorot: 0 },
    /* The count the apply call must echo back. A screen left open since three
       more uploads arrived cannot clear rows it never showed. */
    confirm: Object.values(counts).reduce((a, b) => a + b, 0),
    owns,
    blocked: sold.length
      ? `A licence was granted on ${sold.join(', ')}. That record has to stand — revoke it first if this really must go.`
      : owns.length
      ? `This account owns ${owns.map((o) => o.product + ' ' + (o.plan || '')).join(', ').trim()}. `
        + 'Clearing it would delete the entitlement and break an app they installed. '
        + 'Revoke the entitlement first if that is really what you want.'
      : null,
  });
}

/**
 * POST /reset/apply — { email, tier, confirm }
 *
 * tier: 'activity' clears what they did, 'uploads' adds their music,
 * 'account' adds the login itself. Each includes the ones before it, because
 * an account with no uploads and orphaned requests is a worse state than
 * either end.
 */
export async function resetApply(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const email = lc(b.email);
  const tier = ['activity', 'uploads', 'account'].includes(b.tier) ? b.tier : null;
  if (!email || !tier) return json({ error: 'email_and_tier' }, 400);
  if (email === lc(user.email)) return json({ error: 'not_yourself' }, 400);

  const pre = await resetPreview(env, user,
    new URL('https://x/?email=' + encodeURIComponent(email)));
  const state = await pre.json();
  if (state.blocked) return json({ error: 'licence_sold', hint: state.blocked }, 409);
  if (Number(b.confirm) !== state.confirm) {
    return json({ error: 'confirm_mismatch', expected: state.confirm }, 409);
  }

  const acct = state.account;
  const uid = acct ? acct.id : null;
  const done = [];
  const count = (label, n) => { if (n) done.push(`${n} ${label}`); };

  /* ── 1. Money: marked, never removed ── */
  await softRun(env, 'UPDATE payments SET is_test = 1 WHERE lower(email) = ?', email);
  await softRun(env, `UPDATE invoices SET is_test = 1 WHERE user_id = ?`, uid || '');
  const refs = (await soft(env, 'SELECT ref FROM licence_requests WHERE lower(email) = ?', email))
    .map((r) => r.ref).filter(Boolean);
  if (refs.length) {
    const qs = refs.map(() => '?').join(',');
    await softRun(env, `UPDATE hyp_checkouts SET is_test = 1 WHERE ref IN (${qs})`, ...refs);
  }
  if (state.money && state.money.rows) count('payments archived', state.money.rows);

  /* ── 2. Activity ── */
  await softRun(env, 'UPDATE mail_outbox SET hidden_at = ? WHERE lower(to_email) = ?', now(), email);
  for (const t of ['licence_requests', 'messages', 'waitlist']) {
    await softRun(env, `DELETE FROM ${t} WHERE lower(email) = ?`, email);
  }
  count('licence requests', (state.counts || {}).licence_requests || 0);
  if (uid) {
    await softRun(env, 'DELETE FROM events WHERE user_id = ?', uid);
    count('tracked events', (state.counts || {}).events || 0);
  }

  /* ── 3. Uploads ── */
  if (tier === 'uploads' || tier === 'account') {
    const subs = await soft(env,
      'SELECT id, file_key, published_slug FROM submissions WHERE user_id = ?', uid || '');
    for (const s of subs) {
      if (s.file_key) { try { await trashObject(env, s.file_key); } catch { /* keep going */ } }
    }
    const ids = subs.map((s) => s.id);
    if (ids.length) {
      const qs = ids.map(() => '?').join(',');
      for (const t of ['rights_decls', 'collaborators']) {
        await softRun(env, `DELETE FROM ${t} WHERE submission_id IN (${qs})`, ...ids);
      }
      await softRun(env, `DELETE FROM submissions WHERE id IN (${qs})`, ...ids);
    }
    count('uploads', ids.length);

    /* The rows with no user column. Left behind, they are a catalogue entry
       nothing owns — findable only by walking the slug. */
    const slugs = subs.map((s) => s.published_slug).filter(Boolean);
    if (slugs.length) {
      const qs = slugs.map(() => '?').join(',');
      await softRun(env, `DELETE FROM track_overrides WHERE slug IN (${qs})`, ...slugs);
      await softRun(env,
        `DELETE FROM track_stacks WHERE child_slug IN (${qs}) OR parent_slug IN (${qs})`,
        ...slugs, ...slugs);
      await softRun(env, `DELETE FROM tracks WHERE slug IN (${qs})`, ...slugs);
      count('catalogue rows', slugs.length);
    }
  }

  /* ── 4. The account, email archived first ── */
  if (tier === 'account') {
    if (acct) {
      await softRun(env,
        `INSERT INTO people_archive (email, name, artist_name, source, first_seen, archived_at, reason, had)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET archived_at = excluded.archived_at, had = excluded.had`,
        acct.email, acct.name || '', acct.artist_name || '', acct.signup_source || '',
        acct.created_at || null, now(), String(b.reason || 'test data'),
        JSON.stringify(state.counts || {}).slice(0, 2000));
    }
    for (const [t, col] of EMAIL_TABLES) {
      if (t === 'payments' || t === 'licences') continue;      // money stands
      await softRun(env, `DELETE FROM ${t} WHERE lower(${col}) = ?`, email);
    }
    if (uid) {
      for (const [t, col] of ID_TABLES) await softRun(env, `DELETE FROM ${t} WHERE ${col} = ?`, uid);
      await softRun(env, 'DELETE FROM rights_decls WHERE signer_user_id = ?', uid);
      /* A ghost artist joins to users BY EMAIL, so leaving the row behind means
         re-using that address silently re-offers the claim to whoever takes it. */
      await softRun(env, 'UPDATE managed_artists SET claimed_user_id = NULL WHERE claimed_user_id = ?', uid);
      await softRun(env, 'DELETE FROM users WHERE id = ?', uid);
      count('account removed', 1);
    }
  }

  try {
    await env.DB.prepare(
      'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
    ).bind(user.email || 'owner', 'reset_' + tier, email, done.join(', ').slice(0, 400), now()).run();
  } catch { /* the clear happened either way */ }

  return json({ ok: true, tier, done, archived: tier === 'account' && !!acct });
}

/** Who has been archived — proof the emails are still here. */
export async function listArchive(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  return json({ people: await soft(env,
    'SELECT email, name, artist_name, source, first_seen, archived_at, reason FROM people_archive ORDER BY archived_at DESC LIMIT 500') });
}
