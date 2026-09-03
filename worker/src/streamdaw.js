/**
 * StreamDAW — sell the app, deliver the installer.
 *
 * Snowstar's first software product, and the first thing sold on a basis other
 * than a per-track music licence. It reuses the site-wide account (one login
 * for Mutra + StreamDAW + whatever's next) but keeps its own "what you own" in
 * `entitlements` (see schema-streamdaw.sql), because a music licence and an app
 * entitlement are different shapes.
 *
 * Payments go through HYP — the SAME gateway and terminal Mutra uses — so no new
 * processor, and the money stays on the Israeli books. HYP has NO webhook: the
 * only completion signal is the buyer's browser landing on /api/hyp/return,
 * which hyp.js verifies against HYP's own servers and then dispatches here by
 * the SD- reference prefix. Nothing is granted on the redirect's word alone.
 *
 * Flow:
 *   buy page → POST /api/streamdaw/checkout  → { url } to HYP's signed pay page
 *   HYP      → GET  /api/hyp/return (SD-…)    → verified → grant + email link
 *   buyer    → GET  /api/streamdaw/download?t=… → stream the installer from R2
 *   member   → GET  /api/streamdaw/mine        → dashboard: owned? + re-download
 *
 * One-time ('lifetime') by default; `plan` + `expires_at` exist so a future
 * subscription needs no migration.
 */

import { sendMail } from './mail.js';
import { currentUser } from './session.js';
import { sha256b64, randB64 } from './crypto.js';
import { parseHyp, verifyReturn } from './hyp.js';

const BASE = 'https://pay.hyp.co.il/cgi-bin/yaadpay/yaadpay3ds.pl';
const SITE = 'https://snowstar.company';
const PRODUCT = 'streamdaw';
const ASSET = 'streamdaw-macos';
const TOKEN_TTL = 7 * 24 * 3600;         // emailed download link good for 7 days

// Price in agorot INCL VAT — HYP charges shekels, so StreamDAW is priced in ₪.
// ₪249 ≈ $69. Change here and on the buy page together.
const PRICE_GROSS = 24900;
const VAT = 1.18;

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
const lc = (e) => (e || '').trim().toLowerCase();
const validEmail = (e) => typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const urlToken = (n = 32) => randB64(n).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hypConfigured = (env) => !!(env.HYP_TERMINAL && env.HYP_API_KEY && env.HYP_PASSP);

// ── 1. Checkout: create an order, hand back HYP's signed pay URL ────────────
export async function streamdawCheckout(req, env) {
  if (!hypConfigured(env)) return json({ error: 'hyp_not_configured' }, 503);

  const user = await currentUser(req, env).catch(() => null);
  const body = await req.json().catch(() => ({}));
  const email = lc(user?.email || body.email);
  if (!validEmail(email)) return json({ error: 'email_required' }, 400);

  // SD- + short id; matches HYP's Order regex and lets hyp.js dispatch by prefix.
  const ref = 'SD-' + urlToken(9).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10).padEnd(6, 'X');
  const gross = PRICE_GROSS;
  const shekels = (gross / 100).toFixed(2);

  await env.DB.prepare(
    `INSERT INTO streamdaw_orders (ref, user_id, email, plan, amount, currency, status, created_at)
     VALUES (?, ?, ?, 'lifetime', ?, 'ILS', 'started', ?)`
  ).bind(ref, user?.id || null, email, gross, now()).run();

  // APISign — mirrors the music checkout's signing, including the gotchas the
  // comments in hyp.js were written in blood for: signMe=1 (or the return
  // carries no Sign and every real payment reads as a failure), and using HYP's
  // response VERBATIM as the pay URL (rebuilding it breaks the signature).
  const p = new URLSearchParams({
    action: 'APISign', What: 'SIGN',
    Masof: env.HYP_TERMINAL, KEY: env.HYP_API_KEY, PassP: env.HYP_PASSP,
    Amount: shekels, Coin: '1',
    Info: `StreamDAW ${ref}`, Order: ref,
    UTF8: 'True', UTF8out: 'True', signMe: '1', MoreData: 'True',
    PageLang: 'ENG', tmp: '1', ClientName: email, email,
    SendHesh: 'True', Postpone: 'False', J5: 'False',
  });

  const res = await fetch(`${BASE}?${p.toString()}`);
  const text = await res.text();
  if (/^\s*</.test(text)) return json({ error: 'hyp_system_error' }, 502);
  const d = parseHyp(text);
  if (!d.signature) return json({ error: 'hyp_sign_failed', ccode: d.CCode || null }, 502);

  return json({ ok: true, url: `${BASE}?${text.trim()}`, ref, amount_gross: gross });
}

