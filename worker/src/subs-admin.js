/**
 * Who is subscribed, read from where the money actually lands.
 *
 * Creem writes a subscription into <app>_paddle_subs - the tables Paddle left
 * behind, reused rather than renamed, because the shape was already right.
 * Both admin endpoints, meanwhile, ask their *-subs.js module for
 * <app>_subscriptions, the HYP-era table, which has nothing in it and has had
 * nothing in it since the move.
 *
 * The result was a dashboard that showed no subscribers while a real customer
 * was being billed: one live Audioctor monthly, taken on 12 November, next
 * charge 12 December, invisible in the owner's own admin.
 *
 * So this reads the table the webhook writes. It also separates live money
 * from test money, which the old view had no concept of: env is 'creem-live'
 * for a real card and 'creem-test' or 'sandbox' for everything else, and
 * mixing them is how a founder convinces himself he has four customers when
 * he has one.
 */

const now = () => Math.floor(Date.now() / 1000);

/* 'creem-live' is the only env that moved real money. Anything else - the
   Creem test mode, and the Paddle sandbox rows still sitting in these tables
   from October - is a rehearsal and is counted separately, never together. */
const isLive = (env) => String(env || '').toLowerCase() === 'creem-live';

/**
 * @param {string} app  'audioctor' | 'streamdaw'
 */
export async function creemSubs(env, app) {
  const table = app === 'streamdaw' ? 'streamdaw_paddle_subs' : 'audioctor_paddle_subs';
  let rows = [];
  try {
    const r = await env.DB.prepare(
      `SELECT s.sub_id, s.env, s.email, s.plan, s.status, s.customer_id,
              s.period_end, s.next_billed_at, s.cancel_at, s.first_ref,
              s.created_at, s.updated_at, s.entitlement_id,
              u.name AS user_name
         FROM ${table} s
         LEFT JOIN users u ON u.id = s.user_id
        ORDER BY s.created_at DESC
        LIMIT 500`
    ).all();
    rows = r.results || [];
  } catch {
    return { subs: [], live: emptyRoll(), test: emptyRoll() };
  }

  const t = now();
  const subs = rows.map((s) => {
    const live = isLive(s.env);
    /* How long they have been a subscriber, which is the question actually
       asked and is not the same as the current period. Measured to now for a
       running subscription and to the day it stopped for one that ended. */
    const until = s.status === 'canceled' || s.status === 'cancelled'
      ? (s.cancel_at || s.period_end || s.updated_at) : t;
    return {
      ...s,
      live,
      running: ['active', 'trialing', 'past_due'].includes(s.status),
      /* "Cancelled" in these tables means the renewal was switched off, not
         that access stopped: they keep it to the end of what they paid for. */
      endingOn: s.cancel_at ? (s.period_end || s.cancel_at) : null,
      forDays: Math.max(0, Math.floor((until - s.created_at) / 86400)),
    };
  });

  return {
    subs,
    live: roll(subs.filter((s) => s.live)),
    test: roll(subs.filter((s) => !s.live)),
  };
}

function emptyRoll() {
  return { total: 0, running: 0, ending: 0, stopped: 0, byPlan: {}, longestDays: 0 };
}

function roll(list) {
  const byPlan = {};
  for (const s of list) {
    if (!s.running) continue;
    byPlan[s.plan] = (byPlan[s.plan] || 0) + 1;
  }
  return {
    total: list.length,
    running: list.filter((s) => s.running).length,
    /* Still paying, but has switched the renewal off: the number worth seeing
       early, because it is the one that becomes churn next month. */
    ending: list.filter((s) => s.running && s.cancel_at).length,
    stopped: list.filter((s) => !s.running).length,
    byPlan,
    longestDays: list.reduce((n, s) => Math.max(n, s.forDays), 0),
  };
}
