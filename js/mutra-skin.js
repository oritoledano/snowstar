/* ═══════════ Mutra skin + theme ═══════════
   Runs before the stylesheets so the page never flashes the wrong palette.
   Bone/light is the house look; the header button flips light↔dark and the
   choice is remembered per browser. The other skins stay defined in
   css/skins.css — switching is a one-line change if we ever want them. */
(function () {
  const SKIN = 'bone';
  const root = document.documentElement;
  const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  let theme = read('mutra_theme') || 'light';

  function apply() {
    root.setAttribute('data-skin', SKIN);
    root.setAttribute('data-theme', theme);
    // canvas waveforms and the hero glow re-read their colours off this
    dispatchEvent(new CustomEvent('mutraskin', { detail: { skin: SKIN, theme } }));
  }
  apply();

  addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('themeBtn');
    if (!btn) return;
    const label = () => {
      const next = theme === 'dark' ? 'light' : 'dark';
      btn.setAttribute('aria-label', 'Switch to ' + next + ' mode');
      btn.setAttribute('title', 'Switch to ' + next + ' mode');
    };
    label();
    btn.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      write('mutra_theme', theme);
      apply();
      label();
    });
  });
})();
