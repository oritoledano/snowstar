/** Request health — what the server is actually doing, and for whom.
 *
 * Until this existed the Worker was entirely opaque from the outside. A thrown
 * error went to console.error and then nowhere: the isolate that held it is
 * gone within seconds, so unless somebody was tailing logs at that exact
 * moment, a 500 left no trace anywhere. Nothing timed anything. Nothing
 * attributed anything to anybody. "Is it slow?" and "did that fail?" were
 * questions the system could not be asked.
 *
 * The shape is deliberately dull: one row per request in D1, written AFTER the
 * response has gone, read back with plain GROUP BYs. No aggregation table, no
 * rollup job, no second store. At this traffic a fortnight is a few thousand
 * rows, and the prune — not a clever schema — is what keeps it that way.
 */

const now = () => Math.floor(Date.now() / 1000);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/** How long the log is worth keeping. Long enough to answer "was it doing this
 *  last week too", short enough that the table never becomes a thing to manage. */
export const KEEP_DAYS = 14;

/* One route per endpoint, not one per URL. /t/<slug> is 400 real addresses and
   a crawler walks all of them in a sitting — left alone they would bury every
   endpoint that matters underneath four hundred rows of one. Everything else in
   this Worker is a literal path (188 `path === '...'` tests and exactly one
   regex), so no other collapsing is needed: the cardinality is the API surface.
   Junk from vulnerability scanners still lands as itself, which is the point —
   it is visible, and the ORDER BY in the report drops it to the bottom. */
function routeOf(url) {
  const p = url.pathname;
  if (p.startsWith('/t/')) return '/t/:slug';
  return (p.replace(/^\/api/, '') || '/').slice(0, 80);
}

/**
 * File one request. Call inside ctx.waitUntil: the response is already on its
 * way, so nothing here is on the visitor's clock.
 *
 * This must never throw. It runs detached, so a rejection is an unhandled one,
 * and — worse — the whole point of the thing is to be the part that still works
 * when something else is broken. A health log that can take the request down
 * with it is not a health log.
 */
