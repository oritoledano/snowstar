/**
 * Who a track belongs to, and telling them when it changes.
 *
 * A submission carries the account that uploaded it, and once it is published
 * that account is the track's owner for every purpose that matters — royalties,
 * takedowns, the right to be told what happened to their music. Until now that
 * link was write-once and silent: the owner could rename a track or re-credit
 * its artist and the person who made it would never hear about it, and there
 * was no way at all to move a track to a different email short of editing the
 * database by hand.
 *
 * Both of those are the same underlying problem — ownership was data nobody
 * could act on. This makes it actionable and makes changes to it audible.
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const now = () => Math.floor(Date.now() / 1000);
const clean = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);

/** The account behind a published slug, if the track came in through uploads. */
export async function ownerOf(env, slug) {
  return env.DB.prepare(
    `SELECT sub.id AS submission_id, sub.title AS submitted_title, sub.user_id,
            u.email AS user_email, u.name AS user_name,
            ma.email AS artist_email, ma.name AS artist_name
       FROM submissions sub
       LEFT JOIN users u            ON u.id  = sub.user_id
       LEFT JOIN managed_artists ma ON ma.id = sub.managed_artist_id
      WHERE sub.published_slug = ?`
  ).bind(slug).first().catch(() => null);
}

/**
 * Queue a note to the owner when their track is renamed or re-credited.
 *
 * Through mail_outbox rather than straight out, like every other outbound mail
 * here: the owner reads it before it leaves. A rename is a small thing to the
 * person doing it and a large one to the person whose name is on the record,
 * so silence is the wrong default even though noise would be too.
 */
export async function notifyRename(env, slug, before, after) {
  const changed = [];
  for (const f of ['title', 'artist']) {
    const a = clean(before && before[f]), b = clean(after && after[f]);
    if (b && a !== b) changed.push({ field: f, from: a || '(unset)', to: b });
  }
  if (!changed.length) return null;

  const o = await ownerOf(env, slug);
  const to = o && (o.user_email || o.artist_email);
  if (!to) return null;                       // catalogue track, nobody to tell

  const lines = changed.map(c =>
    `  ${c.field === 'title' ? 'Track name' : 'Artist credit'}: ${c.from}  ->  ${c.to}`);
  const body =
    `Hello${o.user_name || o.artist_name ? ' ' + (o.user_name || o.artist_name) : ''},\n\n` +
    `We updated the details on a track of yours in the Mutra catalogue.\n\n` +
    lines.join('\n') + '\n\n' +
    `Nothing about your rights or your share has changed — this is a change to ` +
    `how the track is listed.\n\n` +
    `If either of these is wrong, reply to this email and we will put it back.\n\n` +
    `Snowstar`;

  await env.DB.prepare(
    `INSERT INTO mail_outbox (to_email, to_name, subject, body, title, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(to, o.user_name || o.artist_name || null,
         'A track of yours was updated', body, clean(after && after.title) || slug, now())
   .run().catch(() => null);

  return { to, changed };
}

/**
 * POST /tracks/owner — move a published track to a different account.
 *
 * The case this exists for: a track uploaded from one address that turns out to
 * belong to another person, or to the same person's real address. Reassigning
 * rewrites the submission's user_id, which is what every downstream question
 * about the track reads, so this is the single edit that moves royalties,
 * notifications and download rights together rather than leaving them split.
 *
 * The account has to already exist. Creating one silently would mean inventing
 * a login for somebody who never asked for it, and they would have no way in.
 */
export async function reassignOwner(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const slug = clean(b.slug, 120);
  const email = clean(b.email, 190).toLowerCase();
  if (!slug || !email) return json({ error: 'need_slug_and_email' }, 400);

  const target = await env.DB.prepare('SELECT id, email, name FROM users WHERE lower(email) = ?')
    .bind(email).first().catch(() => null);
  if (!target) {
    return json({ error: 'no_such_account',
                  detail: 'That email has no Snowstar account yet. Ask them to sign up first, '
                        + 'then reassign — creating an account for someone silently would give '
                        + 'them a login they never asked for and cannot get into.' }, 404);
  }

  const sub = await env.DB.prepare(
    'SELECT id, user_id FROM submissions WHERE published_slug = ?').bind(slug).first().catch(() => null);
  if (!sub) return json({ error: 'not_an_uploaded_track' }, 404);
  if (sub.user_id === target.id) return json({ ok: true, unchanged: true });

  const from = await env.DB.prepare('SELECT email FROM users WHERE id = ?')
    .bind(sub.user_id).first().catch(() => null);

  await env.DB.prepare('UPDATE submissions SET user_id = ? WHERE id = ?')
    .bind(target.id, sub.id).run();

  await env.DB.prepare(
    `INSERT INTO admin_log (actor, action, detail, created_at) VALUES (?, ?, ?, ?)`
  ).bind(user.email || 'owner', 'reassign_track',
         `${slug}: ${(from && from.email) || sub.user_id} -> ${target.email}`, now())
   .run().catch(() => null);

  // Both sides are told. The new owner because they now have a track and a
  // payout attached to them, the old one because something left their account.
  const note = (to, name, msg) => env.DB.prepare(
    `INSERT INTO mail_outbox (to_email, to_name, subject, body, title, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(to, name || null, 'A track was moved between accounts', msg, slug, now())
   .run().catch(() => null);

  await note(target.email, target.name,
    `Hello${target.name ? ' ' + target.name : ''},\n\n`
    + `The track "${slug}" in the Mutra catalogue is now filed under this email. `
    + `Anything it earns, and any notices about it, will come to you here.\n\nSnowstar`);
  if (from && from.email) {
    await note(from.email, null,
      `Hello,\n\nThe track "${slug}" has been moved to another account at the owner's request. `
      + `It is no longer listed under this email.\n\n`
      + `If this is unexpected, reply to this email.\n\nSnowstar`);
  }

  return json({ ok: true, slug, from: (from && from.email) || null, to: target.email });
}

/** GET /tracks/owner?slug= — who holds this track, for the editor to show. */
export async function getOwner(req, env, user, url) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const slug = clean(url.searchParams.get('slug'), 120);
  if (!slug) return json({ error: 'no_slug' }, 400);
  const o = await ownerOf(env, slug);
  return json({
    slug,
    owner: o ? { email: o.user_email || o.artist_email, name: o.user_name || o.artist_name,
                 viaAccount: !!o.user_email, submittedTitle: o.submitted_title } : null,
  });
}
