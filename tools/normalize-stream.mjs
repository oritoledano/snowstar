#!/usr/bin/env node
/**
 * Bring the STREAM renditions of a song family to a loudness target.
 *
 * The player was 11 dB inconsistent: OPTIMIC auditioned at -20.5 LUFS next to
 * SPLITING BETWEEN US at -8.9, so browsing the catalogue meant riding the
 * volume knob. Streaming platforms solved this by normalising on playback;
 * this catalogue has no playback normaliser, so the files have to arrive level.
 *
 * Only the stream copy is touched. The master is the file a licensee pays for
 * and it keeps the loudness the artist chose — this is about auditioning, not
 * about mastering somebody's record for them. The stream is re-rendered from
 * the master rather than from the existing stream copy, so there is one lossy
 * generation, not two.
 *
 * ONE GAIN PER FAMILY. A stem is not normalised to the target on its own: a
 * bell part raised to the level of a full mix is no longer a bell part, and the
 * balance between a session's stems is a musical fact, not an accident. The
 * parent decides the gain and every stem under it moves by the same amount.
 *
 *   node tools/normalize-stream.mjs --email galev@galevmusic.com --target -14
 *   node tools/normalize-stream.mjs --slugs gentle,emotional --go
 */
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..', 'worker');
const WORK = join(process.env.TMPDIR || '/tmp', 'snowstar-norm');

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf('--' + n);
  return i === -1 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true);
};
const EMAIL = flag('email');
const SLUGS = flag('slugs');
const TARGET = Number(flag('target', -14));
const CEILING = Number(flag('ceiling', -1));      // dBTP
const GO = args.includes('--go');

async function d1(sql) {
  const { stdout } = await exec('npx', ['wrangler', 'd1', 'execute', 'snowstar-members',
    '--remote', '--command', sql, '--json'], { cwd: WORKER, maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout.slice(stdout.indexOf('[')));
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function r2(cmd, key, file, type) {
  const a = ['wrangler', 'r2', 'object', cmd, key, '--remote', '--file', file];
  if (type) a.push('--content-type', type);
  for (let t = 1; t <= 3; t++) {
    try {
      await exec('npx', a, { cwd: WORKER, maxBuffer: 32 * 1024 * 1024 });
      if (cmd === 'put' || (existsSync(file) && statSync(file).size > 0)) return true;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, t * 2000));
  }
  return false;
}

/** Integrated loudness, from ebur128's summary — not its per-frame lines. */
function lufs(file) {
  // ebur128 reports on STDERR, so this has to be spawnSync — execFileSync hands
  // back stdout, which for a `-f null -` render is empty.
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file,
    '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  const out = r.stderr || '';
  const at = out.indexOf('Integrated loudness');
  if (at === -1) return null;
  const m = out.slice(at).match(/I:\s+(-?[\d.]+)/);
  return m ? Number(m[1]) : null;
}

/* ── what to work on ── */
let families = [];                       // [{ parent, gain, members: [slug] }]
const stacks = await fetch('https://snowstar.company/api/stacks',
  { headers: { 'user-agent': 'Mozilla/5.0' } }).then((r) => r.json()).catch(() => ({ stacks: {} }));
const kidsOf = stacks.stacks || {};
const parentOf = {};
for (const [p, kids] of Object.entries(kidsOf)) for (const k of kids) parentOf[k] = p;

let slugs = [];
if (SLUGS) slugs = String(SLUGS).split(',').map((s) => s.trim()).filter(Boolean);
else if (EMAIL) {
  const r = await d1(`SELECT s.published_slug AS slug FROM submissions s
      JOIN users u ON u.id = s.user_id
     WHERE u.email = ${q(EMAIL)} AND s.published_slug IS NOT NULL AND s.published_slug <> ''`);
  slugs = (r[0].results || []).map((x) => x.slug);
} else { console.error('need --email or --slugs'); process.exit(1); }

const parents = [...new Set(slugs.map((s) => parentOf[s] || s))];
families = parents.map((p) => ({
  parent: p,
  members: [p, ...(kidsOf[p] || []).filter((k) => slugs.includes(k))],
}));

mkdirSync(WORK, { recursive: true });
console.log(`\ntarget ${TARGET} LUFS, ceiling ${CEILING} dBTP — ${families.length} families, `
  + `${families.reduce((n, f) => n + f.members.length, 0)} files\n`);

let changed = 0, failed = 0;
for (const fam of families) {
  const src = join(WORK, 'parent.mp3');
  rmSync(src, { force: true });
  if (!await r2('get', `snowstar-masters/audio/${fam.parent}.mp3`, src)) {
    console.log(`  ${fam.parent} — MASTER MISSING`); failed++; continue;
  }
  const before = lufs(src);
  if (before == null) { console.log(`  ${fam.parent} — could not measure`); failed++; continue; }
  const gain = Math.round((TARGET - before) * 10) / 10;
  console.log(`  ${fam.parent}  ${before} LUFS  →  ${gain >= 0 ? '+' : ''}${gain} dB`
    + `   (${fam.members.length} file${fam.members.length === 1 ? '' : 's'} move together)`);
  if (!GO) continue;
  if (Math.abs(gain) < 0.3) { console.log('     already there, skipped'); continue; }

  for (const slug of fam.members) {
    const s = join(WORK, 'src.mp3');
    const out = join(WORK, 'out.m4a');
    rmSync(s, { force: true }); rmSync(out, { force: true });
    if (slug !== fam.parent && !await r2('get', `snowstar-masters/audio/${slug}.mp3`, s)) {
      console.log(`     ${slug} — master missing, left alone`); failed++; continue;
    }
    if (slug === fam.parent) execFileSync('cp', [src, s]);

    /* Plain gain plus a true-peak limiter, NOT loudnorm's dynamic mode. A stem
       raised by its parent's gain must move by exactly that much or the family
       balance drifts; loudnorm would re-judge each file on its own. The limiter
       only catches the peaks that boosting pushes past the ceiling. */
    try {
      execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', s,
        '-af', `volume=${gain}dB,alimiter=level_in=1:level_out=1:limit=${
          Math.pow(10, CEILING / 20).toFixed(4)}:attack=5:release=50`,
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
        '-movflags', '+faststart', out], { stdio: 'ignore' });
    } catch { console.log(`     ${slug} — ENCODE FAILED`); failed++; continue; }

    const after = lufs(out);
    if (!await r2('put', `snowstar-masters/stream/audio/${slug}.mp3`, out, 'audio/mp4')) {
      console.log(`     ${slug} — UPLOAD FAILED`); failed++; continue;
    }
    changed++;
    console.log(`     ${slug.padEnd(34)} ${after} LUFS`);
  }
}
console.log(`\n${GO ? `${changed} stream copies rewritten` : 'plan only — add --go'}`
  + `${failed ? `, ${failed} failed` : ''}\n`);
rmSync(WORK, { recursive: true, force: true });
