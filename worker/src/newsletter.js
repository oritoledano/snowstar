/**
 * The newsletter.
 *
 * What existed before this: `members.filter(m => m.newsletter).map(m => m.email)`
 * copied to the clipboard, to be pasted into something else. `users.newsletter`
 * had been collected honestly since the first signup and never once used to
 * send anything.
 *
 * Two facts shaped the design.
 *
 * Cloudflare's send_email binding only reaches VERIFIED destinations — in
 * practice the owner — so it physically cannot mail a subscriber. Everything
 * goes through Resend, whose free tier is 100/day. A list of 400 is therefore a
 * queue that drains over days, not a button that fires once, and the queue is
 * built that way from the start so raising the limit later is a number change
 * rather than a rewrite. Sending is switched OFF until somebody turns it on.
 *
 * And an Israeli commercial mailing needs a working opt-out. That is not a
 * footer link bolted on at the end: it needs a per-person token that can be
 * revoked, a List-Unsubscribe header so Gmail offers its own button, and a
 * suppression list keyed by address so an unsubscribe survives the next import.
 * All three are here, and the send refuses to run without them.
 */
import { sendMail, mailLive } from './mail.js';

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
const lc = (s) => String(s || '').trim().toLowerCase();
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** How many we may send per calendar day. Resend's free tier is 100. */
const DAILY_CAP = 90;

const token = () => {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

/* ── the audience ─────────────────────────────────────────────────────────
   Built from what somebody has actually DONE, not from a tag somebody
   remembered to set. Every clause is optional and they compose. */
function audienceSql(a = {}) {
  const where = ['u.email IS NOT NULL', "u.email NOT LIKE '%@users.snowstar.company'"];
  const binds = [];

  /* Opt-in is the default and has to be argued out of, not into. */
  if (a.optedInOnly !== false) where.push('u.newsletter = 1');
  if (a.vertical) { where.push('u.signup_source = ?'); binds.push(a.vertical); }
  if (a.intent) { where.push('u.signup_intent = ?'); binds.push(a.intent); }
  if (a.artistsOnly) where.push('u.artist = 1');
  if (a.hasLicensed) {
    where.push(`EXISTS (SELECT 1 FROM licences l
                         WHERE l.revoked_at IS NULL AND lower(l.email) = lower(u.email))`);
  }
  if (a.hasUploaded) where.push('EXISTS (SELECT 1 FROM submissions s WHERE s.user_id = u.id)');

  /* Never anybody who has opted out, whatever the filter says. */
  where.push('NOT EXISTS (SELECT 1 FROM suppressions x WHERE lower(x.email) = lower(u.email))');
  return { sql: `SELECT u.email, u.name FROM users u WHERE ${where.join(' AND ')} ORDER BY u.created_at`, binds };
}

/** GET /newsletter/audience?… — who this filter reaches, counted and sampled. */
export async function audienceCount(env, user, url) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const a = {
    vertical: url.searchParams.get('vertical') || null,
    intent: url.searchParams.get('intent') || null,
    artistsOnly: url.searchParams.get('artists') === '1',
    hasLicensed: url.searchParams.get('licensed') === '1',
    hasUploaded: url.searchParams.get('uploaded') === '1',
    optedInOnly: url.searchParams.get('all') !== '1',
  };
  const { sql, binds } = audienceSql(a);
  let rows = [];
  try { rows = (await env.DB.prepare(sql).bind(...binds).all()).results || []; } catch { rows = []; }
  const supp = await env.DB.prepare('SELECT COUNT(*) n FROM suppressions').first().catch(() => ({ n: 0 }));
  return json({
    ok: true, audience: a, count: rows.length,
    sample: rows.slice(0, 12).map((r) => r.email),
    suppressed: (supp && supp.n) || 0,
    /* Said plainly rather than discovered on send night. */
    days: Math.max(1, Math.ceil(rows.length / DAILY_CAP)),
    daily_cap: DAILY_CAP,
  });
}

