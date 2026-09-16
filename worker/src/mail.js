/**
 * Outbound email.
 *
 * Cloudflare's send_email binding only reaches *verified destination* addresses
 * (in practice: the site owner), so it can't send a stranger their reset link.
 * Resend can, from our own verified sending domain.
 */

const RESEND = 'https://api.resend.com/emails';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/**
 * Per-purpose sender identities. These only come into play once our OWN
 * domain is verified with Resend — until then MAIL_FROM is still the
 * provider's sandbox address, which may only deliver to the account owner,
 * so sending "from legal@snowstar.company" would simply be rejected.
 * mailLive() is the switch, and everything below falls back to today's
 * behaviour while it's false.
 */
export const mailLive = (env) => !(env.MAIL_FROM || '').includes('resend.dev');

/* The apex is verified in Resend for SENDING, and Cloudflare Email Routing
   handles the same domain for RECEIVING — the two coexist because Resend signs
   with DKIM and bounces via a send.* subdomain, leaving the apex MX and SPF to
   Cloudflare. So we can now send from the same addresses people write to.
   ORIGINAL NOTE, kept because the trap is still live:
   Resend will verify send.snowstar.company (a subdomain, so the apex MX and
   SPF that Cloudflare Email Routing owns stay untouched). Everything we SEND
   must therefore come from @send.snowstar.company: Resend rejects a From on a
   domain it has not verified with a 403, so pointing these at the apex would
   have broken every kinded message the moment MAIL_FROM was flipped.
   Replies still go to the apex, which Email Routing already delivers. */
const SEND_DOMAIN = 'snowstar.company';
const SENDERS = {
  submissions: `Mutra Submissions <submissions@${SEND_DOMAIN}>`,
  artists:     `Mutra Artists <artists@${SEND_DOMAIN}>`,
  legal:       `Snowstar Legal <legal@${SEND_DOMAIN}>`,
};

/** From: header for a given kind of message. */
export const mailFrom = (env, kind) =>
  (mailLive(env) && SENDERS[kind]) || env.MAIL_FROM || SENDERS.artists;

/** Internal destination for a given kind — the branded inbox once it can
 *  actually be delivered to, otherwise the owner's alert address. */
export const mailTo = (env, kind) =>
  // apex on purpose: this is where mail is RECEIVED, and Cloudflare Email
  // Routing already delivers @snowstar.company. Nothing to verify with Resend.
  mailLive(env) ? `${kind}@snowstar.company` : env.ALERT_TO;