// ── 2. The verified return (dispatched from hyp.js by the SD- prefix) ───────
export async function streamdawReturn(req, env, raw, q) {
  const ref = String(q.Order || '');
  const fail = (why) => Response.redirect(`${SITE}/apps/streamdaw.html?pay=failed&reason=${encodeURIComponent(why)}`, 302);

  if (q.CCode !== '0') {
    await env.DB.prepare(`UPDATE streamdaw_orders SET status='declined' WHERE ref=?`).bind(ref).run().catch(() => {});
    return fail('declined');
  }

  // HYP itself must confirm the parameter set — the redirect is unauthenticated.
  const v = await verifyReturn(env, raw);
  const order = await env.DB.prepare(`SELECT * FROM streamdaw_orders WHERE ref=?`).bind(ref).first();
  if (!order) return fail('unknown_ref');
  if (order.status === 'granted') return Response.redirect(`${SITE}/apps/streamdaw.html?bought=1&ref=${encodeURIComponent(ref)}`, 302);

  if (!v.ok) {
    // The dangerous case: a redirect that asserts a real capture we couldn't
    // verify means the card may have been charged. Don't grant on an unverified
    // claim, but don't tell the buyer it failed either — flag it for the owner.
    const paid = Math.round(parseFloat(String(q.Amount || '0')) * 100);
    const looksCharged = /^[0-9]{4,}$/.test(String(q.ACode || '')) && paid === order.amount;
    if (looksCharged) {
      await env.DB.prepare(`UPDATE streamdaw_orders SET status='charged_unverified', hyp_id=? WHERE ref=?`)
        .bind(String(q.Id || ''), ref).run().catch(() => {});
      await sendMail(env, {
        to: env.ALERT_TO || 'oritoledano@gmail.com', subject: 'StreamDAW: card charged but not verified',
        text: `Order ${ref}: HYP Id ${q.Id || ''}, auth ${q.ACode || ''}, ${q.Amount || ''} ILS.\n`
            + `Charged but VERIFY did not confirm — entitlement NOT granted automatically. Reconcile in HYP.`,
      }).catch(() => {});
      return Response.redirect(`${SITE}/apps/streamdaw.html?pay=confirming&ref=${encodeURIComponent(ref)}`, 302);
    }
    await env.DB.prepare(`UPDATE streamdaw_orders SET status='verify_failed', hyp_id=? WHERE ref=?`)
      .bind(String(q.Id || ''), ref).run().catch(() => {});
    return fail('unverified');
  }

  // Amount must equal what we priced (integers), shekels only.
  const paid = Math.round(parseFloat(String(q.Amount || '0')) * 100);
  if (paid !== order.amount) return fail('amount_mismatch');
  if (q.Coin && q.Coin !== '1') return fail('bad_currency');

  const ent = await grantEntitlement(env, {
    email: order.email, ext_ref: ref, amount: paid, plan: order.plan || 'lifetime',
  });
  const link = await mintDownloadLink(env, ent.id, order.email);
  await emailReceipt(env, order.email, link).catch(() => {});

  await env.DB.prepare(`UPDATE streamdaw_orders SET status='granted', hyp_id=?, entitlement_id=?, settled_at=? WHERE ref=?`)
    .bind(String(q.Id || ''), ent.id, now(), ref).run().catch(() => {});

  return Response.redirect(`${SITE}/apps/streamdaw.html?bought=1&ref=${encodeURIComponent(ref)}`, 302);
}

