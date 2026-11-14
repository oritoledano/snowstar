/* StreamDAW licence keys in the Worker: the format, the check every key passes before it is stored
   or emailed, and SIGNING here with the Worker's own pair (Ori, 2026-10-15: keys go out at once,
   24/7, instead of from the minter on his laptop).

   Two P-256 pairs; the app (STREAMDAW repo, plugin/Source/License.cpp) trusts both:
   - the OFFLINE pair, on Ori's Mac only (~/.cache/streamdaw/license-keypair-v2.txt): every key
     before 0.5.8, and anything minted by hand (streamdaw-keygen, then the dashboard's "Paste key…");
   - the WORKER pair (~/.cache/streamdaw/license-keypair-worker.txt), whose private half is the
     Worker secret STREAMDAW_SIGNING_KEY (put with `wrangler secret put`, never in this repo).
   Whoever can deploy code to this Worker can read that secret, so it is a separate pair: a leak
   burns only it (an app update drops kWorkerPublicKey, the keys it signed are reissued), never
   the offline one.

   A key (plugin/Source/LicenceKey.h): hex of "SD", 2 (permanent) or 3 (with an end), then UTF-8
   lines — product, SERIAL|Name, account email, machines, issued (hex ms)[, expires (hex ms)] —
   then a 64-byte P-256 ECDSA signature (r‖s: WebCrypto's own form) over SHA-256 of all before it.
   Format 4 (2026-10-27, StreamDAW sold as products): "SD", 4, the five lines, then "0" (the key
   itself never ends) and the products, "splits,compare@<hex ms>" or "all" (streamdaw-products.js
   makes the list); apps before the split refuse it, so a Splits key never unlocks all of Pro there.
   This module imports nothing, so the STREAMDAW repo's tests load it as is
   (tests/worker-keys.mjs). */

export const KEY_PUBLIC_OFFLINE = '0450e5706281c210bfaaa3e901c9d0b0a289bb6f93643bb8edca91800436164a070dadbfee3ad6bbbe641bdad21c946bb1e568671d5a0f8b46a4cbb93f1a77c2a4';
export const KEY_PUBLIC_WORKER = '045240d3dff10ad20af0afe00904e9aff6a4654f96c726779307085f1c9644d31dc139b19170c583d3884d802d0fb69638d2a6e4df58dff51a4925a657f4de14f0';
const TRUSTED = [KEY_PUBLIC_OFFLINE, KEY_PUBLIC_WORKER].filter(Boolean);

