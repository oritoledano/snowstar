/**
 * Google and Facebook sign-in (authorization code flow).
 *
 * Design notes:
 *  - `state` is 32 random bytes, stored server-side, single use, 10 minutes.
 *    That's the CSRF defence; we never trust a state we didn't issue.
 *  - Google gets PKCE too, so an intercepted code is useless without the
 *    verifier we kept.
 *  - Accounts are linked by email ONLY when the provider says the address is
 *    verified. Otherwise anyone could register an unverified address at a
 *    provider and walk into an existing account.
 *  - The `identities` table means one person can sign in by password, Google
 *    and Facebook and still be one account.
 */

const STATE_TTL = 600;          // 10 minutes to complete the round trip
const enc = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));

async function sha256url(str) {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(str)));
}

const PROVIDERS = {
  google: {
    id: (env) => env.GOOGLE_CLIENT_ID,
    secret: (env) => env.GOOGLE_CLIENT_SECRET,
    auth: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    pkce: true,
    async profile(accessToken) {
      const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!r.ok) throw new Error('google_userinfo_' + r.status);
      const p = await r.json();
      return { id: p.sub, email: (p.email || '').toLowerCase(), verified: !!p.email_verified, name: p.name, avatar: p.picture };
    },
  },
  facebook: {
    id: (env) => env.FACEBOOK_APP_ID,
    secret: (env) => env.FACEBOOK_APP_SECRET,
    auth: 'https://www.facebook.com/v21.0/dialog/oauth',
    token: 'https://graph.facebook.com/v21.0/oauth/access_token',
    scope: 'email public_profile',
    pkce: false,
    async profile(accessToken) {
      const r = await fetch(
        'https://graph.facebook.com/v21.0/me?fields=id,name,email,picture.width(200)&access_token=' +
        encodeURIComponent(accessToken));
      if (!r.ok) throw new Error('facebook_me_' + r.status);
      const p = await r.json();
      return {
        id: p.id,
        email: (p.email || '').toLowerCase(),
        // Facebook only returns an address it has already confirmed
        verified: !!p.email,
        name: p.name,
        avatar: p.picture && p.picture.data && p.picture.data.url,
      };
    },
  },
};

const redirectUri = (req, provider) =>
  new URL(`/api/auth/${provider}/callback`, new URL(req.url).origin).toString();

/** Only ever bounce back to our own pages. */
function safeReturn(raw) {
  if (!raw) return '/mutra.html';
  try {
    const u = new URL(raw, 'https://snowstar.company');
    if (u.origin !== 'https://snowstar.company') return '/mutra.html';
    return u.pathname + u.search + u.hash;
  } catch { return '/mutra.html'; }
}

const bounce = (to, extra) =>
  new Response(null, { status: 302, headers: { location: to, 'cache-control': 'no-store', ...extra } });

