/* ═══════════ Mutra — the intent engine ═══════════════════════════════════════
   Watches how a visitor moves through the catalogue and decides when they are
   ready to be sold to. Nothing here shows anything: it classifies, scores, and
   fires a moment — mutra-promos.js decides what that moment gets.

   The model, in one line: a promotion is a salesperson entering the
   conversation, and a salesperson who interrupts somebody mid-scroll is worse
   than none. So the trigger is HESITATION, not time-on-page:

     scrolled  >30% of the list
     paused    at least twice, >5s in total
     and nothing promotional has been shown yet this stretch

   Signals and their weights (pauses near the middle of a browse are worth more
   than raw time, plays are worth more than pauses, replays most of all):

     +1  pause > 2s          +3  played a track
     +2  pause > 4s          +4  replayed a track
     +3  changed a filter / searched
     -2  a long run of fast continuous scrolling

   Classification decides the FLAVOUR of what to show:
     engaged     — played tracks, still scrolling: show them more to buy
     frustrated  — filter churn, fast scrolling, no plays: help, don't sell
     browsing    — the default hesitation profile

   Everything observed here is also what the owner sees: each fired moment goes
   through the existing tracker as a `behavior` event, and the promo strips
   report `promo_seen` / `promo_click`, so the dashboard can answer "does any of
   this actually convert" with numbers instead of feelings.

   Privacy: rides the same mutra-track pipeline, so Do-Not-Track visitors are
   invisible here too — mutraTrack is a no-op for them and this file only ever
   *observes* it. Scroll positions never leave the page; only the classified
   moment does. */
(function () {
  if (!document.querySelector('.tracks')) return;   // catalogue pages only

  const S = {
    pauses: 0, pauseMs: 0, plays: 0, replays: 0, filters: 0,
    score: 0, fastRun: 0, maxDepth: 0,
    momentsFired: 0, lastMomentDepth: 0, lastMomentAt: 0, pausesAtMoment: 0,
  };
  const played = new Set();
  let lastY = 0, lastMove = 0, movingSince = 0, pauseTimer = null;

  const depth = () => {
    const d = document.scrollingElement || document.documentElement;
    const max = d.scrollHeight - innerHeight;
    return max > 0 ? Math.min(1, d.scrollTop / max) : 0;
  };

  /* ── the signals ── */

  addEventListener('scroll', () => {
    const now = performance.now();
    const y = (document.scrollingElement || document.documentElement).scrollTop;
    const dy = Math.abs(y - lastY);

    // A fast continuous run: >1200px/s sustained. One long flick is somebody
    // who cannot find anything, and it costs score rather than earning it.
    if (now - lastMove < 120 && dy / Math.max(1, now - lastMove) > 1.2) {
      S.fastRun += dy;
      if (S.fastRun > 2400) { S.score -= 2; S.fastRun = 0; }
    } else S.fastRun = 0;

    lastY = y; lastMove = now;
    if (!movingSince) movingSince = now;
    S.maxDepth = Math.max(S.maxDepth, depth());

    clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => {
      const pausedFor = 2000;               // the timer IS the pause
      S.pauses += 1; S.pauseMs += pausedFor;
      S.score += 1;
      // and keep counting while they stay still — re-armed every 2s, so a long
      // read of one row accrues the whole time, not just the first tick
      const still = () => { S.pauseMs += 2000; S.score += 1; maybeFire();
                            pauseTimer = setTimeout(still, 2000); };
      pauseTimer = setTimeout(still, 2000);
      movingSince = 0;
      maybeFire();
    }, 2000);
  }, { passive: true });

  // Plays, searches and filter changes already flow through mutraTrack — wrap
  // it once rather than teaching every module about this file.
  const orig = window.mutraTrack;
  window.mutraTrack = function (type, detail, opts) {
    try {
      if (type === 'play') {
        if (played.has(detail)) { S.replays += 1; S.score += 4; }
        else { played.add(detail); S.plays += 1; S.score += 3; }
      } else if (type === 'search') { S.filters += 1; S.score += 3; }
    } catch {}
    return orig ? orig(type, detail, opts) : undefined;
  };
  // Tag and facet clicks are filter changes too, and they never hit mutraTrack.
  addEventListener('click', (e) => {
    if (e.target.closest('.tag, .chip, .fcat, .charcard')) { S.filters += 1; S.score += 1; }
  }, { passive: true });

  /* ── the moment ── */

  const subs = [];

  function classify() {
    if (S.plays >= 2 || S.replays >= 1) return 'engaged';
    if (S.filters >= 3 && S.plays === 0) return 'frustrated';
    return 'browsing';
  }

  function maybeFire() {
    if (S.momentsFired >= 8) return;                       // a ceiling, not a diet
    /* Re-arming used to need 15% MORE depth than the last moment — which goes
       silent forever once somebody has already been to the bottom, exactly the
       long browse that deserves more moments. New pauses are the signal that
       they are still weighing options; depth only gates the FIRST moment. */
    const sinceLast = performance.now() - S.lastMomentAt;
    const rearmed = S.momentsFired === 0
      || (S.pauses - S.pausesAtMoment >= 2 && sinceLast > 25000);
    if (!rearmed) return;
    if (S.maxDepth < 0.3 || S.pauses < 2 || S.pauseMs < 5000) return;
    if (window.mutraCatalog && mutraCatalog.narrowed()) return;   // they are searching; leave them be

    S.momentsFired += 1;
    S.lastMomentDepth = S.maxDepth;
    S.pausesAtMoment = S.pauses;
    S.lastMomentAt = performance.now();
    const kind = classify();
    if (window.mutraTrack) mutraTrack('behavior', `${kind} d${Math.round(S.maxDepth * 100)} s${S.score}`);
    subs.forEach((fn) => { try { fn(kind, { ...S }); } catch {} });
  }

  window.mutraBehavior = {
    onMoment: (fn) => subs.push(fn),
    state: () => ({ ...S, classification: classify() }),
  };
})();