/* ── the two templates ────────────────────────────────────────────────────
   The dark one is mail.js's shell, the cream one is the welcome email's
   register. Both are tables with inline styles because email clients are not
   browsers, and neither loads an image — a newsletter that is one blocked
   picture is a blank message. */
function render(c, { name, unsubUrl }) {
  const paras = String(c.body || '').split(/\n\s*\n/).filter(Boolean);
  const hi = name ? `Hi ${esc(name.split(' ')[0])},` : 'Hi,';
  const cream = c.template === 'cream';
  const ink = cream ? '#241c16' : '#eef3fb';
  const bg = cream ? '#faf7f2' : '#05070e';
  const card = cream ? '#ffffff' : '#0d1322';
  const line = cream ? '#e8dfd3' : 'rgba(151,183,255,.14)';
  const dim = cream ? '#7a6a5c' : '#93a0b8';
  const font = cream ? 'Georgia,"Times New Roman",serif' : 'Helvetica,Arial,sans-serif';

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:${bg};">
  ${c.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.preheader)}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:560px;background:${card};border:1px solid ${line};border-radius:16px;">
        <tr><td style="padding:34px 32px;font-family:${font};color:${ink};">
          <div style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:${dim};margin-bottom:20px;">
            Mutra · Snowstar.Company</div>
          <h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;">${esc(c.subject)}</h1>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.65;">${hi}</p>
          ${paras.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.65;">${
            esc(p).replace(/\n/g, '<br>')}</p>`).join('')}
          <hr style="border:0;border-top:1px solid ${line};margin:26px 0 16px;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:${dim};">
            Snowstar.Company, Tel Aviv, Israel.<br>
            You are getting this because you made an account on snowstar.company.
            <a href="${unsubUrl}" style="color:${dim};">Unsubscribe</a> — one click, no questions.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;

  const text = `${hi}\n\n${paras.join('\n\n')}\n\n—\nSnowstar.Company, Tel Aviv, Israel.\n`
    + `You are getting this because you made an account on snowstar.company.\n`
    + `Unsubscribe: ${unsubUrl}\n`;
  return { html, text };
}

/** POST /newsletter — save a draft, queue it, or stop it. */
export async function saveCampaign(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));

  if (b.stop) {
    await env.DB.prepare("UPDATE campaigns SET status = 'stopped' WHERE id = ?")
      .bind(Number(b.stop)).run();
    return json({ ok: true });
  }

  const subject = String(b.subject || '').trim().slice(0, 200);
  const body = String(b.body || '').trim().slice(0, 20000);
  if (!subject || !body) return json({ error: 'subject_and_body' }, 400);
  const template = b.template === 'cream' ? 'cream' : 'dark';
  const audience = b.audience && typeof b.audience === 'object' ? b.audience : {};

  let id = Number(b.id) || null;
  if (id) {
    await env.DB.prepare(
      `UPDATE campaigns SET subject = ?, preheader = ?, body = ?, template = ?, audience = ?
        WHERE id = ? AND status = 'draft'`
    ).bind(subject, String(b.preheader || '').slice(0, 200), body, template,
           JSON.stringify(audience), id).run();
  } else {
    const r = await env.DB.prepare(
      `INSERT INTO campaigns (subject, preheader, body, template, audience, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?)`
    ).bind(subject, String(b.preheader || '').slice(0, 200), body, template,
           JSON.stringify(audience), now()).run();
    id = r.meta.last_row_id;
  }

  /* Queueing builds the recipient rows now, so the list is frozen at the
     moment you pressed the button. A queue that re-ran the filter each day
     would mail somebody who joined halfway through a send. */
  if (b.queue) {
    const { sql, binds } = audienceSql(audience);
    const people = (await env.DB.prepare(sql).bind(...binds).all()).results || [];
    for (const p of people) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO campaign_sends (campaign_id, email, name, token)
         VALUES (?, ?, ?, ?)`
      ).bind(id, lc(p.email), p.name || null, token()).run().catch(() => {});
    }
    await env.DB.prepare("UPDATE campaigns SET status = 'queued', queued_at = ? WHERE id = ?")
      .bind(now(), id).run();
    return json({ ok: true, id, queued: people.length });
  }
  return json({ ok: true, id });
}

