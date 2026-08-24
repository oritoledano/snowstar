/**
 * Get in touch.
 *
 * The point of this endpoint is not to collect messages — a mailto did that.
 * It is to make the message ANSWERABLE by one person: it arrives already
 * sorted, with the two or three facts that decide the reply, and with a
 * reference so a follow-up joins the same thread instead of starting a new one.
 *
 * Six of the eleven leaves in the funnel never reach here at all. They hand off
 * to machinery that already exists — the licence funnel, the artist portal, the
 * account panel — because the fastest support reply is the one nobody has to
 * write. What lands here is only what genuinely needs a human.
 *
 * FIELDS: email and message, and nothing else by default. Phone, country and
 * address were asked for and are deliberately absent — see the note on the
 * schema below. Extra fields appear only on the leaves that cannot be answered
 * without them: a video URL for a Content ID claim, a track title for a rights
 * dispute, the project brief for a quote.
 */

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const clean = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* Which inbox each branch is labelled for. All five addresses forward to the
   same mailbox, so this is a FILTER LABEL rather than five inboxes — which is
   the only reason five is affordable for one person. */
const ROUTES = {
  'a2-quote':    { to: 'licensing', priority: 'quote',  label: 'Quote request' },
  'a3-question': { to: 'licensing', priority: null,     label: 'Pre-sales question' },
  'b1-claim':    { to: 'licensing', priority: 'claim',  label: 'CLAIM' },
  'b2-account':  { to: 'licensing', priority: null,     label: 'Licence / invoice' },
  'b3-renew':    { to: 'licensing', priority: null,     label: 'Renewal or change' },
  'c2-artist':   { to: 'artists',   priority: null,     label: 'Artist in catalogue' },
  'd1-rights':   { to: 'legal',     priority: 'rights', label: 'RIGHTS' },
  'd3-other':    { to: 'hello',     priority: null,     label: 'General' },
};

/** Short, unambiguous, easy to read down a phone. No I/O/0/1. */
function makeRef() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const b = crypto.getRandomValues(new Uint8Array(4));
  for (const x of b) out += A[x % A.length];
  return 'MSG-' + out;
}

/**
 * POST /contact
 *
 * Public and unauthenticated on purpose: the people most likely to need it —
 * someone whose video just got claimed, a co-owner who has found their song in
 * a catalogue they never agreed to — are exactly the people who do not have an
 * account and should not be made to create one first.
 */
export async function submitContact(req, env) {
  const b = await req.json().catch(() => ({}));

  const branch = clean(b.branch, 40);
  const route = ROUTES[branch];
  if (!route) return json({ error: 'bad_branch' }, 400);

  const email = clean(b.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ error: 'bad_email' }, 400);

  const message = clean(b.message, 4000);
  if (message.length < 10) return json({ error: 'message_too_short' }, 400);

  // Spam, without a CAPTCHA. A CAPTCHA costs completions and blocks assistive
  // tech, and the traffic here is far too small to warrant it. A honeypot the
  // human never sees, plus the fact that no human fills a form in under three
  // seconds, catches the drive-by bots that are the whole realistic threat.
  if (clean(b.hp, 100)) return json({ ok: true, ref: makeRef() });   // silent drop
  const dwell = Number(b.t) ? (Date.now() - Number(b.t)) / 1000 : 99;
  if (dwell < 3) return json({ ok: true, ref: makeRef() });

  const ip = req.headers.get('cf-connecting-ip') || '';
  try {
    const recent = await env.DB.prepare(
      'SELECT COUNT(*) n FROM messages WHERE ip = ? AND created_at > ?'
    ).bind(ip, now() - 3600).first();
    if ((recent?.n || 0) >= 5) return json({ error: 'rate_limited' }, 429);
  } catch { /* the table may not exist yet — never block a message on that */ }

  const ref = makeRef();
  const t = now();
  try {
    await env.DB.prepare(
      `INSERT INTO messages
         (ref, branch, priority, email, name, message, order_ref, video_url,
          platform, track, ip, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`
    ).bind(ref, branch, route.priority, email, clean(b.name, 120), message,
           clean(b.order_ref, 40), clean(b.video_url, 400), clean(b.platform, 40),
           clean(b.track, 140), ip, t).run();
  } catch (e) {
    return json({ error: 'save_failed', detail: String(e).slice(0, 160) }, 500);
  }

  // The owner hears about it. Claims and rights disputes have a clock on them
  // and always go, even if contact alerts are muted — muting "a message came
  // in" should not silence a legal notice.
  try {
    const { alert } = await import('./analytics.js');
    const urgent = route.priority === 'claim' || route.priority === 'rights';
    const text = `${route.label} · ${ref}\n\n`
      + `From:  ${email}${b.name ? ' (' + clean(b.name, 120) + ')' : ''}\n`
      + (b.track ? `Track: ${clean(b.track, 140)}\n` : '')
      + (b.video_url ? `Video: ${clean(b.video_url, 400)}\n` : '')
      + (b.platform ? `Where: ${clean(b.platform, 40)}\n` : '')
      + (b.order_ref ? `Ref:   ${clean(b.order_ref, 40)}\n` : '')
      + `\n${message}\n\nInbox: https://snowstar.company/dashboard.html\n`;
    await alert(env, 'contact',
      `[${route.label}] ${ref} — ${clean(b.track || b.video_url || email, 70)}`,
      text, { force: urgent });
  } catch { /* the message is saved; a failed alert must not lose it */ }

  return json({ ok: true, ref });
}

/** GET /messages — the owner's inbox. */
export async function listMessages(env, user, url) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const status = clean(url.searchParams.get('status') || 'new', 20);
  const r = await env.DB.prepare(
    `SELECT * FROM messages WHERE status = ? ORDER BY
       CASE priority WHEN 'claim' THEN 0 WHEN 'rights' THEN 1 ELSE 2 END, id DESC
     LIMIT 200`
  ).bind(status).all().catch(() => ({ results: [] }));
  const counts = await env.DB.prepare(
    'SELECT status, COUNT(*) n FROM messages GROUP BY status'
  ).all().catch(() => ({ results: [] }));
  return json({
    messages: r.results || [],
    counts: Object.fromEntries((counts.results || []).map((x) => [x.status, x.n])),
  });
}

/** POST /messages/status — open / done. */
export async function setMessageStatus(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  const status = clean(b.status, 12);
  if (!Number.isInteger(id) || !['new', 'open', 'done'].includes(status)) {
    return json({ error: 'bad_request' }, 400);
  }
  await env.DB.prepare('UPDATE messages SET status = ? WHERE id = ?').bind(status, id).run();
  return json({ ok: true });
}
