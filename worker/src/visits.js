/**
 * Visits — one row per visit, with the whole visit in it.
 *
 * The traffic page answers "how many" well and "who did what" badly. It counts
 * visits, plays and licence clicks, lists top tracks, referrers and countries,
 * and then offers Recent visits: when the visit ENDED, a name or "anonymous",
 * and three totals. To find out what somebody actually did you clicked one row
 * at a time and read a list of events. Six questions the owner asks every time
 * were not answerable at a glance:
 *
 *   when did they arrive (date and hour, not just the day)
 *   how long did they stay
 *   which pages, in order
 *   did they sign up, or were they already a member
 *   where did they linger
 *   where did they leave
 *
 * All six are in the events table already; none of them were being read. This
 * endpoint answers them per visit, and hands back each visit's steps with it so
 * the row can open without another request.
 *
 * Time on a page is the gap to the next event in the same visit, capped at 30
 * minutes. It is the only way to get it from this data: events.duration is how
 * long a TRACK was listened to (analytics.js sets it for play_end alone), not
 * time on a page. The last page of a visit has no next event, so its dwell is
 * unknown rather than zero, and the exit page is reported without a time.
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const now = () => Math.floor(Date.now() / 1000);

/* Longer than this and they walked away from the machine; counting it as
   reading would quietly inflate every average on the page. */
const MAX_DWELL = 1800;

/* A visit whose only event is the one that opened it has no measurable length,
   and there are a lot of them. They are still visits and still counted; they
   just cannot answer "how long". */
