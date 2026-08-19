/**
 * Rights declarations, collaborator splits, and the owner-gated mail outbox.
 *
 * Architecture (deliberate, per the design review):
 *  - The LEGAL backbone is the uploader's signed declaration of authority.
 *    The collaborator list is income routing + dispute surfacing on top of it;
 *    a collaborator who never joins NEVER blocks licensing.
 *  - Declaration texts are frozen: the exact wording signed is persisted once,
 *    immutably, keyed by version id. Editing copy means adding a new version.
 *  - The splits inside a signed declaration are a snapshot; the collaborators
 *    table is the living routing copy (typo fixes fine, share changes need a
 *    fresh signature).
 *  - NO collaborator email leaves the system without Ori's explicit approval,
 *    ever. While the Resend domain is unverified the approved email is
 *    delivered to Ori's own inbox with a FORWARD-TO banner instead.
 */

import { sendMail, mailLive, mailFrom } from './mail.js';

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const cleanEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

/** The render source. The DB row written at first signature is the record. */
export const RIGHTS_TEXTS = {
  'solo.v1':
`This track is entirely mine.
I confirm that: I made this track and own all rights to it — the composition and the recording. Any samples, loops, or presets in it are ones I'm properly licensed to use in commercial work. No other person, band member, label, or publisher owns any part of it. Mutra may license it to clients worldwide, royalty-free.
If any of this turns out not to be true, I take responsibility for it — not Mutra, and not the clients who licensed the track in good faith.`,
  'shared.v1':
`I share ownership of this track.
I own part of this track, and the people listed own the rest. I confirm that: the list of co-owners and their shares is complete, correct, and adds up to 100%. Every co-owner knows about this submission and has given me permission to submit the track and let Mutra license it to clients worldwide, royalty-free. Any samples, loops, or presets in it are properly licensed for commercial use. Mutra may contact each co-owner at the details I've provided so they can claim their share of the track's income.
If any of this turns out not to be true, I take responsibility for it — not Mutra, not my co-owners, and not the clients who licensed the track in good faith.`,
  'behalf.v1':
`Submitted by Snowstar on behalf of the credited artist.
I confirm that the credited artist has confirmed to me that the ownership details above are correct and that they authorize Mutra to license this track to clients worldwide, royalty-free. Where written confirmation exists, it is noted here and kept on file.`,
  'claim.v1':
`These tracks were submitted on my behalf by Snowstar.
I confirm the ownership details recorded for them are correct: where marked entirely mine, I own all rights; where co-owners are listed, the shares are right and everyone has authorized this. Mutra may license these tracks to clients worldwide, royalty-free.`,
};

async function freezeText(env, id) {
  if (!RIGHTS_TEXTS[id]) throw new Error('unknown_rights_text');
  await env.DB.prepare(
    'INSERT OR IGNORE INTO rights_texts (id, text, created_at) VALUES (?, ?, ?)'
  ).bind(id, RIGHTS_TEXTS[id], now()).run();
}

/**
 * Validate + normalize a declaration payload from the submission POST.
 * Returns { decl, collabs } ready to insert, or throws {message} for a 400.
 */
