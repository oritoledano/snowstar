// The StreamDAW demo's studio room (a Durable Object, one per visitor of the sale page).
//
// The sale page on a computer is the studio: it shows KAYMA's "MAMA" session and its Play
// button. Phones that scan its QR code join the room and play the same song in time with it,
// each in a mix of its own. No audio passes through here: every phone already has the song
// (apps/demo/mama/), the room only carries the transport — "playing from 12.3 s, as of server
// time T" — and a clock for the phones to line themselves up against (ping/pong, NTP-style).
//
//   GET /api/streamdaw/demo/ws?room=<8-16 a-z0-9>&role=host|phone    (WebSocket)
//
// host → room   {type:'transport', playing, pos}      pos = song seconds at this instant
//               {type:'ping', t}
//               {type:'mixSet', id, mode?, t?, reset?}   set phone `id`'s mix (2026-10-10)
// phone → room  {type:'hello', name}  {type:'listen', on}  {type:'ping', t}
//               {type:'mix', mode, t}                     its own mix, after each change (2026-10-10)
// room → all    {type:'welcome', role, id, now, transport, host}   on joining
//               {type:'pong', t, now}
// room → phones {type:'transport', playing, pos, at, seq}            at = server ms of pos
//               {type:'host', up}
//               {type:'mixSet', mode?, t?, reset?}        from the studio
// room → host   {type:'presence', phones:[{id, name, listening, mix?}]}
//               {type:'mix', id, mode, t}                 a phone's mix, as it changes
//
// A mix (2026-10-10, the control page's "whose mix" switch): mode 'master' (the full mix) or
// 'tracks' (its own), t = [[track name, volume 0..1.5, pan -1..1, mute 0/1, solo 0/1], …], at
// most 16; in a mixSet any of the four may be null (unchanged). The room only checks and passes
// them on, and keeps each phone's last one (in its attachment) for a studio page that comes
// back. Pages from before this know none of it: an old phone never sends a mix (the studio
// lists it, without a mix to set), an old studio ignores 'mix' and sends no 'mixSet'.
//
// Hibernates between messages (the WebSocket Hibernation API), so an idle room costs nothing.
// Limits: 16 phones a room, 512-byte messages; a second studio page replaces the first.

const MAX_PHONES = 16, MAX_MSG = 512;