/** POST /newsletter/test — send it to yourself, with a real unsubscribe link. */
export async function testCampaign(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const c = await env.DB.prepare('SELECT * FROM campaigns WHERE id = ?').bind(Number(b.id)).first();
  if (!c) return json({ error: 'not_found' }, 404);
  const t = 'test-' + token();
  const { html, text } = render(c, {
    name: user.name, unsubUrl: `https://snowstar.company/api/n/u?t=${t}`,
  });
  try {
    await sendMail(env, {
      to: user.email, subject: '[test] ' + c.subject, text, html,
      headers: unsubHeaders(`https://snowstar.company/api/n/u?t=${t}`),
    });
  } catch (e) { return json({ error: 'send_failed', detail: String(e.message || e).slice(0, 160) }, 502); }
  return json({ ok: true, to: user.email });
}

/* Gmail and Outlook show their own one-click unsubscribe when these are
   present, and treat mail without them as more likely to be bulk. The POST
   variant is what makes it one click rather than a page visit. */
export function unsubHeaders(url) {
  return {
    'List-Unsubscribe': `<${url}>, <mailto:hello@snowstar.company?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/**
 * The drain. Called from cron; sends at most DAILY_CAP per run.
 *
 * Off unless config.newsletter-sending is 'on'. Everything else here works
 * without that — drafts, audiences, previews and a test to yourself — so the
 * decision about paying for throughput can be made after seeing a real draft
 * rather than before.
 */
export async function drainCampaigns(env, limit = DAILY_CAP) {
  const cfg = await env.DB.prepare("SELECT html FROM site_texts WHERE key = 'config.newsletter-sending'")
    .first().catch(() => null);
  if (!cfg || String(cfg.html).trim() !== 'on') return { skipped: 'sending_off' };
  if (!mailLive(env)) return { skipped: 'mail_not_live' };

  const rows = (await env.DB.prepare(
    `SELECT s.id, s.campaign_id, s.email, s.name, s.token, c.*
       FROM campaign_sends s JOIN campaigns c ON c.id = s.campaign_id
      WHERE s.sent_at IS NULL AND s.failed_at IS NULL
        AND c.status IN ('queued', 'sending')
      ORDER BY s.id LIMIT ?`).bind(limit).all()).results || [];
  if (!rows.length) return { sent: 0 };

  let sent = 0;
  for (const r of rows) {
    /* Checked again at send time, not only at queue time — somebody can
       unsubscribe while a five-day send is still running, and the whole point
       of an opt-out is that it takes effect. */
    const off = await env.DB.prepare('SELECT 1 FROM suppressions WHERE lower(email) = ?')
      .bind(lc(r.email)).first().catch(() => null);
    if (off) {
      await env.DB.prepare("UPDATE campaign_sends SET failed_at = ?, last_error = 'suppressed' WHERE id = ?")
        .bind(now(), r.id).run();
      continue;
    }
    const url = `https://snowstar.company/api/n/u?t=${r.token}`;
    const { html, text } = render(r, { name: r.name, unsubUrl: url });
    try {
      await sendMail(env, { to: r.email, subject: r.subject, text, html, headers: unsubHeaders(url) });
      await env.DB.prepare('UPDATE campaign_sends SET sent_at = ? WHERE id = ?').bind(now(), r.id).run();
      sent++;
    } catch (e) {
      await env.DB.prepare('UPDATE campaign_sends SET failed_at = ?, last_error = ? WHERE id = ?')
        .bind(now(), String(e.message || e).slice(0, 200), r.id).run();
    }
  }
  /* Mark finished campaigns done, so a queue that is empty stops being 'sending'. */
  await env.DB.prepare(
    `UPDATE campaigns SET status = 'sent', done_at = ?
      WHERE status IN ('queued','sending')
        AND NOT EXISTS (SELECT 1 FROM campaign_sends s
                         WHERE s.campaign_id = campaigns.id AND s.sent_at IS NULL AND s.failed_at IS NULL)`
  ).bind(now()).run().catch(() => {});
  return { sent, remaining: rows.length - sent };
}

