/**
 * The job ledger.
 *
 * One row per piece of work sold: when it was quoted, what it was, who paid,
 * and — the part that has never been written down anywhere — exactly what
 * licence went with it.
 *
 * Why this is worth having as a table rather than a folder of PDFs: the licence
 * columns are the ones somebody asks about years later. "Can we still run the
 * Shufersal spot?" is answerable in a second if the period and territory are in
 * a row, and is an afternoon in Dropbox if they are inside a signed offer whose
 * filename you have to remember. The same row also answers the question the
 * other way round — which licences are about to lapse, and which client has
 * quietly been running past their term.
 *
 * `licensed` is a plain flag rather than being inferred from the other columns.
 * Plenty of jobs are work-for-hire with no separate licence at all, and an
 * empty period must not be ambiguous between "no licence" and "licence, period
 * unknown".
 */

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const clean = (v, max = 200) => String(v == null ? '' : v).trim().slice(0, max);

/* Suggested vocabularies. Deliberately NOT enforced — this is a private
   ledger, and a dropdown that refuses the one job that does not fit is worse
   than a free field. They drive datalists in the UI, nothing more. */
export const SERVICES = [
  'Original music', 'Arrangement', 'Post production', 'Sound design',
  'Voice over', 'Mix', 'Master', 'Sonic branding', 'Licence only', 'Other',
];
export const MEDIA = [
  'TV', 'Digital', 'Social', 'Radio', 'Cinema', 'In-app', 'Internal',
  'Point of sale', 'Trade show', 'Out of home', 'All media',
];
export const TERRITORIES = ['Israel', 'Worldwide', 'Europe', 'North America', 'Other'];

const FIELDS = ['job_date', 'project', 'client', 'agency', 'service', 'lic_media',
                'lic_period', 'lic_territory', 'note', 'source'];

/** GET /jobs — everything, newest first. A few hundred rows at most, so it is
 *  sent whole and filtered in the browser rather than paginated. */
export async function listJobs(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const r = await env.DB.prepare(
    `SELECT j.*, w.title AS work_title
       FROM jobs j LEFT JOIN works w ON w.id = j.work_id
      ORDER BY COALESCE(j.job_date, '0000') DESC, j.id DESC`
  ).all().catch(() => ({ results: [] }));
  return json({
    jobs: r.results || [],
    services: SERVICES, media: MEDIA, territories: TERRITORIES,
  });
}

/** POST /jobs — create or update one row. */
export async function saveJob(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));

  if (b.remove) {
    const id = Number(b.remove);
    if (!Number.isInteger(id)) return json({ error: 'bad_id' }, 400);
    await env.DB.prepare('DELETE FROM jobs WHERE id = ?').bind(id).run();
    return json({ ok: true, removed: id });
  }

  const project = clean(b.project, 200);
  if (!project) return json({ error: 'project_required' }, 400);

  // Dates are stored as YYYY-MM-DD text, not a timestamp: this is a business
  // date somebody typed off a work order, and a timezone would only ever move
  // it by a day in the wrong direction.
  let jobDate = clean(b.job_date, 10);
  if (jobDate && !/^\d{4}-\d{2}-\d{2}$/.test(jobDate)) {
    if (/^\d{4}$/.test(jobDate)) jobDate = jobDate + '-01-01';   // year alone is fine
    else jobDate = '';
  }

  const vals = {
    job_date: jobDate || null,
    project,
    client: clean(b.client, 200) || null,
    agency: clean(b.agency, 200) || null,
    service: clean(b.service, 120) || null,
    licensed: b.licensed ? 1 : 0,
    lic_media: Array.isArray(b.lic_media) ? b.lic_media.map((x) => clean(x, 40)).join(', ')
                                          : clean(b.lic_media, 200) || null,
    lic_period: clean(b.lic_period, 120) || null,
    lic_territory: clean(b.lic_territory, 120) || null,
    versions: Number.isFinite(Number(b.versions)) && Number(b.versions) >= 0
      ? Math.round(Number(b.versions)) : null,
    work_id: Number.isInteger(Number(b.work_id)) && Number(b.work_id) > 0
      ? Number(b.work_id) : null,
    source: clean(b.source, 300) || null,
    note: clean(b.note, 1000) || null,
  };
  const t = now();

  if (b.id) {
    const id = Number(b.id);
    const cols = Object.keys(vals).map((k) => `${k}=?`).join(', ');
    await env.DB.prepare(`UPDATE jobs SET ${cols}, updated_at=? WHERE id=?`)
      .bind(...Object.values(vals), t, id).run();
    return json({ ok: true, id });
  }
  const cols = Object.keys(vals).join(', ');
  const qs = Object.keys(vals).map(() => '?').join(', ');
  const r = await env.DB.prepare(
    `INSERT INTO jobs (${cols}, created_at, updated_at) VALUES (${qs}, ?, ?)`
  ).bind(...Object.values(vals), t, t).run();
  return json({ ok: true, id: r.meta.last_row_id });
}

/**
 * GET /jobs/export — the whole ledger as CSV.
 *
 * Because the thing an accountant, a lawyer or a future buyer of this business
 * asks for is a spreadsheet, and a table you cannot get out of is a table you
 * end up keeping twice.
 */
export async function exportJobs(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const r = await env.DB.prepare(
    `SELECT j.job_date, j.project, j.client, j.agency, j.service, j.licensed,
            j.lic_media, j.lic_period, j.lic_territory, j.versions, j.note
       FROM jobs j ORDER BY COALESCE(j.job_date,'0000') DESC, j.id DESC`
  ).all().catch(() => ({ results: [] }));

  const head = ['Date', 'Project', 'Client', 'Agency', 'Service', 'Licensed',
                'Licence media', 'Period', 'Territory', 'Versions', 'Note'];
  // Excel opens a UTF-8 CSV as mojibake without a BOM, and half this ledger is
  // Hebrew — so the BOM is not optional here.
  const cell = (v) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = (r.results || []).map((x) => [
    x.job_date || '', x.project, x.client || '', x.agency || '', x.service || '',
    x.licensed ? 'Yes' : 'No', x.lic_media || '', x.lic_period || '',
    x.lic_territory || '', x.versions == null ? '' : x.versions, x.note || '',
  ].map(cell).join(','));

  return new Response('﻿' + [head.join(','), ...rows].join('\r\n'), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="snowstar-jobs.csv"`,
      'cache-control': 'no-store',
    },
  });
}