// ── 3. Download: serve the installer to an entitled buyer ──────────────────
export async function streamdawDownload(req, env) {
  const url = new URL(req.url);
  const token = url.searchParams.get('t');
  let entitlement = null;

  if (token) {
    const h = await sha256b64(token);
    const row = await env.DB.prepare('SELECT * FROM download_tokens WHERE token_hash = ?').bind(h).first();
    if (row && row.expires_at > now() && row.uses < row.max_uses) {
      await env.DB.prepare('UPDATE download_tokens SET uses = uses + 1, used_at = ? WHERE token_hash = ?').bind(now(), h).run();
      entitlement = await env.DB.prepare('SELECT * FROM entitlements WHERE id = ?').bind(row.entitlement_id).first();
    }
  } else {
    const user = await currentUser(req, env).catch(() => null);
    if (user) {
      entitlement = await env.DB.prepare(
        `SELECT * FROM entitlements WHERE product = ? AND status = 'active' AND (user_id = ? OR email = ?)
           AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 1`
      ).bind(PRODUCT, user.id, lc(user.email), now()).first();
    }
  }
  if (!entitlement || entitlement.status !== 'active') return json({ error: 'not_entitled' }, 403);

  const rel = await env.DB.prepare(
    'SELECT * FROM app_releases WHERE asset = ? AND is_latest = 1 ORDER BY created_at DESC LIMIT 1'
  ).bind(ASSET).first();
  if (!rel) return json({ error: 'no_release' }, 404);

  const obj = await env.APPS.get(rel.r2_key);
  if (!obj) return json({ error: 'file_missing' }, 404);

  return new Response(obj.body, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${rel.filename}"`,
      'content-length': String(rel.bytes || obj.size || ''),
      'cache-control': 'private, no-store',
    },
  });
}

// ── 4. Dashboard: does this member own StreamDAW? ──────────────────────────
export async function myStreamdaw(env, user) {
  if (!user) return json({ owned: false }, 401);
  const ent = await env.DB.prepare(
    `SELECT id, plan, created_at FROM entitlements WHERE product = ? AND status = 'active'
       AND (user_id = ? OR email = ?) AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT 1`
  ).bind(PRODUCT, user.id, lc(user.email), now()).first();
  if (!ent) return json({ owned: false });
  const rel = await env.DB.prepare('SELECT version, filename, bytes, sha256 FROM app_releases WHERE asset = ? AND is_latest = 1')
    .bind(ASSET).first();
  return json({ owned: true, since: ent.created_at, plan: ent.plan, release: rel, download: `${SITE}/api/streamdaw/download` });
}

// ── helpers ────────────────────────────────────────────────────────────────
async function grantEntitlement(env, { email, ext_ref, amount, plan }) {
  const existing = await env.DB.prepare('SELECT * FROM entitlements WHERE ext_ref = ?').bind(ext_ref).first();
  if (existing) return existing;
  const u = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(lc(email)).first();
  const ins = await env.DB.prepare(
    `INSERT INTO entitlements (user_id, email, product, plan, status, source, ext_ref, amount, currency, created_at)
     VALUES (?, ?, ?, ?, 'active', 'hyp', ?, ?, 'ILS', ?)`
  ).bind(u?.id || null, lc(email), PRODUCT, plan, ext_ref, amount, now()).run();
  return { id: ins.meta.last_row_id, email: lc(email) };
}

async function mintDownloadLink(env, entitlementId, email) {
  const token = urlToken(32);
  const h = await sha256b64(token);
  await env.DB.prepare(
    `INSERT INTO download_tokens (token_hash, entitlement_id, email, product, asset, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(h, entitlementId, lc(email), PRODUCT, ASSET, now(), now() + TOKEN_TTL).run();
  return `${SITE}/api/streamdaw/download?t=${token}`;
}

function emailReceipt(env, to, link) {
  const subject = 'Your StreamDAW download — by Snowstar';
  const text =
`Thanks for buying StreamDAW.

Download it here (link is private to you, good for 7 days):
${link}

Install the .pkg, open your DAW, drop StreamDAW on the master bus, press GO LIVE.

You can re-download anytime from your account at ${SITE} — StreamDAW is tied to
this email, the same login you use for Mutra and everything else by Snowstar.

— Snowstar.Company`;
  const html =
`<div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">
  <h2 style="font-family:Anton,sans-serif;text-transform:uppercase;letter-spacing:.02em">Welcome to StreamDAW</h2>
  <p>Thanks for your purchase. Your private download link (good for 7 days):</p>
  <p><a href="${link}" style="display:inline-block;background:#d9744a;color:#1a0f08;font-weight:700;
     padding:12px 22px;border-radius:8px;text-decoration:none">Download StreamDAW</a></p>
  <p style="color:#666;font-size:14px">Install the .pkg, open your DAW, drop StreamDAW on the master bus,
     and press GO LIVE. Re-download anytime from your account at
     <a href="${SITE}">snowstar.company</a> — it's tied to this email, the same login as Mutra.</p>
  <p style="color:#999;font-size:12px">Powered by Snowstar.Company</p>
</div>`;
  return sendMail(env, { to, subject, text, html });
}