export async function listVisits(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);

  const url = new URL(req.url);
  const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days') || '1', 10)));
  const limit = Math.min(200, Math.max(5, parseInt(url.searchParams.get('limit') || '60', 10)));
  const since = now() - days * 86400;

  /* The owner's own visits are not traffic. analytics.js stops recording them
     from 13 November, but 4,647 of the 7,423 events already in the table were
     his - nearly two thirds - so a reader that only stopped at the write would
     still show mostly him for as long as the window reaches back. Excluded
     here rather than deleted: the rows are real history and some of them are
     the only record of a bug being reproduced. A visit counts as his if any
     event in it carries an admin's id. */
  const vs = await env.DB.prepare(
    `SELECT session_id, first_ts, last_ts, country, referrer, views, plays, licenses
       FROM sessions_seen
      WHERE last_ts >= ?
        AND session_id NOT IN (
          SELECT e.session_id FROM events e
            JOIN users u ON u.id = e.user_id
           WHERE u.admin = 1)
      ORDER BY first_ts DESC
      LIMIT ?`
  ).bind(since, limit).all();

  const visits = vs.results || [];
  if (!visits.length) return json({ days, visits: [], totals: emptyTotals() });

  /* One query for every step of every visit on the page, rather than one per
     row. The id tiebreak matters: several events can share a second, and a
     path that reorders itself between two loads is not a path. */
  const ids = visits.map((v) => v.session_id);
  const marks = ids.map(() => '?').join(',');
  const es = await env.DB.prepare(
    `SELECT session_id, type, page, detail, ts, user_id
       FROM events
      WHERE session_id IN (${marks})
      ORDER BY session_id, ts, id`
  ).bind(...ids).all();

  const bySession = new Map();
  for (const e of es.results || []) {
    if (!bySession.has(e.session_id)) bySession.set(e.session_id, []);
    bySession.get(e.session_id).push(e);
  }

  /* Who they were, resolved once for everyone on the page. The same rule as
     the journey drawer uses - the LAST identified user in the visit - so the
     two views cannot disagree about a shared browser. */
  const userIds = [...new Set((es.results || []).map((e) => e.user_id).filter(Boolean))];
  const people = new Map();
  if (userIds.length) {
    const um = userIds.map(() => '?').join(',');
    const us = await env.DB.prepare(
      `SELECT id, name, email, created_at, signup_source FROM users WHERE id IN (${um})`
    ).bind(...userIds).all();
    for (const u of us.results || []) people.set(String(u.id), u);
  }

  const out = visits.map((v) => {
    const steps = bySession.get(v.session_id) || [];

    /* Dwell per step, and the page totals built from the same pass. */
    const perPage = new Map();
    const walked = steps.map((s, i) => {
      const next = steps[i + 1];
      const gap = next ? next.ts - s.ts : null;
      const dwell = gap !== null && gap >= 1 && gap <= MAX_DWELL ? gap : null;
      if (s.type === 'view' && s.page && dwell) {
        perPage.set(s.page, (perPage.get(s.page) || 0) + dwell);
      }
      return {
        at: s.ts - v.first_ts,          // seconds into the visit
        ts: s.ts,
        type: s.type,
        page: s.page || '',
        detail: s.detail || '',
        dwell,
      };
    });

    const viewed = walked.filter((s) => s.type === 'view' && s.page);

    /* Two different numbers, because the obvious one lies. last_ts - first_ts
       is the span from arrival to the last thing they did, and a tab left open
       overnight keeps extending it: one visit in the table reads 19 hours. So
       the span is kept and shown, but "active" - the capped gaps added up - is
       what the average is built from, because that is time somebody was
       actually there. They agree for any normal visit and diverge exactly when
       the span stops meaning anything. */
    const active = walked.reduce((n, s) => n + (s.dwell || 0), 0);
    let longest = null;
    for (const [page, seconds] of perPage) {
      if (!longest || seconds > longest.seconds) longest = { page, seconds };
    }

    const uid = steps.map((s) => s.user_id).reverse().find(Boolean);
    const u = uid ? people.get(String(uid)) : null;
    /* Signed up DURING this visit, rather than arriving already a member:
       the account was created inside the visit, give or take a minute at each
       end for the round trip through a provider. */
    const signedUpNow = !!(u && u.created_at >= v.first_ts - 60 && u.created_at <= v.last_ts + 300);

    return {
      sid: v.session_id,
      started: v.first_ts,
      ended: v.last_ts,
      seconds: v.last_ts > v.first_ts ? v.last_ts - v.first_ts : null,
      active: active || null,
      // a span far longer than the time actually spent means the tab was left open
      idle: v.last_ts - v.first_ts > 7200 && active < (v.last_ts - v.first_ts) / 4,
      country: v.country || '',
      referrer: v.referrer || '',
      pages: viewed.length,
      entry: viewed.length ? viewed[0].page : '',
      exit: viewed.length ? viewed[viewed.length - 1].page : '',
      longest,
      plays: v.plays || 0,
      licences: v.licenses || 0,
      who: u ? { name: u.name || '', email: u.email || '', source: u.signup_source || '', signedUpNow } : null,
      /* Capped: a visit with 200 steps is a bot or a very long session, and
         either way the first 40 say what happened. */
      steps: walked.slice(0, 40),
      moreSteps: Math.max(0, walked.length - 40),
    };
  });

  return json({ days, visits: out, totals: totals(out) });
}

function emptyTotals() {
  return { visits: 0, measurable: 0, avgSeconds: 0, signedIn: 0, signedUp: 0, bounced: 0 };
}

function totals(rows) {
  const timed = rows.filter((r) => r.seconds);
  return {
    visits: rows.length,
    measurable: timed.length,
    /* Built from active time, not the span: one tab left open overnight would
       otherwise set the average for the whole day. */
    avgSeconds: (() => {
      const act = rows.filter((r) => r.active);
      return act.length ? Math.round(act.reduce((n, r) => n + r.active, 0) / act.length) : 0;
    })(),
    signedIn: rows.filter((r) => r.who).length,
    signedUp: rows.filter((r) => r.who && r.who.signedUpNow).length,
    /* One page and gone. Worth its own number: it is the single figure that
       says whether the page they land on is doing its job. */
    bounced: rows.filter((r) => r.pages <= 1).length,
  };
}
