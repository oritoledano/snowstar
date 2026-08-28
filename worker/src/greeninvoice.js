/**
 * Green Invoice (morning) — issuing the tax document for a paid licence.
 *
 * THE RULE THIS FILE IS BUILT AROUND: a tax document cannot be unsent.
 *
 * In Israel a חשבונית מס/קבלה is a legal record the moment it is issued. It
 * cannot be deleted, only cancelled with a credit note, and every cancellation
 * is itself a document the accountant has to explain. So nothing here issues
 * anything on its own. A paid licence QUEUES an invoice, the owner sees what it
 * will say, and one click sends it — the same "nothing leaves without you" gate
 * the outbox uses for email, for the same reason but with higher stakes.
 *
 * Once that has been watched a few times and trusted, flipping it to automatic
 * is a one-line change in licensing.js. Starting automatic and discovering the
 * client name was wrong on forty documents is not recoverable.
 *
 * Idempotency is a UNIQUE index on licence_id rather than a flag in code: a
 * double-click, a retry after a timeout, or two tabs open must not be able to
 * produce two documents for one payment, and the database is the only place
 * that can promise it.
 */

const API = 'https://api.greeninvoice.co.il/api/v1';
/* morning has two live authentication systems and the key you are given looks the
   same either way. The old one posts {id, secret} here; the current one is OAuth2
   client-credentials on a different HOST entirely. A key minted today may simply not
   work against the old endpoint, which looks identical to a mistyped secret — so both
   are tried and whichever answers is reported by name. */
const OAUTH = 'https://api.morning.co/idp/v1/oauth/token';

/* 320 = חשבונית מס/קבלה — the combined invoice-and-receipt, which is what a
   card payment taken at the moment of sale actually is. A plain invoice (305)
   would say money is owed when it has already been paid. */
export const DOC_INVOICE_RECEIPT = 320;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const now = () => Math.floor(Date.now() / 1000);
const clean = (v, n = 200) => String(v == null ? '' : v).trim().slice(0, n);

export const configured = (env) => !!(env.GREENINVOICE_ID && env.GREENINVOICE_SECRET);

/**
 * The business every document must come from, pinned once and checked every time.
 *
 * This exists because of a genuinely nasty property of morning's API: the token
 * binds to the account's DEFAULT business, there is no way to name a business on
 * the document, and "which business is default" is a setting that can be changed
 * in the morning web UI by someone who has no idea this Worker exists. With two
 * businesses on one login, that means invoices could silently start being issued
 * from the wrong entity — with correct credentials, no error, and no sign anything
 * had changed until an accountant found them months later.
 *
 * So the business id is recorded once, deliberately, and asserted before every
 * issue. A mismatch stops the issue rather than warning about it: a document
 * issued from the wrong entity can only be undone with a credit note.
 */
const PIN_KEY = 'greeninvoice_business_id';

async function pinnedBusiness(env) {
  const r = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind(PIN_KEY).first().catch(() => null);
  return (r && r.v) || null;
}

/** POST /invoices/pin — { business_id } lock issuing to one business, or null to clear. */
export async function pinBusiness(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const id = clean(b.business_id, 64);
  if (!id) {
    await env.DB.prepare('DELETE FROM meta WHERE k = ?').bind(PIN_KEY).run();
    return json({ ok: true, pinned: null });
  }
  await env.DB.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
    .bind(PIN_KEY, id).run();
  await env.DB.prepare(
    'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
  ).bind(user.email || 'owner', 'pin_invoice_business', id, clean(b.name, 120), now())
    .run().catch(() => null);
  return json({ ok: true, pinned: id });
}

/**
 * Confirm the token still points at the pinned business.
 * Returns null when all is well, or a Response to send instead of issuing.
 */
async function guardBusiness(env, token) {
  const want = await pinnedBusiness(env);
  if (!want) {
    return json({ error: 'not_pinned',
                  detail: 'No business is locked in yet. Open Invoices, press "Which business?" '
                        + 'and lock the correct one before issuing anything.' }, 409);
  }
  const r = await fetch(`${API}/businesses/me`, { headers: { authorization: `Bearer ${token}` } });
  const got = await r.json().catch(() => null);
  if (!r.ok || !got || !got.id) {
    return json({ error: 'business_check_failed', status: r.status, body: got,
                  detail: 'Could not confirm which business this key points at, so nothing was issued.' }, 502);
  }
  if (got.id !== want) {
    return json({ error: 'wrong_business', status: 409,
                  detail: `This key now points at "${got.name || got.id}" but invoicing is locked to a `
                        + 'different business. Nothing was issued. Either the default business changed in '
                        + 'morning, or the key was replaced with one from the other business.',
                  now: { id: got.id, name: got.name, taxId: got.taxId }, pinned: want }, 409);
  }
  return null;
}