/** Step 1 — hand the visitor to the provider. */
export async function startOAuth(req, env, provider) {
  const cfg = PROVIDERS[provider];
  if (!cfg || !cfg.id(env)) return bounce('/mutra.html?auth=unavailable');

  const state = rand(32);
  const verifier = cfg.pkce ? rand(32) : null;
  const back = safeReturn(new URL(req.url).searchParams.get('return'));

  await env.DB.prepare(
    'INSERT INTO oauth_states (state, provider, verifier, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(state, provider + '|' + back, verifier, now(), now() + STATE_TTL).run();

  const p = new URLSearchParams({
    client_id: cfg.id(env),
    redirect_uri: redirectUri(req, provider),
    response_type: 'code',
    scope: cfg.scope,
    state,
  });
  if (cfg.pkce) {
    p.set('code_challenge', await sha256url(verifier));
    p.set('code_challenge_method', 'S256');
  }
  return bounce(`${cfg.auth}?${p}`);
}

/** Step 2 — they came back with a code. */
export async function finishOAuth(req, env, provider) {
  const cfg = PROVIDERS[provider];
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!cfg || !code || !state) return bounce('/mutra.html?auth=failed');

  // the state must be one we issued, unused and unexpired
  const row = await env.DB.prepare(
    'SELECT provider, verifier, expires_at FROM oauth_states WHERE state = ?'
  ).bind(state).first();
  await env.DB.prepare('DELETE FROM oauth_states WHERE state = ? OR expires_at < ?')
    .bind(state, now()).run();
  if (!row || row.expires_at < now()) return bounce('/mutra.html?auth=expired');

  const [stateProvider, back] = String(row.provider).split('|');
  if (stateProvider !== provider) return bounce('/mutra.html?auth=failed');

  try {
    const body = new URLSearchParams({
      client_id: cfg.id(env),
      client_secret: cfg.secret(env),
      redirect_uri: redirectUri(req, provider),
      grant_type: 'authorization_code',
      code,
    });
    if (cfg.pkce && row.verifier) body.set('code_verifier', row.verifier);

    const tr = await fetch(cfg.token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!tr.ok) throw new Error('token_' + tr.status + ' ' + (await tr.text()).slice(0, 200));
    const tok = await tr.json();
    const profile = await cfg.profile(tok.access_token);
    if (!profile.id) throw new Error('no_provider_id');

    const userId = await linkAndSignIn(env, provider, profile);
    const cookie = await issueSession(env, userId);

    // belt and braces: a code the page can exchange if the cookie above is lost
    const code = rand(32);
    const codeHash = b64url(await crypto.subtle.digest('SHA-256', enc.encode(code)));
    await env.DB.prepare(
      'INSERT INTO handoffs (code_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(codeHash, userId, now(), now() + 120).run();

    const to = safeReturn(back);
    return bounce(to + (to.includes('?') ? '&' : '?') + 'auth=ok&h=' + code,
      { 'set-cookie': cookie });
  } catch (e) {
    const why = String(e && e.message || e).slice(0, 40).replace(/[^\w .:-]/g, '');
    console.error('oauth ' + provider, e && e.stack ? e.stack : String(e));
    return bounce('/mutra.html?auth=failed&why=' + encodeURIComponent(why));
  }
}

/**
 * Find the identity, or the matching verified email, or make a new account —
 * then hand back a session cookie.
 */
async function linkAndSignIn(env, provider, profile) {
  const t = now();
  let userId;

  const existing = await env.DB.prepare(
    'SELECT user_id FROM identities WHERE provider = ? AND provider_id = ?'
  ).bind(provider, profile.id).first();

  if (existing) {
    userId = existing.user_id;
  } else {
    // Link to a password account only if the provider vouches for the address.
    const byEmail = profile.verified && profile.email
      ? await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(profile.email).first()
      : null;

    if (byEmail) {
      userId = byEmail.id;
    } else {
      userId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO users (id, email, name, newsletter, email_verified, avatar, signup_source, created_at, last_login_at)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`
      ).bind(userId, profile.email || `${provider}_${profile.id}@users.snowstar.company`,
             profile.name || null, profile.verified ? 1 : 0, profile.avatar || null,
             provider, t, t).run();
    }
    await env.DB.prepare(
      'INSERT OR IGNORE INTO identities (provider, provider_id, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(provider, profile.id, userId, profile.email || null, t).run();
  }

  // keep the avatar fresh, and note the login
  await env.DB.prepare('UPDATE users SET last_login_at = ?, avatar = COALESCE(?, avatar) WHERE id = ?')
    .bind(t, profile.avatar || null, userId).run();

  return userId;
}

/** Mint the session cookie for a user. */
export async function issueSession(env, userId) {
  const t = now();
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const maxAge = 60 * 86400;
  const hash = btoa(String.fromCharCode(...new Uint8Array(
    await crypto.subtle.digest('SHA-256', enc.encode(token)))));
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(hash, userId, t, t + maxAge).run();
  return `ss_session=${token}; Domain=snowstar.company; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/**
 * Exchange a one-time handoff code for a session.
 *
 * Some browsers drop a Set-Cookie that arrives on a redirect from another
 * site. This second path sets the cookie on an ordinary same-origin request
 * instead — the same mechanism password sign-in already uses successfully.
 */
export async function claimHandoff(req, env) {
  const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), {
    status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...h },
  });
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '');
  if (!/^[A-Za-z0-9_-]{20,120}$/.test(code)) return json({ error: 'invalid' }, 400);

  const hash = b64url(await crypto.subtle.digest('SHA-256', enc.encode(code)));
  const row = await env.DB.prepare(
    'SELECT code_hash, user_id, expires_at, used_at FROM handoffs WHERE code_hash = ?'
  ).bind(hash).first();
  await env.DB.prepare('DELETE FROM handoffs WHERE code_hash = ? OR expires_at < ?')
    .bind(hash, now()).run();
  if (!row || row.used_at || row.expires_at < now()) return json({ error: 'expired' }, 400);

  const cookie = await issueSession(env, row.user_id);
  const u = await env.DB.prepare(
    'SELECT email, name, newsletter, admin, avatar FROM users WHERE id = ?'
  ).bind(row.user_id).first();
  return json({ user: {
    email: u.email, name: u.name, newsletter: !!u.newsletter, admin: !!u.admin, avatar: u.avatar || null,
  } }, 200, { 'set-cookie': cookie });
}

/**
 * Facebook requires a data-deletion callback. It posts a signed request; we
 * verify the signature with the app secret, then delete the account outright.
 */
export async function facebookDataDeletion(req, env) {
  const json = (d, s = 200) => new Response(JSON.stringify(d), {
    status: s, headers: { 'content-type': 'application/json' },
  });
  try {
    const form = await req.formData();
    const signed = form.get('signed_request') || '';
    const [sigPart, payloadPart] = String(signed).split('.');
    if (!sigPart || !payloadPart) return json({ error: 'bad_request' }, 400);

    const unb64 = (s) => Uint8Array.from(
      atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

    const key = await crypto.subtle.importKey(
      'raw', enc.encode(env.FACEBOOK_APP_SECRET || ''),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('HMAC', key, unb64(sigPart), enc.encode(payloadPart));
    if (!ok) return json({ error: 'bad_signature' }, 403);

    const payload = JSON.parse(new TextDecoder().decode(unb64(payloadPart)));
    const fbId = payload.user_id;
    const row = await env.DB.prepare(
      'SELECT user_id FROM identities WHERE provider = ? AND provider_id = ?'
    ).bind('facebook', fbId).first();

    if (row) {
      // ON DELETE CASCADE clears sessions, favorites and identities with it
      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(row.user_id).run();
    }
    const code = fbId + '-' + now();
    return json({ url: 'https://snowstar.company/privacy.html#data-deletion', confirmation_code: code });
  } catch (e) {
    console.error('fb deletion', e && e.stack ? e.stack : String(e));
    return json({ error: 'server_error' }, 500);
  }
}
