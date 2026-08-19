/**
 * Outbound email.
 *
 * Cloudflare's send_email binding only reaches *verified destination* addresses
 * (in practice: the site owner), so it can't send a stranger their reset link.
 * Resend can, from our own verified sending domain.
 */

const RESEND = 'https://api.resend.com/emails';

/**
 * Per-purpose sender identities. These only come into play once our OWN
 * domain is verified with Resend — until then MAIL_FROM is still the
 * provider's sandbox address, which may only deliver to the account owner,
 * so sending "from legal@snowstar.company" would simply be rejected.
 * mailLive() is the switch, and everything below falls back to today's
 * behaviour while it's false.
 */
export const mailLive = (env) => !(env.MAIL_FROM || '').includes('resend.dev');

const SENDERS = {
  submissions: 'Mutra Submissions <submissions@snowstar.company>',
  artists:     'Mutra Artists <artists@snowstar.company>',
  legal:       'Snowstar Legal <legal@snowstar.company>',
};

/** From: header for a given kind of message. */
export const mailFrom = (env, kind) =>
  (mailLive(env) && SENDERS[kind]) || env.MAIL_FROM || SENDERS.artists;

/** Internal destination for a given kind — the branded inbox once it can
 *  actually be delivered to, otherwise the owner's alert address. */
export const mailTo = (env, kind) =>
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

export async function sendMail(env, { to, subject, text, html, from, replyTo }) {
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
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`mail_failed ${res.status} ${detail.slice(0, 200)}`);
  }
  return res.json();
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
