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

/* Tokens last about an hour. Cached on the module so a burst of invoices costs
   one handshake, and deliberately not persisted — a stale token in a database
   is worse than a fresh handshake. */
let tokenCache = { token: null, until: 0 };

async function token(env) {
  if (tokenCache.token && tokenCache.until > Date.now() + 60_000) return tokenCache.token;
  const r = await fetch(`${API}/account/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: env.GREENINVOICE_ID, secret: env.GREENINVOICE_SECRET }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || !d.token) {
    throw new Error(`greeninvoice_auth_${r.status}`);
  }
  tokenCache = { token: d.token, until: Date.now() + 50 * 60 * 1000 };
  return d.token;
}

/**
 * What the document will say, worked out from the licence alone.
 *
 * Amounts on `licences` are ex-VAT agorot; Green Invoice wants shekels and
 * applies VAT itself, so the price goes over as ex-VAT and `vatType: 0`
 * (standard) lets their side do the arithmetic. Doing it here and sending a
 * gross figure would double-tax the line.
 */
export function draftFor(lic, track) {
  const exVat = (lic.amount || 0) / 100;
  return {
    type: DOC_INVOICE_RECEIPT,
    lang: 'he',
    currency: lic.currency || 'ILS',
    vatType: 0,
    client: {
      name: clean(lic.licensee_name) || clean(lic.email) || 'Client',
      taxId: clean(lic.licensee_tax_id, 20) || undefined,
      emails: lic.email ? [clean(lic.email, 190)] : undefined,
      add: true,                       // keep them in the client list for next time
    },
    income: [{
      description: `Music licence ${lic.ref} — ${track || lic.slug}`
        + (lic.project_name ? ` (${clean(lic.project_name, 80)})` : ''),
      quantity: 1,
      price: Number(exVat.toFixed(2)),
      currency: lic.currency || 'ILS',
      vatType: 0,
    }],
    payment: [{
      // 3 = credit card. The money has already been taken by the time a
      // licence exists, so the document records a payment rather than a debt.
      type: 3,
      price: Number((exVat * 1.18).toFixed(2)),
      currency: lic.currency || 'ILS',
    }],
    remarks: `Mutra by Snowstar · licence ${lic.ref}`,
  };
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
  const doc = draftFor(lic, track && track.title);

  let out;
  try {
    const t = await token(env);
    const r = await fetch(`${API}/documents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` },
      body: JSON.stringify(doc),
    });
    out = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`greeninvoice_${r.status}: ${JSON.stringify(out).slice(0, 200)}`);
  } catch (e) {
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

/** POST /invoices/retry — clear a failed row so it can be issued again. */
export async function retryInvoice(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.licence_id);
  const r = await env.DB.prepare(
    `DELETE FROM invoices WHERE licence_id = ? AND status != 'issued'`).bind(id).run();
  return json({ ok: true, cleared: r.meta.changes });
}
