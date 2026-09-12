#!/usr/bin/env node
/**
 * Take one artist's APPROVED uploads into the live catalogue — stacked.
 *
 * Approving a submission has never published it. It marks a track as wanted and
 * leaves it in the private submissions area, which is why an artist could have
 * twenty-seven approved uploads and nothing on the site. This is the missing
 * half: it renders the three audio files a published track needs, writes the
 * catalogue row, and files stems and alternate mixes UNDER the track they
 * belong to instead of letting one song arrive as ten separate rows.
 *
 *   node tools/publish-artist.mjs --email galev@galevmusic.com          # plan only
 *   node tools/publish-artist.mjs --email galev@galevmusic.com --go     # do it
 *   node tools/publish-artist.mjs --email … --go --only gentle          # one family
 *
 * Idempotent. A submission that already carries a published_slug is skipped, so
 * an interrupted run is resumed by running it again — which matters, because a
 * sustained run against the R2 API fails transiently often enough that the
 * stream-rendition script lost 170 of 374 tracks on its first pass.
 *
 * What it deliberately does NOT invent: genres, moods and characteristics stay
 * empty. The rule on this project is not to fill in information we are not sure
 * about, and a genre is a claim about the music. Instruments ARE filled for
 * stems, because the artist named the file after the instrument — that is
 * reading their label, not guessing.
 */
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const WORKER = join(ROOT, 'worker');
const DATA = join(ROOT, 'js', 'mutra-data.js');
const WORK = join(process.env.TMPDIR || '/tmp', 'snowstar-publish');

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf('--' + n);
  return i === -1 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true);
};
const EMAIL = flag('email');
const GO = args.includes('--go');
const ONLY = flag('only');
if (!EMAIL) { console.error('need --email'); process.exit(1); }

/* ── words that mark a file as one PART of a creation rather than a creation ──
   Taken from the intake analyser so the dashboard's "Find versions" and this
   publisher agree about what a stem is. Disagreeing would be worse than either
   rule being wrong. */
/* The value MUST be one of the catalogue's 16 instrument names. Anything else
   is a tag no filter offers, so no buyer can search for it — 'Bells', 'Keys'
   and 'Mandolin' were all invisible on their first pass. A vocal stem maps to
   nothing at all: the voice belongs in the `vocal` field, and 'Choir' would be
   a lie about a lead take. */
const STEM_WORDS = {
  bells: 'Percussion', gtr: 'Guitar', guitar: 'Guitar', piano: 'Piano',
  keys: 'Piano', strings: 'Strings', bass: 'Bass', drums: 'Drums',
  perc: 'Percussion', percussion: 'Percussion', synth: 'Synth', pad: 'Synth',
  lead: 'Synth', rythm: 'Drums', rhythm: 'Drums', arp: 'Synth', fx: 'Samples',
  mando: 'Guitar', swar: 'Strings', reversw: 'Synth', x: 'Synth',
  vox: null, vocal: null, vocals: null, instrumental: null,
};
const FULL_WORDS = new Set(['full', 'mix', 'mixx', 'fullmix', 'master', 'main']);
const DATE_RE = /\b\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}\b/g;

const slugify = (s) => String(s).toLowerCase()
  .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);

/** The title with bounce noise removed: the date it was rendered, and the words
    that only say "this is the whole thing". */
function cleanTitle(t) {
  return String(t || '').replace(DATE_RE, ' ')
    .replace(/\s*[-–—]\s*(full\s*mixx?|fullmix|master|main\s*mix)\s*$/i, '')
    // Pulling the date out of "GENTLE - 25.6.26 - BELLS" leaves the two dashes
    // it sat between, and "GENTLE - - BELLS" is worse than the date was. The run
    // collapses to ONE separator — dropping the dash instead glued the words
    // together as "GENTLE- BELLS".
    .replace(/(?:\s*[-–—]\s*){2,}/g, ' - ')
    .replace(/^[-–—\s]+|[-–—\s]+$/g, '')
    .replace(/\s{2,}/g, ' ').trim();
}
/** The family a title belongs to: everything before the part that names a part. */
function familyKey(t) {
  let s = cleanTitle(t).toLowerCase();
  const parts = s.split(/\s*[-–—]\s*/);
  while (parts.length > 1) {
    const tail = parts[parts.length - 1].split(/\s+/).filter(Boolean);
    if (tail.length && tail.length <= 2
        && tail.every((w) => w in STEM_WORDS || FULL_WORDS.has(w))) parts.pop();
    else break;
  }
  return slugify(parts.join(' ')) || slugify(s);
}
/** What this file IS within its family, as the artist labelled it. */
function partOf(t) {
  const clean = cleanTitle(t);
  const fam = familyKey(t);
  let rest = clean;
  // strip the family words off the front, however they were separated
  const famWords = fam.split('-');
  const words = clean.split(/[\s-–—]+/).filter(Boolean);
  if (words.length > famWords.length
      && words.slice(0, famWords.length).map((w) => slugify(w)).join('-') === fam) {
    rest = words.slice(famWords.length).join(' ');
  } else {
    rest = '';
  }
  return rest.replace(/^[-–—\s]+/, '').trim();
}