export function parseDeclaration(b, user, managedArtist) {
  const d = b.declaration || {};
  const kind = ['solo', 'shared', 'behalf'].includes(d.kind) ? d.kind : null;
  if (!kind) throw new Error('declaration_required');
  const textId = kind + '.v1';
  const signedName = String(d.signed_name || '').trim().slice(0, 120);
  if (signedName.length < 2) throw new Error('signature_required');
  const acum = d.acum ? 1 : 0;

  // Whoever has a say in commercial use without necessarily owning a share —
  // a label, publisher, distributor or sync agent. Disclosure only: it never
  // blocks a submission, it routes the track to the quote lane so nobody is
  // contacted until a deal is real.
  const controllers = (Array.isArray(d.controllers) ? d.controllers : [])
    .slice(0, 10)
    .map((c) => ({
      name: String(c.name || '').trim().slice(0, 120),
      scope: ['recording', 'song', 'both'].includes(c.scope) ? c.scope : 'recording',
      territory: String(c.territory || '').trim().slice(0, 120),
    }))
    .filter((c) => c.name);
  const approval = ['any', 'all'].includes(d.approval) ? d.approval : null;

  let collabs = [];
  if (kind === 'shared' || (kind === 'behalf' && Array.isArray(d.collaborators) && d.collaborators.length)) {
    const raw = Array.isArray(d.collaborators) ? d.collaborators : [];
    if (kind === 'shared' && !raw.length) throw new Error('collaborators_required');
    if (raw.length > 10) throw new Error('too_many_collaborators');
    // the credited artist must not appear in their own collaborator list
    const creditedEmail = managedArtist ? cleanEmail(managedArtist.email) : cleanEmail(user.email);
    const seen = new Set();
    let sumBp = 0;
    for (const c of raw) {
      const name = String(c.name || '').trim().slice(0, 120);
      const email = cleanEmail(c.email);
      const pct = Number(c.share_pct);
      if (name.length < 2) throw new Error('collaborator_name_required');
      if (!validEmail(email)) throw new Error('collaborator_email_invalid');
      if (email === creditedEmail) throw new Error('collaborator_is_uploader');
      if (seen.has(email)) throw new Error('collaborator_duplicate');
      seen.add(email);
      // validate the ROUNDED basis points, not the raw float — 0.001% must not
      // slip through as a zero-bp share, and the sum check must match storage
      const bp = Math.round(pct * 100);
      if (bp < 1 || bp >= 10000) throw new Error('share_out_of_range');
      sumBp += bp;
      collabs.push({ name, email, share_bp: bp });
    }
    // the credited artist keeps the remainder — it must be a real share
    if (sumBp >= 10000) throw new Error('shares_leave_nothing_for_artist');
  }

  const evidence = kind === 'behalf'
    ? { evidence_kind: ['email-reply', 'contract', 'whatsapp', 'other', ''].includes(d.evidence_kind) ? d.evidence_kind : '',
        evidence_note: String(d.evidence_note || '').trim().slice(0, 500) }
    : { evidence_kind: '', evidence_note: '' };

  return {
    decl: { kind, text_id: textId, signed_name: signedName, acum,
            splits_snapshot: JSON.stringify(collabs), ...evidence },
    collabs,
    controllers,
    approval,
  };
}

/** Persist declaration + collaborator rows + queued (unapproved) invites. */
export async function recordDeclaration(env, submissionId, user, parsed, creditedName, trackTitle) {
  await freezeText(env, parsed.decl.text_id);
  const t = now();
  const stmts = [
    env.DB.prepare(
      `INSERT INTO rights_decls (submission_id, kind, text_id, signed_name, signer_user_id,
         acum, splits_snapshot, evidence_kind, evidence_note, created_at, controllers)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(submissionId, parsed.decl.kind, parsed.decl.text_id, parsed.decl.signed_name,
           user.id, parsed.decl.acum, parsed.decl.splits_snapshot,
           parsed.decl.evidence_kind, parsed.decl.evidence_note, t,
           (parsed.controllers && parsed.controllers.length) || parsed.approval
             ? JSON.stringify({ controllers: parsed.controllers, approval: parsed.approval })
             : null),
  ];
  for (const c of parsed.collabs) {
    // link the account if this email already has one — but 'joined' is reserved
    // for the collaborator's own explicit confirmation, never set automatically
    stmts.push(env.DB.prepare(
      `INSERT INTO collaborators (submission_id, name, email, share_bp, user_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, (SELECT id FROM users WHERE email = ?), 'listed', ?, ?)`
    ).bind(submissionId, c.name, c.email, c.share_bp, c.email, t, t));
    // the "create your account" invite only makes sense for people without one;
    // existing members simply find the credit on their dashboard
    stmts.push(env.DB.prepare(
      `INSERT INTO mail_outbox (to_email, to_name, subject, body, kind, submission_id, created_at)
       SELECT ?, ?, ?, ?, 'collab-invite', ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = ?)`
    ).bind(c.email, c.name,
      `You're credited on “${trackTitle}” at Mutra`,
      inviteBody(c, creditedName, trackTitle), submissionId, t, c.email));
  }
  await env.DB.batch(stmts);
}

function inviteBody(c, artistName, trackTitle) {
  const pct = (c.share_bp / 100).toFixed(c.share_bp % 100 ? 2 : 0);
  return `Hi ${c.name},

${artistName} has added the track “${trackTitle}” to Mutra — the music licensing catalog by Snowstar (snowstar.company/mutra.html) — and listed you as a co-owner with a ${pct}% share.

Your share of the track's artist income is held for you. To claim it, create your free account with this email address:

https://snowstar.company/artists.html

Once you're in, you'll see every track you're credited on and can confirm (or dispute) your share.

You're receiving this one-time note because ${artistName} listed you as a rights holder. If this isn't you, or you believe the details are wrong, just reply to this email.

— Snowstar / Mutra, Tel Aviv`;
}

