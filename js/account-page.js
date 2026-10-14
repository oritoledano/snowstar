/**
 * The account page.
 *
 * All of this existed already, inside a 360px popover: the licences painter,
 * the earnings list, the downloads and favourites. A popover is the right place
 * to glance at something and the wrong place to read licence terms off, follow
 * a message thread, or check what a track's expiry date actually is — which is
 * why "a place to see his licences" was still an outstanding ask with a working
 * `paintLicences` sitting in account-ui.js.
 *
 * Nothing here is a second implementation of those endpoints. It calls the same
 * ones and lays the answers out with room.
 */
(function () {
  const root = document.getElementById('ac');
  if (!root) return;
  const M = window.SnowstarAccount || window.MutraMembers;

  const esc = (s) => String(s == null ? '' : s).replace(/[<>&]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const get = (p) => fetch('/api' + p, { credentials: 'same-origin' }).then((r) => r.json());
  const post = (p, b) => fetch('/api' + p, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(b),
  }).then((r) => r.json()).catch(() => null);

  const ils = (agorot) => '₪' + (Number(agorot || 0) / 100).toFixed(2);
  const day = (t) => (t ? new Date(t * 1000).toLocaleDateString(undefined,
    { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
  const daysLeft = (t) => Math.round((t - Date.now() / 1000) / 86400);

  const DEPT = {
    legal: 'Legal', artist: 'Artists', submissions: 'Submissions',
    licensing: 'Licensing', system: 'Snowstar',
  };

  /* Which tabs this person gets. A licence buyer should not be offered an
     earnings page and an artist should not have to hunt for their uploads —
     the same presence rule the popover uses, for the same reason. */
  const TABS = [
    { key: 'licences', label: 'Licences' },
    { key: 'messages', label: 'Messages' },
    { key: 'downloads', label: 'Downloads' },
    { key: 'artist', label: 'My music', needs: 'artist' },
    { key: 'apps', label: 'Apps', needs: 'apps' },
    { key: 'profile', label: 'Details' },
  ];

  let data = {}, tab = (location.hash || '').replace('#', '') || 'licences';

  function gate() {
    root.innerHTML = `
      <div class="ac-gate">
        <h1 style="font-family:var(--font-display)">Your account</h1>
        <p class="ac-sub">Sign in to see your licences, downloads and messages.</p>
        <button class="mbtn mbtn-solid" id="acSignin">Sign in</button>
      </div>`;
    document.getElementById('acSignin').addEventListener('click', () => {
      if (window.SnowstarOpenAuth) SnowstarOpenAuth('login', 'Sign in to see your account.');
    });
  }

  async function loadAll() {
    const [lic, msg, dl, up, apps] = await Promise.all([
      get('/licence/mine').catch(() => ({})),
      get('/messages/mine').catch(() => ({})),
      get('/downloads').catch(() => ({})),
      get('/artist/uploads').catch(() => ({})),
      get('/streamdaw/mine').catch(() => ({})),
    ]);
    data = {
      licences: (lic && lic.licences) || [],
      requests: (lic && lic.requests) || [],
      messages: (msg && msg.messages) || [],
      unread: (msg && msg.unread) || 0,
      downloads: (dl && (dl.downloads || dl.items)) || [],
      uploads: (up && up.uploads) || [],
      isArtist: !!(up && (up.artist || (up.uploads || []).length)),
      // Pro Monthly counts too, also once it is cancelled or its payment failed: that is where it is
      // managed (the sale page, the emails and the app all link to #apps).
      apps: apps && (apps.owned || apps.subscription) ? apps : null,
    };
  }

  const has = (t) => !t.needs
    || (t.needs === 'artist' && data.isArtist)
    || (t.needs === 'apps' && data.apps);

  function shell(inner) {
    const who = (M && M.user && (M.user.name || M.user.email)) || '';
    root.innerHTML = `
      <div class="ac-head"><h1>Your account</h1></div>
      <p class="ac-sub">${esc(who)}</p>
      <div class="ac-tabs">${TABS.filter(has).map((t) =>
        `<button class="ac-tab${t.key === tab ? ' on' : ''}" data-t="${t.key}">${t.label}${
          t.key === 'messages' && data.unread ? '<span class="ac-dot"></span>' : ''}</button>`).join('')}</div>
      ${inner}`;
    root.querySelectorAll('.ac-tab').forEach((b) => b.addEventListener('click', () => {
      tab = b.dataset.t;
      history.replaceState(null, '', '#' + tab);
      render();
    }));
  }

  function licences() {
    const live = data.licences.filter((l) => !l.revoked_at);
    /* An unpaid self-serve request is not "in review" — nobody is looking at
       it, it is waiting on the buyer. Saying otherwise leaves somebody waiting
       for an answer that will never come. */
    const waiting = data.requests.filter((r) => r.lane === 'quote' && r.status === 'new');
    const unfinished = data.requests.filter((r) => r.lane !== 'quote' && r.status === 'new');

    return `
      <div class="ac-panel">
        <h2>Licences</h2>
        <p class="ac-note">One licence covers one project. The certificate names you, the track and
          the project, and stays valid for the term whatever happens to the catalogue afterwards.</p>
        ${live.length ? live.map((l) => {
          const left = l.expires_at ? daysLeft(l.expires_at) : null;
          const ended = left != null && left < 0;
          return `<div class="ac-row">
            <div>
              <b>${esc(l.slug)}</b>
              <span class="ac-chip ${ended ? 'off' : left != null && left <= 30 ? 'soon' : 'live'}">${
                ended ? 'ended' : l.expires_at ? left + ' days left' : 'no end date'}</span>
              <div class="ac-meta">
                <span>${esc(l.ref)}</span>
                <span>${ils(l.amount)} ex VAT</span>
                <span>from ${day(l.starts_at || l.granted_at)}${
                  l.expires_at ? ' to ' + day(l.expires_at) : ''}</span>
              </div>
            </div>
            <div class="ac-acts">
              <a class="mbtn mbtn-ghost" href="/api/licence/certificate?ref=${encodeURIComponent(l.ref)}"
                 target="_blank" rel="noopener">Certificate</a>
              <a class="mbtn mbtn-ghost" href="/api/download?slug=${encodeURIComponent(l.slug)}">Download</a>
            </div>
          </div>`; }).join('')
        : '<p class="ac-empty">No licences yet. Anything you license will appear here with its dates.</p>'}
      </div>

      ${waiting.length ? `<div class="ac-panel"><h2>Waiting on us</h2>
        <p class="ac-note">These need a price from a person. We answer the same day.</p>
        ${waiting.map((r) => `<div class="ac-row"><div><b>${esc(r.slug)}</b>
          <div class="ac-meta"><span>${esc(r.ref)}</span><span>asked ${day(r.created_at)}</span></div></div>
          <div class="ac-acts"><span class="ac-chip">quote</span></div></div>`).join('')}</div>` : ''}

      ${unfinished.length ? `<div class="ac-panel"><h2>Not finished</h2>
        <p class="ac-note">Started but not paid, so nothing is licensed yet. Pick up where you left off.</p>
        ${unfinished.map((r) => `<div class="ac-row"><div><b>${esc(r.slug)}</b>
          <div class="ac-meta"><span>${esc(r.ref)}</span><span>started ${day(r.created_at)}</span></div></div>
          <div class="ac-acts"><a class="mbtn mbtn-solid" href="/mutra.html">Finish it</a></div></div>`).join('')}</div>` : ''}`;
  }

  function messages() {
    return `<div class="ac-panel">
      <h2>Messages${data.unread ? ` — ${data.unread} unread` : ''}</h2>
      <p class="ac-note">Everything we have sent you, from whichever desk sent it. Kept here so it is
        findable even if the email went astray.
        ${data.unread ? '<button class="mbtn mbtn-ghost" id="acReadAll" style="margin-left:6px">Mark all read</button>' : ''}</p>
      ${data.messages.length ? data.messages.map((m) => `
        <div class="ac-msg${m.read_at ? '' : ' unread'}" data-id="${m.id}">
          <b>${esc(m.subject)}</b>
          <div class="ac-meta">
            <span class="ac-chip">${esc(DEPT[m.department] || m.department)}</span>
            <span>${day(m.sent_at)}</span>
          </div>
          <div class="ac-msgbody">${esc(m.body || '')}</div>
        </div>`).join('')
      : `<p class="ac-empty">Nothing yet. Anything we send you — a licence, a question about a track,
           a reply from legal — lands here as well as in your email.</p>`}
    </div>`;
  }

  function downloads() {
    return `<div class="ac-panel"><h2>Downloads</h2>
      <p class="ac-note">Every clean file you have taken. A licensed track can be downloaded again
        as often as you need it — the licence is the permission, not the file.</p>
      ${data.downloads.length ? data.downloads.map((d) => `<div class="ac-row">
        <div><b>${esc(d.slug || d.title || '')}</b>
        <div class="ac-meta"><span>${day(d.ts || d.created_at)}</span></div></div>
        <div class="ac-acts"><a class="mbtn mbtn-ghost"
          href="/api/download?slug=${encodeURIComponent(d.slug || '')}">Again</a></div></div>`).join('')
      : '<p class="ac-empty">Nothing downloaded yet.</p>'}</div>`;
  }

  function artist() {
    const byStatus = (s) => data.uploads.filter((u) => u.status === s).length;
    return `<div class="ac-panel"><h2>My music</h2>
      <p class="ac-note">${data.uploads.length} track${data.uploads.length === 1 ? '' : 's'} sent to us —
        ${byStatus('approved')} accepted, ${byStatus('pending')} with us,
        ${byStatus('info')} waiting on you.</p>
      <div class="ac-acts" style="justify-content:flex-start">
        <a class="mbtn mbtn-solid" href="/artists.html#uploads">Open the studio</a>
      </div></div>`;
  }

  /* StreamDAW Pro Monthly (2026-10-14): what it costs, when it renews, the card, every receipt, and
     cancelling in two clicks. The person chooses how it ends (Consumer Protection Law §13ד: unless
     they name a later date, a cancellation takes effect within days): Pro to the end of the month
     paid for, or now with the unused days refunded. Either way nothing more is charged. */
  function subBlock(s) {
    const amt = ils(s.amount);
    const head = s.status === 'active' ? `${amt} a month · renews on <b>${day(s.renewsAt)}</b>`
      : s.status === 'past_due' ? `the last payment didn’t go through · we try again on <b>${day(s.nextTryAt)}</b>`
      : s.status === 'cancelled' ? `cancelled on ${day(s.cancelledAt)} · ${s.cancelWhen === 'now' ? 'ended' : `Pro until <b>${day(s.paidThrough)}</b>`}`
      : 'ended';
    const live = s.status === 'active' || s.status === 'past_due';
    const receipts = (s.charges || []).map((c) => `<tr><td>${day(c.at)}</td><td>${c.status === 'paid' ? ils(c.amount) : 'declined'}</td>
      <td>${c.from ? `${day(c.from)} – ${day(c.to)}` : ''}</td><td><code>${esc(c.ref)}</code></td></tr>`).join('');
    return `<div class="sd-sub" style="border:1px solid var(--line,rgba(0,0,0,.15));border-radius:14px;padding:16px 18px;margin:0 0 18px">
      <p style="margin:0 0 6px"><b>StreamDAW Pro Monthly</b> · ${head}</p>
      <p class="ac-note" style="margin:0 0 10px">${ils(s.amount)} a month incl. VAT, the same every month${s.cardLast4 ? ` · card ending ${esc(s.cardLast4)}` : ''}.
        ${s.refundDue ? ` Refund of ${ils(s.refundDue)} for the unused days: ${s.refundStatus === 'refunded' ? 'done' : 'on its way (within 14 days)'}.` : ''}</p>
      <div class="ac-acts" style="justify-content:flex-start">
        ${live ? '<button class="mbtn mbtn-ghost" id="sdCancel">Cancel subscription</button>' : ''}
        ${s.status === 'past_due' ? '<a class="mbtn mbtn-solid" href="/apps/streamdaw.html?buy=1&plan=monthly#pricing">Use another card</a>' : ''}
        ${s.canResume ? '<button class="mbtn mbtn-solid" id="sdResume">Resume Pro Monthly</button>' : ''}
        ${s.status === 'ended' || (s.status === 'cancelled' && !s.canResume) ? '<a class="mbtn mbtn-solid" href="/apps/streamdaw.html?plan=monthly#pricing">Start Pro Monthly again</a>' : ''}
      </div>
      <div id="sdCancelBox" hidden style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line,rgba(0,0,0,.15))">
        <p style="margin:0 0 8px"><b>Cancel Pro Monthly?</b> Nothing more will be charged. You choose how it ends:</p>
        <label style="display:block;margin:0 0 6px"><input type="radio" name="sdWhen" value="end" checked>
          At the end of the month you paid for: Pro stays on until <b>${day(s.paidThrough)}</b>.</label>
        <label style="display:block;margin:0 0 10px"><input type="radio" name="sdWhen" value="now">
          Now: Pro ends today${s.refundIfNow ? `, and we refund <b>${ils(s.refundIfNow)}</b> for the unused days within 14 days` : ''}.</label>
        <div class="ac-acts" style="justify-content:flex-start">
          <button class="mbtn mbtn-solid" id="sdCancelGo">Cancel subscription</button>
          <button class="mbtn mbtn-ghost" id="sdCancelKeep">Keep Pro Monthly</button>
        </div>
        <p class="ac-note" id="sdCancelSaid" style="margin-top:8px"></p>
      </div>
      ${receipts ? `<details style="margin-top:12px"><summary>Receipts (${(s.charges || []).length})</summary>
        <table style="width:100%;margin-top:8px;font-size:14px;border-collapse:collapse">${receipts}</table>
        <p class="ac-note">HYP emails the tax receipt for each charge.</p></details>` : ''}
    </div>`;
  }

  function apps() {
    const s = data.apps && data.apps.subscription;
    return `<div class="ac-panel"><h2>StreamDAW</h2>
      ${s ? subBlock(s) : ''}
      <p class="ac-note">Your Pro licence is kept with this account. Each Mac gets its own key:
        request one for a new Mac on the unlock page.</p>
      <div class="ac-acts" style="justify-content:flex-start">
        <a class="mbtn mbtn-solid" href="/apps/streamdaw-unlock.html">Unlock a Mac</a>
        <a class="mbtn mbtn-ghost" href="/api/streamdaw/download">Download the app</a>
      </div></div>`;
  }

  function profile() {
    const u = (M && M.user) || {};
    return `<div class="ac-panel"><h2>Details</h2>
      <p class="ac-note">Name and password are edited from the account menu at the top right.</p>
      <div class="ac-row"><div><b>${esc(u.name || '—')}</b>
        <div class="ac-meta"><span>${esc(u.email || '')}</span>
        ${u.email_verified ? '' : '<span class="ac-chip soon">email not verified</span>'}</div></div></div>
    </div>`;
  }

  function wireApps() {
    const box = document.getElementById('sdCancelBox'), said = document.getElementById('sdCancelSaid');
    const open = document.getElementById('sdCancel'), keep = document.getElementById('sdCancelKeep'), go = document.getElementById('sdCancelGo');
    const resume = document.getElementById('sdResume');
    if (open) open.addEventListener('click', () => { box.hidden = false; open.hidden = true; });
    if (keep) keep.addEventListener('click', () => { box.hidden = true; if (open) open.hidden = false; });
    if (go) go.addEventListener('click', async () => {
      const when = (root.querySelector('input[name="sdWhen"]:checked') || {}).value === 'now' ? 'now' : 'end';
      go.disabled = true; said.textContent = 'Cancelling…';
      const r = await post('/streamdaw/subscription/cancel', { when });
      if (r && r.ok) { data.apps.subscription = r.subscription; render(); }
      else { go.disabled = false; said.textContent = 'That didn’t go through. Try again, or write to hello@snowstar.company: we cancel within 3 business days and confirm by email.'; }
    });
    if (resume) resume.addEventListener('click', async () => {
      resume.disabled = true;
      const r = await post('/streamdaw/subscription/resume', {});
      if (r && r.ok) { data.apps.subscription = r.subscription; render(); } else resume.disabled = false;
    });
  }

  function render() {
    const body = { licences, messages, downloads, artist, apps, profile }[tab] || licences;
    shell(body());
    if (tab === 'apps') wireApps();
    if (tab === 'messages') {
      root.querySelectorAll('.ac-msg').forEach((el) => el.addEventListener('click', async () => {
        const wasUnread = el.classList.contains('unread');
        el.classList.toggle('open');
        if (!wasUnread) return;
        el.classList.remove('unread');
        await post('/messages/read', { id: Number(el.dataset.id) });
        data.unread = Math.max(0, data.unread - 1);
        const dot = root.querySelector('.ac-tab[data-t="messages"] .ac-dot');
        if (dot && !data.unread) dot.remove();
      }));
      const all = document.getElementById('acReadAll');
      if (all) all.addEventListener('click', async (e) => {
        e.stopPropagation();
        await post('/messages/read', { all: true });
        data.messages.forEach((m) => { m.read_at = m.read_at || 1; });
        data.unread = 0;
        render();
      });
    }
  }

  async function boot() {
    if (!(M && M.user)) { gate(); return; }
    try { await loadAll(); } catch { /* render what we have */ }
    render();
  }

  /* Account.ready is a BOOLEAN that flips when the session call returns, not a
     promise — calling .then() on it throws. Polled the same way the dashboard
     polls it, because reading M.user too early shows a signed-in person the
     sign-in gate. */
  (function wait(n) {
    if (M && M.ready) return boot();
    if (n <= 0) return boot();
    setTimeout(() => wait(n - 1), 100);
  })(40);
  if (M && M.onChange) M.onChange(() => { if (M.user) boot(); else gate(); });
  addEventListener('hashchange', () => {
    const h = (location.hash || '').replace('#', '');
    if (h && h !== tab && TABS.some((t) => t.key === h)) { tab = h; render(); }
  });
})();
