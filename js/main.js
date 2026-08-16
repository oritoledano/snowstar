/* ————— Snowstar interactions ————— */

// Nav + full-screen menu
const nav = document.getElementById('nav');
const menuBtn = document.getElementById('menuBtn');
const menuLabel = document.getElementById('menuLabel');
const overlay = document.getElementById('menuOverlay');
addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 30), { passive: true });
nav.classList.toggle('scrolled', scrollY > 30);

function setMenu(open) {
  document.body.classList.toggle('menu-open', open);
  menuBtn.setAttribute('aria-expanded', open);
  overlay.setAttribute('aria-hidden', !open);
  const lbl = menuLabel.querySelector('.mll');
  if (lbl) lbl.textContent = open ? 'Close' : 'Menu';
  if (open) { const first = overlay.querySelector('a'); if (first) setTimeout(() => first.focus(), 400); }
  else menuBtn.focus();
}
const toggleMenu = () => setMenu(!document.body.classList.contains('menu-open'));
menuBtn.addEventListener('click', toggleMenu);
menuLabel.addEventListener('click', toggleMenu);
// close when a menu link is chosen (anchors still scroll; mutra.html still navigates),
// or when the click lands on empty space rather than the menu itself
overlay.addEventListener('click', e => {
  if (e.target.closest('a')) return setMenu(false);
  if (!e.target.closest('.menu-nav, .menu-foot')) setMenu(false);
});
addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) setMenu(false); });

// Hero glow — follows the pointer and shifts across the Snowstar ramp
(function heroGlow() {
  const hero = document.getElementById('hero');
  if (!hero) return;
  const PALETTE = [
    ['#6d28d9', '#3b82f6'],   // violet → blue
    ['#3b82f6', '#22d3ee'],   // blue → cyan
    ['#22d3ee', '#6ee7b7'],   // cyan → mint
    ['#6ee7b7', '#22d3ee'],   // mint → cyan
  ];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let tx = 50, ty = 42, x = 50, y = 42, raf = 0;

  function paint() {
    raf = 0;
    x += (tx - x) * (still ? 1 : 0.12);
    y += (ty - y) * (still ? 1 : 0.12);
    const band = PALETTE[Math.min(PALETTE.length - 1, Math.floor((x / 100) * PALETTE.length))];
    hero.style.setProperty('--gx', x.toFixed(2) + '%');
    hero.style.setProperty('--gy', y.toFixed(2) + '%');
    hero.style.setProperty('--g1', band[0]);
    hero.style.setProperty('--g2', band[1]);
    if (!still && (Math.abs(tx - x) > 0.1 || Math.abs(ty - y) > 0.1)) raf = requestAnimationFrame(paint);
  }
  const queue = () => { if (!raf) raf = requestAnimationFrame(paint); };

  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width) * 100;
    ty = ((e.clientY - r.top) / r.height) * 100;
    queue();
  });
  // touch screens never hover, so let it drift
  if (!still && !matchMedia('(hover: hover)').matches) {
    let t = 0;
    setInterval(() => { t += 0.02; tx = 50 + Math.sin(t) * 34; ty = 42 + Math.cos(t * 0.7) * 16; queue(); }, 60);
  }
  paint();
})();

// Work grid + category filters
const grid = document.getElementById('workGrid');
const workFilters = document.getElementById('workFilters');
const INITIAL = 20; // 5 full rows of 4 on a 14" MacBook Pro at full width

// Categories are derived from each project's existing credits text (no manual re-tagging
// of most hand-authored entries) — Original Music, Sound Design, Voice Over. "vocal
// performance" always co-occurs with "music" in this data, so it naturally falls under
// Original Music rather than Voice Over (which means narration). A project can also carry
// an explicit "tags" array in data.js for one-off categories the text can't safely imply
// (e.g. "Performance" — added only where the credits say so, not inferred from "vocal
// performance" everywhere, which would over-tag unrelated projects).
// Two facet dropdowns. Within a facet the picks are OR'd; across facets (and
// with the search box) they AND — same model Artlist and the Mutra catalog use.
const FACETS = [
  { id: 'work', label: 'Work Type', options: [
    ['ORIGINAL_MUSIC', 'Original Music'], ['SOUND_DESIGN', 'Sound Design'],
    ['VOICE_OVER', 'Voice Over'], ['PERFORMANCE', 'Performance'], ['KAYMA', 'KAYMA'],
  ] },
  { id: 'media', label: 'Media Type', options: [
    ['TV', 'TV'], ['DIGITAL', 'Digital'], ['RADIO', 'Radio'], ['IN_APP', 'In-App'],
  ] },
];
function categorize(p) {
  const text = ((p.credits && p.credits.work) || '').toLowerCase();
  const cats = new Set(p.tags || []);
  if (/sound design/.test(text)) cats.add('SOUND_DESIGN');
  if (/voice over|narration/.test(text)) cats.add('VOICE_OVER');
  if (/music|jingle|score|cover|song/.test(text)) cats.add('ORIGINAL_MUSIC');
  return [...cats];
}

