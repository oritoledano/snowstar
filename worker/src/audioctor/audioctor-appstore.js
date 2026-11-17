/* Audioctor's App Store subscriptions, as Apple tells them (2026-11-17, Ori: "I bought in the iPhone app through
 * Apple and the dashboard does not show it; put it beside the Mac's downloads and purchases").
 *
 * App Store Server Notifications V2: App Store Connect (App Information › App Store Server Notifications) posts every
 * purchase, renewal, cancellation, refund and expiry of the app's subscriptions (iPhone and Mac App Store alike, one
 * app record) to
 *     POST /appstore/notifications   {signedPayload}
 * The payload and the transaction inside it are JWS signed by Apple: the certificate chain in each header must end
 * in Apple Root CA - G3 (pinned below by its SHA-256, taken from macOS's own system keychain), each certificate signed
 * by the next, the leaf carrying Apple's App Store receipt-signing mark, and the JWS signed by the leaf. Anything else
 * is refused. Apple gives no buyer identity: a subscription is its originalTransactionId, its product, its storefront
 * (country) and price. Sandbox (TestFlight, Xcode) and Production come apart by `environment`.
 *
 *   appstore_events  every notification, as it came (decoded)
 *   appstore_subs    each subscription's state now, one row per originalTransactionId
 *   schema-audioctor-appstore.sql
 */
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const now = () => Math.floor(Date.now() / 1000);

const APPLE_ROOT_G3_SHA256 = '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';
const BUNDLE = 'com.snowstar.audioctor';
const RECEIPT_SIGNING_OID = [0x06, 0x0a, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x06, 0x0b, 0x01];   // 1.2.840.113635.100.6.11.1
const OID_P256 = [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07];
const OID_P384 = [0x2b, 0x81, 0x04, 0x00, 0x22];
const OID_ECDSA_SHA384 = [0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x03];

const b64urlBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const b64Bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const has = (bytes, pat) => { outer: for (let i = 0; i + pat.length <= bytes.length; i++) { for (let j = 0; j < pat.length; j++) if (bytes[i + j] !== pat[j]) continue outer; return true; } return false; };

// ── a little DER: enough to take a certificate apart ──────────────────────────
function tlv(b, at) {
  const tag = b[at];
  let len = b[at + 1], p = at + 2;
  if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = (len << 8) | b[p + i]; p += n; }
  return { tag, start: at, body: p, end: p + len };
}
const kids = (b, node) => { const out = []; for (let p = node.body; p < node.end;) { const k = tlv(b, p); out.push(k); p = k.end; } return out; };

/** {tbs, spki, curve, sigAlg384, sig (raw r||s for the issuer's curve), der} of one certificate */
function cert(der) {
  const top = tlv(der, 0);
  const [tbs, alg, sigv] = kids(der, top);
  const t = kids(der, tbs);
  const spkiNode = t[t[0].tag === 0xa0 ? 6 : 5];
  const spki = der.slice(spkiNode.start, spkiNode.end);
  const algBytes = der.slice(alg.start, alg.end);
  // the signature: a BIT STRING (one byte of unused bits) holding SEQUENCE { r INTEGER, s INTEGER }
  const seq = tlv(der, sigv.body + 1);
  const [r, s] = kids(der, seq);
  return { der, tbs: der.slice(tbs.start, tbs.end), spki, curve: has(spki, OID_P384) ? 'P-384' : has(spki, OID_P256) ? 'P-256' : null,
           sha384: has(algBytes, OID_ECDSA_SHA384), r: der.slice(r.body, r.end), s: der.slice(s.body, s.end) };
}
const fixed = (n, len) => { let x = n; while (x.length > len && x[0] === 0) x = x.slice(1); const out = new Uint8Array(len); out.set(x, len - x.length); return out; };
const keyOf = (c) => crypto.subtle.importKey('spki', c.spki, { name: 'ECDSA', namedCurve: c.curve }, false, ['verify']);

/** A JWS from Apple: verified and decoded, or an Error thrown. */
export async function appleJws(jws) {
  const parts = String(jws || '').split('.');
  if (parts.length !== 3) throw new Error('not a JWS');
  const head = JSON.parse(new TextDecoder().decode(b64urlBytes(parts[0])));
  if (head.alg !== 'ES256' || !Array.isArray(head.x5c) || head.x5c.length < 3) throw new Error('no certificate chain');
  const chain = head.x5c.map((c) => cert(b64Bytes(c)));
  const root = chain[chain.length - 1];
  if (hex(await crypto.subtle.digest('SHA-256', root.der)) !== APPLE_ROOT_G3_SHA256) throw new Error('not Apple Root CA - G3');
  if (!has(chain[0].der, RECEIPT_SIGNING_OID)) throw new Error('leaf is not an App Store signing certificate');
  for (let i = 0; i < chain.length - 1; i++) {                       // each signed by the next
    const issuer = chain[i + 1], c = chain[i];
    const size = issuer.curve === 'P-384' ? 48 : 32;
    const raw = new Uint8Array(size * 2); raw.set(fixed(c.r, size), 0); raw.set(fixed(c.s, size), size);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: c.sha384 ? 'SHA-384' : 'SHA-256' }, await keyOf(issuer), raw, c.tbs);
    if (!ok) throw new Error(`certificate ${i} is not signed by ${i + 1}`);
  }
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await keyOf(chain[0]), b64urlBytes(parts[2]),
                                        new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) throw new Error('bad signature');
  return JSON.parse(new TextDecoder().decode(b64urlBytes(parts[1])));
}

