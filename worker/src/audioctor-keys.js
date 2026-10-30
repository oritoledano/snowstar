/* Audioctor licence keys in the Worker (2026-10-21): StreamDAW's streamdaw-keys.js for a second product of the house.
   The same format and checks, with Audioctor's own magic ("AD"), product line ("Audioctor"), machine ids ("AD…")
   and its own P-256 pairs, so a StreamDAW key never opens Audioctor nor the reverse.

   Two pairs; the app (SNOWSTAR-ENHANCE repo, app/licence/Licence.cpp, kPublicKeys) trusts both:
   - the OFFLINE pair, on Ori's Mac only (~/.cache/snowstar-enhance/licence-keypair.txt): keys minted by hand
     (AudioctorKeyGen), pasted in the dashboard;
   - the WORKER pair (~/.cache/snowstar-enhance/licence-keypair-worker.txt, when made), whose private half is the
     Worker secret AUDIOCTOR_SIGNING_KEY (`wrangler secret put`, never in this repo).
   A key (app/licence/AudioctorKey.h): hex of "AD", 2 (permanent) or 3 (with an end: Monthly), then UTF-8 lines:
   product, SERIAL|Name, account email, machines, issued (hex ms)[, expires (hex ms)], then a 64-byte P-256 ECDSA
   signature (r‖s) over SHA-256 of all before it. Imports nothing, so a test can load it as is. */

export const KEY_PUBLIC_OFFLINE = '04e5d1982c3c006825daa26cf20dd948e54c8c58f046f2cd7c6ae76060a7e46c7ca8e84f0066f6292c367818396a87a4c4976684463757b52370be4fb2d6fc106e';
export const KEY_PUBLIC_WORKER = '04f40e6978c309549c34bd5b8fea9d5cc2ac473034c7a049c89d4095c9df3aa29ae8edcab0ae2fa0830fc504e82fbb6d0b415283662afd4589f6b677e04b90fc75';   // the Worker's pair (Ori, 2026-10-21; also in Licence.cpp)
const TRUSTED = [KEY_PUBLIC_OFFLINE, KEY_PUBLIC_WORKER].filter(Boolean);

export const MACHINE_ID_RE = /^AD[0-9A-F]{12,20}$/;
const EMAIL_RE = /^[^\s@"|]+@[^\s@"|]+\.[^\s@"|]{2,}$/;
export const fromHex = (h) => Uint8Array.from(String(h).match(/../g) || [], (x) => parseInt(x, 16));
const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const b64url = (b) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

/* A name goes on the licence as typed, minus anything that is not printable text (and '|', which
   separates it from the serial). What listeners see as the host: never an address. */
export const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f\u007f|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);

/* Format 2 or 3, signed by a pair the app trusts, for Audioctor, for this Mac, and ending exactly
   when the order does (`expiresAt`: SECONDS, as every table here; null/undefined: permanent), so a
   pass or a month never goes out as a permanent key, nor the reverse. */
export async function checkKey(hex, machine, expiresAt) {
  const magic = /^4144(02|03)(?:[0-9a-f]{2})+$/.exec(hex);
  if (!magic) return { error: /^5344/.test(hex) ? 'that is a StreamDAW key, not an Audioctor key' : 'that is not an Audioctor key — paste everything AudioctorKeyGen printed' };
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
  if (!ok) return { error: 'that key does not carry the Audioctor signature (damaged in the paste, or signed with another pair)' };
  const f = new TextDecoder().decode(signed.subarray(3)).split('\n');
  if (f.length !== (pass ? 6 : 5) || f[0] !== 'Audioctor') return { error: 'that key is not for Audioctor' };
  if (!f[3].split(',').map((m) => m.trim().toUpperCase()).includes(machine)) return { error: `that key is for ${f[3]}, not ${machine}` };
  const ends = pass ? parseInt(f[5], 16) : 0, want = expiresAt ? Number(expiresAt) * 1000 : 0;
  if (ends !== want) {
    if (!want) return { error: `that key ends (${isoOf(ends)}), but this order is Audioctor for good — mint it without --days/--expires` };
    if (!ends) return { error: `that is a permanent key, but this order is Monthly, until ${isoOf(want)} — mint it with --expires ${want}` };
    return { error: `that key ends ${isoOf(ends)}, but the order says ${isoOf(want)} — mint it with --expires ${want}` };
  }
  return { serial: f[1].split('|')[0].trim() || null, expiresAt: ends ? ends / 1000 : null };
}

/* The signed bytes, exactly as LicenceKey::signedPart makes them (hex ms without leading zeros,
   as juce::String::toHexString writes an int64). */
export function signedPart({ serialName, email, machines, issuedMs, expiresMs }) {
  const lines = ['Audioctor', serialName, email || '', machines.join(','), issuedMs.toString(16)];
  if (expiresMs) lines.push(expiresMs.toString(16));
  const text = new TextEncoder().encode(lines.join('\n'));
  const out = new Uint8Array(3 + text.length);
  out.set([0x41, 0x44, expiresMs ? 3 : 2]);   // "AD"
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
  if (!/^04[0-9a-f]{192}$/.test(h)) throw new Error('AUDIOCTOR_SIGNING_KEY is not a P-256 private key (194 hex digits: 04, X, Y, d)');
  if (cachedKey && cachedKey.hex === h) return cachedKey.key;
  const b = fromHex(h);
  const key = await crypto.subtle.importKey('jwk',
    { kty: 'EC', crv: 'P-256', x: b64url(b.subarray(1, 33)), y: b64url(b.subarray(33, 65)), d: b64url(b.subarray(65)), ext: false },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  cachedKey = { hex: h, key };
  return key;
}

/* Mint a key here: { hex, serial } or { error }. The same refusals as AudioctorKeyGen: a key that
   would not unlock, or a pass with an odd end (`expiresAt` seconds, in the coming year), is never
   made. The caller still runs checkKey on it, as on every key, before storing it. */
export async function mintKey(secret, { name, email, machine, expiresAt, serial }) {
  name = cleanName(name);
  email = String(email || '').trim().toLowerCase();
  machine = String(machine || '').trim().toUpperCase();
  if (!name) return { error: 'no name for the licence' };
  if (email && !EMAIL_RE.test(email)) return { error: `odd email (${email})` };
  if (!MACHINE_ID_RE.test(machine)) return { error: `odd machine id (${machine})` };
  const nowMs = Date.now();
  let expiresMs = 0;
  if (expiresAt != null) {
    const sec = Number(expiresAt);
    if (!(Number.isSafeInteger(sec) && sec * 1000 > nowMs && sec * 1000 < nowMs + 366 * 86400000)) return { error: `odd end for a key (${expiresAt}): seconds, in the coming year` };
    expiresMs = sec * 1000;
  }
  serial = serial || makeSerial();
  let key;
  try { key = await signingKey(secret); } catch (e) { return { error: e.message }; }
  const part = signedPart({ serialName: `${serial}|${name}`, email, machines: [machine], issuedMs: nowMs, expiresMs });
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, part));
  return { hex: toHex(part) + toHex(sig), serial };
}
