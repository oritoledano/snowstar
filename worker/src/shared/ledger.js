/* The ledger and the owed list, for the dashboard (General > Owed).
 *
 * What is owed lives as files on Ori's Mac: SNOWSTAR/audioctor/ledger/features (a feature
 * and the platforms, stores and pages it has reached) and SNOWSTAR/contracts/owed (things
 * put off). contracts/push.sh copies them here as one JSON document in ops_ledger. This
 * only reads that copy back, and only to the owner: it names work that is not released.
 *
 *   GET /api/ops/ledger  →  { ledger: {...} | null, pushedAt: ms | null }
 *
 * ledger is null until the table exists and the first push has run, and the page says
 * which of the two is missing instead of drawing an empty table.
 */
const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export async function opsLedger(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  let row = null;
  try {
    row = await env.DB.prepare("SELECT json, pushed_at FROM ops_ledger WHERE id = 'snowstar'").first();
  } catch (e) {
    if (/no such table/i.test(String(e && e.message))) return json({ ledger: null, pushedAt: null, missing: 'table' });
    throw e;
  }
  if (!row) return json({ ledger: null, pushedAt: null, missing: 'push' });
  let ledger = null;
  try { ledger = JSON.parse(row.json); } catch { return json({ ledger: null, pushedAt: row.pushed_at, missing: 'push' }); }
  return json({ ledger, pushedAt: row.pushed_at });
}