/**
 * GET or POST /n/u?t=… — unsubscribe. Public, obviously.
 *
 * One click, no sign-in, no confirmation step. A confirmation step on an
 * unsubscribe is a way of keeping people on a list against their wishes, and
 * Gmail's one-click button sends a POST that no human will ever see.
 */
export async function unsubscribe(req, env, url) {
  const t = String(url.searchParams.get('t') || '').slice(0, 64);
  const page = (title, msg) => new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${title}</title>
     <body style="margin:0;background:#05070e;color:#eef3fb;font-family:Helvetica,Arial,sans-serif;
                  display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px">
       <div style="max-width:420px">
         <p style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#93a0b8">Snowstar.Company</p>
         <h1 style="font-size:22px;margin:12px 0">${title}</h1>
         <p style="color:#93a0b8;line-height:1.6;font-size:15px">${msg}</p>
         <p><a href="https://snowstar.company/mutra.html" style="color:#e8b98a">Back to the catalogue</a></p>
       </div></body>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

  if (!t) return page('That link is incomplete', 'Write to hello@snowstar.company and we will take you off by hand.');
  const row = await env.DB.prepare('SELECT email FROM campaign_sends WHERE token = ?').bind(t).first()
    .catch(() => null);
  if (!row) {
    /* A test link, or one already used. Say it worked rather than explaining
       our internals to somebody who just wants out. */
    return page('You are unsubscribed', 'You will not get the newsletter again.');
  }
  await env.DB.prepare(
    "INSERT INTO suppressions (email, reason, ts) VALUES (?, 'unsubscribed', ?) ON CONFLICT(email) DO NOTHING"
  ).bind(lc(row.email), now()).run().catch(() => {});
  await env.DB.prepare('UPDATE campaign_sends SET unsub_at = ? WHERE token = ?').bind(now(), t).run().catch(() => {});
  await env.DB.prepare('UPDATE users SET newsletter = 0 WHERE lower(email) = ?').bind(lc(row.email)).run().catch(() => {});
  return page('You are unsubscribed', `${esc(row.email)} will not get the newsletter again. `
    + 'Anything to do with a licence or a track you sent us still reaches you — that is not marketing.');
}

/** GET /newsletter — the drafts, the sends and the suppression list. */
export async function listCampaigns(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const soft = async (sql) => {
    try { return (await env.DB.prepare(sql).all()).results || []; } catch { return []; }
  };
  const sending = await env.DB.prepare(
    "SELECT html FROM site_texts WHERE key = 'config.newsletter-sending'").first().catch(() => null);
  return json({
    campaigns: await soft(
      `SELECT c.*,
              (SELECT COUNT(*) FROM campaign_sends s WHERE s.campaign_id = c.id) AS total,
              (SELECT COUNT(*) FROM campaign_sends s WHERE s.campaign_id = c.id AND s.sent_at IS NOT NULL) AS sent,
              (SELECT COUNT(*) FROM campaign_sends s WHERE s.campaign_id = c.id AND s.unsub_at IS NOT NULL) AS unsubs
         FROM campaigns c ORDER BY c.id DESC LIMIT 50`),
    suppressed: await soft('SELECT email, reason, ts FROM suppressions ORDER BY ts DESC LIMIT 200'),
    sending: sending ? String(sending.html).trim() === 'on' : false,
    daily_cap: DAILY_CAP,
  });
}
