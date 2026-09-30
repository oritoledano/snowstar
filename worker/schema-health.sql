-- Request health.
--
-- Nothing in this Worker had ever measured itself. index.js caught a thrown
-- error, wrote it to console — where it dies with the isolate, visible only if
-- somebody happened to be tailing at that second — and returned a bare 500. So
-- there was no way to answer any of: how long does anything take, how much is
-- any one person asking of the server, and did a request fail at all. Not "how
-- often" — AT ALL.
--
-- One row per request, written after the response has already gone (the write
-- rides ctx.waitUntil, so it costs the visitor nothing), pruned to a fortnight
-- by the daily cron. At this site's traffic — 56 analytics events in the last
-- day, 12 accounts — that is a few thousand rows, and the prune is what bounds
-- it rather than any cleverness here. If traffic ever makes a write per request
-- the wrong trade, the lever is sampling in recordRequest, not a schema change.
--
-- user_id is ON DELETE SET NULL like every other user FK in this database:
-- clearing a test account leaves its traffic in the history and forgets whose
-- it was, which is the right way round for a health log. reset.js sweeps it by
-- id as well, because the FK is only enforced when the connection has
-- foreign_keys ON and nothing here guarantees that.
CREATE TABLE IF NOT EXISTS req_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       INTEGER NOT NULL,          -- epoch seconds, when the response was sent
  ms       INTEGER NOT NULL,          -- wall time inside the Worker
  method   TEXT    NOT NULL,
  route    TEXT    NOT NULL,          -- path with /api stripped; /t/<slug> collapsed
  status   INTEGER NOT NULL,
  user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ray      TEXT,                      -- CF-Ray, to line a row up with Cloudflare's own logs
  detail   TEXT                       -- the stack, and only ever for a 5xx
);

-- ts first in every index: every question this table answers is asked about a
-- window of time, and an index that cannot narrow by time has to read the lot.
CREATE INDEX IF NOT EXISTS idx_req_ts    ON req_log(ts);
CREATE INDEX IF NOT EXISTS idx_req_user  ON req_log(user_id, ts);
CREATE INDEX IF NOT EXISTS idx_req_route ON req_log(route, ts);
-- errors are rare, so this one earns its keep: it turns "show me what broke"
-- from a scan of the fortnight into a handful of rows.
CREATE INDEX IF NOT EXISTS idx_req_bad   ON req_log(status, ts);
