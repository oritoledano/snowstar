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
// close when a menu link is chosen (anchors still scroll; mutra.html still navigates)
overlay.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) setMenu(false); });

// Starfield
const canvas = document.getElementById('stars');
const ctx = canvas.getContext('2d');
let stars = [];
function seedStars() {
  canvas.width = canvas.offsetWidth * devicePixelRatio;
  canvas.height = canvas.offsetHeight * devicePixelRatio;
  stars = Array.from({ length: 90 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height * 0.7,
    r: Math.random() * 1.4 + 0.3,
    p: Math.random() * Math.PI * 2,
    s: 0.4 + Math.random() * 1.2,
  }));
}
seedStars();
addEventListener('resize', seedStars);
(function twinkle(t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const st of stars) {
    const a = 0.25 + 0.55 * Math.abs(Math.sin(st.p + t * 0.0006 * st.s));
    ctx.beginPath();
    ctx.arc(st.x, st.y, st.r * devicePixelRatio, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(210,235,255,${a})`;
    ctx.fill();
  }
  requestAnimationFrame(twinkle);
})(0);

// Work grid
const grid = document.getElementById('workGrid');
const INITIAL = 18;
PROJECTS.forEach((p, i) => {
  const card = document.createElement('article');
  card.className = 'work-card reveal-card' + (i >= INITIAL ? ' hidden-card' : '');
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
});
document.getElementById('workCount').textContent = PROJECTS.length;
document.getElementById('showAll').addEventListener('click', e => {
  document.querySelectorAll('.hidden-card').forEach(c => { c.classList.remove('hidden-card'); cardObserver.observe(c); });
  e.target.closest('.work-more').style.display = 'none';
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
cg.appendChild(buildMarqueeRow(CLIENT_LOGOS, 'left'));
cg.appendChild(buildMarqueeRow([...CLIENT_LOGOS].reverse(), 'right'));

// Reveal on scroll
const obs = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); }
}), { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach(el => obs.observe(el));

const cardObserver = new IntersectionObserver(es => es.forEach((e, i) => {
  if (e.isIntersecting) {
    setTimeout(() => e.target.classList.add('in'), (e.target.dataset.d || 0));
    cardObserver.unobserve(e.target);
  }
}), { threshold: 0.08 });
document.querySelectorAll('.work-card:not(.hidden-card)').forEach((el, i) => {
  el.dataset.d = (i % 6) * 60;
  cardObserver.observe(el);
});

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