/* Tokens last about an hour. Cached on the module so a burst of invoices costs
   one handshake, and deliberately not persisted — a stale token in a database
   is worse than a fresh handshake. */
let tokenCache = { token: null, until: 0, via: null };

/**
 * A token, from whichever of the two auth systems accepts the credentials.
 *
 * Returns { token, via, detail } rather than throwing on failure, because the
 * caller that matters most — the connection check — needs to SHOW why it failed
 * instead of just knowing that it did. Both flows return 401 for a bad secret,
 * so the only way to tell "wrong secret" from "wrong endpoint for this key" is
 * to try both and see if either one moves.
 */
async function getToken(env) {
  if (tokenCache.token && tokenCache.until > Date.now() + 60_000) {
    return { token: tokenCache.token, via: tokenCache.via };
  }
  const tried = [];

  // Legacy: {id, secret} against the greeninvoice host.
  try {
    const r = await fetch(`${API}/account/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: env.GREENINVOICE_ID, secret: env.GREENINVOICE_SECRET }),
    });
    const d = await r.json().catch(() => null);
    if (r.ok && d && d.token) {
      // `expires` is a unix timestamp; trust it over a guess, minus a minute so a
      // long request cannot finish after the token dies.
      const until = d.expires ? d.expires * 1000 - 60_000 : Date.now() + 50 * 60 * 1000;
      tokenCache = { token: d.token, until, via: 'legacy' };
      return { token: d.token, via: 'legacy' };
    }
    tried.push({ flow: 'legacy', status: r.status, body: d });
  } catch (e) {
    tried.push({ flow: 'legacy', status: 0, body: String((e && e.message) || e) });
  }

  // Current: OAuth2 client-credentials on api.morning.co. Different host, and a
  // different error shape too — {error, error_description}, not {errorCode, ...}.
  try {
    const r = await fetch(OAUTH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: env.GREENINVOICE_ID,
        client_secret: env.GREENINVOICE_SECRET,
        scope: 'read write',
      }),
    });
    const d = await r.json().catch(() => null);
    const tok = d && (d.access_token || d.accessToken);
    if (r.ok && tok) {
      const until = Date.now() + ((d.expires_in || 3600) * 1000) - 60_000;
      tokenCache = { token: tok, until, via: 'oauth' };
      return { token: tok, via: 'oauth' };
    }
    tried.push({ flow: 'oauth', status: r.status, body: d });
  } catch (e) {
    tried.push({ flow: 'oauth', status: 0, body: String((e && e.message) || e) });
  }

  return { token: null, tried };
}

/* Kept for the issuing path, which genuinely cannot continue without a token. */
async function token(env) {
  const t = await getToken(env);
  if (!t.token) throw new Error('greeninvoice_auth_failed');
  return t.token;
}

/**
 * What the document will say, worked out from the licence alone.
 *
 * Amounts on `licences` are ex-VAT agorot; Green Invoice wants shekels and
 * applies VAT itself, so the price goes over as ex-VAT and `vatType: 0`
 * (standard) lets their side do the arithmetic. Doing it here and sending a
 * gross figure would double-tax the line.
 */
export function draftFor(lic, track, opts = {}) {
  const exVat = (lic.amount || 0) / 100;
  /* The date the money actually arrived. morning rejects an empty or future
     receipt date (error 2426), and a licence granted seconds ago can round to
     tomorrow in a different timezone, so it is clamped to today rather than
     trusted blindly. */
  const iso = (t) => new Date(t * 1000).toISOString().slice(0, 10);
  const today = iso(Math.floor(Date.now() / 1000));
  const paidOn = lic.granted_at ? iso(lic.granted_at) : today;
  const date = paidOn > today ? today : paidOn;
  return {
    type: DOC_INVOICE_RECEIPT,
    lang: 'he',
    date,
    currency: lic.currency || 'ILS',
    // Document-level vatType 0 = "default for this business". NOT the same enum as
    // the income-row vatType below, where 1 would mean "price includes VAT" while
    // here 1 means "exempt" — confusing the two is how a wrong tax document gets
    // issued, so both are set explicitly rather than left to a default.
    vatType: 0,
    client: {
      name: clean(lic.licensee_name) || clean(lic.email) || 'Client',
      taxId: clean(lic.licensee_tax_id, 20) || undefined,
      // Supplying emails makes morning send the customer the document. That is
      // right for a real sale and wrong for a test, so it is a decision made at
      // the moment of issuing rather than a property of the licence.
      emails: opts.email && lic.email ? [clean(lic.email, 190)] : undefined,
      add: true,                       // keep them in the client list for next time
    },
    income: [{
      description: `Music licence ${lic.ref} — ${track || lic.slug}`
        + (lic.project_name ? ` (${clean(lic.project_name, 80)})` : ''),
      quantity: 1,
      // Income-row vatType 0 = "VAT added on top", so `price` here is EX-VAT and
      // morning does the 18% itself. Sending the gross figure would tax it twice.
      price: Number(exVat.toFixed(2)),
      currency: lic.currency || 'ILS',
      vatType: 0,
    }],
    payment: [{
      // 3 = credit card. The money has already been taken by the time a
      // licence exists, so the document records a payment rather than a debt.
      type: 3,
      date,
      price: Number((exVat * 1.18).toFixed(2)),
      currency: lic.currency || 'ILS',
    }],
    remarks: `Mutra by Snowstar · licence ${lic.ref}`,
  };
}

/**
 * GET /invoices/whoami — which business do these credentials actually bill from?
 *
 * The owner has two businesses under one morning login. Reading the docs to work out
 * which one a key belongs to is guessing; asking the API is knowing. Every call here
 * is a GET, so the worst case is an error message — nothing is created, nothing is
 * issued, and it can be run as often as you like.
 *
 * Several candidate paths are tried because the endpoint name is the one thing worth
 * discovering empirically: whichever one answers is the answer.
 */
export async function whoami(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  if (!configured(env)) {
    return json({ error: 'not_configured',
                  detail: 'GREENINVOICE_ID and GREENINVOICE_SECRET are not both set.' }, 503);
  }

  /* Shape, not content. Length, equality and stray whitespace are enough to spot
     every common paste mistake, and none of it is useful to anyone who saw it. */
  const id = env.GREENINVOICE_ID || '', sec = env.GREENINVOICE_SECRET || '';
  const shape = {
    idLength: id.length,
    secretLength: sec.length,
    identical: id === sec,
    idLooksLikeUuid: /^[0-9a-f-]{36}$/i.test(id),
    secretLooksLikeUuid: /^[0-9a-f-]{36}$/i.test(sec),
    idHasWhitespace: id !== id.trim(),
    secretHasWhitespace: sec !== sec.trim(),
  };

  const t = await getToken(env);
  if (!t.token) {
    /* Both flows refused, but they refuse differently and that difference is the
       whole diagnosis. The OAuth endpoint separates "I don't believe these
       credentials" (invalid_client) from "this account has no API entitlement"
       (unauthorized_client) — the legacy endpoint returns the same Hebrew line
       for both, so it is the OAuth reply that is worth reading. */
    const oa = (t.tried || []).find((x) => x.flow === 'oauth');
    const code = oa && oa.body && oa.body.error;
    const plan = code === 'unauthorized_client' || code === 'invalid_grant';
    return json({
      ok: false, stage: 'token', tried: t.tried, reason: plan ? 'plan' : 'credentials', shape,
      detail: plan
        ? 'The credentials were recognised but this morning account has no API entitlement. '
          + 'API access needs the Best plan or higher — check the subscription, then try again.'
        : 'morning does not recognise this key and secret. Its OAuth endpoint returned '
          + '"invalid_client", which means the credentials themselves are wrong rather than the '
          + 'plan lacking API access. Two things cause it: the same value pasted into both '
          + 'prompts (the API key goes in GREENINVOICE_ID, the separate secret in '
          + 'GREENINVOICE_SECRET), or the key having been regenerated in morning since.',
    }, 200);
  }

  const call = async (p) => {
    try {
      const r = await fetch(API + p, { headers: { authorization: `Bearer ${t.token}` } });
      return { path: p, status: r.status, body: await r.json().catch(() => null) };
    } catch (e) {
      return { path: p, status: 0, error: String((e && e.message) || e) };
    }
  };

  /* /businesses/me is the business a document would actually be written to: the
     token carries a DEFAULT business and there is no way to select another one on
     the document payload. /businesses lists every business the login owns, which
     is what makes the danger visible — if two come back and the default is the
     wrong one, the key has to be regenerated from inside the right business. */
  const [me, all] = await Promise.all([call('/businesses/me'), call('/businesses')]);

  const b = (me.status === 200 && me.body) || null;
  const list = (all.status === 200 && Array.isArray(all.body)) ? all.body : null;
  const pin = await pinnedBusiness(env);

  return json({
    ok: true,
    via: t.via,
    pinned: pin,
    // True when the key currently points somewhere other than what was locked in.
    // This is the condition worth shouting about: correct credentials, wrong books.
    drifted: !!(pin && b && b.id !== pin),
    business: b && { id: b.id, name: b.name, nameEn: b.nameEn, taxId: b.taxId,
                     active: b.active, documentCount: b.documentCount, email: b.accountEmail },
    businesses: list && list.map((x) => ({
      id: x.id, name: x.name, nameEn: x.nameEn, taxId: x.taxId,
      isDefault: !!(b && x.id === b.id),
    })),
    raw: { me, all },
  });
}

/**
 * POST /invoices/preview — { licence_id }. The dry run.
 *
 * morning has no draft for outgoing documents; a document is legally issued the
 * instant it is created and the only undo is a credit note. What it does have is
 * a preview that takes the IDENTICAL payload and renders the PDF without creating
 * anything — so the thing checked is the thing issued, not a mock-up of it.
 *
 * No client emails are sent here because no document exists to send.
 */
export async function previewInvoice(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  if (!configured(env)) return json({ error: 'not_configured' }, 503);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.licence_id);
  if (!Number.isInteger(id)) return json({ error: 'bad_licence' }, 400);

  const lic = await env.DB.prepare('SELECT * FROM licences WHERE id = ?').bind(id).first().catch(() => null);
  if (!lic) return json({ error: 'no_such_licence' }, 404);

  const track = await env.DB.prepare('SELECT title FROM tracks WHERE slug = ?')
    .bind(lic.slug).first().catch(() => null);
  const doc = draftFor(lic, track && track.title);

  const t = await getToken(env);
  if (!t.token) return json({ error: 'auth_failed', tried: t.tried }, 502);

  const r = await fetch(`${API}/documents/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
    body: JSON.stringify(doc),
  });
  const out = await r.json().catch(() => null);
  if (!r.ok || !out || !out.file) {
    return json({ error: 'preview_failed', status: r.status, body: out }, 502);
  }
  // Base64 PDF straight through; the browser turns it into a blob and opens it.
  return json({ ok: true, pdf: out.file, payload: doc });
}

