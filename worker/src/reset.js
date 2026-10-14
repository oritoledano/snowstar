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
 *   1. A DELETED ACCOUNT IS GONE (2026-10-14, the privacy policy). It used to be
 *      "an email is never lost": every account was copied into people_archive
 *      first. The privacy policy now promises that deleting an account deletes
 *      the person, so nothing is archived, the person's people_archive row goes
 *      too, and so do their key requests, bug reports and the copies of the
 *      emails we sent them. erasePerson() below is the one way it is done, from
 *      here, from Members › Delete and from Facebook's deletion callback.
 *
 *   2. MONEY IS KEPT, NOT DELETED. A payment row is the only record on this
 *      side that a card was charged at HYP, and Israeli tax law wants it for 7
 *      years after the end of the tax year. Test payments get is_test = 1 and
 *      leave the money screens. When a person is erased, their orders and
 *      payments stay, stripped to what the tax record needs (ref, plan, amount,
 *      status, the processor's id, dates) and marked erased_at; retention.js
 *      deletes the stripped StreamDAW and Snowstash orders when the 7 years are
 *      up. Music licences and earnings stand as they are: they are agreements
 *      with other people.
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
import { ipTag } from './crypto.js';

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/** Tables holding an email with no foreign key to enforce anything. Deleted with the account. */
const EMAIL_TABLES = [
  ['artist_terms', 'email'], ['collaborators', 'email'], ['download_tokens', 'email'],
  ['entitlements', 'email'], ['licence_requests', 'email'],
  ['mail_outbox', 'to_email'], ['messages', 'email'],
  ['waitlist', 'email'],
  /* StreamDAW and the privacy policy (2026-10-14): a key request (email, licence name,
     machine ID, the key), a bug report's reply address, the copy of every email we sent,
     and the archive the old rule 1 kept. */
  ['streamdaw_activations', 'email'], ['streamdaw_reports', 'email'],
  ['user_messages', 'email'], ['people_archive', 'email'],
];
/** Money and agreements: kept when the person goes (rule 2). Orders and payments are
 *  stripped of the person; licences and earnings stand. Counted apart, never deleted here. */
const KEPT_TABLES = [
  ['streamdaw_orders', 'email'], ['snowstash_orders', 'email'], ['payments', 'email'],
  ['licences', 'email'], ['earnings', 'email'],
];
/** Account-local, keyed by id, safe to remove with the account. */
const ID_TABLES = [
  ['sessions', 'user_id'], ['favorites', 'user_id'], ['identities', 'user_id'],
  ['downloads', 'user_id'], ['password_resets', 'user_id'], ['channels', 'user_id'],
  ['handoffs', 'user_id'], ['artist_managers', 'user_id'], ['events', 'user_id'],
  ['snowstash_scans', 'user_id'], ['snowstash_registrations', 'user_id'],
  ['snowstash_unlocks', 'user_id'],
  ['streamdaw_free_downloads', 'user_id'],   // who took the free installer (2026-10-13)
  ['user_messages', 'user_id'],              // copies of what we emailed them (2026-10-14)
  ['sessions_seen', 'user_id'],              // signed-in visits, where the column exists
  /* Request health. The FK is ON DELETE SET NULL like the rest, but D1 only
     enforces that when the connection has foreign_keys ON and nothing here
     guarantees it — so clear it by hand like every other table in this list.
     Losing a cleared account's traffic history is the right outcome: the rows
     are about a person, and the person is being cleared. */
  ['req_log', 'user_id'],
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

  /* What stays when the account goes (rule 2): counted so the screen can say so. */
  const kept = {};
  for (const [t, col] of KEPT_TABLES) {
    const r = await soft(env, `SELECT COUNT(*) n FROM ${t} WHERE lower(${col}) = ?`, email);
    if (r.length && r[0].n) kept[t] = r[0].n;
  }

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
    kept,
    blocked: sold.length
      ? `A licence was granted on ${sold.join(', ')}. That record has to stand — revoke it first if this really must go.`
      : owns.length
      ? `This account owns ${owns.map((o) => o.product + ' ' + (o.plan || '')).join(', ').trim()}. `
        + 'Clearing it would delete the entitlement and break an app they installed. '
        + 'Revoke the entitlement first, or use "Erase this person" if they asked to be deleted.'
      : null,
    /* "Erase this person": their own request. What they own does not stop it (the app on
       their Mac keeps the key it has); only a licence sold on their music does. */
    eraseBlocked: sold.length
      ? `A licence was granted on ${sold.join(', ')}. That record has to stand — revoke it first if this really must go.`
      : null,
  });
}

/**
 * POST /reset/apply — { email, tier, confirm }
 *
 * tier: 'activity' clears what they did, 'uploads' adds their music,
 * 'account' adds the login itself (erasePerson). Each includes the ones before
 * it, because an account with no uploads and orphaned requests is a worse state
 * than either end. 'erase' is 'account' for a person who asked to be deleted:
 * owning StreamDAW does not block it (2026-10-14).
 */
