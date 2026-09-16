#!/usr/bin/env bash
# Dump the live D1 schema into worker/schema-live.sql.
#
# Twenty-nine of sixty-one tables existed ONLY in production — created by hand
# against D1 and never written down, including submissions, coupons, mail_outbox,
# hyp_checkouts, managed_artists, rights_decls and collaborators. The database
# could not have been rebuilt from this repository, and the hand-written
# schema*.sql files had drifted into contradiction: schema-licensing.sql declares
# a unique index on licences(project_name) while its own CREATE TABLE omits that
# column.
#
# This does not replace those files. They carry the reasoning — why a column is
# NOT NULL, why StreamDAW coupons are a separate table, what a status value
# means — and a dump can carry none of that. This is the record of what exists;
# they remain the record of why.
#
# Run it after any schema change made directly against D1.
set -euo pipefail
cd "$(dirname "$0")/../worker"

OUT=schema-live.sql
TMP="${TMPDIR:-/tmp}/snowstar-schema.$$.json"
trap 'rm -f "$TMP"' EXIT

echo "reading sqlite_master…"
npx wrangler d1 execute snowstar-members --remote --json --command "
  SELECT type, name, sql FROM sqlite_master
   WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%'
   ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name;" > "$TMP" 2>/dev/null

python3 - "$TMP" "$OUT" <<'PY'
import json, re, subprocess, sys, datetime
src, out_path = sys.argv[1], sys.argv[2]
rows = json.load(open(src))[0]['results']
tables = [r for r in rows if r['type'] == 'table']
idxs   = [r for r in rows if r['type'] == 'index']

have = subprocess.run(['bash', '-c', 'cat schema*.sql 2>/dev/null'],
                      capture_output=True, text=True).stdout
undocumented = sorted(
    t['name'] for t in tables
    if not re.search(r'CREATE TABLE (IF NOT EXISTS )?["\']?' + re.escape(t['name']) + r'\b',
                     have, re.I))

head = [
  '-- Snowstar — the live schema, dumped from D1. Generated; do not hand-edit.',
  '--',
  '-- The hand-written schema*.sql files carry the REASONING and stay authoritative',
  '-- for that. This carries the truth about what exists, which they had drifted',
  '-- away from: %d of %d tables had no DDL checked in anywhere.' % (len(undocumented), len(tables)),
  '--',
  '-- Regenerate with tools/dump-schema.sh',
  '-- Dumped: %s' % datetime.date.today().isoformat(),
  '',
]
if undocumented:
    head += ['-- Tables that existed only in production when this was first run:',
             *['--   ' + n for n in undocumented], '']

body = [t['sql'].strip().rstrip(';') + ';\n' for t in tables]
body += ['-- ── indexes ──────────────────────────────────────────────────────────────\n']
body += [i['sql'].strip().rstrip(';') + ';' for i in idxs]

open(out_path, 'w').write('\n'.join(head + body) + '\n')
print(f"  {len(tables)} tables, {len(idxs)} indexes -> {out_path}")
if undocumented:
    print(f"  {len(undocumented)} still undocumented in schema*.sql: {', '.join(undocumented[:6])}…")
PY
