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