export async function resetApply(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const email = lc(b.email);
  const tier = ['activity', 'uploads', 'account', 'erase'].includes(b.tier) ? b.tier : null;
  if (!email || !tier) return json({ error: 'email_and_tier' }, 400);
  if (email === lc(user.email)) return json({ error: 'not_yourself' }, 400);

  const pre = await resetPreview(env, user,
    new URL('https://x/?email=' + encodeURIComponent(email)));
  const state = await pre.json();
  const block = tier === 'erase' ? state.eraseBlocked : state.blocked;
  if (block) return json({ error: 'licence_sold', hint: block }, 409);
  if (Number(b.confirm) !== state.confirm) {
    return json({ error: 'confirm_mismatch', expected: state.confirm }, 409);
  }

  const acct = state.account;
  const uid = acct ? acct.id : null;
  const done = [];
  const count = (label, n) => { if (n) done.push(`${n} ${label}`); };

  /* ── 1. Money: marked, never removed. A person who asked to be erased is a real customer:
     their payments are real and stay in the books (erasePerson strips them instead). ── */
  if (tier !== 'erase') {
    await softRun(env, 'UPDATE payments SET is_test = 1 WHERE lower(email) = ?', email);
    await softRun(env, `UPDATE invoices SET is_test = 1 WHERE user_id = ?`, uid || '');
    const refs = (await soft(env, 'SELECT ref FROM licence_requests WHERE lower(email) = ?', email))
      .map((r) => r.ref).filter(Boolean);
    if (refs.length) {
      const qs = refs.map(() => '?').join(',');
      await softRun(env, `UPDATE hyp_checkouts SET is_test = 1 WHERE ref IN (${qs})`, ...refs);
    }
    if (state.money && state.money.rows) count('payments archived', state.money.rows);
  }

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
  if (tier === 'uploads' || tier === 'account' || tier === 'erase') {
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

  /* ── 4. The account: the person, everywhere (erasePerson). Nothing archived. ── */
  if (tier === 'account' || tier === 'erase') {
    const r = await erasePerson(env, { email, uid });
    done.push(...r.done);
  }

  try {
    /* The trail says what was done, not to whom: an erased person's address is not kept
       here either. The tag (keyed, crypto.js) lets a repeat request be recognised. */
    const subject = tier === 'account' || tier === 'erase' ? 'erased:' + await ipTag(env, email, 'erase') : email;
    await env.DB.prepare(
      'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
    ).bind(user.email || 'owner', 'reset_' + tier, subject, done.join(', ').slice(0, 400), now()).run();
  } catch { /* the clear happened either way */ }

  return json({ ok: true, tier, done, archived: false });
}

const hex = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s))))]
  .map((x) => x.toString(16).padStart(2, '0')).join('');

/**
 * Delete a person: every row about them, in every table that has one (2026-10-14, the
 * privacy policy's "Deleting your data"). By email, by account id, or both.
 *
 * Kept (rule 2): StreamDAW and Snowstash orders and Mutra payments, stripped of the person
 * (email, account, Mac, licence name, payer's note) and marked erased_at, for the 7 years tax
 * law asks (retention.js deletes the stripped orders after that); invoices lose their account
 * link (the invoice itself lives with the invoicing service); music licences and earnings
 * stand. Everything else goes: the account and its sign-ins, entitlements, key requests and
 * keys, download links, free downloads, bug reports, the copies of our emails, contact
 * messages, the archive row, tracked events, the request log, and the stream-health, usage
 * and live-link rows of the Macs their keys were for.
 *
 * Every statement is soft: a table this database does not have yet is skipped, never a
 * failure halfway. Order matters where a foreign key points at a row about to go.
 */
