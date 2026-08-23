/**
 * Hyp Pay (formerly YaadPay) — card payments for Mutra licences.
 *
 * Base URL is a single endpoint for everything: https://pay.hyp.co.il/p/
 * Docs: https://developers.hyp.co.il/pay/
 *
 * ─── THE THING TO UNDERSTAND BEFORE EDITING THIS FILE ───────────────────────
 *
 * Hyp Pay has NO webhook. The only completion signal is a browser redirect —
 * a GET, from the customer's own browser, that anyone on the internet can type
 * by hand. It carries a `Sign` parameter, but `Sign` cannot be checked locally:
 * there is no shared secret and the algorithm is unpublished.
 *
 * So the redirect is, as it arrives here, UNAUTHENTICATED. Granting a licence
 * on it would mean anyone who mints a reference via /api/licence/request could
 * then type a URL and take the clean master. The catalogue would be free.
 *
 * Every grant therefore goes through verifyReturn(), which asks HYP's own
 * servers whether the parameter set is real, and then re-checks the amount
 * against what WE computed — never against what the query string claims.
 *
 * ─── WHY NOTHING HERE CAN CHARGE A CARD YET ────────────────────────────────
 *
 * The API needs `PassP`, which is NOT the Hyp Portal login password. It is a
 * separate value, read from the portal under Settings → Payment Page and API →
 * Verification. Until HYP_PASSP is set as a secret, every entry point below
 * refuses with hyp_not_configured. That is deliberate: the terminal issued is a
 * PRODUCTION terminal (test terminals begin 00100), so a half-wired integration
 * charges real cards.
 */

const BASE = 'https://pay.hyp.co.il/p/';

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const configured = (env) => !!(env.HYP_TERMINAL && env.HYP_API_KEY && env.HYP_PASSP);

/**
 * HYP speaks Windows-1255, not UTF-8. Its own documented redirect contains
 * Info=%EC%EC%E0%20%FA%E9%E0%E5%F8 — which is "ללא תיאור" in cp1255 and
 * mojibake in UTF-8. decodeURIComponent() THROWS URIError on those bytes, so a
 * naive parse crashes the return handler AFTER the card has been charged.
 *
 * TextDecoder supports cp1255 in Workers; TextEncoder is UTF-8 only, which is
 * fine because we never have to SEND legacy-encoded Hebrew.
 */
const CP1255 = new TextDecoder('windows-1255');
const UTF8_STRICT = new TextDecoder('utf-8', { fatal: true });

function percentBytes(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 37) { out.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
    else if (c === 43) { out.push(32); }        // '+' means space in a query
    else { out.push(c); }
  }
  return new Uint8Array(out);
}

/** UTF-8 when it decodes cleanly, cp1255 otherwise. Never throws. */
export function decodeValue(s) {
  try {
    const b = percentBytes(String(s));
    try { return UTF8_STRICT.decode(b); } catch { return CP1255.decode(b); }
  } catch { return String(s); }
}

/** Parse a HYP response body: URL-encoded key=value pairs, cp1255-tolerant. */
export function parseHyp(body) {
  const out = {};
  for (const part of String(body).split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const k = i < 0 ? part : part.slice(0, i);
    const v = i < 0 ? '' : part.slice(i + 1);
    out[decodeValue(k)] = decodeValue(v);
  }
  return out;
}

/* ═══════════ 1. start a payment ═══════════ */

/**
 * Ask HYP to sign a payment page URL, then hand the buyer the redirect.
 * Amount is shekels with two decimals — HYP is not agorot-based, unlike our
 * own storage, so the conversion happens here and only here.
 */
