/**
 * Snowstar / Mutra member API — accounts, favorites.
 *
 * Security posture:
 *  - passwords: HMAC-SHA256 with a server-side secret "pepper", then PBKDF2-SHA256
 *    at the platform-max 100k iterations with a 16-byte per-user salt. The pepper
 *    lives only in Worker secrets, never in D1 — so a database leak on its own
 *    can't be brute-forced offline. (Workers cap PBKDF2 at 100k, hence the pepper.)
 *  - sessions: 32 random bytes, stored SHA-256-hashed so a DB leak isn't replayable;
 *    delivered as HttpOnly + Secure + SameSite=Lax cookie (JS can never read it)
 *  - comparisons on secrets are constant-time
 *  - login/signup throttled per IP+email; generic errors so we never reveal
 *    whether an email is registered
 *  - same-origin only (the Worker shares the site's domain), plus an Origin check
 *    on writes as CSRF defence-in-depth alongside SameSite
 */

import { handleTrack, handleStats, handleJourney, sendDigest, handleDownload,
         listAlerts, setAlertsMuted } from './analytics.js';
import { sendMail, resetEmail } from './mail.js';
import { startOAuth, finishOAuth, facebookDataDeletion, claimHandoff, KILL_LEGACY_COOKIE } from './oauth.js';
import { listWorks, saveWork, reorderWorks, deleteWork, uploadWorkFile,
         listLogos, saveLogo, reorderLogos, deleteLogo } from './works.js';
import { listTexts, saveText, listNotes, saveNote, deleteNote, storageReport } from './site.js';
import {listOverrides, saveOverride, uploadCover, listUses, saveUse,
         setOrigTitle, listOrigTitles, deleteTrack, undeleteTrack } from './catalog.js';
import { bulkEdit, bulkUndo, listBatches, bulkArtist } from './bulk.js';
import { listArtists, ensureArtists, saveArtist } from './artistreg.js';
import { listChannels, addChannel, removeChannel, allChannels, setChannelStatus } from './clearlist.js';
import { registerArtist, myUploads, uploadTrack, createSubmission,
         streamSubmission, listSubmissions, reviewSubmission, cleanupOrphanUploads,
         listArtistsAdmin } from './artists.js';
import { listOutbox, sendOutbox, myCredits, respondCredit, linkOnSignIn,
         listManagedArtists, createManagedArtist, countersignClaim, claimStatus, amendDeclaration } from './rights.js';
import { updateProfile, myDownloads, myFavoritesList, uploadAvatar, clearAvatar } from './profile.js';
import { updateMember, deleteMember, memberDetail } from './members.js';
import { startCheckout, handleReturn, listStale, hypStatus } from './hyp.js';
import { createRequest, myLicences, listQueue, recordPayment,
         grantFromDashboard, revokeLicence, declineRequest } from './licensing.js';
import { handleStream } from './stream.js';
import { getClasses, setClasses } from './pricing.js';
import { listJobs, saveJob, exportJobs } from './jobs.js';
import { interpretBrief } from './agent.js';
import { listStacks, saveStack } from './stacks.js';
import { sharePage } from './share.js';
import { listTrash, emptyTrash, restoreFromTrash } from './trash.js';
import { reassignOwner, getOwner } from './ownership.js';
import { listProfiles, saveProfile, uploadArtistPhoto, setManager, deleteProfile } from './artistprofile.js';
import { listCoupons, saveCoupon, checkCoupon } from './coupons.js';
import { listEarnings, settleEarnings, myEarnings } from './earnings.js';
import { certificate } from './certificate.js';
import { submitContact, listMessages, setMessageStatus } from './contact.js';
import { publicUser } from './user.js';
import { pbkdf2, safeEqual, randB64, sha256b64, PBKDF2_ITERS } from './crypto.js';
import { currentUser, readCookies } from './session.js';

const SESSION_DAYS = 60;
const MAX_ATTEMPTS = 8;          // per window
const ATTEMPT_WINDOW = 15 * 60;  // 15 minutes
const RESET_MINUTES = 45;        // how long a password-reset link stays good
const VALID_TOKEN = /^[A-Za-z0-9_-]{20,120}$/;
const ALLOWED_ORIGINS = ['https://snowstar.company', 'https://www.snowstar.company'];

const now = () => Math.floor(Date.now() / 1000);

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