export class DemoRoom {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
  }

  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
    const url = new URL(req.url);
    const role = url.searchParams.get('role') === 'host' ? 'host' : 'phone';
    if (role === 'phone' && this.ctx.getWebSockets('phone').length >= MAX_PHONES) return new Response('room full', { status: 429 });
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    if (role === 'host') for (const old of this.ctx.getWebSockets('host')) { try { old.close(4000, 'another studio page took over'); } catch {} }
    this.ctx.acceptWebSocket(server, [role]);
    const id = role === 'host' ? 'studio' : 'p' + Math.random().toString(36).slice(2, 8);
    server.serializeAttachment({ role, id, name: role === 'host' ? 'studio' : guessName(req.headers.get('user-agent')), listening: false });
    const transport = (await this.ctx.storage.get('transport')) || { playing: false, pos: 0, at: Date.now(), seq: 0 };
    send(server, { type: 'welcome', role, id, now: Date.now(), transport, host: this.ctx.getWebSockets('host').length > 0 });
    if (role === 'host') this.toPhones({ type: 'host', up: true });
    this.presence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > MAX_MSG) return;
    let m; try { m = JSON.parse(data); } catch { return; }
    const me = ws.deserializeAttachment() || {};
    if (m.type === 'ping') { send(ws, { type: 'pong', t: m.t, now: Date.now() }); return; }
    if (me.role === 'host' && m.type === 'transport') {
      const prev = (await this.ctx.storage.get('transport')) || { seq: 0 };
      const pos = Math.max(0, Math.min(3600, Number(m.pos) || 0));
      const t = { playing: !!m.playing, pos, at: Date.now(), seq: (prev.seq || 0) + 1 };
      await this.ctx.storage.put('transport', t);
      this.toPhones({ type: 'transport', ...t });
      send(ws, { type: 'transport', ...t });
      return;
    }
    if (me.role === 'phone' && m.type === 'hello') {
      if (typeof m.name === 'string' && m.name.trim()) me.name = m.name.trim().slice(0, 24);
      ws.serializeAttachment(me); this.presence(); return;
    }
    if (me.role === 'phone' && m.type === 'listen') {
      me.listening = !!m.on; ws.serializeAttachment(me); this.presence(); return;
    }
    if (me.role === 'phone' && m.type === 'mix') {
      const t = tracks(m.t, false);
      if (!t || (m.mode !== 'master' && m.mode !== 'tracks')) return;
      me.mix = { mode: m.mode, t }; ws.serializeAttachment(me);
      for (const h of this.ctx.getWebSockets('host')) send(h, { type: 'mix', id: me.id, ...me.mix });
      return;
    }
    if (me.role === 'host' && m.type === 'mixSet') {
      const to = this.ctx.getWebSockets('phone').find((p) => (p.deserializeAttachment() || {}).id === m.id);
      if (!to) return;
      const o = { type: 'mixSet' };
      if (m.mode === 'master' || m.mode === 'tracks') o.mode = m.mode;
      if (m.reset === true) o.reset = true;
      if (m.t !== undefined) { const t = tracks(m.t, true); if (!t) return; o.t = t; }
      send(to, o); return;
    }
  }

  async webSocketClose(ws) { this.left(ws); try { ws.close(); } catch {} }
  async webSocketError(ws) { this.left(ws); }

  left(ws) {
    const me = ws.deserializeAttachment() || {};
    if (me.role === 'host') {
      // The studio page closed: the song stops on every phone, and they are told why.
      const still = this.ctx.getWebSockets('host').some((h) => h !== ws);
      if (!still) { this.ctx.storage.put('transport', { playing: false, pos: 0, at: Date.now(), seq: Date.now() }); this.toPhones({ type: 'host', up: false }); }
    }
    this.presence(ws);
  }

  toPhones(msg) { for (const p of this.ctx.getWebSockets('phone')) send(p, msg); }

  presence(gone) {
    const phones = this.ctx.getWebSockets('phone').filter((p) => p !== gone).map((p) => {
      const a = p.deserializeAttachment() || {}; return a.mix ? { id: a.id, name: a.name, listening: !!a.listening, mix: a.mix } : { id: a.id, name: a.name, listening: !!a.listening };
    });
    for (const h of this.ctx.getWebSockets('host')) if (h !== gone) send(h, { type: 'presence', phones });
  }
}

function send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch {} }
// A mix's tracks, checked: [[name, volume, pan, mute, solo], …], at most 16, a name of 1–24
// characters. `partial`: a value may be null (a mixSet changes only what it names).
function tracks(t, partial) {
  if (!Array.isArray(t) || t.length > 16) return null;
  const num = (v, lo, hi) => (v === null && partial ? null : typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v * 1000) / 1000)) : undefined);
  const flag = (v) => (v === null && partial ? null : v === 1 || v === true ? 1 : v === 0 || v === false ? 0 : undefined);
  const out = [];
  for (const e of t) {
    if (!Array.isArray(e) || typeof e[0] !== 'string' || !e[0] || e[0].length > 24) return null;
    const r = [e[0], num(e[1], 0, 1.5), num(e[2], -1, 1), flag(e[3]), flag(e[4])];
    if (r.includes(undefined)) return null;
    out.push(r);
  }
  return out;
}
function guessName(ua) {
  ua = String(ua || '');
  return /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : 'Phone';
}

/** GET /api/streamdaw/demo/ws?room=…&role=… — hand the WebSocket to the room's object. */
export function streamdawDemoSocket(req, env) {
  const url = new URL(req.url);
  const room = String(url.searchParams.get('room') || '');
  if (!/^[a-z0-9]{8,16}$/.test(room)) return new Response('bad room', { status: 400 });
  if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
  if (!env.DEMO_ROOM) return new Response('demo rooms are not set up', { status: 503 });
  return env.DEMO_ROOM.get(env.DEMO_ROOM.idFromName(room)).fetch(req);
}