/* ─────────── the owner's mailbox (approval gate) ─────────── */

export async function listOutbox(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const r = await env.DB.prepare(
    `SELECT o.id, o.to_email, o.to_name, o.subject, o.body, o.kind, o.sent_at, o.sent_how,
            o.last_error, o.created_at, s.title
       FROM mail_outbox o LEFT JOIN submissions s ON s.id = o.submission_id
      ORDER BY o.id DESC LIMIT 200`
  ).all();
  return json({ outbox: r.results || [], mail_live: mailLive(env) });
}

/** Send the selected queued emails — Ori's explicit act, one by one or all. */
export async function sendOutbox(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Number.isInteger).slice(0, 50);
  if (!ids.length) return json({ error: 'no_ids' }, 400);
  const live = mailLive(env);
  const results = [];
  for (const id of ids) {
    const row = await env.DB.prepare('SELECT * FROM mail_outbox WHERE id = ?').bind(id).first();
    if (!row || row.sent_at) { results.push({ id, ok: false, error: 'not_found_or_sent' }); continue; }
    // claim the row atomically BEFORE sending, so a concurrent click (or a
    // crash mid-send) can never produce a double delivery
    const claim = await env.DB.prepare(
      `UPDATE mail_outbox SET sent_at = ?, sent_how = ?, last_error = '' WHERE id = ? AND sent_at IS NULL`
    ).bind(now(), live ? 'direct' : 'forwarded-via-owner', id).run();
    if (!claim.meta.changes) { results.push({ id, ok: false, error: 'already_claimed' }); continue; }
    try {
      if (live) {
        // co-owner contact is a rights matter — it goes out as legal@
        await sendMail(env, { to: row.to_email, subject: row.subject, text: row.body,
          from: mailFrom(env, 'legal'), replyTo: 'legal@snowstar.company' });
      } else {
        // domain not verified yet: deliver to Ori with a forward banner
        await sendMail(env, {
          to: env.ALERT_TO,
          subject: `[FORWARD TO: ${row.to_email}] ${row.subject}`,
          text: `─── Forward the text below to ${row.to_name} <${row.to_email}> ───\n\n${row.body}`,
        });
      }
      await env.DB.prepare(
        `UPDATE collaborators SET status = 'notified', updated_at = ?
          WHERE submission_id = ? AND email = ? AND status = 'listed'`
      ).bind(now(), row.submission_id, row.to_email).run();
      results.push({ id, ok: true });
    } catch (e) {
      // release the claim so the send can be retried, and keep the error visible
      await env.DB.prepare(
        `UPDATE mail_outbox SET sent_at = NULL, sent_how = '', last_error = ? WHERE id = ?`
      ).bind(String(e && e.message || e).slice(0, 300), id).run();
      results.push({ id, ok: false, error: 'send_failed' });
    }
  }
  return json({ results, mail_live: live });
}

/* ─────────── collaborator side ─────────── */

/** Tracks this signed-in user is credited on (any account, not only artists). */
export async function myCredits(env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const r = await env.DB.prepare(
    `SELECT c.id, c.share_bp, c.status, c.flag_note, s.title, s.status AS track_status,
            COALESCE(m.name, u.artist_name, u.name, u.email) AS artist
       FROM collaborators c
       JOIN submissions s ON s.id = c.submission_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN managed_artists m ON m.id = s.managed_artist_id
      WHERE c.email = ? OR c.user_id = ?
      ORDER BY c.id DESC`
  ).bind(cleanEmail(user.email), user.id).all();
  return json({ credits: r.results || [] });
}

