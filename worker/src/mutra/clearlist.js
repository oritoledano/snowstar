/**
 * Clearlist — the channels a licensee wants their Mutra usage cleared on.
 *
 * The problem this solves: a track can be perfectly licensed and STILL get an
 * automated copyright claim, because Content ID matches audio, not paperwork.
 * The fix everywhere in this industry is a whitelist — the rights holder tells
 * the platform "this channel is allowed", per channel, in advance.
 *
 * So this stores the channels, shows them to the owner to action, and tracks
 * whether each has actually been cleared. It deliberately does NOT claim a
 * channel is cleared the moment it is typed in: 'pending' until someone has
 * really done it, because a false "you're covered" is worse than no promise.
 */

const now = () => Math.floor(Date.now() / 1000);
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/** Platform → how to recognise a plausible value, so a typo is caught here
 *  rather than by a human later. */
export const PLATFORMS = {
  youtube:   { label: 'YouTube',   hint: 'Channel URL or @handle' },
  instagram: { label: 'Instagram', hint: '@username' },
  tiktok:    { label: 'TikTok',    hint: '@username' },
  facebook:  { label: 'Facebook',  hint: 'Page or profile URL' },
  twitch:    { label: 'Twitch',    hint: 'Channel name' },
  podcast:   { label: 'Podcast',   hint: 'Show URL or RSS' },
  website:   { label: 'Website',   hint: 'https://…' },
  other:     { label: 'Other',     hint: 'Anything else we should clear' },
};

const clean = (v) => String(v == null ? '' : v).trim().slice(0, 300);

export async function listChannels(env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const r = await env.DB.prepare(
    `SELECT id, platform, value, status, created_at, cleared_at
       FROM channels WHERE user_id = ? ORDER BY id`
  ).bind(user.id).all();
  return json({ channels: r.results || [], platforms: PLATFORMS });
}

export async function addChannel(req, env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const platform = String(b.platform || '');
  if (!PLATFORMS[platform]) return json({ error: 'bad_platform' }, 400);
  const value = clean(b.value);
  if (value.length < 2) return json({ error: 'value_required' }, 400);

  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM channels WHERE user_id = ?')
    .bind(user.id).first();
  if ((n?.n || 0) >= 40) return json({ error: 'too_many' }, 400);

  await env.DB.prepare(
    `INSERT OR IGNORE INTO channels (user_id, platform, value, status, created_at)
     VALUES (?, ?, ?, 'pending', ?)`
  ).bind(user.id, platform, value, now()).run();
  return listChannels(env, user);
}

export async function removeChannel(req, env, user) {
  if (!user) return json({ error: 'unauthorized' }, 401);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!Number.isInteger(id)) return json({ error: 'bad_id' }, 400);
  // scoped by user_id so an id from someone else's list can't be deleted
  await env.DB.prepare('DELETE FROM channels WHERE id = ? AND user_id = ?')
    .bind(id, user.id).run();
  return listChannels(env, user);
}

/** Owner view: every channel awaiting action, newest first. */
export async function allChannels(env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const r = await env.DB.prepare(
    `SELECT c.id, c.platform, c.value, c.status, c.created_at, c.cleared_at,
            u.email, u.name
       FROM channels c JOIN users u ON u.id = c.user_id
      ORDER BY c.status = 'cleared', c.id DESC LIMIT 500`
  ).all();
  return json({ channels: r.results || [], platforms: PLATFORMS });
}

/** Owner marks a channel actually cleared (or back to pending). */
export async function setChannelStatus(req, env, user) {
  if (!user || !user.admin) return json({ error: 'forbidden' }, 403);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  const status = ['pending', 'cleared', 'rejected'].includes(b.status) ? b.status : null;
  if (!Number.isInteger(id) || !status) return json({ error: 'bad_request' }, 400);
  await env.DB.prepare('UPDATE channels SET status = ?, cleared_at = ? WHERE id = ?')
    .bind(status, status === 'cleared' ? now() : null, id).run();
  return json({ ok: true });
}
