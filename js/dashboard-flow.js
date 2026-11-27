/* Audioctor > Releases: each version as a train on its line.
 *
 * Five stations, left to right: Built, Test (TestFlight or a beta), Review, Store, Site.
 * A version's badge sits on the station it is waiting at; the pipe behind it is lime, the
 * pipe ahead is dark. A station that does not exist for that lane (no store for Windows)
 * is a small dim dot the line runs straight through. Lime badge at the end = arrived.
 *
 * A pure function from /api/ops/ledger to HTML, like dashboard-ledger.js; the rows are
 * SNOWSTAR/<product>/ledger/releases.md, sent by contracts/push.sh. Nothing is edited here.
 */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const stateOf = (c) => (/^done/.test(c) ? 'done' : /^todo/.test(c) ? 'todo' : /^n\/a/.test(c) ? 'na' : 'ask');
  const noteOf = (c) => String(c || '').replace(/^(done|todo|n\/a|\?)\s*/, '');
  const STAGES = [['built', 'Built'], ['test', 'Test'], ['review', 'Review'], ['store', 'Store'], ['site', 'Site']];
  const WORD = { done: 'done', todo: 'waiting', ask: 'not checked', na: 'not on this line' };

  const CSS = `<style>
    .fl-page{background:#0b0a08;color:#f3eddc;border-radius:16px;padding:22px}
    .fl-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:0 0 6px}
    .fl-head h2{margin:0;font-size:22px;color:#f3eddc}
    .fl-head span{font-size:12px;color:rgba(243,237,220,.55)}
    .fl-grid{display:grid;grid-template-columns:150px repeat(5,1fr);align-items:center}
    .fl-st{text-align:center;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:rgba(243,237,220,.55);padding:14px 0 6px}
    .fl-lane{grid-column:1/-1;margin-top:14px;padding:10px 14px 0;font-size:14px;font-weight:700;color:#f3eddc;border-top:1px solid rgba(243,237,220,.1)}
    .fl-name{padding:0 14px;font-size:12px;color:rgba(243,237,220,.6);line-height:1.3}
    .fl-cell{position:relative;height:78px}
    .fl-cell::before,.fl-cell::after{content:"";position:absolute;top:52px;height:6px;width:50%;background:rgba(243,237,220,.12)}
    .fl-cell::before{left:0}.fl-cell::after{right:0}
    .fl-cell.first::before,.fl-cell.last::after{display:none}
    .fl-cell.in::before,.fl-cell.out::after{background:#c8f23a}
    .fl-dot{position:absolute;left:50%;top:55px;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;box-sizing:border-box;background:#181713;border:2px solid rgba(243,237,220,.25);z-index:1}
    .fl-done .fl-dot{background:#c8f23a;border-color:#c8f23a}
    .fl-todo .fl-dot{background:#ff5c8a;border-color:#ff5c8a}
    .fl-ask .fl-dot{border-color:#ff5c8a}
    .fl-na .fl-dot{width:8px;height:8px;margin:-4px 0 0 -4px;border:0;background:rgba(243,237,220,.3)}
    .fl-na.in.out .fl-dot{background:#c8f23a}
    .fl-here .fl-dot::after{content:"";position:absolute;inset:-7px;border-radius:50%;border:2px solid #ff5c8a;animation:fl-pulse 1.6s ease-out infinite}
    @keyframes fl-pulse{from{transform:scale(.7)}to{transform:scale(1.5)}}
    .fl-ver{position:absolute;left:50%;top:6px;transform:translateX(-50%);white-space:nowrap;font-size:13px;font-weight:800;padding:4px 10px;border-radius:8px;background:#ff5c8a;color:#2a0010;z-index:2}
    .fl-ver::after{content:"";position:absolute;left:50%;bottom:-5px;margin-left:-5px;border:5px solid transparent;border-bottom:0;border-top-color:#ff5c8a}
    .fl-ver.home{background:#c8f23a;color:#1d2a00}.fl-ver.home::after{border-top-color:#c8f23a}
    .fl-why{grid-column:2/-1;font-size:12px;color:#ff5c8a;padding:0 0 4px;text-align:center}
    .fl-none{color:rgba(243,237,220,.6);font-size:13px;padding:8px 0}
    .fl-key{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:rgba(243,237,220,.6);margin:18px 0 0}
    .fl-key i{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:6px;vertical-align:-1px;box-sizing:border-box}
    @media (max-width:760px){.fl-grid{grid-template-columns:84px repeat(5,1fr)}.fl-name{padding:0 4px}.fl-ver{font-size:11px;padding:3px 6px}}
  </style>`;

  function train(r) {
    const st = STAGES.map(([k]) => stateOf(r[k] || '?'));
    /* where it stands: the first station that is still waiting or was never checked */
    let at = st.findIndex((s) => s === 'todo' || s === 'ask');
    const home = at < 0;
    if (home) at = st.length - 1 - [...st].reverse().findIndex((s) => s === 'done');
    const cells = STAGES.map(([k, label], i) => {
      const cls = ['fl-cell', 'fl-' + st[i], i === 0 ? 'first' : '', i === STAGES.length - 1 ? 'last' : '',
        i > 0 && i <= at ? 'in' : '', i < at ? 'out' : '', !home && i === at ? 'fl-here' : ''].join(' ');
      const n = noteOf(r[k]);
      return `<div class="${cls}" title="${esc(label + ': ' + WORD[st[i]] + (n ? '. ' + n : ''))}">${
        i === at ? `<b class="fl-ver${home ? ' home' : ''}">${esc(r.version)}</b>` : ''}<i class="fl-dot"></i></div>`;
    });
    const why = home ? '' : noteOf(r[STAGES[at][0]]) || r.note || '';
    return `<div class="fl-name" title="${esc(r.note || '')}">${esc(r.carries || '')}</div>${cells.join('')}${
      why ? `<div class="fl-why">${esc(why)}</div>` : ''}`;
  }

  function html(d) {
    d = (d && d.ledger) || d || {};   /* the route wraps the document: { ledger, pushedAt } */
    const out = (d.verticals || []).filter((v) => (v.releases || []).length).map((v) => {
      const lanes = [];
      for (const r of v.releases) {
        let l = lanes.find((x) => x.name === r.lane);
        if (!l) lanes.push(l = { name: r.lane, rows: [] });
        l.rows.push(r);
      }
      const waiting = v.releases.filter((r) => STAGES.some(([k]) => /^(todo|\?)/.test(r[k] || '?'))).length;
      return `<div class="fl-page"><div class="fl-head"><h2>${esc(v.label)}</h2><span>${waiting} on the way · ${v.releases.length - waiting} arrived</span></div>
        <div class="fl-grid"><div></div>${STAGES.map(([, l]) => `<div class="fl-st">${l}</div>`).join('')}
        ${lanes.map((l) => `<div class="fl-lane">${esc(l.name)}</div>${l.rows.map(train).join('')}`).join('')}</div>
        <p class="fl-key"><span><i style="background:#c8f23a"></i>done</span><span><i style="background:#ff5c8a"></i>waiting here</span>
          <span><i style="border:2px solid #ff5c8a"></i>not checked</span><span><i style="width:6px;height:6px;background:rgba(243,237,220,.3)"></i>not on this line</span></p></div>`;
    });
    return CSS + (out.length ? out.join('') : '<div class="fl-page"><p class="fl-none">No releases written down yet.</p></div>');
  }

  window.SnowstarFlow = { html };
})();