/** Confirm or dispute a credit. Disputes flag — they never freeze the track. */
export async function respondCredit(req, env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  const row = await env.DB.prepare('SELECT id, email, user_id FROM collaborators WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'not_found' }, 404);
  if (row.email !== cleanEmail(user.email) && row.user_id !== user.id) return json({ error: 'forbidden' }, 403);
  const action = b.action === 'flag' ? 'flagged' : 'joined';
  await env.DB.prepare(
    `UPDATE collaborators SET status = ?, flag_note = ?, user_id = ?, updated_at = ? WHERE id = ?`
  ).bind(action, action === 'flagged' ? String(b.note || '').trim().slice(0, 1000) : '',
         user.id, now(), id).run();
  return json({ ok: true, status: action });
}

/**
 * Hook: link collaborator rows + managed-artist profiles to an account.
 * Runs on EVERY successful sign-in/up (idempotent — all updates are guarded).
 *
 * Linking a credit only lets the person SEE it (status untouched — confirming
 * stays their explicit act, and no money moves without the owner anyway).
 * Claiming a managed-artist profile grants real access (their tracks, artist
 * status), so it requires a VERIFIED email — password signups are unverified
 * and must not be able to claim a ghost profile just by typing its address.
 */
export async function linkOnSignIn(env, userId, email, verified) {
  const e = cleanEmail(email);
  const t = now();
  try {
    await env.DB.prepare(
      `UPDATE collaborators SET user_id = ?, updated_at = ?
        WHERE email = ? AND user_id IS NULL`
    ).bind(userId, t, e).run();
    if (!verified) return;
    const m = await env.DB.prepare(
      'SELECT id, name FROM managed_artists WHERE email = ? AND claimed_user_id IS NULL ORDER BY id'
    ).bind(e).all();
    for (const row of m.results || []) {
      await env.DB.batch([
        env.DB.prepare('UPDATE managed_artists SET claimed_user_id = ? WHERE id = ? AND claimed_user_id IS NULL')
          .bind(userId, row.id),
        env.DB.prepare('UPDATE users SET artist = 1, artist_name = COALESCE(artist_name, ?) WHERE id = ?')
          .bind(row.name, userId),
      ]);
    }
  } catch (err) {
    console.error('linkOnSignIn', err && err.message);
  }
}

/* ─────────── managed (ghost) artists — owner only ─────────── */

export async function listManagedArtists(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const r = await env.DB.prepare(
    'SELECT id, name, email, claimed_user_id FROM managed_artists ORDER BY name'
  ).all();
  return json({ artists: r.results || [] });
}

export async function createManagedArtist(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || '').trim().slice(0, 80);
  const email = cleanEmail(b.email);
  if (name.length < 2) return json({ error: 'name_required' }, 400);
  if (!validEmail(email)) return json({ error: 'email_invalid' }, 400);
  // if this email already has an account, link it now — the OWNER naming the
  // address is the trust anchor here, so no verification gate is needed
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  const r = await env.DB.prepare(
    'INSERT INTO managed_artists (name, email, claimed_user_id, created_at) VALUES (?, ?, ?, ?)'
  ).bind(name, email, existing ? existing.id : null, now()).run();
  if (existing) {
    await env.DB.prepare('UPDATE users SET artist = 1, artist_name = COALESCE(artist_name, ?) WHERE id = ?')
      .bind(name, existing.id).run();
  }
  return json({ ok: true, id: r.meta.last_row_id, name, linked: !!existing });
}

/** The countersign when a claimed artist confirms their on-behalf submissions. */
export async function countersignClaim(req, env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const signedName = String(b.signed_name || '').trim().slice(0, 120);
  if (signedName.length < 2) return json({ error: 'signature_required' }, 400);
  const m = await env.DB.prepare('SELECT id FROM managed_artists WHERE claimed_user_id = ?').bind(user.id).first();
  if (!m) return json({ error: 'nothing_to_claim' }, 400);
  const subs = await env.DB.prepare(
    `SELECT s.id FROM submissions s
      WHERE s.managed_artist_id = ? AND s.id NOT IN
        (SELECT submission_id FROM rights_decls WHERE kind = 'claim' AND signer_user_id = ?)`
  ).bind(m.id, user.id).all();
  const rows = subs.results || [];
  if (!rows.length) return json({ ok: true, countersigned: 0 });
  await freezeText(env, 'claim.v1');
  const t = now();
  await env.DB.batch(rows.map((s) =>
    env.DB.prepare(
      `INSERT INTO rights_decls (submission_id, kind, text_id, signed_name, signer_user_id, acum, splits_snapshot, created_at)
       VALUES (?, 'claim', 'claim.v1', ?, ?, 0, '[]', ?)`
    ).bind(s.id, signedName, user.id, t)));
  return json({ ok: true, countersigned: rows.length });
}

