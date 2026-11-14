/**
 * Ask — the dashboard's own assistant (2026-10-31).
 *
 * The dashboard has grown to twenty-odd pages and the owner is often away from
 * it. The questions he actually asks are small and recurring: what did people
 * look at this week, who stayed longest and what did they do, make me a code
 * for Mutra only. Finding the page that answers each one is the work, not the
 * answer.
 *
 * So this is a front door in plain language, and deliberately NOT a general
 * agent. A model is used for one job: reading a sentence and choosing one of a
 * fixed list of skills, with a few simple parameters. It never writes SQL, it
 * never sees the database, and anything it returns that is not on the list is
 * thrown away. Every query below is hand-written and parameterised here.
 *
 * Writes go one step further: this endpoint cannot write at all. A request to
 * make a coupon comes back as a PROPOSAL, which the dashboard shows as a
 * filled-in form for the owner to check and submit to /api/coupons like any
 * other code. So the worst a confused model can do is draw the wrong form.
 *
 * On time-on-page: events.duration is how long a track was listened to
 * (analytics.js only sets it for play_end), so it cannot answer "how long did
 * they spend on this page". That is derived instead from the gap to the next
 * event in the same visit, capped at 30 minutes, which is what every analytics
 * tool does and has the same known hole: the last page of a visit has no
 * measurable time, so it is undercounted. Said out loud in the answer rather
 * than hidden, because a number whose method you cannot see is worse than no
 * number.
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const now = () => Math.floor(Date.now() / 1000);

/* The same model as the search agent: it reads a situation well and answers a
   prompt this small in about a second. */
const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MAX_ASK = 600;

/* The whole surface. A skill the model names that is not a key here is
   dropped, so this object is the security boundary, not the prompt. */
const SKILLS = {
  'pages.time': { days: 7, limit: 12 },
  'visits.summary': { days: 7 },
  'visits.longest': { days: 7 },
  'traffic.referrers': { days: 7, limit: 12 },
  'traffic.countries': { days: 7, limit: 12 },
  'coupons.list': {},
  'coupon.create': {},
};

const SCOPES = ['mutra', 'streamdaw', 'audioctor', 'snowstash', 'snowstar', 'all'];

const SYSTEM = `You turn one sentence from the owner of snowstar.company into ONE skill call.

Reply with JSON only. No prose, no code fence.

{"skill": "<one of the names below>", "days": <1-90>, "limit": <1-50>, "coupon": {...}, "say": "<one short line back to the owner>"}

THE SKILLS
- pages.time        which pages people spent time on, and how long
- visits.summary    how many visits, how long they lasted on average
- visits.longest    the single longest visit, and the path that person took
- traffic.referrers where visits came from
- traffic.countries which countries visits came from
- coupons.list      the discount codes that exist
- coupon.create     propose a new discount code

"days" is how far back to look. "a week" is 7, "this month" is 30, "today" is 1.
Default to 7 when the sentence does not say.

FOR coupon.create ONLY, fill "coupon":
{"scope": "mutra|streamdaw|audioctor|snowstash|snowstar|all",
 "kind": "percent|amount", "value": <number>, "lasts_days": <number or null>,
 "max_uses": <number, 0 = unlimited>, "note": "<short reminder>", "code": "<optional, else generated>"}
"70% off" is kind percent, value 70. "30 shekels off" is kind amount, value 30.
"for a week" means lasts_days 7. If the sentence does not say how long the code
should last, set "lasts_days" to null and put the question in "say" - never
invent an expiry.
If the sentence does not say which property the code is for, set scope to null
and ask in "say".

EXAMPLES
"which page did people spend the most time on last week"
{"skill":"pages.time","days":7,"limit":12,"say":"Where the last seven days went."}

"who stayed on the site longest this month and what did they do"
{"skill":"visits.longest","days":30,"say":"The longest visit of the last thirty days."}

"make me a code for mutra only, 70% off, for a week"
{"skill":"coupon.create","coupon":{"scope":"mutra","kind":"percent","value":70,"lasts_days":7,"max_uses":0,"note":"70% off Mutra, one week"},"say":"A Mutra-only code at 70% off, expiring in seven days. Check it and press Create."}

"make me a 50% code"
{"skill":"coupon.create","coupon":{"scope":null,"kind":"percent","value":50,"lasts_days":null,"max_uses":0,"note":"50% off"},"say":"Which property is it for, and should it expire, or stay open until you switch it off?"}`;

/* Workers AI has moved the reply field around between model families, so take
   the first string that looks like one rather than betting on a shape. */
const pick = (o) => {
  if (typeof o === 'string') return o;
  if (!o || typeof o !== 'object') return '';
  for (const k of ['response', 'result', 'output_text', 'text', 'content']) {
    if (typeof o[k] === 'string') return o[k];
    if (o[k] && typeof o[k] === 'object') { const s = pick(o[k]); if (s) return s; }
  }
  if (Array.isArray(o.choices) && o.choices[0]) return pick(o.choices[0].message || o.choices[0]);
  if (Array.isArray(o.output)) { for (const x of o.output) { const s = pick(x); if (s) return s; } }
  return '';
};