/** GET /invoices — what is queued, what has been issued. */
export async function listInvoices(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);

  // Every paid licence with no invoice row yet is queued by definition — no
  // background job to fall behind, and nothing to reconcile if one is deleted.
  const pending = await env.DB.prepare(
    `SELECT l.id, l.ref, l.email, l.slug, l.amount, l.licensee_name, l.licensee_tax_id,
            l.project_name, l.currency, l.granted_at
       FROM licences l
       LEFT JOIN invoices i ON i.licence_id = l.id
      WHERE l.grant_reason = 'paid' AND l.amount > 0 AND i.id IS NULL
        AND l.revoked_at IS NULL
      ORDER BY l.granted_at DESC LIMIT 100`
  ).all().catch(() => ({ results: [] }));

  const issued = await env.DB.prepare(
    `SELECT id, licence_ref, number, url, amount, status, last_error, issued_at, ts
       FROM invoices ORDER BY ts DESC LIMIT 100`
  ).all().catch(() => ({ results: [] }));

  return json({
    configured: configured(env),
    pending: (pending.results || []).map((l) => ({ ...l, draft: draftFor(l) })),
    issued: issued.results || [],
  });
}

/**
 * POST /invoices/issue — { licence_id }. One document, one licence, once.
 *
 * The row is claimed BEFORE the call goes out, so a second request for the same
 * licence loses the unique index instead of producing a second tax document.
 * If the call then fails, the row keeps the error and can be retried; what it
 * cannot do is silently duplicate.
 */