export async function startCheckout(req, env, user) {
  if (!configured(env)) {
    return json({ error: 'hyp_not_configured',
      detail: 'HYP_PASSP is missing. It is the API password from the Hyp Portal under '
            + 'Settings → Payment Page and API → Verification, and is NOT the portal login password.' }, 503);
  }
  const b = await req.json().catch(() => ({}));
  const ref = String(b.ref || '').trim();
  if (!/^MU-\d{4}-\d{4}$/.test(ref)) return json({ error: 'bad_ref' }, 400);

  const r = await env.DB.prepare(
    `SELECT * FROM licence_requests WHERE ref = ? AND status = 'new'`
  ).bind(ref).first();
  if (!r) return json({ error: 'not_found_or_decided' }, 404);

  // A quote-lane track has someone else with a say in its commercial use. It
  // must never reach a self-serve card page — that is the whole point of the
  // lane, and enforcing it here as well as at grant time is not redundant.
  if (r.lane === 'quote') return json({ error: 'quote_lane_not_self_serve' }, 409);
  if (!r.list_amount) return json({ error: 'no_price' }, 409);

  const exVat = r.list_amount;                       // agorot, ex-VAT
  const gross = Math.round(exVat * 1.18);            // agorot, incl VAT
  const shekels = (gross / 100).toFixed(2);

  const p = new URLSearchParams({
    action: 'APISign',
    What: 'SIGN',
    Masof: env.HYP_TERMINAL,
    KEY: env.HYP_API_KEY,
    PassP: env.HYP_PASSP,
    Amount: shekels,
    Coin: '1',                                       // 1 = ILS
    Info: `Mutra licence ${ref}`,
    Order: ref,                                      // comes back on the redirect
    UTF8: 'True',
    UTF8out: 'True',
    MoreData: 'True',                                // makes HYP return Coin etc.
    PageLang: 'HEB',
    tmp: '1',
    ClientName: r.licensee_name || '',
    email: r.email || '',
    SendHesh: 'True',
    Postpone: 'False',
    J5: 'False',
  });

  const res = await fetch(`${BASE}?${p.toString()}`);
  const text = await res.text();
  // HYP returns 200 even for errors, and HTML when the system itself failed.
  if (/^\s*</.test(text)) return json({ error: 'hyp_system_error' }, 502);
  const d = parseHyp(text);
  if (!d.signature) return json({ error: 'hyp_sign_failed', ccode: d.CCode || null, raw: text.slice(0, 200) }, 502);

  await env.DB.prepare(
    `INSERT INTO hyp_checkouts (ref, request_id, amount, status, created_at) VALUES (?, ?, ?, 'started', ?)`
  ).bind(ref, r.id, gross, now()).run().catch(() => {});

  const pay = new URLSearchParams({
    action: 'pay', Masof: env.HYP_TERMINAL, Amount: shekels, Coin: '1',
    Info: `Mutra licence ${ref}`, Order: ref, UTF8: 'True', UTF8out: 'True',
    MoreData: 'True', PageLang: 'HEB', signature: d.signature,
  });
  return json({ ok: true, url: `${BASE}?${pay.toString()}`, ref, amount_gross: gross });
}

/* ═══════════ 2. the return, and why it is not trusted ═══════════ */

/**
 * Ask HYP whether this exact parameter set is genuine.
 *
 * Parameter ORDER is load-bearing — HYP compares against what it sent — so the
 * raw query string is forwarded byte-for-byte rather than rebuilt from a
 * URLSearchParams round-trip, which would reorder and re-encode it.
 */
async function verifyReturn(env, rawQuery) {
  const url = `${BASE}?action=APISign&What=VERIFY`
    + `&Masof=${encodeURIComponent(env.HYP_TERMINAL)}`
    + `&KEY=${encodeURIComponent(env.HYP_API_KEY)}`
    + `&PassP=${encodeURIComponent(env.HYP_PASSP)}`
    + `&${rawQuery}`;
  const res = await fetch(url);
  const text = await res.text();
  if (/^\s*</.test(text)) return { ok: false, error: 'hyp_system_error' };
  const d = parseHyp(text);
  return { ok: d.CCode === '0', ccode: d.CCode, data: d };
}

/**
 * The buyer's browser lands here after paying.
 *
 * Seven gates, all of which must pass. Everything except the reference is read
 * from OUR database — the redirect carries no slug and no tier, so a forged URL
 * has nothing to forge with even before VERIFY runs.
 */