const cardObserver = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) {
    setTimeout(() => e.target.classList.add('in'), (e.target.dataset.d || 0));
    cardObserver.unobserve(e.target);
  }
}), { threshold: 0.08 });

// The list itself lives in the Worker (D1) so the owner can edit it live;
// PROJECTS in data.js remains only as an emergency fallback if the API is down.
let WORKS = [];
let workCards = [];
let workIndex = [];

function buildWorkGrid(list) {
  WORKS = list;
  grid.innerHTML = '';
  workCards = list.map((p, i) => {
    const card = document.createElement('article');
    card.className = 'work-card reveal-card' + (i >= INITIAL ? ' hidden-card' : '');
    card.dataset.id = p.id || '';
    card.dataset.cats = categorize(p).join(',');
    card.dataset.media = (p.media || []).join(',');
    card.dataset.d = (i % 6) * 60;
    card.innerHTML = `
    <img src="${p.thumb}" alt="${p.title}" loading="lazy">
    ${p.preview ? `<video muted loop playsinline preload="none"><source src="${p.preview}" type="video/mp4"></video>` : ''}
    <div class="wc-meta">
      <h3>${p.title}</h3>
      ${(p.mp4 || p.vimeo) ? `<span class="wc-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="13" height="13"><path d="M8 5v14l11-7z" fill="currentColor"/></svg></span>` : ''}
    </div>`;
    if (p.preview) {
      const vid = card.querySelector('video');
      card.addEventListener('mouseenter', () => { vid.play().catch(() => {}); card.classList.add('previewing'); });
      card.addEventListener('mouseleave', () => { vid.pause(); card.classList.remove('previewing'); });
    }
    card.addEventListener('click', () => openLightbox(p));
    grid.appendChild(card);
    return card;
  });
  workCards.filter(c => !c.classList.contains('hidden-card')).forEach(el => cardObserver.observe(el));
  document.getElementById('workCount').textContent = list.length;
  // Everything searchable about a project, flattened once: title plus every
  // credit line (director, production, agency, the work description itself).
  workIndex = list.map(p => [p.title, ...Object.values(p.credits || {})].join(' ').toLowerCase());
  applyWorkFilter();
}

function loadWorks() {
  return fetch('/api/works')
    .then(r => { if (!r.ok) throw new Error('works_' + r.status); return r.json(); })
    .then(d => buildWorkGrid(d.works))
    .catch(() => buildWorkGrid(typeof PROJECTS !== 'undefined' ? PROJECTS : []));
}
loadWorks();
// the admin editor refreshes the grid after a save without a page reload
window.SnowstarWorks = { reload: loadWorks, list: () => WORKS };

const selected = { work: new Set(), media: new Set() };
let query = '';
let workExpanded = false;
const showAllBtn = document.getElementById('showAll');
const workMore = showAllBtn.closest('.work-more');

const workEmpty = document.createElement('p');
workEmpty.className = 'work-empty';
workEmpty.textContent = 'Nothing matches that — try fewer filters or another word.';
workEmpty.hidden = true;
grid.after(workEmpty);

function applyWorkFilter() {
  const pristine = !query && !selected.work.size && !selected.media.size;
  let shown = 0;
  workCards.forEach((card, i) => {
    const hasAny = (facet, csv) => !selected[facet].size ||
      (csv && csv.split(',').some(c => selected[facet].has(c)));
    const matches = hasAny('work', card.dataset.cats) && hasAny('media', card.dataset.media) &&
      (!query || query.split(/\s+/).every(t => workIndex[i].includes(t)));
    // pristine keeps the tidy 20-card opening; any search or filter shows every match
    const visible = matches && (!pristine || workExpanded || i < INITIAL);
    if (visible) shown++;
    const wasHidden = card.classList.contains('hidden-card');
    card.classList.toggle('hidden-card', !visible);
    if (visible && wasHidden) cardObserver.observe(card);
  });
  workMore.style.display = (pristine && !workExpanded && WORKS.length > INITIAL) ? '' : 'none';
  workEmpty.hidden = shown > 0;
}

showAllBtn.addEventListener('click', () => { workExpanded = true; applyWorkFilter(); });

const workSearch = document.getElementById('workSearch');
workSearch.addEventListener('input', () => {
  query = workSearch.value.trim().toLowerCase();
  applyWorkFilter();
});

const CARET = '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function closePanels(except) {
  workFilters.querySelectorAll('.wf-drop').forEach(d => {
    if (d !== except) { d.classList.remove('open'); d.querySelector('.wf-panel').hidden = true; }
  });
}
document.addEventListener('click', e => { if (!e.target.closest('.wf-drop')) closePanels(); });
addEventListener('keydown', e => { if (e.key === 'Escape') closePanels(); });

FACETS.forEach(({ id, label, options }) => {
  const drop = document.createElement('div');
  drop.className = 'wf-drop';
  const btn = document.createElement('button');
  btn.className = 'work-chip wf-btn';
  btn.setAttribute('aria-haspopup', 'true');
  const panel = document.createElement('div');
  panel.className = 'wf-panel';
  panel.hidden = true;

  const sync = () => {
    const n = selected[id].size;
    btn.innerHTML = `${label}${n ? ' · ' + n : ''} ${CARET}`;
    btn.classList.toggle('active', n > 0);
    panel.querySelectorAll('.wf-opt').forEach(b =>
      b.classList.toggle('active', b.dataset.key === 'ALL' ? !n : selected[id].has(b.dataset.key)));
  };

  [['ALL', 'All'], ...options].forEach(([key, text]) => {
    const b = document.createElement('button');
    b.className = 'wf-opt';
    b.dataset.key = key;
    b.textContent = text;
    b.addEventListener('click', () => {
      if (key === 'ALL') selected[id].clear();
      else selected[id].has(key) ? selected[id].delete(key) : selected[id].add(key);
      sync();
      applyWorkFilter();
    });
    panel.appendChild(b);
  });

  btn.addEventListener('click', () => {
    const opening = panel.hidden;
    closePanels(drop);
    panel.hidden = !opening;
    drop.classList.toggle('open', opening);
  });

  drop.append(btn, panel);
  workFilters.appendChild(drop);
  sync();
});

// Clients — two infinite marquee rows scrolling opposite directions
const cg = document.getElementById('clientsGrid');
cg.classList.add('marquee');
function buildMarqueeRow(logos, dir) {
  const row = document.createElement('div');
  row.className = 'marq-row';
  const track = document.createElement('div');
  track.className = 'marq-track';
  track.dataset.dir = dir;
  // duplicate the set so the loop is seamless
  logos.concat(logos).forEach(src => {
    const d = document.createElement('div');
    d.className = 'client';
    d.innerHTML = `<img src="${src}" alt="Client logo" loading="lazy">`;
    track.appendChild(d);
  });
  row.appendChild(track);
  return row;
}
// Enough logos now to fill a 3rd row too — split into 3 distinct sets (interleaved so
// each row has variety) rather than repeating the full list three times.
const ROWS = 3;
const rowSets = Array.from({ length: ROWS }, (_, i) => CLIENT_LOGOS.filter((_, j) => j % ROWS === i));
cg.appendChild(buildMarqueeRow(rowSets[0], 'left'));
cg.appendChild(buildMarqueeRow([...rowSets[1]].reverse(), 'right'));
cg.appendChild(buildMarqueeRow(rowSets[2], 'left')); // 3rd strip — same direction as the first

// Reveal on scroll
const obs = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); }
}), { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => obs.observe(el));

// Lightbox
const lb = document.getElementById('lightbox');
const lbBody = document.getElementById('lightboxBody');
const lbTitle = document.getElementById('lightboxTitle');
function openLightbox(p) {
  if (p.mp4) {
    lbBody.innerHTML = `<video src="${p.mp4}" controls autoplay playsinline poster="${p.thumb}"></video>`;
  } else if (p.vimeo) {
    lbBody.innerHTML = `<iframe src="https://player.vimeo.com/video/${p.vimeo}?autoplay=1&title=0&byline=0&portrait=0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${p.title}"></iframe>`;
  } else {
    lbBody.innerHTML = `<img src="${p.thumb}" alt="${p.title}">`;
  }
  const c = p.credits || {};
  const creditBits = [
    c.work && `<span><em>Snowstar</em>${c.work}</span>`,
    c.director && `<span><em>Director</em>${c.director}</span>`,
    c.production && `<span><em>Production</em>${c.production}</span>`,
    c.agency && `<span><em>Agency</em>${c.agency}</span>`,
  ].filter(Boolean).join('');
  lbTitle.innerHTML = `<strong>${p.title}</strong>` +
    (creditBits ? `<span class="lb-credits">${creditBits}</span>` :
      (p.mp4 || p.vimeo ? '' : '<span class="lb-credits"><span>full film on request</span></span>'));
  lb.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  lb.hidden = true;
  lbBody.innerHTML = '';
  document.body.style.overflow = '';
}
document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
lb.addEventListener('click', e => { if (e.target === lb) closeLightbox(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !lb.hidden) closeLightbox(); });
document.querySelectorAll('[data-vimeo-open="showreel"]').forEach(b =>
  b.addEventListener('click', () => openLightbox(SHOWREEL)));

// Newsletter (prototype: opens a prefilled email — swap for Buttondown/Formspree in production)
document.getElementById('newsletter').addEventListener('submit', e => {
  e.preventDefault();
  const email = e.target.querySelector('input').value;
  document.getElementById('newsletterNote').textContent = '❄ Thanks — we’ll keep you posted at ' + email;
  e.target.reset();
});

document.getElementById('year').textContent = new Date().getFullYear();
