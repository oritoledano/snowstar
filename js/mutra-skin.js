/* ═══════════ Mutra skins ═══════════
   Applies the saved skin before paint, and renders the picker bar.
   The bar is temporary — once a skin is chosen it comes out and only the
   light/dark toggle stays. */
(function () {
  const SKINS = [
    { id: 'ember', label: 'Ember' },
    { id: 'vapor', label: 'Vapor' },
    { id: 'bone',  label: 'Bone'  },
  ];
  const root = document.documentElement;
  const store = {
    get(k, d) { try { return localStorage.getItem(k) || d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  function apply(skin, theme) {
    root.setAttribute('data-skin', skin);
    root.setAttribute('data-theme', theme);
    // let the canvas waveforms and hero glow pick up the new palette
    dispatchEvent(new CustomEvent('mutraskin', { detail: { skin, theme } }));
  }

  let skin = store.get('mutra_skin', 'ember');
  let theme = store.get('mutra_theme', '');
  if (!theme) theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  apply(skin, theme);

  addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.className = 'skin-bar';
    bar.innerHTML =
      SKINS.map(s => `<button data-skin="${s.id}">${s.label}</button>`).join('') +
      `<span class="sep"></span>` +
      `<button data-theme="dark">Dark</button><button data-theme="light">Light</button>`;
    document.body.appendChild(bar);

    function paintBar() {
      bar.querySelectorAll('[data-skin]').forEach(b => b.classList.toggle('on', b.dataset.skin === skin));
      bar.querySelectorAll('[data-theme]').forEach(b => b.classList.toggle('on', b.dataset.theme === theme));
    }
    bar.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.skin) { skin = b.dataset.skin; store.set('mutra_skin', skin); }
      if (b.dataset.theme) { theme = b.dataset.theme; store.set('mutra_theme', theme); }
      apply(skin, theme);
      paintBar();
    });
    paintBar();
  });
})();