/** URL-safe random token, for things that travel in a link. */
const randToken = (n) => randB64(n).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const validEmail = (e) =>
  typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

/** Which Snowstar product a set of favorites belongs to. */
const PRODUCTS = new Set(['mutra', 'snowstar']);
const product = (v) => (PRODUCTS.has(v) ? v : 'mutra');

const favoritesFor = async (env, userId, prod) => {
  const r = await env.DB.prepare(
    'SELECT slug FROM favorites WHERE user_id = ? AND product = ? ORDER BY created_at DESC'
  ).bind(userId, prod).all();
  return (r.results || []).map((row) => row.slug);
};

/** Rate limiter keyed on IP + action + email, backed by D1. */
async function throttle(env, key) {
  const t = now();
  const row = await env.DB.prepare('SELECT count, reset_at FROM attempts WHERE bucket = ?').bind(key).first();
  if (row && row.reset_at > t) {
    if (row.count >= MAX_ATTEMPTS) return false;
    await env.DB.prepare('UPDATE attempts SET count = count + 1 WHERE bucket = ?').bind(key).run();
  } else {
    await env.DB.prepare(
      'INSERT INTO attempts (bucket, count, reset_at) VALUES (?, 1, ?) ' +
      'ON CONFLICT(bucket) DO UPDATE SET count = 1, reset_at = excluded.reset_at'
    ).bind(key, t + ATTEMPT_WINDOW).run();
  }
  return true;
}

async function clearThrottle(env, key) {
  await env.DB.prepare('DELETE FROM attempts WHERE bucket = ?').bind(key).run();
}

/**
 * One session for the whole of Snowstar.
 *
 * `Domain=snowstar.company` widens the cookie from host-only to the apex plus
 * every subdomain, so a future product at e.g. app.snowstar.company shares the
 * same signed-in user. Changing this later would sign everyone out, which is
 * why it's set now while the account list is still small.
 */