export async function erasePerson(env, { email, uid } = {}) {
  email = lc(email);
  uid = uid || null;
  if (uid && !email) {
    const u = await soft(env, 'SELECT email FROM users WHERE id = ?', uid);
    email = u.length ? lc(u[0].email) : '';
  }
  if (email && !uid) {
    const u = await soft(env, 'SELECT id FROM users WHERE lower(email) = ?', email);
    uid = u.length ? u[0].id : null;
  }
  const done = [];
  if (!email && !uid) return { done, email: '', uid: null };
  const E = email || '#none', U = uid || '#none';     // a value no row has (not '': erased orders have that)
  const t = now();
  const gone = async (label, sql, ...b) => {
    const before = await soft(env, sql.replace(/^DELETE FROM (\w+) WHERE/, 'SELECT COUNT(*) n FROM $1 WHERE'), ...b);
    if (await softRun(env, sql, ...b) && before.length && before[0].n) done.push(`${before[0].n} ${label}`);
  };

  /* The Macs their keys were for: what the relay sent from them is labelled with hashes of
     these machine IDs (server/telemetry.js, server/livelink.js in the StreamDAW repo). */
  const machines = new Set();
  for (const r of await soft(env, 'SELECT machine_id FROM streamdaw_activations WHERE lower(email) = ?', E)) if (r.machine_id) machines.add(r.machine_id);
  for (const r of await soft(env, 'SELECT machine_id FROM streamdaw_orders WHERE lower(email) = ? OR user_id = ?', E, U)) if (r.machine_id) machines.add(r.machine_id);
  for (const m of machines) {
    const h = (await hex(m)).slice(0, 16), live = await hex('streamdaw-live:' + m);
    await softRun(env, 'DELETE FROM sd_samples WHERE stream_id IN (SELECT id FROM sd_streams WHERE machine = ?)', h);
    await gone('stream-health rows', 'DELETE FROM sd_streams WHERE machine = ?', h);
    await gone('usage records', 'DELETE FROM sd_usage WHERE machine = ?', h);
    await gone('live links', 'DELETE FROM streamdaw_live WHERE machine_hash = ?', live);
  }

  /* Money: kept, stripped (rule 2). Unlinked from the entitlement first, which goes below. */
  const sd = await soft(env, 'SELECT COUNT(*) n FROM streamdaw_orders WHERE (lower(email) = ? OR user_id = ?) AND erased_at IS NULL', E, U);
  if (!(await softRun(env, `UPDATE streamdaw_orders SET email = '', user_id = NULL, machine_id = NULL, owner_name = NULL,
                              entitlement_id = NULL, erased_at = ? WHERE lower(email) = ? OR user_id = ?`, t, E, U)))
    await softRun(env, `UPDATE streamdaw_orders SET email = '', user_id = NULL, entitlement_id = NULL WHERE lower(email) = ? OR user_id = ?`, E, U);
  if (sd.length && sd[0].n) done.push(`${sd[0].n} StreamDAW orders kept for tax, without the person`);
  if (!(await softRun(env, `UPDATE snowstash_orders SET email = '', user_id = NULL, scan_id = NULL, erased_at = ? WHERE lower(email) = ? OR user_id = ?`, t, E, U)))
    await softRun(env, `UPDATE snowstash_orders SET email = '', user_id = NULL, scan_id = NULL WHERE lower(email) = ? OR user_id = ?`, E, U);
  await softRun(env, 'UPDATE payments SET email = NULL, user_id = NULL, payer_note = NULL WHERE lower(email) = ? OR user_id = ?', E, U);
  await softRun(env, 'UPDATE invoices SET user_id = NULL WHERE user_id = ?', U);

  /* Their StreamDAW: key requests and keys, download links, then what they owned. */
  const ents = (await soft(env, 'SELECT id FROM entitlements WHERE lower(email) = ? OR user_id = ?', E, U)).map((r) => r.id);
  if (ents.length) {
    const qs = ents.map(() => '?').join(',');
    await gone('key requests', `DELETE FROM streamdaw_activations WHERE entitlement_id IN (${qs})`, ...ents);
    await softRun(env, `DELETE FROM download_tokens WHERE entitlement_id IN (${qs})`, ...ents);
  }
  /* A Mutra licence request that became a sale: the sale's rows lose the pointer, the
     request (their message, their details) goes. */
  const reqs = (await soft(env, 'SELECT id FROM licence_requests WHERE lower(email) = ?', E)).map((r) => r.id);
  if (reqs.length) {
    const qs = reqs.map(() => '?').join(',');
    await softRun(env, `UPDATE hyp_checkouts SET request_id = NULL WHERE request_id IN (${qs})`, ...reqs);
    await softRun(env, `UPDATE licences SET request_id = NULL WHERE request_id IN (${qs})`, ...reqs);
  }
  for (const [tb, col] of EMAIL_TABLES) await gone(tb.replace(/_/g, ' '), `DELETE FROM ${tb} WHERE lower(${col}) = ?`, E);
  if (uid) {
    for (const [tb, col] of ID_TABLES) await gone(tb.replace(/_/g, ' '), `DELETE FROM ${tb} WHERE ${col} = ?`, U);
    await softRun(env, 'DELETE FROM rights_decls WHERE signer_user_id = ?', U);
    /* A ghost artist joins to users BY EMAIL, so leaving the row behind means
       re-using that address silently re-offers the claim to whoever takes it. */
    await softRun(env, 'UPDATE managed_artists SET claimed_user_id = NULL WHERE claimed_user_id = ?', U);
    await softRun(env, 'UPDATE licences SET user_id = NULL WHERE user_id = ?', U);
    await softRun(env, 'UPDATE earnings SET user_id = NULL WHERE user_id = ?', U);
    if (await softRun(env, 'DELETE FROM users WHERE id = ?', U)) done.push('account removed');
  }
  /* Earlier trail entries that named them. */
  if (email) {
    const tag = 'erased:' + await ipTag(env, email, 'erase');
    await softRun(env, 'UPDATE admin_log SET subject = ? WHERE lower(subject) = ?', tag, email);
  }
  return { done, email, uid };
}

/** Who has been archived — proof the emails are still here. */
export async function listArchive(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  return json({ people: await soft(env,
    'SELECT email, name, artist_name, source, first_seen, archived_at, reason FROM people_archive ORDER BY archived_at DESC LIMIT 500') });
}