function extractJson(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { /* usually fenced or chatty */ }
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch { /* keep digging */ } }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* give up */ } }
  return null;
}

const clampInt = (v, lo, hi, dflt) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

/* A page a visit sat on for more than half an hour is somebody who walked away
   from the laptop, not somebody reading, so it is counted as 0 rather than
   dragging the averages up. */
const DWELL = 'next_ts - ts BETWEEN 1 AND 1800';

async function pagesTime(env, days, limit) {
  const since = now() - days * 86400;
  const r = await env.DB.prepare(
    `WITH e AS (
       SELECT session_id, type, page, ts,
              LEAD(ts) OVER (PARTITION BY session_id ORDER BY ts) AS next_ts
         FROM events WHERE ts >= ?)
     SELECT page,
            COUNT(*) AS views,
            COUNT(DISTINCT session_id) AS visitors,
            SUM(CASE WHEN ${DWELL} THEN next_ts - ts ELSE 0 END) AS seconds,
            CAST(AVG(CASE WHEN ${DWELL} THEN next_ts - ts END) AS INT) AS avg_seconds
       FROM e WHERE type = 'view' AND page IS NOT NULL
      GROUP BY page ORDER BY seconds DESC, views DESC LIMIT ?`
  ).bind(since, limit).all();
  const rows = (r.results || []).map((x) => ({ ...x, seconds: x.seconds || 0, avg_seconds: x.avg_seconds || 0 }));
  return {
    title: `Where the last ${days} day${days === 1 ? '' : 's'} went`,
    note: 'Time on a page is the gap to that visit’s next event, capped at 30 minutes. The last page of a visit has no next event, so it is undercounted.',
    columns: ['Page', 'Time', 'Average', 'Views', 'Visitors'],
    kinds: ['text', 'secs', 'secs', 'num', 'num'],
    rows: rows.map((x) => [x.page, x.seconds, x.avg_seconds, x.views, x.visitors]),
  };
}

async function visitsSummary(env, days) {
  const since = now() - days * 86400;
  const s = await env.DB.prepare(
    `SELECT COUNT(*) AS visits,
            SUM(CASE WHEN last_ts > first_ts THEN 1 ELSE 0 END) AS measurable,
            CAST(AVG(CASE WHEN last_ts > first_ts THEN last_ts - first_ts END) AS INT) AS avg_s,
            MAX(last_ts - first_ts) AS longest_s,
            SUM(views) AS views, SUM(plays) AS plays, SUM(licenses) AS licences
       FROM sessions_seen WHERE last_ts >= ?`
  ).bind(since).first();
  const v = s || {};
  return {
    title: `The last ${days} day${days === 1 ? '' : 's'}`,
    note: 'A visit with one event has no length, so the average is over the visits that have one.',
    columns: ['Visits', 'With a length', 'Average length', 'Longest', 'Page views', 'Plays', 'Licences'],
    kinds: ['num', 'num', 'secs', 'secs', 'num', 'num', 'num'],
    rows: [[v.visits || 0, v.measurable || 0, v.avg_s || 0, v.longest_s || 0,
            v.views || 0, v.plays || 0, v.licences || 0]],
  };
}

async function visitsLongest(env, days) {
  const since = now() - days * 86400;
  const top = await env.DB.prepare(
    `SELECT session_id, first_ts, last_ts, (last_ts - first_ts) AS len, country, referrer, views, plays
       FROM sessions_seen
      WHERE last_ts >= ? AND last_ts > first_ts
      ORDER BY len DESC LIMIT 1`
  ).bind(since).first();
  if (!top) {
    return { title: `The last ${days} days`, columns: [], kinds: [], rows: [],
             note: 'No visit in that window lasted long enough to measure.' };
  }
  const path = await env.DB.prepare(
    `SELECT type, page, detail, ts FROM events WHERE session_id = ? ORDER BY ts LIMIT 60`
  ).bind(top.session_id).all();
  const steps = path.results || [];
  const start = top.first_ts;
  return {
    /* No name, no email: this says what was done, not who did it. The People
       page is where a person is looked up, with the rest of that decision. */
    title: `The longest visit of the last ${days} days — ${top.country || 'somewhere'}, ${top.views} views`,
    note: `Arrived from ${top.referrer || 'nowhere in particular'}. Visit ${top.session_id.slice(0, 8)}, the first sixty steps.`,
    columns: ['At', 'What', 'Page', 'Detail'],
    kinds: ['secs', 'text', 'text', 'text'],
    rows: steps.map((s) => [s.ts - start, s.type, s.page || '', s.detail || '']),
  };
}

async function byColumn(env, col, days, limit, title) {
  const since = now() - days * 86400;
  const r = await env.DB.prepare(
    `SELECT COALESCE(NULLIF(${col}, ''), 'direct') AS k, COUNT(*) AS visits
       FROM sessions_seen WHERE last_ts >= ? GROUP BY k ORDER BY visits DESC LIMIT ?`
  ).bind(since, limit).all();
  return {
    title: `${title}, last ${days} day${days === 1 ? '' : 's'}`,
    columns: [title, 'Visits'], kinds: ['text', 'num'],
    rows: (r.results || []).map((x) => [x.k, x.visits]),
  };
}