function sessionCookie(token, maxAgeSec) {
  const parts = [
    `ss_session=${token}`,
    'Domain=snowstar.company',
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSec}`,
  ];
  return parts.join('; ');
}


/** Auth success response: fresh session cookie + eviction of the legacy one. */
function authed(data, status, cookie) {
  const res = json(data, status, { 'set-cookie': cookie });
  res.headers.append('set-cookie', KILL_LEGACY_COOKIE);
  return res;
}

/** CSRF defence-in-depth: state-changing requests must come from our own origin. */
function originOk(req) {
  const o = req.headers.get('origin');
  if (!o) return true; // same-origin form/fetch without Origin (rare); SameSite still guards
  return ALLOWED_ORIGINS.includes(o);
}

async function handle(req, env, ctx) {
  const url = new URL(req.url);
  if (url.pathname.startsWith('/t/')) return sharePage(req, env, url);
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const method = req.method.toUpperCase();
  const ip = req.headers.get('cf-connecting-ip') || 'unknown';

  if (method !== 'GET' && !originOk(req)) return json({ error: 'bad_origin' }, 403);

  // ── social sign-in ──
  const oauth = path.match(/^\/auth\/(google|facebook)(\/callback)?$/);
  if (oauth && method === 'GET') {
    return oauth[2] ? finishOAuth(req, env, oauth[1]) : startOAuth(req, env, oauth[1]);
  }
  // Facebook requires this endpoint to exist before it will approve the app
  if (path === '/facebook/data-deletion' && method === 'POST') return facebookDataDeletion(req, env);
  if (path === '/auth/claim' && method === 'POST') return claimHandoff(req, env);

  // ── analytics beacon (anonymous, no auth) ──
  if (path === '/track' && method === 'POST') return handleTrack(req, env, ctx);

  // ── owner-only stats ──
  if (path === '/stats' && method === 'GET') return handleStats(req, env, await currentUser(req, env));
  if (path === '/journey' && method === 'GET') return handleJourney(req, env, await currentUser(req, env));
  if (path === '/alerts' && method === 'GET') return listAlerts(env, await currentUser(req, env));
  if (path === '/alerts/mute' && method === 'POST') return setAlertsMuted(req, env, await currentUser(req, env));

  // ── member download (the one thing that needs an account) ──
  // Playback is public and clean; downloading is gated and watermarked.
  if (path === '/stream' && (method === 'GET' || method === 'HEAD')) return handleStream(req, env);
  if (path === '/download' && method === 'GET') return handleDownload(req, env, await currentUser(req, env));

  // ── portfolio works: public read, owner-only writes ──
  if (path === '/works' && method === 'GET') return listWorks(env);
  if (path === '/works' && method === 'POST') return saveWork(req, env, await currentUser(req, env), ctx);
  if (path === '/works/reorder' && method === 'POST') return reorderWorks(req, env, await currentUser(req, env));
  if (path === '/works/delete' && method === 'POST') return deleteWork(req, env, await currentUser(req, env), ctx);
  if (path === '/works/upload' && method === 'PUT') return uploadWorkFile(req, env, await currentUser(req, env), url);

  // ── artist submissions: upload behind login, owner review before the catalog ──
  if (path === '/artist/register' && method === 'POST') return registerArtist(req, env, await currentUser(req, env));
  if (path === '/artist/uploads' && method === 'GET') return myUploads(env, await currentUser(req, env));
  if (path === '/artist/upload' && method === 'PUT') return uploadTrack(req, env, await currentUser(req, env), url);
  if (path === '/artist/submissions' && method === 'POST') return createSubmission(req, env, await currentUser(req, env), ctx);
  if (path === '/artist/file' && method === 'GET') return streamSubmission(req, env, await currentUser(req, env), url);
  if (path === '/artists' && method === 'GET') return listArtistsAdmin(env, await currentUser(req, env));
  if (path === '/storage' && method === 'GET') return storageReport(env, await currentUser(req, env));
  // rejected uploads land in trash/ and are emptied deliberately, never silently
  if (path === '/storage/trash' && method === 'GET') return listTrash(env, await currentUser(req, env));
  if (path === '/storage/trash' && method === 'DELETE') return emptyTrash(req, env, await currentUser(req, env), url);
  if (path === '/storage/trash/restore' && method === 'POST') return restoreFromTrash(req, env, await currentUser(req, env));
  // what a licence earned and who it is owed to. Records payouts; never makes them.
  if (path === '/earnings' && method === 'GET') return listEarnings(env, await currentUser(req, env));
  if (path === '/earnings/settle' && method === 'POST') return settleEarnings(req, env, await currentUser(req, env));
  if (path === '/earnings/mine' && method === 'GET') return myEarnings(env, await currentUser(req, env));
  // removing a track: audio to trash, slug onto the deleted list, both reversible
  if (path === '/tracks' && method === 'DELETE') return deleteTrack(req, env, await currentUser(req, env), url);
  if (path === '/tracks/undelete' && method === 'POST') return undeleteTrack(req, env, await currentUser(req, env));
  // discount codes. /check is public so the funnel can preview a code; the
  // discount itself is only ever applied server-side at grant time.
  if (path === '/coupons' && method === 'GET') return listCoupons(env, await currentUser(req, env));
  if (path === '/coupons' && method === 'POST') return saveCoupon(req, env, await currentUser(req, env));
  if (path === '/coupons/check' && method === 'POST') return checkCoupon(req, env);
  // artist profiles — one language for account artists and managed ones alike
  if (path === '/artists/profiles' && method === 'GET') return listProfiles(env, await currentUser(req, env));
  if (path === '/artists/profiles' && method === 'POST') return saveProfile(req, env, await currentUser(req, env));
  if (path === '/artists/photo' && method === 'PUT') return uploadArtistPhoto(req, env, await currentUser(req, env), url);
  if (path === '/artists/profiles' && method === 'DELETE') return deleteProfile(req, env, await currentUser(req, env), url);
  if (path === '/artists/managers' && method === 'POST') return setManager(req, env, await currentUser(req, env));
  // who a published upload belongs to, and moving it to another account
  if (path === '/tracks/owner' && method === 'GET') return getOwner(req, env, await currentUser(req, env), url);
  if (path === '/tracks/owner' && method === 'POST') return reassignOwner(req, env, await currentUser(req, env));
  if (path === '/submissions' && method === 'GET') return listSubmissions(env, await currentUser(req, env), url);
  if (path === '/submissions/review' && method === 'POST') return reviewSubmission(req, env, await currentUser(req, env));

  // ── rights layer: credits, claims, managed artists, owner-gated mail ──
  if (path === '/credits' && method === 'GET') return myCredits(env, await currentUser(req, env));
  if (path === '/credits/respond' && method === 'POST') return respondCredit(req, env, await currentUser(req, env));
  if (path === '/claim' && method === 'GET') return claimStatus(env, await currentUser(req, env));
  if (path === '/claim' && method === 'POST') return countersignClaim(req, env, await currentUser(req, env));
  if (path === '/managed-artists' && method === 'GET') return listManagedArtists(env, await currentUser(req, env));
  if (path === '/managed-artists' && method === 'POST') return createManagedArtist(req, env, await currentUser(req, env));
  if (path === '/mailbox' && method === 'GET') return listOutbox(env, await currentUser(req, env));
  if (path === '/mailbox/send' && method === 'POST') return sendOutbox(req, env, await currentUser(req, env));

  // ── site editor: text overrides (public read) + owner markup notes ──
  if (path === '/submissions/amend' && method === 'POST') return amendDeclaration(req, env, await currentUser(req, env));
  if (path === '/artistreg' && method === 'GET') return listArtists(env);
  if (path === '/artistreg/ensure' && method === 'POST') return ensureArtists(req, env, await currentUser(req, env));
  if (path === '/artistreg/save' && method === 'POST') return saveArtist(req, env, await currentUser(req, env));
  if (path === '/channels' && method === 'GET') return listChannels(env, await currentUser(req, env));
  if (path === '/channels' && method === 'POST') return addChannel(req, env, await currentUser(req, env));
  if (path === '/channels/remove' && method === 'POST') return removeChannel(req, env, await currentUser(req, env));
  if (path === '/channels/all' && method === 'GET') return allChannels(env, await currentUser(req, env));
  if (path === '/channels/status' && method === 'POST') return setChannelStatus(req, env, await currentUser(req, env));
  if (path === '/avatar' && method === 'PUT') return uploadAvatar(req, env, await currentUser(req, env), url);
  if (path === '/avatar/clear' && method === 'POST') return clearAvatar(req, env, await currentUser(req, env));
  if (path === '/tracks' && method === 'GET') return listOverrides(env);
  if (path === '/tracks' && method === 'POST') return saveOverride(req, env, await currentUser(req, env));
  // Bulk: dry-run by default, snapshotted so every batch is undoable.
  if (path === '/tracks/bulk' && method === 'POST') return bulkEdit(req, env, await currentUser(req, env));
  if (path === '/tracks/bulk/undo' && method === 'POST') return bulkUndo(req, env, await currentUser(req, env));
  if (path === '/tracks/bulk/batches' && method === 'GET') return listBatches(env, await currentUser(req, env));
  if (path === '/tracks/bulk/artist' && method === 'POST') return bulkArtist(req, env, await currentUser(req, env));
  // where a track has been used before — the fact that sells it
  if (path === '/tracks/uses' && method === 'GET') return listUses(env, url);
  if (path === '/tracks/uses' && method === 'POST') return saveUse(req, env, await currentUser(req, env));
  if (path === '/tracks/orig' && method === 'GET') return listOrigTitles(env);
  if (path === '/tracks/orig' && method === 'POST') return setOrigTitle(req, env, await currentUser(req, env));
  // version stacks: alternate cuts filed under the track they belong to
  if (path === '/stacks' && method === 'GET') return listStacks(env);
  if (path === '/stacks' && method === 'POST') return saveStack(req, env, await currentUser(req, env));
  // search agent: a model reads the brief, the ranking stays ours
  if (path === '/agent' && method === 'POST') return interpretBrief(req, env);
  // the job ledger — what was sold, to whom, and on what licence
  if (path === '/jobs' && method === 'GET') return listJobs(env, await currentUser(req, env));
  if (path === '/jobs' && method === 'POST') return saveJob(req, env, await currentUser(req, env));
  if (path === '/jobs/export' && method === 'GET') return exportJobs(env, await currentUser(req, env));
  if (path === '/pricing/classes' && method === 'GET') return getClasses(env, await currentUser(req, env));
  if (path === '/pricing/classes' && method === 'POST') return setClasses(req, env, await currentUser(req, env));
  if (path === '/tracks/cover' && method === 'PUT') return uploadCover(req, env, await currentUser(req, env), url);
  if (path === '/texts' && method === 'GET') return listTexts(env);
  if (path === '/texts' && method === 'POST') return saveText(req, env, await currentUser(req, env));
  if (path === '/notes' && method === 'GET') return listNotes(req, env, await currentUser(req, env), url);
  if (path === '/notes' && method === 'POST') return saveNote(req, env, await currentUser(req, env));
  if (path === '/notes/delete' && method === 'POST') return deleteNote(req, env, await currentUser(req, env));

  // ── client logos: public read, owner-only writes (shared by both sites) ──
  if (path === '/logos' && method === 'GET') return listLogos(env);
  if (path === '/logos' && method === 'POST') return saveLogo(req, env, await currentUser(req, env), ctx);
  if (path === '/logos/reorder' && method === 'POST') return reorderLogos(req, env, await currentUser(req, env));
  if (path === '/logos/delete' && method === 'POST') return deleteLogo(req, env, await currentUser(req, env), ctx);

  // ── self-service profile: edit own details, own downloads/favorites history ──
  if (path === '/profile' && method === 'POST') return updateProfile(req, env, await currentUser(req, env));
  if (path === '/downloads' && method === 'GET') return myDownloads(env, await currentUser(req, env));
  if (path === '/favorites/list' && method === 'GET') return myFavoritesList(env, await currentUser(req, env), url);

  // ── owner-only member management (dashboard) ──
  // ── HYP card payments. The return is an UNAUTHENTICATED browser GET, so it
  //    is verified against HYP's own servers before anything is granted.
  if (path === '/hyp/checkout' && method === 'POST') return startCheckout(req, env, await currentUser(req, env));
  if (path === '/hyp/return' && method === 'GET') return handleReturn(req, env, ctx);
  if (path === '/hyp/stale' && method === 'GET') return listStale(env, await currentUser(req, env));
  if (path === '/hyp/status' && method === 'GET') {
    const u = await currentUser(req, env);
    return (u && u.admin) ? hypStatus(env) : json({ error: 'forbidden' }, 403);
  }

  // ── licensing: request in, owner grants, member downloads the master ──
  if (path === '/licence/request' && method === 'POST') return createRequest(req, env, await currentUser(req, env));
  if (path === '/licence/mine' && method === 'GET') return myLicences(env, await currentUser(req, env));
  if (path === '/licence/certificate' && method === 'GET') return certificate(req, env, await currentUser(req, env));
  // Public and unauthenticated on purpose: someone whose video just got claimed,
  // or a co-owner who has found their song in a catalogue they never agreed to,
  // is exactly the person without an account.
  if (path === '/contact' && method === 'POST') return submitContact(req, env);
  if (path === '/messages' && method === 'GET') return listMessages(env, await currentUser(req, env), url);
  if (path === '/messages/status' && method === 'POST') return setMessageStatus(req, env, await currentUser(req, env));
  if (path === '/licence/queue' && method === 'GET') return listQueue(env, await currentUser(req, env), url);
  if (path === '/licence/payment' && method === 'POST') return recordPayment(req, env, await currentUser(req, env));
  if (path === '/licence/grant' && method === 'POST') return grantFromDashboard(req, env, await currentUser(req, env));
  if (path === '/licence/revoke' && method === 'POST') return revokeLicence(req, env, await currentUser(req, env));
  if (path === '/licence/decline' && method === 'POST') return declineRequest(req, env, await currentUser(req, env));

  if (path === '/members/detail' && method === 'GET') return memberDetail(env, await currentUser(req, env), url);
  if (path === '/members/update' && method === 'POST') return updateMember(req, env, await currentUser(req, env));
  if (path === '/members/delete' && method === 'POST') return deleteMember(req, env, await currentUser(req, env));

  // ── who am I ──
  if (path === '/me' && method === 'GET') {
    const u = await currentUser(req, env);
    if (!u) return json({ user: null, favorites: [] });
    const prod = product(url.searchParams.get('product'));
    return json({ user: publicUser(u), favorites: await favoritesFor(env, u.id, prod) });
  }

  // ── signup ──
  if (path === '/signup' && method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = String(body.name || '').trim().slice(0, 80) || null;
    const newsletter = body.newsletter ? 1 : 0;
    const prod = product(body.product);
    const source = String(body.source || prod).slice(0, 30);

    if (!validEmail(email)) return json({ error: 'invalid_email' }, 400);
    if (password.length < 8) return json({ error: 'weak_password' }, 400);
    if (password.length > 200) return json({ error: 'invalid' }, 400);

    if (!(await throttle(env, `signup:${ip}`))) return json({ error: 'rate_limited' }, 429);

    const exists = await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first();
    if (exists) return json({ error: 'email_taken' }, 409);

    const salt = randB64(16);
    const hash = await pbkdf2(password, salt, PBKDF2_ITERS, env);
    const id = crypto.randomUUID();
    const t = now();
    await env.DB.prepare(
      `INSERT INTO users (id, email, name, pw_hash, pw_salt, pw_iters, newsletter, signup_source, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, email, name, hash, salt, PBKDF2_ITERS, newsletter, source, t, t).run();

    const token = randB64(32);
    const maxAge = SESSION_DAYS * 86400;
    await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(await sha256b64(token), id, t, t + maxAge).run();

    // link waiting collaborator credits; NOT verified — a password signup
    // must never claim a managed-artist profile just by typing its email
    ctx.waitUntil(linkOnSignIn(env, id, email, false));

    return authed({ user: publicUser({ email, name, newsletter, pw_hash: hash, signup_source: source }), favorites: [] },
      201, sessionCookie(token, maxAge));
  }

  // ── login ──
  if (path === '/login' && method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!validEmail(email) || !password) return json({ error: 'invalid_credentials' }, 401);

    const key = `login:${ip}:${email}`;
    if (!(await throttle(env, key))) return json({ error: 'rate_limited' }, 429);

    const u = await env.DB.prepare(
      `SELECT id, email, name, newsletter, admin, avatar, pw_hash, pw_salt, pw_iters,
              first_name, last_name, country, phone, role, company, signup_source
         FROM users WHERE email = ?`
    ).bind(email).first();

    // Always run a derivation so response time doesn't reveal whether the email
    // exists — or whether it's a social-only account with no password set.
    const hasPw = !!(u && u.pw_hash && u.pw_salt);
    const salt = hasPw ? u.pw_salt : randB64(16);
    const iters = hasPw ? u.pw_iters : PBKDF2_ITERS;
    const candidate = await pbkdf2(password, salt, iters, env);
    if (!hasPw || !safeEqual(candidate, u.pw_hash)) return json({ error: 'invalid_credentials' }, 401);

    await clearThrottle(env, key);
    const t = now();
    const token = randB64(32);
    const maxAge = SESSION_DAYS * 86400;
    await env.DB.batch([
      env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .bind(await sha256b64(token), u.id, t, t + maxAge),
      env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(t, u.id),
      env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(t),
    ]);
    // idempotent: credits listed since the last visit get linked on every login
    ctx.waitUntil(linkOnSignIn(env, u.id, u.email, false));

    return authed(
      { user: publicUser(u), favorites: await favoritesFor(env, u.id, product(body.product)) },
      200, sessionCookie(token, maxAge)
    );
  }

  // ── logout ──
  if (path === '/logout' && method === 'POST') {
    for (const token of readCookies(req, 'ss_session')) {
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
        .bind(await sha256b64(token)).run();
    }
    // clear both cookie variants — the Domain= one and any legacy host-only one
    return authed({ ok: true }, 200, sessionCookie('', 0));
  }

  // ── forgot password: issue a single-use link ──
  if (path === '/reset/request' && method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    // The answer is identical either way — this endpoint must never reveal
    // whether an address has an account.
    if (!validEmail(email)) return json({ ok: true });
    if (!(await throttle(env, `reset:${ip}`))) return json({ error: 'rate_limited' }, 429);

    const u = await env.DB.prepare('SELECT id, email FROM users WHERE email = ?').bind(email).first();
    if (!u) return json({ ok: true });

    const token = randToken(32);
    const t = now();
    await env.DB.prepare(
      'INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(await sha256b64(token), u.id, t, t + RESET_MINUTES * 60).run();

    const link = `https://snowstar.company/reset.html?t=${token}`;
    ctx.waitUntil((async () => {
      try {
        await sendMail(env, { to: u.email, ...resetEmail(link, RESET_MINUTES) });
      } catch (e) {
        console.error('reset mail failed', e && e.stack ? e.stack : String(e));
      }
    })());
    return json({ ok: true });
  }

  // ── is this reset link still good? (so the page can say so up front) ──
  if (path === '/reset/check' && method === 'GET') {
    const token = url.searchParams.get('t') || '';
    if (!VALID_TOKEN.test(token)) return json({ valid: false });
    const row = await env.DB.prepare(
      'SELECT expires_at, used_at FROM password_resets WHERE token_hash = ?'
    ).bind(await sha256b64(token)).first();
    return json({ valid: !!row && !row.used_at && row.expires_at > now() });
  }

  // ── set the new password ──
  if (path === '/reset/confirm' && method === 'POST') {
    const body = await req.json().catch(() => ({}));
    const token = String(body.token || '');
    const password = String(body.password || '');
    if (!VALID_TOKEN.test(token)) return json({ error: 'invalid_token' }, 400);
    if (password.length < 8) return json({ error: 'weak_password' }, 400);
    if (password.length > 200) return json({ error: 'invalid' }, 400);
    if (!(await throttle(env, `resetc:${ip}`))) return json({ error: 'rate_limited' }, 429);

    const t = now();
    const row = await env.DB.prepare(
      `SELECT r.token_hash, r.user_id, r.expires_at, r.used_at,
              u.email, u.name, u.newsletter, u.admin, u.avatar,
              u.first_name, u.last_name, u.country, u.phone, u.role, u.company, u.signup_source
         FROM password_resets r JOIN users u ON u.id = r.user_id
        WHERE r.token_hash = ?`
    ).bind(await sha256b64(token)).first();
    if (!row || row.used_at || row.expires_at <= t) return json({ error: 'invalid_token' }, 400);

    const salt = randB64(16);
    const hash = await pbkdf2(password, salt, PBKDF2_ITERS, env);
    const sessionToken = randB64(32);
    const maxAge = SESSION_DAYS * 86400;

    await env.DB.batch([
      env.DB.prepare('UPDATE users SET pw_hash = ?, pw_salt = ?, pw_iters = ? WHERE id = ?')
        .bind(hash, salt, PBKDF2_ITERS, row.user_id),
      env.DB.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').bind(t, row.token_hash),
      // a reset is how you take an account back, so every other session dies
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id),
      env.DB.prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').bind(row.user_id),
      env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
        .bind(await sha256b64(sessionToken), row.user_id, t, t + maxAge),
    ]);
    await clearThrottle(env, `resetc:${ip}`);

    // the batch just wrote a new hash — reflect that without a second read
    row.pw_hash = hash;
    return authed(
      { user: publicUser(row), favorites: await favoritesFor(env, row.user_id, product(body.product)) },
      200, sessionCookie(sessionToken, maxAge)
    );
  }

  // ── favorites (scoped per product, so a second product can't collide) ──
  if (path === '/favorites' && (method === 'POST' || method === 'DELETE')) {
    const u = await currentUser(req, env);
    if (!u) return json({ error: 'unauthorized' }, 401);
    const body = await req.json().catch(() => ({}));
    const slug = String(body.slug || '').trim().slice(0, 120);
    if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'invalid_slug' }, 400);
    const prod = product(body.product);

    if (method === 'POST') {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO favorites (user_id, product, slug, created_at) VALUES (?, ?, ?, ?)'
      ).bind(u.id, prod, slug, now()).run();
    } else {
      await env.DB.prepare('DELETE FROM favorites WHERE user_id = ? AND product = ? AND slug = ?')
        .bind(u.id, prod, slug).run();
    }
    return json({ favorites: await favoritesFor(env, u.id, prod) });
  }

  // ── merge favorites saved before signing in ──
  if (path === '/favorites/merge' && method === 'POST') {
    const u = await currentUser(req, env);
    if (!u) return json({ error: 'unauthorized' }, 401);
    const body = await req.json().catch(() => ({}));
    const prod = product(body.product);
    const slugs = Array.isArray(body.slugs) ? body.slugs.slice(0, 500) : [];
    const valid = slugs.filter((s) => typeof s === 'string' && /^[a-z0-9-]+$/.test(s));
    if (valid.length) {
      const t = now();
      await env.DB.batch(valid.map((s) =>
        env.DB.prepare('INSERT OR IGNORE INTO favorites (user_id, product, slug, created_at) VALUES (?, ?, ?, ?)')
          .bind(u.id, prod, s, t)
      ));
    }
    return json({ favorites: await favoritesFor(env, u.id, prod) });
  }

  return json({ error: 'not_found' }, 404);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDigest(env));
    ctx.waitUntil(cleanupOrphanUploads(env));
  },

  async fetch(req, env, ctx) {
    try {
      return await handle(req, env, ctx);
    } catch (err) {
      console.error('api error', err && err.stack ? err.stack : String(err));
      return json({ error: 'server_error' }, 500);
    }
  },
};