export const MACHINE_ID_RE = /^SD[0-9A-F]{12,20}$/;
// "all", or known ids in a list, each for good or "@<hex ms>" (the app ignores an id it does not know).
const PRODUCTS_RE = /^(?:all|(?:splits|station|record|compare|party)(?:@[0-9a-f]{1,13})?(?:,(?:splits|station|record|compare|party)(?:@[0-9a-f]{1,13})?)*)$/;
const EMAIL_RE = /^[^\s@"|]+@[^\s@"|]+\.[^\s@"|]{2,}$/;
export const fromHex = (h) => Uint8Array.from(String(h).match(/../g) || [], (x) => parseInt(x, 16));
const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const b64url = (b) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/* A name goes on the licence as typed, minus anything that is not printable text (and '|', which
   separates it from the serial). What listeners see as the host: never an address. */
export const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f\u007f|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

/* Format 2 or 3, signed by a pair the app trusts, for StreamDAW, for this Mac, and ending exactly
   when the order does (`expiresAt`: SECONDS, as every table here; null/undefined: permanent), so a
   pass or a month never goes out as a permanent key, nor the reverse. With `products` (the list the
   account holds now): format 4 naming exactly that list, and nothing else. */
export async function checkKey(hex, machine, expiresAt, products) {
  const magic = /^5344(02|03|04)(?:[0-9a-f]{2})+$/.exec(hex);
  if (!magic) return { error: 'that is not a StreamDAW key — paste everything streamdaw-keygen printed (keys from the old 512-bit pair are no longer accepted)' };
  if ((magic[1] === '04') !== !!products)
    return { error: products ? `this account holds products (${products}): the key must name them (format 4)` : 'that key names products, but this order is for all of Pro' };
  const pass = magic[1] === '03';
  const b = fromHex(hex);
  if (b.length < 3 + 16 + 64) return { error: 'that key looks truncated — paste everything keygen printed' };
  const signed = b.subarray(0, b.length - 64), sig = b.subarray(b.length - 64);
  let ok = false;
  for (const pubHex of TRUSTED) {
    try {
      const pub = await crypto.subtle.importKey('raw', fromHex(pubHex), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, signed);
    } catch {}
    if (ok) break;
  }
  if (!ok) return { error: 'that key does not carry the StreamDAW signature (damaged in the paste, or signed with another pair)' };
  const f = new TextDecoder().decode(signed.subarray(3)).split('\n');
  if (f.length !== (products ? 7 : pass ? 6 : 5) || f[0] !== 'StreamDAW') return { error: 'that key is not for StreamDAW' };
  if (!f[3].split(',').map((m) => m.trim().toUpperCase()).includes(machine)) return { error: `that key is for ${f[3]}, not ${machine}` };
  if (products) {
    if (f[5] !== '0') return { error: 'a products key carries its ends on the products, never on the key' };
    if (f[6] !== products) return { error: `that key gives ${f[6]}, but this account holds ${products}` };
    return { serial: f[1].split('|')[0].trim() || null, expiresAt: null, products };
  }
  const ends = pass ? parseInt(f[5], 16) : 0, want = expiresAt ? Number(expiresAt) * 1000 : 0;
  if (ends !== want) {
    if (!want) return { error: `that is a Pro pass (until ${isoOf(ends)}), but this order is permanent Pro — mint it without --days/--expires` };
    if (!ends) return { error: `that is a permanent key, but this order is a Pro pass until ${isoOf(want)} — mint it with --expires ${want}` };
    return { error: `that pass ends ${isoOf(ends)}, but the order says ${isoOf(want)} — mint it with --expires ${want}` };
  }
  return { serial: f[1].split('|')[0].trim() || null, expiresAt: ends ? ends / 1000 : null };
}

/* The signed bytes, exactly as LicenceKey::signedPart makes them (hex ms without leading zeros,
   as juce::String::toHexString writes an int64). */
export function signedPart({ serialName, email, machines, issuedMs, expiresMs, products }) {
  const lines = ['StreamDAW', serialName, email || '', machines.join(','), issuedMs.toString(16)];
  if (products) lines.push(expiresMs ? expiresMs.toString(16) : '0', products);
  else if (expiresMs) lines.push(expiresMs.toString(16));
  const text = new TextEncoder().encode(lines.join('\n'));
  const out = new Uint8Array(3 + text.length);
  out.set([0x53, 0x44, products ? 4 : expiresMs ? 3 : 2]);
  out.set(text, 3);
  return out;
}

// Short, unambiguous, readable over the phone: no O/0/I/1 (as the keygen). 32 letters divide 256,
// so the bytes map evenly.
const SERIAL_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeSerial() {
  const r = crypto.getRandomValues(new Uint8Array(16));
  return [0, 4, 8, 12].map((i) => Array.from(r.subarray(i, i + 4), (x) => SERIAL_ABC[x % 32]).join('')).join('-');
}

let cachedKey = null;   // { hex, key }: one import per Worker instance
async function signingKey(secret) {
  const h = String(secret || '').trim().toLowerCase();
  if (!/^04[0-9a-f]{192}$/.test(h)) throw new Error('STREAMDAW_SIGNING_KEY is not a P-256 private key (194 hex digits: 04, X, Y, d)');
  if (cachedKey && cachedKey.hex === h) return cachedKey.key;
  const b = fromHex(h);
  const key = await crypto.subtle.importKey('jwk',
    { kty: 'EC', crv: 'P-256', x: b64url(b.subarray(1, 33)), y: b64url(b.subarray(33, 65)), d: b64url(b.subarray(65)), ext: false },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  cachedKey = { hex: h, key };
  return key;
}

/* Mint a key here: { hex, serial } or { error }. The same refusals as streamdaw-keygen: a key that
   would not unlock, or a pass with an odd end (`expiresAt` seconds, in the coming year), is never
   made. The caller still runs checkKey on it, as on every key, before storing it. `products`: a
   format-4 key with that list (streamdaw-products.js), which never ends itself. */
export async function mintKey(secret, { name, email, machine, expiresAt, serial, products }) {
  name = cleanName(name);
  email = String(email || '').trim().toLowerCase();
  machine = String(machine || '').trim().toUpperCase();
  if (!name) return { error: 'no name for the licence' };
  if (email && !EMAIL_RE.test(email)) return { error: `odd email (${email})` };
  if (!MACHINE_ID_RE.test(machine)) return { error: `odd machine id (${machine})` };
  const nowMs = Date.now();
  let expiresMs = 0;
  if (products) {
    if (expiresAt != null) return { error: 'a products key carries its ends on the products' };
    if (!PRODUCTS_RE.test(products)) return { error: `odd products list (${products})` };
    for (const m of products.matchAll(/@([0-9a-f]+)/g)) {
      const end = parseInt(m[1], 16);
      if (!(end > nowMs && end < nowMs + 4 * 366 * 86400000)) return { error: `odd end in the products list (${products})` };
    }
  } else if (expiresAt != null) {
    const sec = Number(expiresAt);
    if (!(Number.isSafeInteger(sec) && sec * 1000 > nowMs && sec * 1000 < nowMs + 366 * 86400000)) return { error: `odd end for a key (${expiresAt}): seconds, in the coming year` };
    expiresMs = sec * 1000;
  }
  serial = serial || makeSerial();
  let key;
  try { key = await signingKey(secret); } catch (e) { return { error: e.message }; }
  const part = signedPart({ serialName: `${serial}|${name}`, email, machines: [machine], issuedMs: nowMs, expiresMs, products });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, part));
  return { hex: toHex(part) + toHex(sig), serial };
}
