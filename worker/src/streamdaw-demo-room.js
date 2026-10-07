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
// phone → room  {type:'hello', name}  {type:'listen', on}  {type:'ping', t}
// room → all    {type:'welcome', role, id, now, transport, host}   on joining
//               {type:'pong', t, now}
// room → phones {type:'transport', playing, pos, at, seq}            at = server ms of pos
//               {type:'host', up}
// room → host   {type:'presence', phones:[{id, name, listening}]}
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
      const a = p.deserializeAttachment() || {}; return { id: a.id, name: a.name, listening: !!a.listening };
    });
    for (const h of this.ctx.getWebSockets('host')) if (h !== gone) send(h, { type: 'presence', phones });
  }
}

function send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch {} }
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
