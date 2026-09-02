/**
 * Hyp Pay (formerly YaadPay) — card payments for Mutra licences.
 *
 * One endpoint for everything — see BASE below.
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

/* The endpoint HYP gave the owner directly. Verified in a browser today:
   https://pay.hyp.co.il/p/ and this URL return byte-identical responses, so
   they are the same handler and either works — but this is the one HYP's own
   support will reference, so it is the one we use.

   Also verified against the live terminal, and it settles the architecture:
     no Masof            -> "שגיאה - תקלה במסוף - Masof Error"
     Masof, no signature -> "שגיאה - שגיאת אימות"   (authentication error)
   The terminal is recognised, and SIGNATURE VERIFICATION IS ENABLED on it.
   So the two-step flow below is mandatory, not optional: a payment page URL
   without a signature obtained from the SIGN call is rejected outright. */
const BASE = 'https://pay.hyp.co.il/cgi-bin/yaadpay/yaadpay3ds.pl';

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
  if (!/^[A-Z0-9][A-Z0-9-]{4,60}$/.test(ref)) return json({ error: 'bad_ref' }, 400);

  const r = await env.DB.prepare(
    `SELECT * FROM licence_requests WHERE ref = ? AND status = 'new'`
  ).bind(ref).first();
  if (!r) return json({ error: 'not_found_or_decided' }, 404);

  // A quote-lane track has someone else with a say in its commercial use. It
  // must never reach a self-serve card page — that is the whole point of the
  // lane, and enforcing it here as well as at grant time is not redundant.
  if (r.lane === 'quote') return json({ error: 'quote_lane_not_self_serve' }, 409);
  // NULL means there is no self-serve price at all; zero means a code took it
  // to nothing. Only the first is a refusal — `!r.list_amount` caught both and
  // turned a fully-discounted licence into "no_price".
  if (r.list_amount == null) return json({ error: 'no_price' }, 409);

  /* Nothing to charge. A card processor refuses a zero authorisation, so a
     free licence is granted here instead of being sent to a checkout that
     cannot succeed. It is still a real licence with a real certificate — the
     only difference is that no money moved, which is what the reason records. */
  if (r.list_amount === 0) {
    // Imported here rather than at the top, matching the redirect handler:
    // licensing.js imports coupons.js which imports nothing back, but a static
    // cycle between these two modules has bitten before.
    const { grantLicence } = await import('./licensing.js');
    const out = await grantLicence(env, {
      request_id: r.id, user_id: r.user_id, email: r.email, slug: r.slug,
      tier: r.tier, amount: 0, reason: 'comp', actor: 'system:coupon',
      licensee_name: r.licensee_name, licensee_tax_id: r.licensee_tax_id,
    });
    return out && out.ok
      ? json({ free: true, ref: r.ref, licence_id: out.licence_id || out.id })
      : json({ error: (out && out.error) || 'grant_failed' }, 400);
  }

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
    /* Without this the redirect comes back carrying no Sign parameter, and
       What=VERIFY has nothing to check — it answers CCode=200 and every real
       payment is read as a failure. Two customers were charged and told
       nothing had happened. */
    signMe: '1',
    MoreData: 'True',                                // makes HYP return Coin etc.
    // Buyers are agencies and producers; the catalogue and terms are in English,
    // so the card page should not switch language mid-purchase.
    PageLang: 'ENG',
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

  /* What HYP signed, minus the credentials. Verification has been failing and
     there was no way to tell whether signMe survived into the signed URL —
     which decides whether the fault is at this end or in how the return is
     checked. Keys only for anything sensitive; the point is which parameters
     exist, not their values. */
  await env.DB.prepare(
    'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
  ).bind('system:hyp', 'hyp.signed', ref,
         JSON.stringify({
           askedFor: [...p.keys()],
           hypReturned: text.slice(0, 900).replace(/(KEY|PassP)=[^&]*/gi, '$1=***'),
         }).slice(0, 1800), now()).run().catch(() => {});

  // Use HYP's RESPONSE VERBATIM as the payment query string. It already is the
  // full pay URL — action=pay, every parameter we signed, in HYP's own order,
  // plus the signature — and KEY/PassP are not echoed back.
  //
  // Rebuilding it from our own subset is what broke the first live attempt:
  // the signature covers the parameters that were SIGNED, so dropping tmp,
  // ClientName, email, SendHesh, Postpone and J5 from the redirect made HYP
  // reject it with "שגיאה - שגיאת אימות". Same failure mode as the VERIFY
  // ordering rule below — do not reconstruct what HYP handed you.
  return json({ ok: true, url: `${BASE}?${text.trim()}`, ref, amount_gross: gross });
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
  // HYP's own params are appended AFTER ours. If the redirect carries its own
  // action= (it carries action=pay), a naive append gives the URL two action
  // values and most servers honour the LAST one — turning our VERIFY into a
  // pay request. Strip the keys we set ourselves from the forwarded string,
  // preserving the order of everything else, which is what HYP compares.
  const OURS = new Set(['action', 'what', 'masof', 'key', 'passp']);
  const kept = rawQuery.split('&').filter((kv) => {
    const k = kv.split('=')[0].toLowerCase();
    return kv && !OURS.has(k);
  }).join('&');

  const url = `${BASE}?action=APISign&What=VERIFY`
    + `&Masof=${encodeURIComponent(env.HYP_TERMINAL)}`
    + `&KEY=${encodeURIComponent(env.HYP_API_KEY)}`
    + `&PassP=${encodeURIComponent(env.HYP_PASSP)}`
    + `&${kept}`;
  const res = await fetch(url);
  const text = await res.text();
  if (/^\s*</.test(text)) return { ok: false, error: 'hyp_system_error', raw: text.slice(0, 200) };
  const d = parseHyp(text);
  return { ok: d.CCode === '0', ccode: d.CCode, data: d, raw: text.slice(0, 400), sent: kept };
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
  if (q.CCode !== '0') {
    await env.DB.prepare(
      'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
    ).bind('system:hyp', 'hyp.declined', ref,
           JSON.stringify({ ccode: q.CCode, errMsg: q.errMsg || '', id: q.Id || '' }).slice(0, 900),
           now()).run().catch(() => {});
    return fail('declined');
  }
  if (!/^[A-Z0-9][A-Z0-9-]{4,60}$/.test(ref)) return fail('bad_ref');

  // 2. HYP itself must confirm the parameter set.
  //     A failure here is the dangerous case — the card may well have been
  //     charged — so record everything needed to reconcile by hand rather than
  //     discarding it and leaving the owner to guess.
  const v = await verifyReturn(env, raw);
  if (!v.ok) {
    /* The dangerous case, and the one that actually happened. If the redirect
       itself asserts a capture — CCode 0, a real authorisation code, and an
       amount matching what WE priced — then the card has been charged even
       though we cannot verify it. Granting on an unverified claim would let a
       forged URL mint licences, so the licence still waits. But the customer
       must not be told their payment failed, because it did not. */
    const looksCharged = q.CCode === '0' && /^[0-9]{4,}$/.test(String(q.ACode || ''))
      && Math.round(parseFloat(String(q.Amount || '0')) * 100)
         === Math.round((( await env.DB.prepare('SELECT list_amount FROM licence_requests WHERE ref = ?')
              .bind(ref).first().catch(() => null) ) || {}).list_amount * 1.18);
    if (looksCharged) {
      await env.DB.prepare(
        `UPDATE hyp_checkouts SET status = 'charged_unverified', hyp_id = ? WHERE ref = ?`
      ).bind(String(q.Id || ''), ref).run().catch(() => {});
      /* Log what HYP actually sent back. The first time this fired there was no
         record of the redirect at all, so there was no way to tell whether the
         Sign parameter had arrived — which is the one fact needed to fix it. */
      await env.DB.prepare(
        'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
      ).bind('system:hyp', 'hyp.charged_unverified', ref,
             JSON.stringify({ verify: (v.raw || '').slice(0, 200),
                              keys: raw.split('&').map((kv) => kv.split('=')[0]),
                              sent: (v.sent || '').slice(0, 500) }).slice(0, 1800),
             now()).run().catch(() => {});
      await env.DB.prepare(
        `INSERT INTO mail_outbox (to_email, to_name, subject, body, title, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(env.ALERT_TO || 'oritoledano@gmail.com', 'Snowstar',
        'A card was charged but the payment could not be verified',
        `Reference ${ref}\nHYP id ${q.Id || ''}, auth code ${q.ACode || ''}, ${q.Amount || ''} ILS\n\n`
        + `The card was charged. HYP's VERIFY call did not confirm it, so the licence has NOT been\n`
        + `granted automatically. Check the transaction at HYP and grant it from Licensing.\n\n`
        + `The customer has been told their payment went through and the licence is being confirmed.`,
        now()).run().catch(() => null);
      return Response.redirect(
        `https://snowstar.company/mutra.html?pay=confirming&ref=${encodeURIComponent(ref)}`, 302);
    }

    await env.DB.prepare(
      'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
    ).bind('system:hyp', 'hyp.verify_failed', ref,
           JSON.stringify({ ccode: v.ccode || null, err: v.error || null,
                            hypReply: (v.raw || '').slice(0, 300),
                            returned: raw.slice(0, 600) }).slice(0, 1800),
           now()).run().catch(() => {});
    await env.DB.prepare(
      `UPDATE hyp_checkouts SET status = 'verify_failed', hyp_id = ? WHERE ref = ?`
    ).bind(String(q.Id || ''), ref).run().catch(() => {});
    return fail('unverified');
  }

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

  /* The money has moved; everything from here is bookkeeping and must never
     unwind the sale. The ledger writes each shareholder's cut (backfillable
     if it fails), and the tax document (חשבונית מס/קבלה) goes out to the
     buyer automatically — an invoice that fails lands as a 'failed' row in
     the Invoices panel rather than as a silent gap. */
  if (out.ok) {
    try {
      const { accrueEarnings } = await import('./earnings.js');
      await accrueEarnings(env, { slug: r.slug, licence_id: out.id,
                                  amount_agorot: r.list_amount, reason: 'paid' });
    } catch { /* deliberately swallowed */ }
    try {
      const { autoIssueInvoice } = await import('./greeninvoice.js');
      await autoIssueInvoice(env, out.id);
    } catch { /* deliberately swallowed */ }
  }

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