export async function issueInvoice(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  if (!configured(env)) {
    return json({ error: 'not_configured',
                  detail: 'Set GREENINVOICE_ID and GREENINVOICE_SECRET as Worker secrets first.' }, 503);
  }
  const b = await req.json().catch(() => ({}));
  const id = Number(b.licence_id);
  if (!Number.isInteger(id)) return json({ error: 'bad_licence' }, 400);

  const lic = await env.DB.prepare('SELECT * FROM licences WHERE id = ?').bind(id).first().catch(() => null);
  if (!lic) return json({ error: 'no_such_licence' }, 404);
  if (lic.grant_reason !== 'paid' || !lic.amount) {
    return json({ error: 'nothing_to_invoice',
                  detail: 'This licence was not paid for, so there is nothing to invoice.' }, 400);
  }

  /* Which business, checked now — before the row is claimed, so a refusal here
     leaves nothing behind to clean up. */
  const tk = await getToken(env);
  if (!tk.token) return json({ error: 'auth_failed', tried: tk.tried }, 502);
  const wrong = await guardBusiness(env, tk.token);
  if (wrong) return wrong;

  const claim = await env.DB.prepare(
    `INSERT OR IGNORE INTO invoices (user_id, licence_id, licence_ref, provider, doc_type,
                                     amount, currency, vat_treatment, status, ts)
     VALUES (?, ?, ?, 'morning', ?, ?, ?, 'standard', 'sending', ?)`
  ).bind(lic.user_id, lic.id, lic.ref, DOC_INVOICE_RECEIPT,
         Math.round(lic.amount * 1.18), lic.currency || 'ILS', now()).run();
  if (!claim.meta.changes) {
    const existing = await env.DB.prepare('SELECT number, url, status FROM invoices WHERE licence_id = ?')
      .bind(id).first().catch(() => null);
    return json({ error: 'already_invoiced', invoice: existing }, 409);
  }

  const track = await env.DB.prepare('SELECT title FROM tracks WHERE slug = ?')
    .bind(lic.slug).first().catch(() => null);
  const doc = draftFor(lic, track && track.title, { email: !!b.email });

  let out;
  try {
    const r = await fetch(`${API}/documents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${tk.token}` },
      body: JSON.stringify(doc),
    });
    out = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`greeninvoice_${r.status}: ${JSON.stringify(out).slice(0, 200)}`);
  } catch (e) {
    /* A network failure does NOT mean no document was created — the request may
       have landed and the reply been lost, and morning has no idempotency key to
       lean on. So before reporting failure, look for a document carrying this
       licence ref. Finding one turns a blind retry into a recovered record. */
    const found = await findByRef(env, lic.ref).catch(() => null);
    if (found) {
      await env.DB.prepare(
        `UPDATE invoices SET status = 'issued', doc_id = ?, number = ?, url = ?,
                             issued_at = ?, last_error = 'recovered after a timeout'
          WHERE licence_id = ?`
      ).bind(clean(found.id, 60), clean(found.number, 40),
             clean((found.url && (found.url.he || found.url.origin)) || '', 400), now(), id).run();
      return json({ ok: true, recovered: true, number: found.number });
    }
    await env.DB.prepare(
      `UPDATE invoices SET status = 'failed', last_error = ? WHERE licence_id = ?`
    ).bind(String((e && e.message) || e).slice(0, 300), id).run();
    return json({ error: 'issue_failed', detail: String((e && e.message) || e).slice(0, 300) }, 502);
  }

  await env.DB.prepare(
    `UPDATE invoices SET status = 'issued', doc_id = ?, number = ?, url = ?,
                         allocation_no = ?, issued_at = ?, last_error = NULL
      WHERE licence_id = ?`
  ).bind(clean(out.id, 60), clean(out.number, 40),
         clean((out.url && (out.url.he || out.url.origin)) || '', 400),
         clean(out.allocationNumber, 40) || null, now(), id).run();

  await env.DB.prepare(
    'INSERT INTO admin_log (actor_id, action, subject, detail, ts) VALUES (?, ?, ?, ?, ?)'
  ).bind(user.email || 'owner', 'issue_invoice', lic.ref,
         `doc ${out.number || out.id}`, now()).run().catch(() => null);

  return json({ ok: true, number: out.number, url: (out.url && (out.url.he || out.url.origin)) || null });
}

/**
 * Find an already-issued document by the licence ref we stamp into every one.
 *
 * This is the only recovery available: POST /documents accepts no idempotency
 * key, so after a timeout the sole way to learn whether a document exists is to
 * go looking for it. The ref lives in both `description` and `remarks`, which is
 * why it is worth putting there.
 */
async function findByRef(env, ref) {
  const t = await getToken(env);
  if (!t.token) return null;
  const r = await fetch(`${API}/documents/search`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${t.token}` },
    body: JSON.stringify({ page: 1, pageSize: 20, description: ref }),
  });
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  const items = (d && (d.items || d.documents)) || [];
  return items.find((x) => JSON.stringify(x).includes(ref)) || null;
}

/** POST /invoices/retry — clear a failed row so it can be issued again. */
export async function retryInvoice(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.licence_id);
  const r = await env.DB.prepare(
    `DELETE FROM invoices WHERE licence_id = ? AND status != 'issued'`).bind(id).run();
  return json({ ok: true, cleared: r.meta.changes });
}
