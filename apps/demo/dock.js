// The mixer's dock (2026-10-20, built for 0.6.2; the approved design, wip/tabs-design-r2-2026-10-19/stream-perform/
// "THE MIXER DOCK"): one drawer under every Stream mode (Broadcast, On stage, Phones in Unison), for whose mix: Main
// (what this Mac's monitor out plays: the PA) or each listener's own (what lands on their faders). Shut, a strip:
// the handle, the mix being edited, a meter per stem and the PA's two. Open, a console screwed into the drawer: the
// whose-mix keys (Main, then everyone in the order they came, a lamp each), the mix's own module (Main: the PA's VU,
// its output, in time, Line up; a listener: their state and timing, their device), and a channel per stem on air
// (its pair, a lamp, pan, S, M, the fader with its meter, the stem's name on tape), Solo all, Mute all, Copy mix,
// Paste mix, Reset. Enlarged, it takes the section: taller faders, their dB, and each pair's own controls (0.7.0, what
// the 0.6 list had): its ON (on air), its source key (the pair, and what else plays into it: the page's pair-source
// menu) and its name on tape (a click renames it; Enter keeps, Esc puts back). The commands are the control page's
// own (studio.html, "whose mix": monMix for Main by pair, mixSet for a listener by the stems' names): the dock only
// asks (set, all, copy, paste, reset); the page sends them and gives the result back through view().
// Its host: the page mounts html() in a section's [data-dock-slot]; the dock marks the nearest [data-dock-host]
// dk-open or dk-big (the section hides its deck, or becomes a band) and tells it ('sdaw-dock' event, and change()).
// Speed (the plug-in's WKWebView): the knob, the screws, the powder coat, the VU and the tape are pictures
// (stage/web/rec/, dock-tape.webp drawn by tools/booth-art/stream-art.js); the console is rebuilt only when its shape
// changes (open, enlarged, whose mix, which stems, the width), never under a hand on it; a fader, a pan, a meter, a
// lamp moves in place: the caps, the knobs' marks, the meters' covers and the needle by transform, written at the
// engine's ticks (meters) or under the hand (no transition). Nothing animates, no filter, no backdrop-filter.
//   SdawDock.create({ view, esc, img, set, all, copy, paste, reset, lineUp, change, onAir, source, rename })
//     → { html, sig, patch, meters, show, close, state }
// view() returns (all optional):
//   (0.7.2) the first stem is OUT: { i: 0, out: true, pair: '1/2', name: 'OUT', kind: 'out', on, title } (1/2, what the listeners hear: the same module as
//   every channel; its ON is a lamp, no source key, its tape is not renamed; Main: this Mac's monitor level of it; a listener: their level of the full mix,
//   mixes[peer].out = { v, has }: has false while they play the tracks, then it is dim; pan, S and M are theirs to the tracks only)
//   (2026-10-25) while two programs are on, the decks come right after OUT: { i: 'xa'|'xb', deck: 'a'|'b', pair: 'A'|'B', name (the program's), v (its level
//   into the crossfader, 0…1.5, the engine's), on (OUT on air), title }: the same module, its fader is the deck's level (deck(side, v, final), the same in
//   every whose-mix: it changes what goes out), its meter the program's own signal before that level (meters' levels.xa / levels.xb, not scaled by the
//   fader); no pan, no S, no M (CUE is on the crossfader; the fader down is its mute); not in Solo all / Mute all / Copy / Paste / Reset
//   { stems: [{ i, pair: '3/4', name, live, on, src: { kind: 'app'|'input'|'click'|'system', name, icon } | null, title }]
//     (the pairs on air after 1/2, in order; enlarged, every pair shown; i: the engine's pair index; on: on air),
//     people: [{ peer, name, state: 'ok'|'wait'|'off', ms, model, inst, you }] (in the order they came; you: the site's demo, the visitor's own phone),
//     main: { has, tracks: { [i]: { v, p, m, s } } }, mixes: { [peer]: { mode: 'tracks'|'master', tracks: [{ name, v, p, m, s }] } },
//     pa: { state, device }, clip: { from } | null (a mix copied: Paste), mainSub: 'the PA', mainNote }
//   set(who, { i, name }, { v | p | m | s }, final)   who: 'main' | a peer; v: 0…1.5 (linear), p: −1…+1
//   all(who, 'solo' | 'mute'), copy(who), paste(who), reset(who), lineUp(), change({ open, big, who })
//   (2026-10-29) link: { on, out: [peers] } → Main's 'Link to all' key → link(on); a listener out of the Link: 'Back to the PA' → relink(peer)
//   canAdd: true = a free pair exists: the console ends with '+ Add channel' → add() (the page picks the next free pair and opens its Input menu)
//   onAir(i, on), source(i) (the page opens its menu at [data-dk-src=i]), rename(i, name)   (enlarged only)
//   meters(levels, main): levels[i] = [l, r] (each stem's peak as it is sent, 0…1), main = [l, r] (the monitor out)
(function () {
  'use strict';
  const WIDE = 700;
  const MAXV = 1.5;
  // the fader's scale: the desk's (fadermeter.js pos()): −60 … 0 dB, −18 dB at 55 %, carried on to +3.5 dB (1.5)
  const pos = (d) => (d <= -60 ? 0 : d >= -18 ? 0.55 + (d + 18) / 18 * 0.45 : (d + 60) / 42 * 0.55);
  const TOP = pos(20 * Math.log10(MAXV));
  const fOfDb = (d) => Math.max(0, Math.min(1, pos(d) / TOP));
  const dbOf = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
  const vOfF = (f) => { const u = f * TOP; if (u <= 0.0005) return 0; const d = u >= 0.55 ? (u - 0.55) / 0.45 * 18 - 18 : u / 0.55 * 42 - 60; return Math.min(MAXV, Math.pow(10, d / 20)); };
  const dbTxt = (v) => { const d = dbOf(v); if (!isFinite(d) || d <= -60) return '−∞'; return Math.abs(d) < .05 ? '0.0' : (d > 0 ? '+' : '−') + Math.abs(d).toFixed(1); };
  const STATE_WORD = { ok: 'In time', wait: 'Lining up…', off: 'Not playing' };
  const INST_WORD = { drums: 'drums', bass: 'bass', guitar: 'guitar', keys: 'keys', vocals: 'vocals' };

  const ICON = {
    spk: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="3.5" y="1.5" width="9" height="13" rx="1.5"/><circle cx="8" cy="10" r="2.6"/><circle cx="8" cy="4.6" r="1"/></svg>',
    up: '<svg viewBox="0 0 10 10" fill="none" stroke="#f3eddc" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5l3-3 3 3"/></svg>',
    down: '<svg viewBox="0 0 10 10" fill="none" stroke="#f3eddc" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3.5l3 3 3-3"/></svg>',
    grow: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6V2h4M14 10v4h-4M10 2h4v4M6 14H2v-4"/></svg>',
    shrink: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v4H2M10 14v-4h4M14 6h-4V2M2 10h4v4"/></svg>',
    // a pair's second source (the page's own glyphs): an input (an XLR socket), StreamDAW's click, everything this Mac plays
    input: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><circle cx="8.5" cy="10.5" r="1.1"/><circle cx="15.5" cy="10.5" r="1.1"/><circle cx="12" cy="15.5" r="1.1"/></svg>',
    click: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M9.2 3.5h5.6L18 20.5H6z"/><path d="M12 15.5l5.2-8.2"/><path d="M8.5 16.5h7"/></svg>',
    system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/></svg>',
  };

  const CSS = (IMG) => `
.dk { --d-ink: #f3eddc; --d-lime: #c8f23a; --d-amber: #ffb547; --d-head: 48px; --d-open: 340px; --d-mix: 176px; --d-ch: 58px;
  --d-sans: "Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; --d-mono: ui-monospace, "SF Mono", Menlo, monospace;
  --d-cond: "Barlow Condensed", "Avenir Next Condensed", "Arial Narrow", sans-serif; --d-marker: "Permanent Marker", "Marker Felt", cursive;
  position: relative; height: var(--d-head); z-index: 6; color: var(--d-ink); font: 13px/1.35 var(--d-sans); -webkit-font-smoothing: antialiased;
  background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,0) 40px, rgba(0,0,0,0) 85%, rgba(0,0,0,.2)), #3c3b39 url(${IMG}powder-bay.webp) 0 0 / 220px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 -1px 0 #000, 0 -3px 0 rgba(0,0,0,.55); }
.dk.dk-narrow { --d-head: 42px; --d-open: 300px; --d-mix: 118px; --d-ch: 48px; }
.dk.dk-isopen { height: var(--d-open); box-shadow: inset 0 1px 0 rgba(255,255,255,.2), 0 -1px 0 #000, 0 -20px 34px -10px rgba(0,0,0,.9); }
.dk.dk-isbig { position: absolute; inset: 0; height: auto; box-shadow: inset 0 1px 0 rgba(255,255,255,.2), 0 -1px 0 #000, 0 -20px 34px -10px rgba(0,0,0,.9); }
.dk button { font: inherit; color: inherit; cursor: pointer; }
.dk button:disabled { cursor: default; }
.dk :focus-visible { outline: 2px solid var(--d-lime); outline-offset: 2px; }

/* the drawer's head */
.dk-head { position: relative; cursor: pointer; height: var(--d-head); display: flex; align-items: center; gap: 12px; padding: 0 16px 0 14px; }
.dk-isopen .dk-head::after, .dk-isbig .dk-head::after { content: ""; position: absolute; left: 12px; right: 12px; bottom: 0; height: 1px; background: rgba(0,0,0,.55); box-shadow: 0 1px 0 rgba(255,255,255,.08); }
.dk-pull { appearance: none; border: 0; background: none; padding: 0; display: flex; align-items: center; gap: 9px; flex: none; color: #f4f2ea !important; }
.dk-pull .dk-pt { font: 700 14px/1 var(--d-cond) !important; letter-spacing: .16em; text-transform: uppercase; }
.dk-pull svg { width: 18px; height: 18px; opacity: .9; }
.dk-dl { font: 700 12px/1 var(--d-cond); letter-spacing: .16em; text-transform: uppercase; color: rgba(236,232,220,.6); flex: none; white-space: nowrap; }
.dk-wps { display: flex; align-items: center; gap: 6px; min-width: 0; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; padding: 4px 2px; }
.dk-wps::-webkit-scrollbar { display: none; }
.dk-wp { appearance: none; border: 0; padding: 2px; border-radius: 8px; flex: none; background: linear-gradient(180deg, #8d8a83, #4a4844 40%, #222120 75%, #3a3835); box-shadow: 0 0 0 1px #0b0b0a, 0 2px 4px rgba(0,0,0,.6); }
.dk-wp .dk-c { display: flex; align-items: center; gap: 7px; height: 28px; padding: 0 11px 0 8px; border-radius: 6px; font: 700 12.5px/1 var(--d-cond); letter-spacing: .07em; text-transform: uppercase; color: #ddd6c4; white-space: nowrap;
  background: radial-gradient(140% 70% at 50% -8%, rgba(255,255,255,.2), rgba(255,255,255,0) 62%), linear-gradient(180deg, #363430, #22211e 62%, #191816);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.24), inset 0 -3px 5px rgba(0,0,0,.55), inset 0 0 0 1px rgba(0,0,0,.55); }
.dk-wp .dk-c small { font: 600 12px/1 var(--d-cond); letter-spacing: .1em; color: rgba(243,237,220,.55); }
.dk-wp .dk-c svg { width: 13px; height: 13px; flex: none; color: #cfc9b8; }
.dk-wp.dk-sel { background: linear-gradient(180deg, #eaff9c, #b4d93a 45%, #6d8c10); box-shadow: 0 0 0 1px #0b0b0a, 0 0 14px rgba(200,242,58,.45), 0 2px 4px rgba(0,0,0,.6); }
.dk-wp.dk-sel .dk-c { color: #fff; background: radial-gradient(120% 80% at 50% 115%, rgba(200,242,58,.3), rgba(200,242,58,0) 62%), radial-gradient(140% 70% at 50% -8%, rgba(255,255,255,.16), rgba(255,255,255,0) 62%), linear-gradient(180deg, #3a3933, #24231f); }
.dk-wp.dk-sel .dk-c small { color: rgba(232,248,184,.75); } .dk-wp.dk-sel .dk-c svg { color: var(--d-lime); }
.dk-wp.dk-off .dk-c { color: rgba(243,237,220,.45); }
.dk-sp { flex: 1; min-width: 0; }
.dk-bridge { display: flex; align-items: flex-end; gap: 9px; flex: none; padding: 0 4px; }
.dk-bm { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.dk-bm .dk-mv { display: flex; gap: 1.5px; height: 20px; }
.dk-bm b { font: 700 12px/1 var(--d-cond); letter-spacing: .04em; color: rgba(236,232,220,.62); text-transform: uppercase; max-width: 46px; overflow: hidden; white-space: nowrap; }
.dk-mm { display: grid; grid-template-columns: auto 132px; gap: 4px 7px; align-items: center; flex: none; }
.dk-mm .dk-silk { font-size: 12px; }
.dk-sq { appearance: none; border: 0; width: 28px; height: 26px; border-radius: 4px; display: grid; place-items: center; color: #ece6d2 !important; flex: none;
  background: radial-gradient(120% 90% at 50% 10%, #4a4741, #2c2a26 60%, #1f1d1a); box-shadow: 0 0 0 1px #000, 0 2px 0 #0d0c0b, 0 4px 6px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.18); }
.dk-sq svg { width: 13px; height: 13px; }

/* meters: a lit ladder under a cover that shrinks (transform), the segments' lines over both */
.dk-lad { position: relative; display: block; width: 3px; height: 100%; overflow: hidden; background: linear-gradient(to top, #c8f23a 0 78%, #ffc35a 78%); box-shadow: 0 1px 0 rgba(255,255,255,.08); }
.dk-lad i { position: absolute; inset: 0; background: #0a0a09; transform-origin: 50% 0; transform: scaleY(1); }
.dk-lad::after { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(to top, transparent 0 2px, rgba(10,10,9,.92) 2px 3.5px); box-shadow: inset 0 1px 1px rgba(0,0,0,.8); }
.dk-lad u { position: absolute; left: 0; right: 0; bottom: 0; height: 100%; text-decoration: none; transform: translateY(100%); }
.dk-lad u::before { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: #e8ff9a; }
.dk-hl { position: relative; display: block; height: 4px; border-radius: 1px; overflow: hidden; background: linear-gradient(90deg, #c8f23a 0 80%, #ffc35a 80%); box-shadow: 0 1px 0 rgba(255,255,255,.08); }
.dk-hl i { position: absolute; inset: 0; background: #0a0a09; transform-origin: 100% 50%; transform: scaleX(1); }
.dk-hl::after { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 3px, rgba(10,10,9,.92) 3px 4.5px); box-shadow: inset 0 1px 1px rgba(0,0,0,.8); }

/* the console: channel modules screwed into the drawer */
.dk-console { display: none; position: absolute; left: 0; right: 0; top: var(--d-head); bottom: 0; gap: 6px; padding: 9px 12px 12px; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.dk-console::-webkit-scrollbar { display: none; }
.dk-isopen .dk-console, .dk-isbig .dk-console { display: flex; }
.dk-mod { position: relative; display: flex; flex-direction: column; align-items: center; min-width: 0; border-radius: 7px;
  background: linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,0) 12%, rgba(0,0,0,0) 86%, rgba(0,0,0,.26)), #4a4947 url(${IMG}powder-deck.webp) 0 0 / 220px;
  box-shadow: 0 0 0 1px #0b0b0a, inset 0 1px 0 rgba(255,255,255,.22), inset 0 -1px 0 rgba(0,0,0,.5), 0 5px 9px -3px rgba(0,0,0,.75); }
.dk-scr { position: absolute; left: 50%; width: 9px; height: 9px; margin-left: -4.5px; background: url(${IMG}screws.webp) 0 0 / 36px 9px no-repeat; pointer-events: none; }
.dk-scr.dk-s1 { background-position: -9px 0; } .dk-scr.dk-s2 { background-position: -18px 0; } .dk-scr.dk-s3 { background-position: -27px 0; }
.dk-scr.dk-t { top: 4px; } .dk-scr.dk-b { bottom: 4px; }
.dk-ch { flex: 1 1 0; min-width: var(--d-ch); max-width: 120px; padding: 15px 3px 16px; gap: 7px; }
.dk-empty { flex: 1; align-self: center; text-align: center; padding: 0 20px; font: 500 13px/1.4 var(--d-sans); color: rgba(243,237,220,.7); }
.dk-empty b { display: block; margin-bottom: 4px; font: 600 16px/1.2 "Fraunces", Georgia, serif; color: var(--d-ink); }
.dk-ch .dk-top { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; }
.dk-ch .dk-pr { font: 700 12px/1 var(--d-cond); letter-spacing: .06em; color: #f4f2ea; white-space: nowrap; }
.dk-kn { position: relative; width: var(--s); height: var(--s); flex: none; margin: 2px 0 4px; touch-action: none; cursor: ns-resize; border-radius: 50%; }
.dk-kn > img { position: absolute; left: 50%; top: 50%; width: calc(var(--s) * 1.944); height: calc(var(--s) * 1.944); margin: calc(var(--s) * -.972) 0 0 calc(var(--s) * -.972); pointer-events: none; }
.dk-kn .dk-ind { position: absolute; inset: 0; transform: rotate(0deg); pointer-events: none; }
.dk-kn .dk-ind::before { content: ""; position: absolute; left: 50%; top: 7%; width: 2px; height: 14%; margin-left: -1px; border-radius: 1px; background: #f8f6ef; box-shadow: 0 0 3px rgba(255,255,255,.45); }
.dk-kn .dk-kl { position: absolute; top: calc(50% + var(--s) * .5); font: 700 9.5px/1 var(--d-cond); color: #ece8dc; pointer-events: none; }
.dk-kn .dk-kl.dk-lo { left: calc(50% - var(--s) * .78 - 4px); } .dk-kn .dk-kl.dk-hi { left: calc(50% + var(--s) * .78 - 1px); }
.dk-smr { display: flex; gap: 5px; }
.dk-k { appearance: none; border: 0; width: 26px; height: 21px; border-radius: 4px; font: 700 12.5px/21px var(--d-cond) !important; color: #cfc9b8 !important; padding: 0;
  background: linear-gradient(#45433e, #2a2824); box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,255,255,.18), 0 2px 0 #121110, 0 4px 5px rgba(0,0,0,.45); }
.dk-k.dk-s.dk-on { color: #1d2a00 !important; background: radial-gradient(120% 100% at 50% 35%, #f6ffc8, #d4f55a 45%, #99bf1c); box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,255,255,.65), 0 2px 0 #3c4a0c, 0 0 12px rgba(200,242,58,.55); }
.dk-k.dk-m.dk-on { color: #3a2400 !important; background: radial-gradient(120% 100% at 50% 35%, #fff3d4, #ffc866 45%, #d08a22); box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,255,255,.65), 0 2px 0 #5a3a0a, 0 0 12px rgba(255,185,80,.5); }
.dk-fad { position: relative; flex: 1; width: 100%; min-height: 0; touch-action: none; cursor: ns-resize; }
.dk-run { position: absolute; left: 0; right: 0; top: 10px; bottom: 10px; }
.dk-slot { position: absolute; left: calc(50% - 6px); top: -4px; bottom: -4px; width: 5px; border-radius: 3px; background: #040404; box-shadow: inset 0 1px 2px #000, 0 1px 0 rgba(255,255,255,.14), 0 -1px 0 rgba(0,0,0,.45); }
.dk-tk { position: absolute; right: calc(50% + 3px); height: 1px; margin-bottom: -.5px; width: 7px; background: rgba(244,242,234,.55); }
.dk-tk.dk-u { width: 10px; background: #f4f2ea; }
.dk-tn { position: absolute; right: calc(50% + 12px); transform: translateY(50%); font: 600 9px/1 var(--d-cond); color: rgba(244,242,234,.72); letter-spacing: .02em; white-space: nowrap; }
.dk-tn.dk-u { color: #f4f2ea; font-weight: 700; }
.dk-mt { position: absolute; left: calc(50% + 12px); top: 0; bottom: 0; display: flex; gap: 1.5px; }
.dk-capw { position: absolute; left: 0; right: 0; top: 0; height: 100%; transform: translateY(0); pointer-events: none; }
.dk-cap { position: absolute; left: calc(50% - 3.5px); bottom: 0; width: 28px; height: 15px; margin: 0 0 -7.5px -14px; border-radius: 2.5px; z-index: 2; pointer-events: auto; cursor: grab;
  background: linear-gradient(180deg, #6a6862 0, #33322f 16%, #1f1e1c 48%, #2b2a27 84%, #55534e 100%); box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,255,255,.38), 0 7px 8px -2px rgba(0,0,0,.75), 0 2px 2px rgba(0,0,0,.6); }
.dk-cap::before { content: ""; position: absolute; left: 2px; right: 2px; top: 50%; height: 2px; margin-top: -1px; border-radius: 1px; background: #f6f4ec; box-shadow: 0 0 3px rgba(255,255,255,.45); }
.dk-rd { display: none; font: 600 12px/1 var(--d-mono); color: var(--d-lime); padding: 4px 6px; border-radius: 3px; background: linear-gradient(#070905, #11150a); text-shadow: 0 0 6px rgba(200,242,58,.55); box-shadow: inset 0 1px 3px rgba(0,0,0,.95), 0 1px 0 rgba(255,255,255,.14); white-space: nowrap; }
.dk-rd.dk-dim { color: rgba(200,242,58,.4); text-shadow: none; }
.dk-isbig .dk-rd { display: inline-block; }
/* enlarged: each pair's own controls (0.7.0): the source key, ON, the name on tape as a key */
.dk-isopen .dk-ch, .dk-isbig .dk-ch { min-width: 66px; }
.dk-src { appearance: none; border: 0; display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-width: 0; max-width: 100%; height: 24px; padding: 0 6px; border-radius: 4px;
  font: 700 13px/1 var(--d-cond) !important; letter-spacing: .04em; color: #f4f2ea !important; white-space: nowrap;
  background: linear-gradient(#2f2d29, #1c1b18); box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,255,255,.14), 0 2px 3px rgba(0,0,0,.5); }
.dk-src .dk-car { font: 700 13px/1 var(--d-cond); color: rgba(244,242,234,.6); }
.dk-src svg, .dk-src img { width: 15px; height: 15px; flex: none; border-radius: 3px; color: var(--d-lime); }
.dk-src .dk-lt { display: inline-grid; place-items: center; width: 15px; height: 15px; border-radius: 3px; background: #c8f23a; color: #1d2a00; font: 700 12px/1 var(--d-sans); }
.dk-src.dk-has { box-shadow: 0 0 0 1px #000, inset 0 0 0 1px rgba(200,242,58,.35), inset 0 1px 0 rgba(255,255,255,.14), 0 2px 3px rgba(0,0,0,.5); }
.dk-src.dk-bad svg, .dk-src.dk-bad .dk-lt { color: var(--d-amber); }
.dk-src[aria-expanded="true"] { box-shadow: 0 0 0 1px #000, 0 0 0 2px var(--d-lime); }
.dk-isopen .dk-k.dk-air, .dk-isbig .dk-k.dk-air { width: 38px; height: 23px; font-size: 12.5px !important; line-height: 23px !important; letter-spacing: .08em; }
.dk-isopen .dk-k.dk-air.dk-on, .dk-isbig .dk-k.dk-air.dk-on { color: #1d2a00 !important; background: radial-gradient(120% 100% at 50% 35%, #f6ffc8, #d4f55a 45%, #99bf1c); box-shadow: 0 0 0 1px #000, inset 0 1px 0 rgba(255,255,255,.65), 0 2px 0 #3c4a0c, 0 0 12px rgba(200,242,58,.55); }
button.dk-tape { appearance: none; cursor: text; padding: 0; background: none; color: #1b1a20 !important; font: 400 12px/9px var(--d-marker) !important; }
button.dk-tape:hover { filter: none; outline: 1px dashed rgba(200,242,58,.6); outline-offset: 2px; }
.dk-tin { display: block; width: calc(100% + 6px); max-width: 120px; box-sizing: border-box; height: 28px; margin: 0 -3px; padding: 0 5px; border: 0; border-radius: 3px; outline: 2px solid var(--d-lime);
  font: 600 13px/28px var(--d-sans); color: #1b1a20; background: #f4efd9; text-align: center; }
.dk-ch.dk-muted .dk-mt { opacity: .55; }
.dk-ch.dk-none { opacity: .45; }
.dk-ch.dk-none .dk-fad, .dk-ch.dk-none .dk-kn { cursor: default; }
.dk-ch.dk-clk { background: linear-gradient(180deg, rgba(255,255,255,.09), rgba(255,255,255,0) 12%, rgba(0,0,0,0) 86%, rgba(0,0,0,.26)), #3f4232 url(${IMG}powder-deck.webp) 0 0 / 220px; }
.dk-tape { position: relative; box-sizing: border-box; display: block; max-width: calc(100% + 4px); height: 30px; border-style: solid; border-width: 9px 8px 12px; border-image: url(${IMG}dock-tape.webp) 20 30 26 fill / 9px 8px 12px;
  font: 400 12px/9px var(--d-marker); color: #1b1a20; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; text-align: center; flex: none; }

/* the mix's own module, left */
.dk-mixm { flex: 0 0 var(--d-mix); padding: 15px 12px 16px; gap: 9px; align-items: stretch; }
.dk-mixm .dk-nm { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dk-mixm .dk-tape { height: 36px; border-width: 10px 15px 13px; font-size: 17px; line-height: 13px; align-self: flex-start; transform: rotate(-2deg); }
.dk-mixm .dk-role { font: 600 12px/1 var(--d-cond); letter-spacing: .14em; text-transform: uppercase; color: rgba(236,232,220,.7); white-space: nowrap; }
.dk-lrow { display: flex; align-items: center; gap: 8px; font: 600 12px/1 var(--d-sans); color: #f6f3ea; white-space: nowrap; min-width: 0; }
.dk-msv { font: 600 12px/1 var(--d-mono); color: rgba(200,242,58,.85); }
.dk-dvl { font: 500 13px/1.3 var(--d-sans); color: rgba(246,243,234,.68); overflow-wrap: anywhere; }
.dk-note { font: 500 13px/1.35 var(--d-sans); color: rgba(246,243,234,.74); }
.dk-kg { display: grid; grid-template-columns: 1fr 1fr; gap: 9px 7px; margin-top: auto; }
.dk-nb { appearance: none; min-width: 0; padding: 7px 4px 6px; border: 0; border-radius: 4px; font: 700 12.5px/1 var(--d-cond) !important; letter-spacing: .06em; color: #2a251d !important; text-transform: uppercase; white-space: nowrap;
  background: radial-gradient(120% 90% at 50% 10%, #fffdf6, #ece4cf 55%, #cfc3a6); box-shadow: 0 0 0 1px #1a1916, 0 2px 0 #8f856e, 0 3px 0 #1a1916, 0 5px 6px rgba(0,0,0,.5), inset 0 1px 0 #fff; }
.dk-nb.dk-w { grid-column: span 2; }
/* Edit (2026-10-29, the founder, the 0.6 list's show/hide back): while editing every pair is a channel, each with a lamp on
   its top (lit = shown, dark = hidden) and a hidden one dimmed; Done: the hidden ones leave the console and the strip. */
.dk-vis { appearance: none; position: absolute; right: 7px; top: 7px; z-index: 2; display: grid; place-items: center; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; background: rgba(0,0,0,.28); cursor: pointer; }
.dk-vis .dk-led { width: 10px; height: 10px; }
.dk-ch.dk-hid > :not(.dk-vis):not(.dk-scr) { opacity: .4; }
.dk-nb:disabled { opacity: .5; }
.dk-nb.dk-on { background: radial-gradient(120% 90% at 50% 10%, #f4ffd0, #d4f25c 55%, #a9cc2a); box-shadow: 0 0 0 1px #1a1916, 0 2px 0 #6f8a14, 0 3px 0 #1a1916, 0 5px 6px rgba(0,0,0,.5), inset 0 1px 0 #fff; }
.dk-vu { position: relative; width: 150px; height: 82px; flex: none; align-self: center; }
.dk-vu > img { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.dk-vu .dk-clip { position: absolute; left: 5.625%; top: 9.09%; width: 88.75%; height: 79.55%; overflow: hidden; border-radius: 3px; }
.dk-vu .dk-needle { position: absolute; left: 50%; top: 145%; width: 1.3px; height: 135%; margin-left: -.65px; transform-origin: 50% 100%; transform: translateY(-100%) rotate(-42deg); background: #16130e; }
.dk-win { display: block; align-self: flex-start; max-width: 100%; font: 600 12px/1.15 var(--d-mono); color: var(--d-lime); padding: 5px 7px; border-radius: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  background: linear-gradient(#070905, #11150a); text-shadow: 0 0 7px rgba(200,242,58,.6); box-shadow: inset 0 1px 4px rgba(0,0,0,.95), inset 0 0 0 1px rgba(200,242,58,.07), 0 1px 0 rgba(255,255,255,.14); }
.dk-pa2 { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.dk-silk { font: 700 12px/1 var(--d-cond); letter-spacing: .14em; text-transform: uppercase; color: #ebe7db; white-space: nowrap; }

.dk-addm { flex: 0 0 96px; align-items: stretch; justify-content: center; opacity: .9; }
.dk-add { appearance: none; border: 0; background: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; height: 100%; padding: 12px 6px; color: rgba(243,237,220,.78) !important; }
.dk-add b { font: 600 30px/1 var(--d-sans); color: var(--d-lime); }
.dk-add span { font: 700 12.5px/1.1 var(--d-cond); letter-spacing: .1em; text-transform: uppercase; text-align: center; }
.dk-add:hover b { filter: brightness(1.2); }
/* lamps */
.dk-led { position: relative; display: inline-block; flex: none; width: 8px; height: 8px; border-radius: 50%; background: radial-gradient(circle at 50% 58%, #3a3830, #121110 72%);
  box-shadow: 0 0 0 1.2px #0a0a09, 0 0 0 2.2px #8a8780, 0 0 0 2.8px #1d1c1a, 0 1.5px 2px 2.5px rgba(0,0,0,.55); }
.dk-led::after { content: ""; position: absolute; left: 20%; top: 12%; width: 42%; height: 30%; border-radius: 50%; background: radial-gradient(closest-side, rgba(255,255,255,.75), rgba(255,255,255,0)); }
.dk-led.dk-on { background: radial-gradient(circle at 50% 55%, #fbffe2 0, #d9ff5c 30%, #a5cc1e 70%, #5d7a0b);
  box-shadow: 0 0 0 1.2px #0a0a09, 0 0 0 2.2px #8a8780, 0 0 0 2.8px #1d1c1a, 0 1.5px 2px 2.5px rgba(0,0,0,.55), 0 0 8px 3px rgba(200,242,58,.55), 0 0 18px 4px rgba(200,242,58,.25); }
.dk-led.dk-wait { background: radial-gradient(circle at 50% 55%, #fff4d8 0, #ffc566 32%, #e08a1c 72%, #7a4208);
  box-shadow: 0 0 0 1.2px #0a0a09, 0 0 0 2.2px #8a8780, 0 0 0 2.8px #1d1c1a, 0 1.5px 2px 2.5px rgba(0,0,0,.55), 0 0 8px 3px rgba(255,170,60,.5); }
.dk-led.dk-lg { width: 9px; height: 9px; }
.dk-wait-note { position: absolute; left: calc(var(--d-mix) + 30px); right: 16px; top: 42%; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 9px 12px; border-radius: 8px; background: rgba(14,10,7,.88); box-shadow: inset 0 0 0 1px rgba(255,181,71,.3); font: 600 12.5px/1.3 var(--d-sans); color: #ffd9a0; pointer-events: none; z-index: 3; }

/* the plug-in's window */
.dk-narrow .dk-head { gap: 7px; padding: 0 10px; }
.dk-narrow .dk-pull .dk-pt { font-size: 12.5px !important; letter-spacing: .12em; }
.dk-narrow .dk-wps { gap: 4px; }
.dk-narrow .dk-wp .dk-c { height: 26px; padding: 0 7px 0 6px; gap: 5px; font-size: 12px; letter-spacing: .03em; }
.dk-narrow .dk-wp .dk-c small { display: none; }
.dk-narrow .dk-mm { grid-template-columns: auto 70px; }
.dk-narrow .dk-dl, .dk-narrow .dk-bridge { display: none; }
.dk-narrow .dk-console { gap: 4px; padding: 7px 8px 9px; }
.dk-narrow .dk-ch { padding: 13px 2px 14px; gap: 5px; }
.dk-narrow .dk-ch .dk-pr { font-size: 12px; letter-spacing: .02em; }
.dk-narrow .dk-k { width: 21px; height: 20px; font-size: 12px !important; line-height: 20px !important; }
.dk-narrow .dk-smr { gap: 3px; }
.dk-narrow .dk-cap { width: 22px; margin-left: -11px; height: 13px; margin-bottom: -6.5px; }
.dk-narrow .dk-tn { font-size: 8px; right: calc(50% + 10px); }
.dk-narrow .dk-tape { font-size: 12px; border-width: 8px 6px 11px; height: 28px; line-height: 9px; }
.dk-narrow .dk-mixm { padding: 13px 7px 14px; gap: 6px; }
.dk-narrow .dk-mixm .dk-tape { font-size: 13px; height: 31px; border-width: 9px 12px 12px; line-height: 10px; }
.dk-narrow .dk-mixm .dk-role, .dk-narrow .dk-mixm .dk-dvl, .dk-narrow .dk-mixm .dk-note { display: none; }
.dk-narrow .dk-kg { gap: 6px 5px; }
.dk-narrow .dk-nb { font-size: 12px !important; padding: 6px 2px 5px; letter-spacing: .02em; }
.dk-narrow .dk-vu { width: 84px; height: 46px; }
.dk-narrow .dk-pa2 { flex-direction: column; align-items: flex-start; gap: 6px; }
.dk-narrow .dk-win { font-size: 12px; padding: 4px 5px; white-space: normal; overflow-wrap: anywhere; }
.dk-narrow .dk-lrow { font-size: 12px; gap: 6px; }
`;

  const f1 = (n) => (Math.round(n * 10) / 10).toString();
  const f3 = (n) => (Math.round(n * 1000) / 1000).toString();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const escFallback = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const setText = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
  const setCls = (el, c, on) => { if (el && el.classList.contains('dk-' + c) !== !!on) el.classList.toggle('dk-' + c, !!on); };
  const setTf = (el, t) => { if (el && el.style.transform !== t) el.style.transform = t; };

  function create(o) {
    const esc = o.esc || escFallback;
    const IMG = o.img || '/rec/';
    if (!document.getElementById('dk-css')) { const s = document.createElement('style'); s.id = 'dk-css'; s.textContent = CSS(IMG); document.head.appendChild(s); }
    const V = () => (o.view && o.view()) || {};
    const call = (name, ...a) => { try { if (typeof o[name] === 'function') return o[name](...a); } catch (e) { console.error('dock:', name, e); } return undefined; };
    let root = null, ro = null, headSig = '', conSig = '', pressed = false, pending = false;
    const ui = { open: true, big: false, who: 'main', narrow: false, touch: {}, hand: null, vis: false };   // vis: Edit (show or hide channels); ui.edit is a tape being renamed
    const live = { lv: {}, main: [0, 0], peak: {}, vu: -999, drawn: new Map() };
    const builds = { head: 0, console: 0 };
    const CTL = () => ui.open || ui.big;   // each channel's own controls (Input, ON, its name): in the open console, whatever its size

    // ---------- whose mix, and what is in it ----------
    const stems = (v) => (Array.isArray(v.stems) ? v.stems.filter((s) => s && s.i != null && (!s.hidden || ui.vis)) : []);   // a hidden pair: only while editing
    const bare = (v) => stems(v).filter((s) => !s.out && !s.deck);   // the pairs after 1/2: Solo all, Mute all and the empty note leave OUT (1/2) and the decks out
    const strip = (v) => stems(v).filter((s) => !s.out);              // the shut strip's meter bridge: the decks (two programs) and the pairs
    const peopleOf = (v) => (Array.isArray(v.people) ? v.people.filter((p) => p && p.peer != null) : []);
    const nameOf = (p) => { const n = String((p && p.name) || '').split(/\s[·•|-]\s|·/)[0].trim(); return n || 'Guest'; };
    const instOf = (p) => { if (p.inst) return p.inst; const m = String(p.name || '').split(/\s[·•|-]\s|·/); return m.length > 1 ? m[m.length - 1].trim().toLowerCase() : ''; };
    const stOf = (p) => (p.away ? 'wait' : p.state === 'ok' ? 'ok' : p.state === 'wait' ? 'wait' : 'off');
    function who(v) { if (ui.who !== 'main' && !peopleOf(v).some((p) => String(p.peer) === ui.who)) ui.who = 'main'; return ui.who; }
    const person = (v, w) => peopleOf(v).find((p) => String(p.peer) === String(w)) || null;
    // a stem's values in a mix: Main by pair, a listener by the stem's name; has: whether that mix has it
    function track(v, w, s) {
      const key = w + ':' + s.i, t = ui.touch[key];
      let r;
      if (s.deck) r = { v: s.v != null ? +s.v : 1, p: 0, m: false, s: false, has: true };   // (2026-10-25) a deck: its level into the crossfader, whoever's mix is shown
      else if (w === 'main') { const m = (v.main && v.main.tracks && v.main.tracks[s.i]) || {}; r = { v: m.v != null ? +m.v : 1, p: +m.p || 0, m: !!m.m, s: !!m.s, has: !!(v.main ? v.main.has !== false : true) }; }
      else if (s.out) {   // (0.7.2) OUT, 1/2: a listener's level of the full mix (their page reports it as `out`; has: they are hearing the full mix now)
        const mx = v.mixes && v.mixes[w], o = mx && mx.out;
        r = o ? { v: o.v != null ? +o.v : 1, p: +o.p || 0, m: !!o.m, s: false, has: o.has !== false } : { v: 1, p: 0, m: false, s: false, has: false };   // (2026-10-29) its mute and pan too
      } else {
        const mx = v.mixes && v.mixes[w], x = mx && Array.isArray(mx.tracks) ? mx.tracks.find((t2) => t2 && t2.name === s.name) : null;
        r = x ? { v: x.v != null ? +x.v : 1, p: +x.p || 0, m: !!x.m, s: !!x.s, has: true } : { v: 1, p: 0, m: false, s: false, has: false };
      }
      if (t && Date.now() - t.at < 600) Object.assign(r, t.val);
      return r;
    }
    const linkedOut = (v, w) => !!(v.link && Array.isArray(v.link.out) && v.link.out.map(String).includes(String(w)));   // Link on, and this listener left it
    const mixKnown = (v, w) => w === 'main' ? !(v.main && v.main.has === false) : !!(v.mixes && v.mixes[w]);

    // ---------- small parts ----------
    const px = (cls) => (cls ? ' ' + cls.split(' ').filter(Boolean).map((c) => 'dk-' + c).join(' ') : '');
    const led = (cls, data) => '<i class="dk-led' + px(cls) + '"' + (data ? ' ' + data : '') + '></i>';
    // what a listener hears: their page's Full mix, or their Track mixer (their own mix of the stems)
    const hears = (v, w) => { const mx = v.mixes && v.mixes[w]; return !mx ? '' : mx.mode === 'master' ? 'Full mix' : 'Track mixer'; };
    const lampOf = (st) => (st === 'ok' ? 'on' : st === 'wait' ? 'wait' : '');
    const lad = (data) => '<span class="dk-lad"' + (data ? ' ' + data : '') + '><i></i><u></u></span>';
    const scr = (cls) => '<i class="dk-scr' + px(cls) + '"></i>';
    function pad(v, w) {
      if (w === 'main') return '<button type="button" class="dk-wp' + (who(v) === 'main' ? ' dk-sel' : '') + '" data-dk-act="who" data-who="main" aria-pressed="' + (who(v) === 'main') + '" title="Main: what this Mac’s monitor out plays"><span class="dk-c">' + ICON.spk + 'Main<small>' + esc(v.mainSub || 'the PA') + '</small></span></button>';
      const p = person(v, w), st = stOf(p);
      return '<button type="button" class="dk-wp' + (who(v) === String(p.peer) ? ' dk-sel' : '') + (st === 'off' ? ' dk-off' : '') + '" data-dk-act="who" data-who="' + esc(p.peer) + '" aria-pressed="' + (who(v) === String(p.peer)) + '" title="' + esc(nameOf(p)) + '’s mix: what they hear">'
        + '<span class="dk-c">' + led(lampOf(st), 'data-pled') + esc(nameOf(p)) + (hears(v, p.peer) ? '<small>' + hears(v, p.peer) + '</small>' : '') + '</span></button>';
    }
    const master = () => '<span class="dk-mm" data-master><span class="dk-silk">L</span><span class="dk-hl"><i data-ml></i></span><span class="dk-silk">R</span><span class="dk-hl"><i data-mr></i></span></span>';

    // ---------- the head ----------
    function headSigOf(v) { return [ui.open, ui.big, ui.narrow, who(v), v.mainSub || '', peopleOf(v).map((p) => p.peer + ':' + nameOf(p) + ':' + hears(v, p.peer)).join(','), ui.open ? '' : strip(v).map((s) => s.i + ':' + s.name).join(',')].join('|'); }
    function buildHead(v) {
      const hd = root.querySelector('[data-head]'); if (!hd) return;
      builds.head++;
      const open = ui.open || ui.big, w = who(v);
      let h = '<button type="button" class="dk-pull" data-dk-act="pull" aria-expanded="' + open + '" aria-label="' + (open ? 'Close the mixer' : 'Open the mixer') + '"><span class="dk-pt">Mixer</span>' + (open ? ICON.down : ICON.up) + '</button>';
      if (!open) {
        h += '<span class="dk-wps">' + pad(v, w) + '</span><span class="dk-sp"></span>';
        if (!ui.narrow) h += '<span class="dk-bridge" aria-hidden="true">' + strip(v).map((s) => '<span class="dk-bm"><span class="dk-mv">' + lad('data-bl="' + s.i + '"') + lad('data-br="' + s.i + '"') + '</span><b>' + esc(String(s.name || s.pair || '').slice(0, 5)) + '</b></span>').join('') + '</span>';
        h += master();
      } else {
        h += '<span class="dk-dl">Whose mix</span><span class="dk-wps" data-wps role="group" aria-label="Whose mix">' + pad(v, 'main') + peopleOf(v).map((p) => pad(v, String(p.peer))).join('') + '</span><span class="dk-sp"></span>'
          + (ui.narrow ? '' : master());
      }
      hd.innerHTML = h;
      live.drawn.clear();
      const sel = hd.querySelector('.dk-wp.dk-sel'), row = hd.querySelector('[data-wps]');
      if (sel && row && row.scrollWidth > row.clientWidth) { const l = sel.offsetLeft - row.offsetLeft; if (l < row.scrollLeft || l + sel.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = l - 8; }
    }

    // ---------- the console ----------
    function conSigOf(v) {
      if (!ui.open && !ui.big) return 'shut';
      const w = who(v), p = w === 'main' ? null : person(v, w);
      return [ui.big, ui.narrow, ui.vis, w, stems(v).map((s) => s.i + ':' + s.name + ':' + s.pair + ':' + (s.kind || '') + (s.hidden ? ':h' : '')).join(','), v.canAdd ? 'add' : '', v.link ? (v.link.on ? 'L' : 'l') + (linkedOut(v, w) ? 'x' : '') : '', mixKnown(v, w), p ? nameOf(p) + ':' + instOf(p) : '', v.mainSub || '', v.mainNote || ''].join('|');
    }
    function marksFor() {
      const big = ui.big, N = ui.narrow;
      return big ? (N ? [3.5, 0, -6, -12, -18, -30, -60] : [3.5, 0, -3, -6, -9, -12, -18, -24, -30, -40, -60]) : (N ? [0, -12, -60] : [0, -6, -18, -30, -60]);
    }
    function buildConsole(v) {
      const cn = root.querySelector('[data-console]'); if (!cn) return;
      builds.console++;
      if (!ui.open && !ui.big) { cn.innerHTML = ''; live.drawn.clear(); return; }
      const w = who(v), N = ui.narrow, known = mixKnown(v, w);
      let c = '<div class="dk-mod dk-mixm" data-mixm>' + scr('s1 t') + scr('s2 b');
      if (w === 'main') {
        c += '<span class="dk-nm"><span class="dk-tape">Main</span><span class="dk-role">' + esc(v.mainSub || 'the PA') + '</span></span>'
          + (ui.big ? '<span class="dk-vu" role="meter" aria-label="What the PA plays" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><img src="' + IMG + 'vu-face.webp" alt="" draggable="false"><span class="dk-clip"><i class="dk-needle" data-vun></i></span><img src="' + IMG + 'vu-top.webp" alt="" draggable="false"></span>' : '')
          + '<span class="dk-win" data-padev></span><span class="dk-pa2"><span class="dk-lrow">' + led('lg', 'data-paled') + '<span data-pain></span></span><button type="button" class="dk-nb" data-dk-act="lineup">Line up</button></span>'
          + (ui.big ? '<span class="dk-note">' + esc(v.mainNote || 'Stems soloed, click and guide out. Changes the PA, never what the band hears.') + '</span>' : '')
          + (v.link ? '<button type="button" class="dk-nb dk-w dk-lnk' + (v.link.on ? ' dk-on' : '') + '" data-dk-act="link" aria-pressed="' + !!v.link.on + '" title="' + (v.link.on
            ? 'Linked: every listener hears this mix and follows each change to it. Click to unlink.' : 'Link every listener’s mix to this one: a change here changes everyone’s') + '">' + (v.link.on ? 'Linked to all' : 'Link to all') + '</button>' : '');
      } else {
        const p = person(v, w), nm = nameOf(p);
        c += '<span class="dk-nm"><span class="dk-tape">' + esc(nm) + '</span><span class="dk-role">' + esc(INST_WORD[instOf(p)] || instOf(p)) + '</span></span>'
          + '<span class="dk-lrow">' + led('lg', 'data-wled') + '<span data-wst></span><span class="dk-msv" data-wms></span></span>'
          + '<span class="dk-dvl" data-wdv></span>'
          + '<span class="dk-note">' + (p && p.you ? (known ? 'What you hear on your phone. It lands on its own faders.' : 'Waiting for your phone’s mix: it comes when the page opens.')
            : known ? 'What ' + esc(nm) + ' hears. It lands on ' + esc(nm) + '’s own faders.' : 'Waiting for ' + esc(nm) + '’s mix: their page sends it when it opens.') + '</span>'
          + (v.link && v.link.on ? (linkedOut(v, w)
            ? '<button type="button" class="dk-nb dk-w" data-dk-act="relink" title="' + esc(nm) + ' made their own mix: give them the ' + esc(v.mainSub || 'PA') + '’s again, and follow it">Back to ' + esc(v.mainSub || 'the PA') + '</button>'
            : '<span class="dk-lrow">' + led('on') + '<span>Linked to Main</span></span>') : '');
      }
      const k = (act, word, short, wide) => '<button type="button" class="dk-nb' + (wide && !N ? ' dk-w' : '') + '" data-dk-act="' + act + '" title="' + word + '">' + (N ? short : word) + '</button>';
      c += '<span class="dk-kg">' + k('solo', 'Solo all', 'Solo') + k('mute', 'Mute all', 'Mute') + k('copy', 'Copy mix', 'Copy') + k('paste', 'Paste mix', 'Paste') + k('reset', 'Reset', 'Reset')
        + '<button type="button" class="dk-nb' + (ui.vis ? ' dk-on' : '') + '" data-dk-act="edit" aria-pressed="' + ui.vis + '" title="' + (ui.vis ? 'Done: the hidden channels leave the mixer' : 'Show or hide each channel') + '">' + (ui.vis ? 'Done' : 'Edit') + '</button></span></div>';
      const knS = N ? 22 : 26, marks = marksFor();
      stems(v).forEach((s, j) => {
        const clk = s.kind === 'click' || s.kind === 'guide' || /^(click|guide)\b/i.test(String(s.name || ''));
        let sc = '';
        for (const d of marks) { const ff = f3(fOfDb(d)), u = d === 0, lab = d === -60 ? '∞' : d > 0 ? '+3' : String(Math.abs(d)); sc += '<i class="dk-tk' + (u ? ' dk-u' : '') + '" style="bottom:' + f1(ff * 100) + '%"></i><span class="dk-tn' + (u ? ' dk-u' : '') + '" style="bottom:' + f1(ff * 100) + '%">' + lab + '</span>'; }
        const nm = String(s.name || s.pair || ''), two = clk && /\+/.test(nm);
        const outTitle = s.title || 'OUT: channels 1/2, what your listeners hear';
        const deckTitle = s.title || ('Deck ' + String(s.pair || '') + ' level: what goes into the crossfader');
        const top = s.deck ? '<span class="dk-top"><span class="dk-src dk-outk" data-deck="' + esc(s.deck) + '" title="' + esc(deckTitle) + '"><span class="dk-pn">' + esc(s.pair || '') + '</span></span></span>'
            + '<button type="button" class="dk-k dk-air" data-dk-act="on" aria-pressed="false" disabled title="Deck ' + esc(s.pair || '') + ' goes out through OUT">ON</button>'
          : s.out ? '<span class="dk-top"><span class="dk-src dk-outk" data-out title="' + esc(outTitle) + '"><span class="dk-pn">' + esc(s.pair || '1/2') + '</span></span></span>'
            + '<button type="button" class="dk-k dk-air" data-dk-act="on" aria-pressed="false" disabled title="OUT is on air whenever you are live">ON</button>'
          : !CTL() ? '<span class="dk-top"><span class="dk-pr">' + esc(s.pair || '') + '</span>' + led('', 'data-sled') + '</span>'
          // enlarged: the pair's source key (the page's menu opens under it) and its ON
          : '<span class="dk-top"><button type="button" class="dk-src" data-dk-act="src" data-dk-src="' + s.i + '" aria-haspopup="menu" aria-expanded="false"><span class="dk-pn">' + esc(s.pair || '') + '</span><span data-srcg></span></button></span>'
            + '<button type="button" class="dk-k dk-air" data-dk-act="on" aria-pressed="false" title="Put ' + esc(s.pair || '') + ' on air">ON</button>';
        const tape = s.deck ? '<span class="dk-tape" data-tape title="' + esc(deckTitle) + '" style="transform:rotate(' + (s.deck === 'a' ? 1.5 : -1) + 'deg)">' + esc(nm) + '</span>'
          : s.out ? '<span class="dk-tape" data-tape title="' + esc(outTitle) + '" style="transform:rotate(-2deg)">' + esc(nm) + '</span>'
          : CTL() && s.kind !== 'click'   // StreamDAW's own click keeps its name; a DAW's click or guide pair is renamed like any
          ? '<button type="button" class="dk-tape" data-dk-act="name" data-tape title="' + esc(nm) + ' · click to rename" aria-label="Name of pair ' + esc(s.pair || '') + ': ' + esc(nm) + '. Click to rename" style="transform:rotate(' + [-2, 1.5, -1, 2, -1.5, 1, -2.5, 1.5][j % 8] + 'deg)">' + esc(nm) + '</button>'
          : '<span class="dk-tape" data-tape style="transform:rotate(' + [-2, 1.5, -1, 2, -1.5, 1, -2.5, 1.5][j % 8] + 'deg)">' + esc(two ? nm.replace(/\s*\+.*$/, '') : nm) + '</span>';
        const vis = ui.vis && !s.out && !s.deck ? '<button type="button" class="dk-vis" data-dk-act="vis" aria-pressed="' + !s.hidden + '" title="' + (s.hidden ? 'Hidden: click to show ' : 'Shown: click to hide ') + esc(nm) + '" aria-label="' + (s.hidden ? 'Show ' : 'Hide ') + esc(nm) + '">' + led(s.hidden ? '' : 'on') + '</button>' : '';
        c += '<div class="dk-mod dk-ch' + (clk ? ' dk-clk' : '') + (s.out ? ' dk-out' : '') + (s.deck ? ' dk-deck' : '') + (s.hidden ? ' dk-hid' : '') + '" data-ch="' + s.i + '"' + (s.deck ? ' data-deck="' + esc(s.deck) + '"' : '') + ' role="group" aria-label="' + esc(s.out ? outTitle : s.deck ? deckTitle + ': ' + nm : nm + ' (' + (s.pair || '') + ')') + '">' + scr(['s1', 's2', 's3', ''][j % 4] + ' t') + scr(['s3', '', 's1', 's2'][j % 4] + ' b')
          + vis + top
          + '<span class="dk-kn" style="--s:' + knS + 'px" data-kn role="slider" tabindex="0" aria-label="Pan, ' + esc(nm) + '" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0"><img src="' + IMG + 'knob.webp" alt="" draggable="false"><i class="dk-ind" data-ind></i><span class="dk-kl dk-lo">L</span><span class="dk-kl dk-hi">R</span></span>'
          + '<span class="dk-smr"><button type="button" class="dk-k dk-s" data-dk-act="s" aria-pressed="false" title="Solo ' + esc(nm) + '">S</button><button type="button" class="dk-k dk-m" data-dk-act="m" aria-pressed="false" title="Mute ' + esc(nm) + '">M</button></span>'
          + '<span class="dk-fad" data-fad><span class="dk-run">' + sc + '<span class="dk-slot"></span><span class="dk-mt">' + lad('data-l') + lad('data-r') + '</span>'
          + '<span class="dk-capw" data-capw><span class="dk-cap" data-cap role="slider" tabindex="0" aria-label="' + (s.deck ? esc(deckTitle) + ', ' : 'Level, ') + esc(nm) + '" aria-valuemin="-60" aria-valuemax="3.5" aria-valuenow="0"></span></span></span></span>'
          + '<span class="dk-rd" data-rd></span>' + tape + '</div>';
      });
      if (v.canAdd) c += '<div class="dk-mod dk-addm"><button type="button" class="dk-add" data-dk-act="add" title="Add a channel: pick what plays into the next free pair"><b>+</b><span>Add channel</span></button></div>';
      if (!known && w !== 'main' && bare(v).length) c += '<div class="dk-wait-note" data-waitnote>' + led('wait') + ' Waiting for ' + esc(nameOf(person(v, w))) + '’s mix</div>';
      if (!bare(v).length && !stems(v).some((s) => s.deck)) c += '<div class="dk-empty" data-empty><b>No stems on air yet.</b>Send your DAW’s tracks to StreamDAW Audio 3/4 and up: each pair is a channel here.</div>';
      cn.innerHTML = c;
      live.drawn.clear();
    }
    // the values of the mix shown: in place
    function patchConsole(v) {
      const cn = root && root.querySelector('[data-console]'); if (!cn || (!ui.open && !ui.big)) return;
      const w = who(v), known = mixKnown(v, w), S = bare(v), A = stems(v), anyS = A.some((s) => track(v, w, s).s);
      for (const s of A) {
        const el = cn.querySelector('[data-ch="' + s.i + '"]'); if (!el) continue;
        const t = track(v, w, s), none = !s.deck && (!known || !t.has);
        setCls(el, 'none', none); setCls(el, 'muted', !s.deck && (t.m || (anyS && !t.s)));
        setCls(el.querySelector('[data-sled]'), 'on', !!s.live && !none);
        const sb = el.querySelector('[data-dk-act="s"]'), mb = el.querySelector('[data-dk-act="m"]');
        setCls(sb, 'on', t.s); setCls(mb, 'on', t.m);
        if (sb.getAttribute('aria-pressed') !== String(t.s)) sb.setAttribute('aria-pressed', String(t.s));
        if (mb.getAttribute('aria-pressed') !== String(t.m)) mb.setAttribute('aria-pressed', String(t.m));
        const fixed = !!s.deck, lout = !!s.out && w !== 'main';   // a deck has its level only; (2026-10-29) a listener's OUT: level, pan and M (S belongs to tracks)
        sb.disabled = none || fixed || lout; mb.disabled = none || fixed; if (fixed) el.dataset.nopan = '1'; else delete el.dataset.nopan;
        if (s.deck) { const tS = 'A deck has no solo: CUE on the crossfader plays it alone in your ears', tM = 'To silence deck ' + (s.pair || '') + ', pull its fader down'; if (sb.title !== tS) sb.title = tS; if (mb.title !== tM) mb.title = tM; }
        else if (s.out) { const tS = lout ? 'Solo belongs to tracks, not the full mix' : 'Solo OUT: this Mac’s monitor plays only the full mix', tM = lout ? 'Mute the full mix in their ears' : 'Mute OUT on this Mac’s monitor'; if (sb.title !== tS) sb.title = tS; if (mb.title !== tM) mb.title = tM; }
        setTf(el.querySelector('[data-ind]'), 'rotate(' + f1(t.p * 135) + 'deg)');
        const kn = el.querySelector('[data-kn]'), pv = String(Math.round(t.p * 100)); if (kn.getAttribute('aria-valuenow') !== pv) { kn.setAttribute('aria-valuenow', pv); kn.setAttribute('aria-valuetext', t.p === 0 ? 'centre' : Math.abs(Math.round(t.p * 100)) + ' % ' + (t.p < 0 ? 'left' : 'right')); }
        const f = fOfDb(dbOf(t.v));
        setTf(el.querySelector('[data-capw]'), 'translateY(' + f1(-f * 100) + '%)');
        const cap = el.querySelector('[data-cap]'), dv = isFinite(dbOf(t.v)) ? String(Math.round(dbOf(t.v) * 10) / 10) : '-60';
        if (cap.getAttribute('aria-valuenow') !== dv) { cap.setAttribute('aria-valuenow', dv); cap.setAttribute('aria-valuetext', dbTxt(t.v) + ' dB'); }
        const rd = el.querySelector('[data-rd]'); setText(rd, dbTxt(t.v)); setCls(rd, 'dim', t.m);
        if (s.deck) patchDeck(el, s);
        else if (CTL() && !s.out) patchPair(el, s);
        else if (s.out) patchOut(el, s);
      }
      const mm = cn.querySelector('[data-mixm]');
      if (mm) {
        const pa = v.pa || {}, pst = pa.state || 'off';
        setText(mm.querySelector('[data-padev]'), pa.device || 'No output');
        const pl = mm.querySelector('[data-paled]'); setCls(pl, 'on', pst === 'ok'); setCls(pl, 'wait', pst === 'wait');
        setText(mm.querySelector('[data-pain]'), pst === 'ok' ? 'In time' : pst === 'wait' ? 'Lining up…' : 'Off');
        const p = w === 'main' ? null : person(v, w);
        if (p) {
          const st = stOf(p);
          const wl = mm.querySelector('[data-wled]'); setCls(wl, 'on', st === 'ok'); setCls(wl, 'wait', st === 'wait');
          setText(mm.querySelector('[data-wst]'), p.away ? 'Reconnecting…' : STATE_WORD[st]);
          setText(mm.querySelector('[data-wms]'), st === 'ok' && typeof p.ms === 'number' ? '±' + (p.ms < 1 ? (Math.round(p.ms * 10) / 10 || .1) : Math.round(p.ms)) + ' ms' : '');
          const mx = v.mixes && v.mixes[w];
          setText(mm.querySelector('[data-wdv]'), (p.model || '') + (mx ? (p.model ? ' · ' : '') + 'hears the ' + (mx.mode === 'master' ? 'Full mix' : 'Track mixer') : ''));
        }
        const all = (k) => S.length > 0 && S.every((s) => track(v, w, s)[k]);
        setCls(mm.querySelector('[data-dk-act="solo"]'), 'on', all('s')); setCls(mm.querySelector('[data-dk-act="mute"]'), 'on', all('m'));
        for (const a of ['solo', 'mute', 'copy', 'reset']) { const b = mm.querySelector('[data-dk-act="' + a + '"]'); if (b) b.disabled = !known || !S.length; }
        const pb = mm.querySelector('[data-dk-act="paste"]'); if (pb) { pb.disabled = !v.clip || !S.length; const tt = v.clip ? 'Paste ' + (v.clip.from === 'Main' ? 'the Main mix' : (v.clip.from || 'the copied') + '’s mix') + ' here' : 'Copy a mix first'; if (pb.title !== tt) pb.title = tt; }
      }
      paintMeters(true);
    }
    // OUT (1/2): its ON shows whether the mix is on air, and cannot be pressed (the session's STOP LIVE ends it)
    function patchOut(el, s) {
      const on = el.querySelector('[data-dk-act="on"]'); if (!on) return;
      setCls(on, 'on', !!s.on); if (on.getAttribute('aria-pressed') !== String(!!s.on)) on.setAttribute('aria-pressed', String(!!s.on));
      const tt = s.on ? 'OUT is on air whenever you are live' : 'OUT goes on air when you go live';
      if (on.title !== tt) on.title = tt;
    }
    // (2026-10-25) a deck: its lamp says whether what it plays goes out (OUT on air); it cannot be pressed
    function patchDeck(el, s) {
      const on = el.querySelector('[data-dk-act="on"]'); if (!on) return;
      setCls(on, 'on', !!s.on); if (on.getAttribute('aria-pressed') !== String(!!s.on)) on.setAttribute('aria-pressed', String(!!s.on));
    }
    // enlarged: a pair's ON and its source key, in place
    function patchPair(el, s) {
      const on = el.querySelector('[data-dk-act="on"]');
      if (on) { setCls(on, 'on', !!s.on); if (on.getAttribute('aria-pressed') !== String(!!s.on)) on.setAttribute('aria-pressed', String(!!s.on));
        const tt = (s.on ? 'Take ' : 'Put ') + (s.pair || '') + (s.on ? ' off air' : ' on air'); if (on.title !== tt) on.title = tt; }
      const b = el.querySelector('[data-dk-src]'); if (!b) return;
      const x = s.src || null, sg = x ? [x.kind, x.name, x.icon || '', x.bad ? 1 : 0].join('|') : '';
      if (b.dataset.sig !== sg) {
        b.dataset.sig = sg;
        const g = b.querySelector('[data-srcg]');
        if (g) g.innerHTML = !x ? '<span class="dk-car" aria-hidden="true">›</span>'
          : x.kind === 'app' ? (x.icon ? '<img src="' + esc(x.icon) + '" alt="">' : '<span class="dk-lt" aria-hidden="true">' + esc(String(x.name || '?').trim().charAt(0).toUpperCase() || '?') + '</span>')
          : (ICON[x.kind] || ICON.input);
        setCls(b, 'has', !!x); setCls(b, 'bad', !!(x && x.bad));
      }
      const tt = s.title || ('Add an app or an input to ' + (s.pair || ''));
      if (b.title !== tt) { b.title = tt; b.setAttribute('aria-label', 'Pair ' + (s.pair || '') + ': ' + tt); }
    }
    function patchHead(v) {
      const hd = root && root.querySelector('[data-head]'); if (!hd) return;
      for (const b of hd.querySelectorAll('.dk-wp[data-who]')) {
        const w = b.dataset.who; if (w === 'main') continue;
        const p = person(v, w); if (!p) continue;
        const st = stOf(p), l = b.querySelector('[data-pled]'); setCls(l, 'on', st === 'ok'); setCls(l, 'wait', st === 'wait'); setCls(b, 'off', st === 'off');
      }
    }

    // ---------- meters: what each stem sounds like in this mix, after its fader and pan ----------
    function paintMeters(force) {
      if (!root) return;
      const v = V(), w = who(v), S = stems(v), anyS = S.some((s) => track(v, w, s).s);
      const lvOf = (s) => {
        const raw = live.lv[s.i] || [0, 0], t = track(v, w, s);
        if (s.deck) return [fOfDb(dbOf(+raw[0] || 0)), fOfDb(dbOf(+raw[1] || 0))];   // a deck: the program's own signal, before its level (not scaled by the fader)
        if (t.m || (anyS && !t.s) || !t.has) return [0, 0];
        const g = t.v, p = t.p, gl = p > 0 ? 1 - p * .7 : 1, gr = p < 0 ? 1 + p * .7 : 1;
        return [fOfDb(dbOf((+raw[0] || 0) * g * gl)), fOfDb(dbOf((+raw[1] || 0) * g * gr))];
      };
      const put = (el, h) => { if (!el) return; const q = Math.round(clamp(h, 0, 1) * 40) / 40; if (!force && live.drawn.get(el) === q) return; live.drawn.set(el, q); setTf(el.firstElementChild, 'scaleY(' + f3(1 - q) + ')'); };
      const peak = (el, key, h) => {
        if (!el) return; const now = Date.now(), pk = live.peak[key] || { h: 0, at: 0 };
        if (h >= pk.h || now - pk.at > 1500) { pk.h = h; pk.at = now; live.peak[key] = pk; }
        const q = Math.round(clamp(pk.h, 0, 1) * 40) / 40, u = el.querySelector('u'); if (u) setTf(u, 'translateY(' + f1((1 - q) * 100) + '%)');
      };
      const cn = root.querySelector('[data-console]');
      if (cn && (ui.open || ui.big)) for (const s of S) {
        const el = cn.querySelector('[data-ch="' + s.i + '"]'); if (!el) continue;
        const [l, r] = lvOf(s), L = el.querySelector('[data-l]'), R = el.querySelector('[data-r]');
        put(L, l); put(R, r); peak(L, s.i + 'l', l); peak(R, s.i + 'r', r);
      }
      const hd = root.querySelector('[data-head]');
      if (hd && !ui.open && !ui.big) for (const s of strip(v)) { const [l, r] = lvOf(s); put(hd.querySelector('[data-bl="' + s.i + '"]'), l); put(hd.querySelector('[data-br="' + s.i + '"]'), r); }
      // the PA's two (Main's output), and Main's VU
      const [ml, mr] = live.main, hl = (x) => fOfDb(dbOf(+x || 0));
      for (const [sel, x] of [['[data-ml]', ml], ['[data-mr]', mr]]) { const e = root.querySelector(sel); if (!e) continue; const q = Math.round(clamp(hl(x), 0, 1) * 40) / 40; if (force || live.drawn.get(e) !== q) { live.drawn.set(e, q); setTf(e, 'scaleX(' + f3(1 - q) + ')'); } }
      const nd = root.querySelector('[data-vun]');
      if (nd) {
        const p = Math.max(+ml || 0, +mr || 0), vu = p > 0 ? 20 * Math.log10(p) + 4 : -40;
        const q = vu <= -40 ? -0.01 : Math.min(1.04, Math.pow(10, vu / 20) / Math.pow(10, 3 / 20)), ang = -42 + 84 * clamp(q, -0.02, 1.04);
        if (force || Math.abs(ang - live.vu) > 0.4) { live.vu = ang; setTf(nd, 'translateY(-100%) rotate(' + ang.toFixed(1) + 'deg)'); }
      }
    }
    function meters(levels, main) {
      if (levels) { if (Array.isArray(levels)) levels.forEach((x, i) => { if (x) live.lv[i] = x; }); else Object.assign(live.lv, levels); }
      if (main) live.main = [+main[0] || 0, main[1] == null ? +main[0] || 0 : +main[1] || 0];
      mount(); paintMeters(false);
    }

    // ---------- mounting ----------
    function host() { return root && root.closest('[data-dock-host]'); }
    function markHost() {
      const h = host(); if (!h) return;
      const open = ui.open && !ui.big, big = ui.big;
      let ch = false;
      if (h.classList.contains('dk-open') !== open) { h.classList.toggle('dk-open', open); ch = true; }
      if (h.classList.contains('dk-big') !== big) { h.classList.toggle('dk-big', big); ch = true; }
      if (ch) h.dispatchEvent(new CustomEvent('sdaw-dock', { detail: { open: ui.open || ui.big, big } }));
    }
    function mount() {
      const r = document.querySelector('[data-dk-root]');
      if (r === root) return;
      root = r; headSig = ''; conSig = ''; live.drawn.clear();
      if (ro) { ro.disconnect(); ro = null; }
      if (!root) return;
      if (window.ResizeObserver) { ro = new ResizeObserver(() => { if (fitW()) patch(); }); ro.observe(root); }
      const cn = root.querySelector('[data-console]');
      for (const sc of [cn]) if (sc) sc.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || sc.scrollWidth <= sc.clientWidth + 1) return;
        const x0 = sc.scrollLeft; sc.scrollLeft = x0 + e.deltaY; if (sc.scrollLeft !== x0) e.preventDefault();
      }, { passive: false });
      fitW();
      markHost();
    }
    function fitW() {
      if (!root) return false;
      const N = root.clientWidth > 0 && root.clientWidth < WIDE;
      if (N === ui.narrow) return false;
      ui.narrow = N; setCls(root, 'narrow', N); return true;
    }

    // ---------- the page's calls ----------
    function html() {
      root = null; headSig = ''; conSig = '';
      return '<div class="dk' + (ui.open ? ' dk-isopen' : '') + (ui.big ? ' dk-isbig' : '') + '" data-dk-root role="region" aria-label="Mixer"><div class="dk-head" data-head></div><div class="dk-console" data-console></div></div>';
    }
    function sig() { return 'dk'; }
    function patch() {
      mount();
      if (!root) return;
      fitW();
      const v = V();
      setCls(root, 'isopen', ui.open && !ui.big); setCls(root, 'isbig', ui.big);
      markHost();
      const hs = headSigOf(v), cs = conSigOf(v);
      if ((pressed || ui.hand || ui.edit) && (hs !== headSig || cs !== conSig)) pending = true;
      else {
        if (hs !== headSig) { buildHead(v); headSig = hs; }
        if (cs !== conSig) { buildConsole(v); conSig = cs; }
        pending = false;
      }
      patchHead(v);
      patchConsole(v);
      paintMeters(false);
    }
    function setOpen(open, big) {
      const was = [ui.open, ui.big];
      ui.open = !!open; ui.big = false;   // one open state (the medium size): the console, each pair with its ON and Input
      if (was[0] !== ui.open || was[1] !== ui.big) { patch(); call('change', { open: ui.open, big: ui.big, who: ui.who }); }
    }
    // the page: open someone's mix (the stage's mix keys), or close it
    function show(w, open) {
      const v = V();
      ui.who = w && (w === 'main' || person(v, w)) ? String(w) : 'main';
      if (open === false) setOpen(false, false); else if (!ui.open) setOpen(true, false); else { patch(); call('change', { open: ui.open, big: ui.big, who: ui.who }); }
    }
    function close() { setOpen(false, false); }
    function state() {
      const v = V(), cn = root && root.querySelector('[data-console]');
      return { open: ui.open, big: ui.big, who: who(v), narrow: ui.narrow, builds: { ...builds },
        height: root ? root.getBoundingClientRect().height : 0,
        pads: root ? [...root.querySelectorAll('.dk-wp')].map((b) => ({ who: b.dataset.who, sel: b.classList.contains('dk-sel'), text: b.textContent })) : [],
        channels: cn ? [...cn.querySelectorAll('[data-ch]')].map((el) => ({ i: el.dataset.deck ? el.dataset.ch : +el.dataset.ch, deck: el.dataset.deck || '', title: el.getAttribute('aria-label') || '', s: el.querySelector('[data-dk-act="s"]').classList.contains('dk-on'), m: el.querySelector('[data-dk-act="m"]').classList.contains('dk-on'),
          cap: el.querySelector('[data-capw]').style.transform, pan: el.querySelector('[data-ind]').style.transform, none: el.classList.contains('dk-none'), name: (el.querySelector('[data-tape]') || el.querySelector('.dk-tin') || {}).textContent || (el.querySelector('.dk-tin') || {}).value || '',
          l: el.querySelector('[data-l] i').style.transform, on: (el.querySelector('[data-dk-act="on"]') || { classList: { contains: () => null } }).classList.contains('dk-on'),
          src: el.querySelector('[data-dk-src]') ? el.querySelector('[data-dk-src]').dataset.sig || '' : null, rename: !!el.querySelector('button[data-dk-act="name"]') })) : [],
        bridge: root ? root.querySelectorAll('[data-bl]').length : 0 };
    }

    // ---------- enlarged: a pair's name, renamed on its tape (Enter keeps, Esc puts back, leaving keeps) ----------
    function editName(btn) {
      const ch = btn.closest('[data-ch]'), v = V(), s = ch && stemOf(v, ch.dataset.ch); if (!s || ui.edit) return;
      const inp = document.createElement('input');
      inp.className = 'dk-tin'; inp.maxLength = 40; inp.spellcheck = false; inp.value = String(s.name || '');
      inp.setAttribute('aria-label', 'Name of pair ' + (s.pair || ''));
      ui.edit = { i: s.i, inp, was: String(s.name || '') };
      btn.replaceWith(inp); inp.focus(); inp.select();
      const done = (keep) => {
        const e = ui.edit; if (!e || e.inp !== inp) return;
        ui.edit = null;
        const nv = inp.value.trim().slice(0, 40);
        if (keep && nv && nv !== e.was) call('rename', e.i, nv);
        conSig = ''; patch();
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } });
      inp.addEventListener('blur', () => done(true));
    }

    // ---------- hands: the faders, the pans, the keys ----------
    const stemOf = (v, i) => stems(v).find((s) => String(s.i) === String(i));
    function setVal(i, val, final) {
      const v = V(), w = who(v), s = stemOf(v, i); if (!s || (!s.deck && !mixKnown(v, w))) return;
      const t = track(v, w, s); if (!t.has) return;
      const key = w + ':' + i, was = ui.touch[key], now = Date.now();
      ui.touch[key] = { val: Object.assign({}, was && now - was.at < 600 ? was.val : null, val), at: now };   // (0.7.0) an expired hold is not merged back in
      if (s.deck) { if ('v' in val) call('deck', s.deck, val.v, final !== false); }   // (2026-10-25) a deck's level into the crossfader: what goes out
      else call('set', w, { i: s.i, name: s.name }, val, final !== false);
      patchConsole(v);
      clearTimeout(ui.holdT); ui.holdT = setTimeout(() => { if (root && !ui.hand) patchConsole(V()); }, 650);   // the hold ends: the mix's own word again
    }
    function faderF(el, y) { const run = el.querySelector('.dk-run').getBoundingClientRect(); return clamp((run.bottom - y) / run.height, 0, 1); }
    document.addEventListener('pointerdown', (e) => {
      if (!root || !root.contains(e.target)) return;
      pressed = true;
      if (e.button !== 0) return;
      const fad = e.target.closest('[data-fad]'), kn = e.target.closest('[data-kn]');
      const ch = (fad || kn) && (fad || kn).closest('[data-ch]'); if (!ch || ch.classList.contains('dk-none') || (kn && !fad && ch.dataset.nopan)) return;
      const v = V(), s = stemOf(v, ch.dataset.ch), t = s && track(v, who(v), s); if (!t) return;
      e.preventDefault();
      if (fad) {
        const onCap = !!e.target.closest('[data-cap]'), f0 = fOfDb(dbOf(t.v));
        ui.hand = { kind: 'v', i: ch.dataset.ch, el: fad, y0: e.clientY, f0: onCap ? f0 : faderF(fad, e.clientY), id: e.pointerId, h: fad.querySelector('.dk-run').getBoundingClientRect().height };
        if (!onCap) setVal(ch.dataset.ch, { v: vOfF(ui.hand.f0) }, false);
        (onCap ? fad.querySelector('[data-cap]') : fad).focus({ preventScroll: true });
      } else ui.hand = { kind: 'p', i: ch.dataset.ch, el: kn, x0: e.clientX, y0: e.clientY, p0: t.p, id: e.pointerId };
      try { (ui.hand.el).setPointerCapture(e.pointerId); } catch {}
    }, true);
    document.addEventListener('pointermove', (e) => {
      const h = ui.hand; if (!h || e.pointerId !== h.id) return;
      if (h.kind === 'v') { const f = clamp(h.f0 + (h.y0 - e.clientY) / Math.max(40, h.h), 0, 1); h.last = f; setVal(h.i, { v: vOfF(f) }, false); }
      else { const z = (window.SdawZoom && SdawZoom.z) || 1; let p = clamp(h.p0 + ((e.clientX - h.x0) - (e.clientY - h.y0)) / (110 * z), -1, 1); if (Math.abs(p) < .04) p = 0; h.last = p; setVal(h.i, { p: Math.round(p * 100) / 100 }, false); }   // (0.7.0) a zoomed page turns as it looks
    });
    const up = (e) => {
      const h = ui.hand;
      if (h && (!e || e.pointerId === h.id)) {
        ui.hand = null;
        if (h.last != null) setVal(h.i, h.kind === 'v' ? { v: vOfF(h.last) } : { p: Math.round(h.last * 100) / 100 }, true);
        else if (h.kind === 'v') setVal(h.i, { v: vOfF(h.f0) }, true);
      }
      if (!pressed) return; pressed = false; if (pending) setTimeout(patch, 0);
    };
    document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
    document.addEventListener('dblclick', (e) => {
      if (!root || !root.contains(e.target)) return;
      const ch = e.target.closest('[data-ch]'); if (!ch) return;
      if (e.target.closest('[data-fad]')) setVal(ch.dataset.ch, { v: 1 }, true);   // (the fader holds the pointer while pressed: its double-click lands on it)
      else if (e.target.closest('[data-kn]')) setVal(ch.dataset.ch, { p: 0 }, true);
    });
    document.addEventListener('keydown', (e) => {
      if (!root || !root.isConnected) return;
      const el = document.activeElement, ch = el && root.contains(el) && el.closest('[data-ch]');
      if (ch && (el.matches('[data-cap]') || el.matches('[data-kn]'))) {
        const v = V(), s = stemOf(v, ch.dataset.ch), t = s && track(v, who(v), s); if (!t || ch.classList.contains('dk-none') || (el.matches('[data-kn]') && ch.dataset.nopan)) return;
        const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
        if (el.matches('[data-cap]')) {
          const db = isFinite(dbOf(t.v)) ? dbOf(t.v) : -60;
          if (d) { e.preventDefault(); setVal(ch.dataset.ch, { v: db + d <= -60 ? 0 : Math.min(MAXV, Math.pow(10, (db + d) / 20)) }, true); }
          else if (e.key === 'Home') { e.preventDefault(); setVal(ch.dataset.ch, { v: 1 }, true); }
          else if (e.key === 'End') { e.preventDefault(); setVal(ch.dataset.ch, { v: 0 }, true); }
        } else {
          if (d) { e.preventDefault(); let p = clamp(t.p + d * .1, -1, 1); if (Math.abs(p) < .03) p = 0; setVal(ch.dataset.ch, { p: Math.round(p * 100) / 100 }, true); }
          else if (e.key === 'Home') { e.preventDefault(); setVal(ch.dataset.ch, { p: 0 }, true); }
        }
        return;
      }
    });
    document.addEventListener('click', (e) => {
      // the whole head is the pull: open when shut, close when open (its own chips and buttons keep their own action)
      const hd = e.target.closest && e.target.closest('[data-head]');
      if (hd && root && root.contains(hd) && !e.target.closest('button, a, input, select, textarea, [data-dk-act]')) { setOpen(!(ui.open || ui.big), false); return; }
      const b = e.target.closest && e.target.closest('[data-dk-act]');
      if (!b || !root || !root.contains(b)) return;
      const v = V(), w = who(v), act = b.dataset.dkAct;
      if (act === 'pull') { setOpen(!(ui.open || ui.big), false); return; }
      if (act === 'who') { if (!ui.open && !ui.big) { show(b.dataset.who); return; } ui.who = b.dataset.who; patch(); call('change', { open: ui.open, big: ui.big, who: ui.who }); return; }
      if (act === 's' || act === 'm') { const ch = b.closest('[data-ch]'), s = stemOf(v, ch.dataset.ch); if (!s) return; const t = track(v, w, s); setVal(s.i, { [act]: !t[act] }, true); return; }
      if (act === 'solo' || act === 'mute') { call('all', w, act); return; }
      if (act === 'copy') { call('copy', w); return; }
      if (act === 'paste') { call('paste', w); return; }
      if (act === 'reset') { call('reset', w); return; }
      if (act === 'lineup') { call('lineUp'); return; }
      if (act === 'add') { call('add'); return; }
      if (act === 'link') { call('link', !(v.link && v.link.on)); return; }
      if (act === 'relink') { call('relink', w); return; }
      if (act === 'edit') { ui.vis = !ui.vis; patch(); return; }
      if (act === 'vis') { const ch = b.closest('[data-ch]'), s = ch && stemOf(v, ch.dataset.ch); if (s && !s.out && !s.deck) call('vis', s.i, !!s.hidden); return; }   // vis(i, show): show it when it is hidden
      // enlarged: a pair's ON, its source menu (the page's), its name
      if (act === 'on' || act === 'src' || act === 'name') {
        const ch = b.closest('[data-ch]'), s = ch && stemOf(v, ch.dataset.ch); if (!s || s.out) return;
        if (act === 'on') { const now = !s.on; setCls(b, 'on', now); b.setAttribute('aria-pressed', String(now)); call('onAir', s.i, now); }
        else if (act === 'src') call('source', s.i);
        else editName(b);
      }
    });

    return { html, sig, patch, meters, show, close, state };
  }
  window.SdawDock = { create };
})();