export async function recordRequest(env, { url, method, status, ms, userId, ray, detail }) {
  try {
    await env.DB.prepare(
      `INSERT INTO req_log (ts, ms, method, route, status, user_id, ray, detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      now(),
      Math.max(0, Math.round(ms)),
      String(method || 'GET').slice(0, 8),
      routeOf(url),
      status | 0,
      userId == null ? null : userId,
      ray ? String(ray).slice(0, 40) : null,
      // Only a 5xx earns a detail. A 404 explains itself by its route, and
      // keeping a body for every one of them would make the table mostly noise.
      status >= 500 && detail ? String(detail).slice(0, 2000) : null
    ).run();
  } catch {
    /* Deliberately silent. There is nowhere left to report to — the reporting
       is what just failed — and console.error here would fire on every request
       for as long as the table were missing. */
  }
}

/** Daily, from the cron. Returns how many rows went, for the digest. */
export async function pruneReqLog(env, days = KEEP_DAYS) {
  try {
    const cutoff = now() - days * 86400;
    const r = await env.DB.prepare('DELETE FROM req_log WHERE ts < ?').bind(cutoff).run();
    return (r && r.meta && r.meta.changes) || 0;
  } catch {
    return 0;
  }
}

/**
 * The report behind System → Health.
 *
 * Four questions, each its own statement, all over the same time window:
 * is it healthy, which endpoints are slow, who is asking for the most, and
 * what has actually broken.
 */
export async function healthReport(env, user, url) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);

  const hours = Math.min(KEEP_DAYS * 24, Math.max(1, parseInt(url.searchParams.get('h'), 10) || 24));
  const since = now() - hours * 3600;

  /* One batch, one round trip. D1 runs a batch sequentially in a transaction,
     which for five reads is both cheaper and more predictable than five
     separate awaits racing on the same connection. */
  let out;
  try {
    out = await env.DB.batch([
      // 0 — the headline
      env.DB.prepare(
        `SELECT COUNT(*) AS n,
                SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) AS errs,
                SUM(CASE WHEN status >= 400 AND status < 500 THEN 1 ELSE 0 END) AS refused,
                AVG(ms) AS avg_ms, MAX(ms) AS max_ms,
                COUNT(DISTINCT user_id) AS people
           FROM req_log WHERE ts >= ?`
      ).bind(since),

      /* 1 — the middle and the tail. An average hides the thing you are looking
         for: one request in twenty taking four seconds barely moves a mean that
         thousands of 20ms reads are holding down. PERCENT_RANK is a window
         function, which this SQLite has had since long before D1 existed. */
      env.DB.prepare(
        `SELECT MAX(CASE WHEN pct <= 0.50 THEN ms END) AS p50,
                MAX(CASE WHEN pct <= 0.95 THEN ms END) AS p95
           FROM (SELECT ms, PERCENT_RANK() OVER (ORDER BY ms) AS pct
                   FROM req_log WHERE ts >= ?)`
      ).bind(since),

      // 2 — by endpoint. LIMIT is what keeps scanner junk from mattering:
      // each junk path appears once and never reaches the top of the list.
      env.DB.prepare(
        `SELECT route, method, COUNT(*) AS n,
                SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) AS errs,
                SUM(CASE WHEN status >= 400 AND status < 500 THEN 1 ELSE 0 END) AS refused,
                CAST(AVG(ms) AS INTEGER) AS avg_ms, MAX(ms) AS max_ms
           FROM req_log WHERE ts >= ?
          GROUP BY route, method ORDER BY n DESC LIMIT 40`
      ).bind(since),

      /* 3 — by person, which is the question that was actually asked. Signed-out
         traffic is the bulk of it and has no row here by design: this table
         holds no IP and no fingerprint, so an anonymous request is counted in
         the headline and attributed to nobody. */
      env.DB.prepare(
        `SELECT r.user_id, u.email, u.name, COUNT(*) AS n,
                SUM(CASE WHEN r.status >= 500 THEN 1 ELSE 0 END) AS errs,
                CAST(AVG(r.ms) AS INTEGER) AS avg_ms, MAX(r.ms) AS max_ms,
                MAX(r.ts) AS last_ts
           FROM req_log r LEFT JOIN users u ON u.id = r.user_id
          WHERE r.ts >= ? AND r.user_id IS NOT NULL
          GROUP BY r.user_id ORDER BY n DESC LIMIT 50`
      ).bind(since),

      // 4 — what broke, with the stack that used to go to console and vanish
      env.DB.prepare(
        `SELECT r.id, r.ts, r.ms, r.method, r.route, r.status, r.ray, r.detail,
                u.email
           FROM req_log r LEFT JOIN users u ON u.id = r.user_id
          WHERE r.ts >= ? AND r.status >= 500
          ORDER BY r.id DESC LIMIT 40`
      ).bind(since),

      // 5 — shape over time, for the sparkline
      env.DB.prepare(
        `SELECT (ts / 3600) * 3600 AS hour, COUNT(*) AS n,
                SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) AS errs,
                CAST(AVG(ms) AS INTEGER) AS avg_ms
           FROM req_log WHERE ts >= ?
          GROUP BY hour ORDER BY hour`
      ).bind(since),
    ]);
  } catch (e) {
    /* Almost always one thing: schema-health.sql has not been applied yet. Say
       so plainly rather than returning an empty report that looks like silence
       from a healthy server. */
    return json({
      error: 'no_log',
      note: String(e && e.message || e).slice(0, 300),
      hint: 'Apply worker/schema-health.sql to snowstar-members.',
    }, 200);
  }

  const one = (i) => (out[i] && out[i].results && out[i].results[0]) || {};
  const many = (i) => (out[i] && out[i].results) || [];
  const head = one(0), pct = one(1);

  return json({
    hours,
    since,
    keep_days: KEEP_DAYS,
    totals: {
      n: head.n || 0,
      errs: head.errs || 0,
      refused: head.refused || 0,
      people: head.people || 0,
      avg_ms: head.avg_ms == null ? null : Math.round(head.avg_ms),
      max_ms: head.max_ms || 0,
      p50_ms: pct.p50 == null ? null : Math.round(pct.p50),
      p95_ms: pct.p95 == null ? null : Math.round(pct.p95),
    },
    routes: many(2),
    people: many(3),
    errors: many(4),
    timeline: many(5),
  });
}