/** What the artist still needs to countersign (drives the dashboard banner). */
export async function claimStatus(env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const m = await env.DB.prepare(
    'SELECT id, name FROM managed_artists WHERE claimed_user_id = ?').bind(user.id).first();
  if (!m) return json({ pending: 0 });
  const c = await env.DB.prepare(
    `SELECT COUNT(*) n FROM submissions s
      WHERE s.managed_artist_id = ? AND s.id NOT IN
        (SELECT submission_id FROM rights_decls WHERE kind = 'claim' AND signer_user_id = ?)`
  ).bind(m.id, user.id).first();
  return json({ pending: c.n, managed_name: m.name, text: RIGHTS_TEXTS['claim.v1'] });
}

/* ─────────── owner corrections to a filed declaration ─────────── */

/**
 * Amend a submission's declaration after the fact.
 *
 * Deliberately NOT a rewrite of the signed record: the frozen text and the
 * original signature stay exactly as filed, because that is the legal
 * artefact. What this edits is the routing copy on top of it — the splits,
 * the controllers, the ACUM flag, the lane — which is what actually drives
 * who gets paid and whether a track can self-serve. A share CHANGE still
 * needs a fresh signature from the artist; this exists for typos, for
 * details the artist gave you by phone, and for tracks you uploaded on
 * their behalf.
 */
export async function amendDeclaration(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!Number.isInteger(id)) return json({ error: 'bad_id' }, 400);

  const sub = await env.DB.prepare('SELECT id, user_id, managed_artist_id FROM submissions WHERE id = ?').bind(id).first();
  if (!sub) return json({ error: 'not_found' }, 404);
  const decl = await env.DB.prepare('SELECT * FROM rights_decls WHERE submission_id = ?').bind(id).first();
  if (!decl) return json({ error: 'no_declaration' }, 404);

  const t = now();
  const stmts = [];

  if (b.acum !== undefined) {
    stmts.push(env.DB.prepare('UPDATE rights_decls SET acum = ? WHERE submission_id = ?')
      .bind(b.acum ? 1 : 0, id));
  }

  if (Array.isArray(b.controllers)) {
    const controllers = b.controllers.slice(0, 10).map((c) => ({
      name: String(c.name || '').trim().slice(0, 120),
      scope: ['recording', 'song', 'both'].includes(c.scope) ? c.scope : 'recording',
      territory: String(c.territory || '').trim().slice(0, 120),
    })).filter((c) => c.name);
    let existing = {};
    try { existing = JSON.parse(decl.controllers || '{}'); } catch {}
    stmts.push(env.DB.prepare('UPDATE rights_decls SET controllers = ? WHERE submission_id = ?')
      .bind(controllers.length || existing.approval
        ? JSON.stringify({ controllers, approval: existing.approval || null })
        : null, id));
  }

  // Splits: replace the live collaborator rows. The snapshot inside the signed
  // declaration is untouched, so the difference between what was signed and
  // what is now routed stays visible and auditable.
  if (Array.isArray(b.collaborators)) {
    const creditedEmail = cleanEmail(user.email);
    const seen = new Set();
    let sumBp = 0;
    const rows = [];
    for (const c of b.collaborators.slice(0, 10)) {
      const name = String(c.name || '').trim().slice(0, 120);
      const email = cleanEmail(c.email);
      const bp = Math.round(Number(c.share_pct) * 100);
      if (name.length < 2 || !validEmail(email) || !Number.isFinite(bp) || bp < 1) continue;
      if (email === creditedEmail || seen.has(email)) continue;
      seen.add(email);
      sumBp += bp;
      rows.push({ name, email, bp });
    }
    if (sumBp > 9999) return json({ error: 'shares_exceed_100' }, 400);
    stmts.push(env.DB.prepare('DELETE FROM collaborators WHERE submission_id = ?').bind(id));
    for (const r of rows) {
      stmts.push(env.DB.prepare(
        `INSERT INTO collaborators (submission_id, name, email, share_bp, user_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, (SELECT id FROM users WHERE email = ?), 'listed', ?, ?)`
      ).bind(id, r.name, r.email, r.bp, r.email, t, t));
    }
  }

  if (b.lane === 'instant' || b.lane === 'quote') {
    stmts.push(env.DB.prepare('UPDATE submissions SET lane = ? WHERE id = ?').bind(b.lane, id));
  }
  if (typeof b.title === 'string' && b.title.trim()) {
    stmts.push(env.DB.prepare('UPDATE submissions SET title = ? WHERE id = ?')
      .bind(b.title.trim().slice(0, 200), id));
  }

  if (!stmts.length) return json({ error: 'nothing_to_update' }, 400);
  await env.DB.batch(stmts);
  return json({ ok: true });
}