/** Wrap body copy in the Snowstar shell — dark, plain, no images to block. */
function shell(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#05070e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070e;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:480px;background:#0d1322;border:1px solid rgba(151,183,255,.14);border-radius:16px;">
        <tr><td style="padding:32px 30px;font-family:Helvetica,Arial,sans-serif;color:#eef3fb;">
          <div style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#8fd8ff;margin-bottom:18px;">
            Snowstar.Company
          </div>
          <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#eef3fb;font-weight:600;">${title}</h1>
          ${bodyHtml}
        </td></tr>
      </table>
      <div style="max-width:480px;margin:16px auto 0;font-family:Helvetica,Arial,sans-serif;
                  font-size:11px;line-height:1.6;color:#5f6b82;text-align:center;">
        Snowstar.Company · Tel Aviv · <a href="https://snowstar.company" style="color:#5f6b82;">snowstar.company</a>
      </div>
    </td></tr>
  </table></body></html>`;
}

export async function sendMail(env, { to, subject, text, html, from, replyTo, attachments, headers }) {
  if (!env.RESEND_KEY) throw new Error('no_mail_key');
  const res = await fetch(RESEND, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: from || env.MAIL_FROM || 'SNOWSTAR.COMPANY <hello@send.snowstar.company>',
      reply_to: replyTo || 'hello@snowstar.company',
      to: [to],
      subject,
      text,
      html,
      // [{filename, content}] where content is base64. Resend caps the whole
      // message at 40MB; callers are expected to have checked their own size
      // before getting here.
      ...(attachments && attachments.length ? { attachments } : {}),
      /* Custom headers. Needed for List-Unsubscribe, without which Gmail shows
         no unsubscribe button of its own and treats the message as more likely
         to be bulk — so a newsletter that passed them here and was silently
         dropped would have been compliant on paper and in the spam folder. */
      ...(headers && Object.keys(headers).length ? { headers } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`mail_failed ${res.status} ${detail.slice(0, 200)}`);
  }
  const out = await res.json();

  /* Keep a copy. Fifteen call sites across eight files send mail, and none of
     them recorded anything — mail_outbox is a send QUEUE that only ever held
     co-owner invites, so the welcome, the password reset, the licence and its
     audio, the quote receipt and every StreamDAW delivery left no trace at all.
     Wrapping the send is the one change that catches all of them.

     Deliberately after the send and deliberately swallowed: a person who got
     their licence must never be told it failed because we could not file a copy. */
  try { await recordMessage(env, to, subject, text || html, from, out && out.id); }
  catch { /* the mail went; the filing is secondary */ }
  return out;
}

/* Which desk it came from. Derived from the sending address, which already
   varies by kind (submissions@, artists@, legal@), so no caller has to change
   and no caller can forget. */
const DEPARTMENTS = [
  [/legal@/i, 'legal'],
  [/submissions@/i, 'submissions'],
  [/artists@/i, 'artist'],
  [/licensing@/i, 'licensing'],
  [/alerts@/i, 'system'],
];
export function departmentOf(from) {
  const f = String(from || '');
  for (const [re, name] of DEPARTMENTS) if (re.test(f)) return name;
  return 'system';
}

async function recordMessage(env, to, subject, body, from, providerId) {
  if (!env.DB || !to) return;
  const email = String(to).trim().toLowerCase();
  /* Owner alerts are not messages TO a customer — they would put our own
     internal warnings in somebody's inbox if the addresses ever collided. */
  if (email === String(env.ALERT_TO || '').toLowerCase() && /alerts@/i.test(String(from || ''))) return;
  const uid = await env.DB.prepare('SELECT id FROM users WHERE lower(email) = ?')
    .bind(email).first().then((r) => (r ? r.id : null)).catch(() => null);
  await env.DB.prepare(
    `INSERT INTO user_messages (email, user_id, department, subject, body, sent_at, provider_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(email, uid, departmentOf(from), String(subject || '').slice(0, 300),
         String(body || '').slice(0, 20000), Math.floor(Date.now() / 1000),
         String(providerId || '').slice(0, 80) || null).run();
}

export function resetEmail(link, minutes) {
  const subject = 'Reset your Snowstar password';
  const text =
    `Someone asked to reset the password for your Snowstar account.\n\n` +
    `Open this link to choose a new one:\n${link}\n\n` +
    `The link works once and expires in ${minutes} minutes.\n\n` +
    `If this wasn't you, ignore this email — your password stays as it is.\n`;
  const html = shell('Reset your password', `
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#93a0b8;">
      Someone asked to reset the password for your Snowstar account. Choose a new one here:
    </p>
    <p style="margin:0 0 22px;">
      <a href="${link}" style="display:inline-block;padding:13px 26px;border-radius:99px;
         background:#22d3ee;color:#05070e;font-weight:600;font-size:15px;text-decoration:none;">
        Set a new password
      </a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#93a0b8;">
      The link works once and expires in ${minutes} minutes.
    </p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#5f6b82;">
      If this wasn't you, ignore this email — your password stays as it is.
    </p>`);
  return { subject, text, html };
}

/* ═══════════ Welcome ═══════════════════════════════════════════════════════
   One template, four front doors. Somebody who signs up on Mutra is welcomed
   to MUTRA — not to a company they have never heard of — and the family is
   introduced underneath, briefly, as the reason the one account works
   everywhere. Sent from every signup path (password and OAuth), never allowed
   to fail the signup itself.

   Table markup and inline styles on purpose: email clients are not browsers,
   and a stylesheet here would arrive as plain text in half of them. */
const SITE = 'https://snowstar.company';
const PRODUCTS = {
  mutra: {
    name: 'Mutra',
    line: 'Music chosen by brands, licensed in minutes.',
    blurb: 'Your account keeps your licences, your downloads and anything you favourite. '
         + 'Every track is written in-house and cleared, so what you licence is what you get.',
    cta: ['Browse the catalogue', '/mutra.html'],
  },
  streamdaw: {
    name: 'StreamDAW',
    line: 'Your master bus, in their pocket.',
    blurb: 'Your licence lives on this account, so a new machine only ever needs a sign-in '
         + 'and a re-download.',
    cta: ['Open StreamDAW', '/apps/streamdaw.html'],
  },
  snowstash: {
    name: 'Snowstash',
    line: 'Find the royalties nobody paid you.',
    blurb: 'Your reports stay on this account — run a check now, come back to the findings later.',
    cta: ['Run a check', '/snowstash.html'],
  },
  snowstar: {
    name: 'Snowstar',
    line: 'Original music, sound design and audio branding.',
    blurb: 'One account covers everything we make.',
    cta: ['See the work', '/'],
  },
};
const ORDER = ['mutra', 'streamdaw', 'snowstash'];

export function welcomeEmail({ name, product }) {
  const key = PRODUCTS[product] ? product : 'snowstar';
  const p = PRODUCTS[key];
  const hi = name ? `Hi ${name},` : 'Hi,';
  const others = ORDER.filter((k) => k !== key).map((k) => PRODUCTS[k]);

  const subject = `Welcome to ${p.name} — powered by Snowstar`;

  const text = `${hi}

Welcome to ${p.name}. ${p.line}

${p.blurb}

${p.cta[0]}: ${SITE}${p.cta[1]}

— — —

The same login also opens:
${others.map((o) => `· ${o.name} — ${o.line}  ${SITE}${o.cta[1]}`).join('\n')}

Anything at all, just reply — this reaches a person.

Snowstar.Company, Tel Aviv
${SITE}`;

  const card = (o) => `
    <tr>
      <td style="padding:10px 0;border-top:1px solid #e6dfd5">
        <a href="${SITE}${o.cta[1]}" style="color:#17140d;text-decoration:none;font-weight:600;font-size:15px">${o.name}</a>
        <div style="color:#6f6862;font-size:13px;line-height:1.5;margin-top:2px">${o.line}</div>
      </td>
    </tr>`;

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#faf7f2">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2;padding:28px 16px">
   <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0"
           style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e6dfd5;border-radius:14px">
      <tr><td style="padding:30px 32px 8px">
        <div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#b97e1e">Powered by Snowstar</div>
        <h1 style="margin:10px 0 6px;font:700 26px/1.2 Georgia,'Times New Roman',serif;color:#231f1c">
          Welcome to ${p.name}.</h1>
        <p style="margin:0;color:#6f6862;font:400 15px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
          ${p.line}</p>
      </td></tr>
      <tr><td style="padding:14px 32px 0">
        <p style="margin:0 0 18px;color:#231f1c;font:400 15px/1.65 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
          ${hi} ${p.blurb}</p>
        <a href="${SITE}${p.cta[1]}"
           style="display:inline-block;background:#17140d;color:#ffe9d8;text-decoration:none;
                  font:600 14px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                  padding:13px 22px;border-radius:99px">${p.cta[0]} &rarr;</a>
      </td></tr>
      <tr><td style="padding:26px 32px 6px">
        <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#8b8378;
                    font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
          The same login also opens</div>
      </td></tr>
      <tr><td style="padding:0 32px 8px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
          ${others.map(card).join('')}
        </table>
      </td></tr>
      <tr><td style="padding:18px 32px 30px">
        <p style="margin:0;color:#8b8378;font:400 13px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
          Anything at all, just reply — this reaches a person.<br>
          Snowstar.Company · Tel Aviv</p>
      </td></tr>
    </table>
   </td></tr>
  </table></body></html>`;

  return { subject, text, html };
}

/**
 * GET /messages/mine — the person's own inbox.
 *
 * Matched on email OR id, the same rule myLicences uses: somebody can be sent
 * mail before they have an account, and the account should pick it up when it
 * arrives rather than starting them at zero.
 */
export async function myMessages(env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const email = String(user.email || '').toLowerCase();
  let rows = [];
  try {
    rows = (await env.DB.prepare(
      `SELECT id, department, subject, body, sent_at, read_at
         FROM user_messages
        WHERE lower(email) = ? OR (user_id IS NOT NULL AND user_id = ?)
        ORDER BY sent_at DESC LIMIT 100`).bind(email, user.id).all()).results || [];
  } catch { rows = []; }
  return json({ messages: rows, unread: rows.filter((m) => !m.read_at).length });
}

/** POST /messages/read — { id } or { all: true }. */
export async function markMessageRead(req, env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const email = String(user.email || '').toLowerCase();
  const t = Math.floor(Date.now() / 1000);
  try {
    if (b.all) {
      await env.DB.prepare(
        `UPDATE user_messages SET read_at = ?
          WHERE read_at IS NULL AND (lower(email) = ? OR user_id = ?)`).bind(t, email, user.id).run();
    } else {
      /* Scoped to them in the WHERE, not checked beforehand — an id is a
         guessable integer and this is the only thing standing between one
         person's inbox and another's. */
      await env.DB.prepare(
        `UPDATE user_messages SET read_at = ?
          WHERE id = ? AND (lower(email) = ? OR user_id = ?)`)
        .bind(t, Number(b.id), email, user.id).run();
    }
  } catch { /* nothing to do */ }
  return json({ ok: true });
}