export async function handleReturn(req, env, ctx) {
  if (!configured(env)) return json({ error: 'hyp_not_configured' }, 503);

  const qi = req.url.indexOf('?');
  const raw = qi < 0 ? '' : req.url.slice(qi + 1);
  const q = parseHyp(raw);
  const ref = String(q.Order || '');
  const fail = (why) => Response.redirect(
    `https://snowstar.company/mutra.html?pay=failed&reason=${encodeURIComponent(why)}`, 302);

  // 1. the redirect's own status must be a CAPTURE, not an authorisation
  if (q.CCode !== '0') return fail('declined');
  if (!/^MU-\d{4}-\d{4}$/.test(ref)) return fail('bad_ref');

  // 2. HYP itself must confirm the parameter set
  const v = await verifyReturn(env, raw);
  if (!v.ok) return fail('unverified');

  // 3-4. the reference must resolve to a request still awaiting a decision
  const r = await env.DB.prepare(
    `SELECT * FROM licence_requests WHERE ref = ?`).bind(ref).first();
  if (!r) return fail('unknown_ref');
  if (r.status !== 'new') return Response.redirect(
    `https://snowstar.company/mutra.html?pay=ok&ref=${encodeURIComponent(ref)}`, 302);

  // 5. the amount must equal what WE priced, compared as integers
  const expected = Math.round((r.list_amount || 0) * 1.18);
  const paid = Math.round(parseFloat(String(q.Amount || '0')) * 100);
  if (!expected || paid !== expected) return fail('amount_mismatch');

  // 6. shekels only
  if (q.Coin && q.Coin !== '1') return fail('bad_currency');

  // 7. a quote-lane track is never granted by machine
  if (r.lane === 'quote') return fail('quote_lane');

  const { grantLicence } = await import('./licensing.js');
  const pay = await env.DB.prepare(
    `INSERT INTO payments (user_id, email, amount, currency, method, status, reference, payer_note, ts, recorded_by)
     VALUES (?, ?, ?, 'ILS', 'card', 'received', ?, ?, ?, 'system:hyp')`
  ).bind(r.user_id, r.email, paid, ref,
         `HYP Id=${q.Id || ''} ACode=${q.ACode || ''}`, now()).run();

  const out = await grantLicence(env, {
    request_id: r.id, user_id: r.user_id, email: r.email, slug: r.slug, tier: r.tier,
    amount: r.list_amount, reason: 'paid', actor: 'system:hyp',
    payment_id: pay.meta.last_row_id,
    licensee_name: r.licensee_name, licensee_tax_id: r.licensee_tax_id,
    scope_text: `Card payment ${paid / 100} ILS via HYP, ref ${ref}.`,
    controller_cleared: false,
  });

  await env.DB.prepare(
    `UPDATE hyp_checkouts SET status = ?, hyp_id = ?, settled_at = ? WHERE ref = ?`
  ).bind(out.ok ? 'granted' : 'grant_failed', String(q.Id || ''), now(), ref).run().catch(() => {});

  return Response.redirect(
    `https://snowstar.company/mutra.html?pay=ok&ref=${encodeURIComponent(ref)}`, 302);
}

/**
 * Checkouts that started and never came back.
 *
 * Hyp Pay has NO transaction-inquiry action — if a buyer closes the tab after
 * paying, nothing tells us. This list is the reconciliation strategy, not a
 * nicety: the owner checks these against the HYP portal report and, where money
 * really arrived, grants by hand through the existing queue.
 */
export async function listStale(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const cutoff = now() - 1800;
  const r = await env.DB.prepare(
    `SELECT c.*, q.slug, q.tier, q.email FROM hyp_checkouts c
       LEFT JOIN licence_requests q ON q.id = c.request_id
      WHERE c.status = 'started' AND c.created_at < ? ORDER BY c.id DESC LIMIT 100`
  ).bind(cutoff).all();
  return json({ stale: r.results || [], configured: configured(env) });
}

export function hypStatus(env) {
  return json({
    configured: configured(env),
    terminal_set: !!env.HYP_TERMINAL,
    key_set: !!env.HYP_API_KEY,
    passp_set: !!env.HYP_PASSP,
    // test terminals begin 00100; anything else bills a real card
    mode: env.HYP_TERMINAL ? (String(env.HYP_TERMINAL).startsWith('00100') ? 'test' : 'PRODUCTION') : 'unset',
  });
}