async function d1(sql) {
  const { stdout } = await exec('npx', ['wrangler', 'd1', 'execute', 'snowstar-members',
    '--remote', '--command', sql, '--json'], { cwd: WORKER, maxBuffer: 64 * 1024 * 1024 });
  const jsonStart = stdout.indexOf('[');
  return JSON.parse(stdout.slice(jsonStart));
}
async function d1file(path) {
  const { stdout } = await exec('npx', ['wrangler', 'd1', 'execute', 'snowstar-members',
    '--remote', '--file', path, '--json'], { cwd: WORKER, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** R2 through wrangler, with the retry the API demands on a sustained run. */
async function r2get(bucketKey, file) {
  for (let t = 1; t <= 3; t++) {
    try {
      await exec('npx', ['wrangler', 'r2', 'object', 'get', bucketKey, '--remote', '--file', file],
        { cwd: WORKER, maxBuffer: 32 * 1024 * 1024 });
      if (existsSync(file) && statSync(file).size > 0) return true;
    } catch { /* fall through to the sleep */ }
    await new Promise((r) => setTimeout(r, t * 2000));
  }
  return false;
}
async function r2put(bucketKey, file, type) {
  for (let t = 1; t <= 3; t++) {
    try {
      await exec('npx', ['wrangler', 'r2', 'object', 'put', bucketKey, '--remote',
        '--file', file, '--content-type', type], { cwd: WORKER, maxBuffer: 32 * 1024 * 1024 });
      return true;
    } catch { await new Promise((r) => setTimeout(r, t * 2000)); }
  }
  return false;
}

function duration(file) {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' });
    const n = Math.round(parseFloat(out.trim()));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

/* ══════════════════ plan ══════════════════════════════════════════════════ */
const rows = (await d1(
  `SELECT s.id, s.title, s.ext, s.file_key, s.meta, s.published_slug, u.artist_name, u.name
     FROM submissions s JOIN users u ON u.id = s.user_id
    WHERE u.email = ${q(EMAIL)} AND s.status = 'approved'
    ORDER BY s.id`))[0].results;
if (!rows.length) { console.error('no approved uploads for ' + EMAIL); process.exit(1); }

const ARTIST = rows[0].artist_name || rows[0].name || EMAIL;
const families = new Map();
for (const r of rows) {
  const k = familyKey(r.title);
  if (!families.has(k)) families.set(k, []);
  families.get(k).push(r);
}

/* One family per song, not per label the artist happened to use. "SPLITING
   BETWEEN US - OLGAL" and "SPLITING BETWEEN US - INSTRUMENTAL" arrive as two
   families because OLGAL is not a word this script knows — but one key is a
   prefix of the other, and a short tail on a long shared stem is a version
   marker, not a different song. Same rule the intake analyser uses. */
for (const key of [...families.keys()].sort((a, b) => a.length - b.length)) {
  if (!families.has(key) || key.length < 8) continue;
  for (const other of [...families.keys()]) {
    if (other === key || !other.startsWith(key + '-')) continue;
    const tail = other.slice(key.length + 1).split('-').filter(Boolean);
    if (tail.length > 2) continue;
    families.get(key).push(...families.get(other));
    families.delete(other);
  }
}
for (const members of families.values()) members.sort((a, b) => a.id - b.id);

const taken = new Set(JSON.parse(
  readFileSync(DATA, 'utf8').match(/\{[\s\S]*\}/)[0]).tracks.map((t) => t.slug));

const plan = [];
let paletteIdx = 0;
for (const [key, members] of families) {
  // The parent is the one that says it is the whole thing; failing that, the
  // one with nothing appended to the family name; failing that, the earliest.
  const scored = members.map((m) => {
    const part = partOf(m.title).toLowerCase();
    const words = part.split(/\s+/).filter(Boolean);
    const isFull = !part || words.every((w) => FULL_WORDS.has(w));
    return { ...m, part: partOf(m.title), isFull };
  });
  const parent = scored.find((s) => s.isFull) || scored[0];
  const kids = scored.filter((s) => s !== parent)
    .sort((a, b) => a.part.localeCompare(b.part));
  const famTitle = cleanTitle(parent.title).replace(/\s*[-–—]\s*$/, '');
  const palette = paletteIdx++;

  const entry = (row, isParent) => {
    let meta = {};
    try { meta = JSON.parse(row.meta || '{}') || {}; } catch { /* none given */ }
    const part = row.part || '';
    const instruments = [];
    for (const w of part.toLowerCase().split(/[\s-–—]+/).filter(Boolean)) {
      const inst = STEM_WORDS[w];
      if (inst && !instruments.includes(inst)) instruments.push(inst);
    }
    const sungPart = /vox|vocal/i.test(part);
    let slug = slugify(isParent ? famTitle : cleanTitle(row.title));
    if (!slug) slug = slugify(famTitle + '-' + part);
    let n = 2, base = slug;
    while (taken.has(slug)) slug = `${base}-${n++}`;
    taken.add(slug);
    return {
      sub_id: row.id, slug, file_key: row.file_key, ext: row.ext,
      title: isParent ? famTitle : cleanTitle(row.title),
      artist: ARTIST, parent: isParent ? null : null,   // filled below
      family: key, palette, famTitle,
      bpm: Number.isFinite(meta.bpm) ? meta.bpm : null,
      key: meta.key || null, scale: meta.scale || null,
      // A stem is instrumental unless the artist called it the vocal one.
      vocal: isParent ? (meta.vocal || null) : (sungPart ? 'Vocals' : 'Instrumental'),
      instruments, duration: Number.isFinite(meta.duration) ? meta.duration : null,
      part,
    };
  };

  const p = entry(parent, true);
  plan.push(p);
  for (const k of kids) {
    const e = entry(k, false);
    e.parent = p.slug;
    plan.push(e);
  }
}

const todo = plan.filter((p) => !ONLY || p.family === ONLY || p.slug.startsWith(String(ONLY)));
console.log(`\n${ARTIST} — ${families.size} songs, ${plan.length} files\n`);
for (const [key] of families) {
  const fam = plan.filter((p) => p.family === key);
  const p = fam.find((x) => !x.parent);
  console.log(`  ${p.title}  →  ${p.slug}`
    + `   [${p.bpm || '?'}bpm ${p.key || '?'}${p.scale ? ' ' + p.scale : ''} ${p.vocal || '?'}]`);
  for (const k of fam.filter((x) => x.parent)) {
    console.log(`     └ ${k.title}  →  ${k.slug}`
      + (k.instruments.length ? `   [${k.instruments.join(', ')}]` : ''));
  }
}
const already = rows.filter((r) => r.published_slug);
if (already.length) console.log(`\n  (${already.length} already published — will be skipped)`);
if (!GO) { console.log('\nplan only. add --go to publish.\n'); process.exit(0); }

/* ══════════════════ publish ═══════════════════════════════════════════════ */
mkdirSync(WORK, { recursive: true });
const published = [];
const failed = [];
const pubSlug = new Map(rows.map((r) => [r.id, r.published_slug]));

let n = 0;
for (const t of todo) {
  n++;
  const tag = `[${n}/${todo.length}] ${t.title}`;
  if (pubSlug.get(t.sub_id)) { console.log(`${tag} — already live, skipped`); continue; }

  const src = join(WORK, `src.${t.ext || 'wav'}`);
  const master = join(WORK, 'master.mp3');
  const stream = join(WORK, 'stream.m4a');
  const preview = join(WORK, 'preview.mp3');
  const cover = join(WORK, 'cover.jpg');
  for (const f of [src, master, stream, preview, cover]) rmSync(f, { force: true });

  if (!await r2get(`snowstar-mutra/${t.file_key}`, src)) {
    console.log(`${tag} — SOURCE MISSING`); failed.push([t.slug, 'source']); continue;
  }
  const dur = t.duration || duration(src);

  try {
    // 192 kbps MP3 is the deliverable a licensee downloads. Real MP3, not AAC
    // in an .mp3 key: serving AAC bytes from a .mp3 URL works in one browser
    // and not another.
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', src,
      '-vn', '-ar', '44100', '-ac', '2', join(WORK, 'flat.wav')]);
    execFileSync('lame', ['--quiet', '-b', '192', '-h', join(WORK, 'flat.wav'), master]);
    // 128 kbps AAC is what the player streams — good enough to choose a track
    // by, not what anyone would licence.
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', join(WORK, 'flat.wav'),
      '-vn', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2',
      '-movflags', '+faststart', stream]);
  } catch (e) {
    console.log(`${tag} — ENCODE FAILED`); failed.push([t.slug, 'encode']); continue;
  }
  // The watermarked copy, for anything that does not look like a browser
  // playing audio. Ducked under the tag, so a separator cannot lift it out.
  try {
    execFileSync('python3', [join(HERE, 'watermark.py'), join(WORK, 'flat.wav'),
      preview, join(HERE, 'watermark-tag.wav')], { stdio: 'ignore' });
  } catch { /* fall back to the master below */ }
  const previewFile = existsSync(preview) && statSync(preview).size > 0 ? preview : master;

  execFileSync('python3', [join(HERE, 'make-track-art.py'),
    t.parent ? t.title : t.famTitle, cover, t.famTitle, String(t.palette)], { stdio: 'ignore' });

  const key = `audio/${t.slug}.mp3`;
  const ups = [
    [`snowstar-masters/${key}`, master, 'audio/mpeg'],
    [`snowstar-masters/stream/${key}`, stream, 'audio/mp4'],
    [`snowstar-mutra/${key}`, previewFile, 'audio/mpeg'],
    [`snowstar-mutra/covers-art-sm/${t.slug}.jpg`, cover, 'image/jpeg'],
  ];
  let ok = true;
  for (const [k, f, ty] of ups) if (!await r2put(k, f, ty)) { ok = false; break; }
  if (!ok) { console.log(`${tag} — UPLOAD FAILED`); failed.push([t.slug, 'upload']); continue; }

  published.push({ ...t, duration: dur, audio_key: key });
  console.log(`${tag} — ${t.slug}${t.parent ? ` (under ${t.parent})` : ''}, ${dur}s`);
}

