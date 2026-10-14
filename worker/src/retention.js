/**
 * What the privacy policy promises to forget, and when (2026-10-14). The daily cron calls
 * privacyCleanup(); each line is one sentence of privacy.html's "How long we keep it", so a
 * change here is a change there.
 *
 * Elsewhere, already: req_log 14 days (health.js), StreamDAW stream health (samples 14 days,
 * stream rows 90 days, usage records 24 months: streamdaw-telemetry.js), live links 180 days
 * unseen (streamdaw.js), expired sign-in sessions (index.js, at each sign-in).
 *
 * Every statement is soft: one missing table must not stop the others.
 */

const DAY = 86400;
const KEEP = {
  attempts: 1 * DAY,            // rate-limit rows, a day after their window closed (they hold keyed tags only)
  streamBreadth: 1 * DAY,       // the catalogue's per-address play counter (an hour's window)
  authLog: 30 * DAY,            // sign-in breadcrumbs
  downloadTokens: 30 * DAY,     // download-link rows (a hash and an email), 30 days after the link died
  reports: 730 * DAY,           // StreamDAW problem reports: 2 years
  userMessages: 730 * DAY,      // copies of the emails we sent (receipts, keys, links): 2 years
  analytics: 730 * DAY,         // site analytics: a signed-in visitor's account is unlinked after 24 months (the counts stay)
  taxYears: 7,                  // erased people's orders: 7 years after the end of the tax year
};

/** The first second of the oldest tax year still kept, less a day for time zones: an order
 *  before this is more than 7 full years past the end of its year (Israel: a calendar year). */
export function taxCutoff(nowSec, years = KEEP.taxYears) {
  const y = new Date(nowSec * 1000).getUTCFullYear() - years;
  return Math.floor(Date.UTC(y, 0, 1) / 1000) - DAY;
}

/** `t` (seconds) for the tests. Returns what each statement removed, by name. */
export async function privacyCleanup(env, t = Math.floor(Date.now() / 1000)) {
  const out = {};
  const run = async (name, sql, ...b) => {
    try { const r = await env.DB.prepare(sql).bind(...b).run(); out[name] = (r && r.meta && r.meta.changes) || 0; }
    catch { out[name] = null; }
  };
  await run('attempts', 'DELETE FROM attempts WHERE reset_at < ?', t - KEEP.attempts);
  await run('stream_breadth', 'DELETE FROM stream_breadth WHERE ts < ?', t - KEEP.streamBreadth);
  await run('auth_log', 'DELETE FROM auth_log WHERE ts < ?', t - KEEP.authLog);
  await run('download_tokens', 'DELETE FROM download_tokens WHERE expires_at < ?', t - KEEP.downloadTokens);
  await run('streamdaw_reports', 'DELETE FROM streamdaw_reports WHERE created_at < ?', t - KEEP.reports);
  await run('user_messages', 'DELETE FROM user_messages WHERE sent_at < ?', t - KEEP.userMessages);
  await run('events', 'UPDATE events SET user_id = NULL WHERE user_id IS NOT NULL AND ts < ?', t - KEEP.analytics);
  await run('sessions_seen', 'UPDATE sessions_seen SET user_id = NULL WHERE user_id IS NOT NULL AND last_ts < ?', t - KEEP.analytics);
  const cut = taxCutoff(t);
  await run('streamdaw_orders', 'DELETE FROM streamdaw_orders WHERE erased_at IS NOT NULL AND created_at < ?', cut);
  await run('snowstash_orders', 'DELETE FROM snowstash_orders WHERE erased_at IS NOT NULL AND created_at < ?', cut);
  return out;
}