async function couponsList(env) {
  const r = await env.DB.prepare(
    `SELECT code, kind, value, scope, max_uses, used, expires_at, active
       FROM coupons ORDER BY active DESC, created_at DESC LIMIT 40`
  ).all();
  return {
    title: 'Discount codes',
    columns: ['Code', 'Worth', 'Property', 'Used', 'Expires', 'On'],
    kinds: ['text', 'text', 'text', 'text', 'date', 'text'],
    rows: (r.results || []).map((c) => [
      c.code,
      c.kind === 'percent' ? `${c.value}%` : `₪${(c.value / 100).toFixed(0)}`,
      c.scope || 'mutra',
      c.max_uses ? `${c.used}/${c.max_uses}` : String(c.used),
      c.expires_at || 0,
      c.active ? 'yes' : 'no',
    ]),
  };
}

/* Shapes a proposal the dashboard can show as a filled-in coupon form. Nothing
   is written here; the form posts to /api/coupons exactly as the Editor does. */
function proposeCoupon(c, say) {
  const scope = SCOPES.includes(c && c.scope) ? c.scope : null;
  const kind = c && c.kind === 'amount' ? 'amount' : 'percent';
  const value = clampInt(c && c.value, 1, kind === 'percent' ? 100 : 100000, 0);
  const lasts = c && c.lasts_days === null ? null : clampInt(c && c.lasts_days, 1, 3650, null);

  const missing = [];
  if (!scope) missing.push('which property it is for');
  if (!value) missing.push('how big the discount is');
  if (lasts === null) missing.push('whether it should expire');

  return {
    kind: 'propose',
    action: 'coupon.create',
    missing,
    say: say || (missing.length
      ? `Before I fill this in: ${missing.join(', and ')}?`
      : 'Check it and press Create.'),
    /* The body /api/coupons takes, so the form and the Editor speak the same
       language. expires_at is left out entirely when there is no expiry. */
    body: {
      scope, kind, value,
      max_uses: clampInt(c && c.max_uses, 0, 100000, 0),
      note: String((c && c.note) || '').slice(0, 200),
      code: String((c && c.code) || '').slice(0, 40).toUpperCase().replace(/[^A-Z0-9$_-]/g, ''),
      expires_at: lasts === null ? null : now() + lasts * 86400,
      lasts_days: lasts,
    },
  };
}

export async function assistantAsk(req, env, user) {
  if (!user || !user.admin) return json({ ok: false, reason: 'forbidden' }, 403);
  if (!env.AI) return json({ ok: false, reason: 'no_ai_binding' }, 503);

  const body = await req.json().catch(() => ({}));
  const ask = String(body.ask || '').trim().slice(0, MAX_ASK);
  if (ask.length < 2) return json({ ok: false, reason: 'empty' }, 400);

  let out;
  try {
    out = await Promise.race([
      env.AI.run(MODEL, {
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: ask }],
        max_tokens: 320,
        temperature: 0.1,
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000)),
    ]);
  } catch (e) {
    return json({ ok: false, reason: 'ai_failed',
                  detail: String((e && e.message) || e).slice(0, 120) }, 502);
  }

  const parsed = extractJson(pick(out));
  if (!parsed || typeof parsed !== 'object') {
    return json({ ok: false, reason: 'unparseable' }, 502);
  }

  const skill = typeof parsed.skill === 'string' ? parsed.skill : '';
  if (!Object.prototype.hasOwnProperty.call(SKILLS, skill)) {
    return json({ ok: true, kind: 'ask',
      say: 'I can show you pages and the time on them, how long visits lasted, the longest '
         + 'visit and the path it took, where visits came from, the discount codes you have, '
         + 'or draft a new code. Ask me one of those.' });
  }

  const d = SKILLS[skill];
  const days = clampInt(parsed.days, 1, 90, d.days || 7);
  const limit = clampInt(parsed.limit, 1, 50, d.limit || 12);
  const say = String(parsed.say || '').slice(0, 300);

  try {
    if (skill === 'coupon.create') return json({ ok: true, ...proposeCoupon(parsed.coupon, say) });

    let table;
    if (skill === 'pages.time') table = await pagesTime(env, days, limit);
    else if (skill === 'visits.summary') table = await visitsSummary(env, days);
    else if (skill === 'visits.longest') table = await visitsLongest(env, days);
    else if (skill === 'traffic.referrers') table = await byColumn(env, 'referrer', days, limit, 'Came from');
    else if (skill === 'traffic.countries') table = await byColumn(env, 'country', days, limit, 'Country');
    else if (skill === 'coupons.list') table = await couponsList(env);

    return json({ ok: true, kind: 'answer', skill, days, say, ...table });
  } catch (e) {
    return json({ ok: false, reason: 'query_failed',
                  detail: String((e && e.message) || e).slice(0, 200) }, 500);
  }
}
