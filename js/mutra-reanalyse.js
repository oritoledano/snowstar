/* ═══════════ Re-analyse a track that is already uploaded ════════════════════
   mutra-analyse.js was written for the moment a file is dropped: it takes a
   File in the browser's memory. Everything it measures is just as useful weeks
   later, on a submission sitting in R2 — but by then the File is long gone.

   This fetches the audio back through /api/artist/file (which serves only to
   the uploader or the owner) and hands it over as a File, so one analyser
   serves both the upload form and the dashboard rather than two that drift.

   What it CANNOT do is as important as what it can. The analyser measures
   duration, tempo, key and voice from the waveform. It does not identify
   instruments, moods or genres — those need a model this site does not have —
   so they are reported as "not detected" rather than guessed. A confident
   wrong genre on a licence page is worse than a blank one.

   Tempo and key are gated: mutra-analyse only returns them when its own
   confidence clears a bar, and a null here means "could not tell", never zero.
*/
(function () {
  const CACHE = new Map();          // id -> result, so re-opening a row is free

  async function analyseSubmission(id, onStep) {
    if (CACHE.has(id)) return CACHE.get(id);
    if (!window.mutraAnalyse) throw new Error('analyser not loaded on this page');

    const step = (s) => { try { onStep && onStep(s); } catch {} };
    step('Fetching the audio…');
    const res = await fetch('/api/artist/file?id=' + encodeURIComponent(id),
      { credentials: 'same-origin' });
    if (!res.ok) throw new Error(res.status === 403 ? 'not yours to analyse' : 'could not fetch the audio');
    const blob = await res.blob();

    // analyse() reads file.name for its title guess; a Blob has none, and the
    // title is already known here, so a placeholder keeps it from throwing.
    const file = new File([blob], `submission-${id}.wav`, { type: blob.type || 'audio/wav' });
    const r = await window.mutraAnalyse.analyse(file, step);

    const out = {
      duration: r.duration ?? null,
      bpm: r.bpm ?? null,
      bpmAlternatives: r.bpmAlternatives || [],
      key: r.key ?? null,
      scale: r.scale ?? null,
      keyConfidence: r.keyConfidence || 0,
      vocal: r.vocal ?? null,
      vocalConfidence: r.vocalConfidence || 0,
      // Named so the UI can say so out loud instead of leaving a silent gap.
      undetected: ['instruments', 'moods', 'genres'],
    };
    CACHE.set(id, out);
    return out;
  }

  /** One line of prose for whatever was measured, and what was not. */
  function describe(r) {
    const bits = [];
    if (r.duration) bits.push(fmt(r.duration));
    bits.push(r.bpm ? `${r.bpm} BPM` : 'tempo unclear');
    bits.push(r.key ? `${r.key}${r.scale ? ' ' + r.scale : ''}` : 'key unclear');
    if (r.vocal) bits.push(r.vocalConfidence < 0.5 ? `${r.vocal}?` : r.vocal);
    return bits.join(' · ');
  }
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

  window.mutraReanalyse = { analyseSubmission, describe, fmt, CACHE };
})();