const STATUS = { 1: 'active', 2: 'expired', 3: 'billing_retry', 4: 'grace', 5: 'revoked' };

/** POST /appstore/notifications — Apple's server, no cookie, no Origin (CSRF-exempt). */
export async function appstoreNotification(req, env) {
  let body = {};
  try { body = await req.json(); } catch {}
  let n;
  try { n = await appleJws(body.signedPayload); } catch (e) { return json({ error: 'unverified', why: String(e.message || e) }, 400); }
  const d = n.data || {};
  if (d.bundleId && d.bundleId !== BUNDLE) return json({ ok: true, ignored: 'another app' });
  let tx = null, renew = null;
  try { if (d.signedTransactionInfo) tx = await appleJws(d.signedTransactionInfo); } catch (e) { return json({ error: 'unverified_transaction' }, 400); }
  try { if (d.signedRenewalInfo) renew = await appleJws(d.signedRenewalInfo); } catch (e) { renew = null; }
  const t = now(), env_ = d.environment || (tx && tx.environment) || null;
  const sec = (ms) => (ms ? Math.floor(Number(ms) / 1000) : null);
  await env.DB.prepare(
    `INSERT OR IGNORE INTO appstore_events (uuid, received_at, type, subtype, environment, bundle_id, original_transaction_id,
       transaction_id, product_id, signed_date, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(n.notificationUUID || crypto.randomUUID(), t, n.notificationType || null, n.subtype || null, env_, d.bundleId || null,
         tx ? String(tx.originalTransactionId) : null, tx ? String(tx.transactionId) : null, tx ? tx.productId : null, sec(n.signedDate),
         JSON.stringify({ tx, renew, status: d.status ?? null }).slice(0, 8000)).run();
  if (tx && tx.originalTransactionId) {
    const status = STATUS[d.status] || (n.notificationType === 'EXPIRED' ? 'expired' : n.notificationType === 'REFUND' || n.notificationType === 'REVOKE' ? 'revoked' : 'active');
    await env.DB.prepare(
      `INSERT INTO appstore_subs (original_transaction_id, environment, bundle_id, product_id, first_purchase, purchase_date, expires_date,
         price, currency, storefront, auto_renew, status, last_type, last_subtype, app_account_token, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (original_transaction_id) DO UPDATE SET environment = excluded.environment, product_id = excluded.product_id,
         purchase_date = excluded.purchase_date, expires_date = excluded.expires_date, price = excluded.price, currency = excluded.currency,
         storefront = excluded.storefront, auto_renew = COALESCE(excluded.auto_renew, appstore_subs.auto_renew), status = excluded.status,
         last_type = excluded.last_type, last_subtype = excluded.last_subtype,
         app_account_token = COALESCE(excluded.app_account_token, appstore_subs.app_account_token), updated_at = excluded.updated_at`
    ).bind(String(tx.originalTransactionId), env_, tx.bundleId || d.bundleId || null, tx.productId || null, sec(tx.originalPurchaseDate),
           sec(tx.purchaseDate), sec(tx.expiresDate), tx.price != null ? Number(tx.price) : null, tx.currency || null, tx.storefront || null,
           renew && renew.autoRenewStatus != null ? Number(renew.autoRenewStatus) : null, status, n.notificationType || null, n.subtype || null,
           tx.appAccountToken || null, t).run();
  }
  return json({ ok: true });
}

/** The dashboard's App Store rows: the subscriptions now, and the latest notifications. */
export async function appstoreAdmin(env) {
  const all = async (sql) => ((await env.DB.prepare(sql).all().catch(() => ({ results: [] }))).results) || [];
  const subs = await all('SELECT * FROM appstore_subs ORDER BY COALESCE(purchase_date, updated_at) DESC LIMIT 200');
  const events = await all(`SELECT uuid, received_at, type, subtype, environment, product_id, original_transaction_id
                              FROM appstore_events ORDER BY received_at DESC LIMIT 50`);
  const live = subs.filter((s) => s.environment === 'Production');
  return { subs, events, live: { active: live.filter((s) => s.status === 'active' || s.status === 'grace').length, total: live.length },
           sandbox: subs.length - live.length, lastEvent: events[0] ? events[0].received_at : null };
}