if (!published.length) { console.log('\nnothing published.\n'); process.exit(1); }

/* ── one SQL file, so a half-written catalogue cannot happen ── */
const sql = [];
for (const p of published) {
  sql.push(`INSERT OR REPLACE INTO tracks (slug, title, audio_key, orig_title) VALUES (${
    q(p.slug)}, ${q(p.title)}, ${q(p.audio_key)}, ${q(p.title)});`);
  sql.push(`UPDATE submissions SET published_slug = ${q(p.slug)} WHERE id = ${p.sub_id};`);
  if (p.parent) {
    // created_at is NOT NULL with no default — leaving it out fails the insert.
    sql.push(`INSERT OR REPLACE INTO track_stacks (child_slug, parent_slug, sort, created_at) VALUES (${
      q(p.slug)}, ${q(p.parent)}, ${published.filter((x) => x.parent === p.parent).indexOf(p)}, ${
      Math.floor(Date.now() / 1000)});`);
  }
}
const sqlPath = join(WORK, 'publish.sql');
writeFileSync(sqlPath, sql.join('\n') + '\n');
await d1file(sqlPath);
console.log(`\n  ${sql.length} database statements applied`);

/* ── the shipped catalogue file ── */
const raw = readFileSync(DATA, 'utf8');
const open = raw.indexOf('{');
const close = raw.lastIndexOf('}');
const cat = JSON.parse(raw.slice(open, close + 1));
const bySlug = new Map(cat.tracks.map((t) => [t.slug, t]));
for (const p of published) {
  const entry = {
    title: p.title, slug: p.slug, artist: p.artist,
    genres: [], packages: [],
    duration: p.duration || 0,
    audio: `https://cdn.snowstar.company/${p.audio_key}`,
    cover: `https://cdn.snowstar.company/covers-art-sm/${p.slug}.jpg`,
    moods: [], instruments: p.instruments, bpm: p.bpm,
    vocal: p.vocal, key: p.key, scale: p.scale, characteristics: [],
  };
  if (bySlug.has(p.slug)) Object.assign(bySlug.get(p.slug), entry);
  else cat.tracks.push(entry);
}
cat.tracks.sort((a, b) => a.title.localeCompare(b.title));
writeFileSync(DATA + '.bak', raw);
writeFileSync(DATA, raw.slice(0, open) + JSON.stringify(cat) + raw.slice(close + 1));
console.log(`  js/mutra-data.js — ${cat.tracks.length} tracks (was ${cat.tracks.length - published.length})`);

console.log(`\npublished ${published.length}${failed.length ? `, ${failed.length} failed: ` + failed.map((f) => f.join(':')).join(', ') : ''}`);
console.log('commit js/mutra-data.js to put them on the site.\n');
rmSync(WORK, { recursive: true, force: true });
