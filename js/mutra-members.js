/* ═══════════ Mutra members — account, favorites, sharing, similar ═══════════
   Talks to the Worker API on the same origin (/api/*), so the session cookie is
   first-party and HttpOnly — this file never sees or stores a token.
   Favorites work before signing in too (kept locally, then merged on login). */
(function () {
  const API = '/api';
  const LOCAL_FAVS = 'mutra_favs';

  const MembersState = {
    user: null,
    favorites: new Set(),
    ready: false,
  };
  window.MutraMembers = MembersState;

  const listeners = new Set();
  MembersState.onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

  // ── local (signed-out) favorites ──
  const readLocal = () => {
    try { return new Set(JSON.parse(localStorage.getItem(LOCAL_FAVS) || '[]')); }
    catch { return new Set(); }
  };
  const writeLocal = (set) => {
    try { localStorage.setItem(LOCAL_FAVS, JSON.stringify([...set])); } catch {}
  };

  async function api(path, opts = {}) {
    const res = await fetch(API + path, {
      credentials: 'same-origin',
      headers: opts.body ? { 'content-type': 'application/json' } : undefined,
      ...opts,
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok) throw Object.assign(new Error((data && data.error) || 'request_failed'), { code: data && data.error, status: res.status });
    return data;
  }

  // ── session bootstrap ──
  async function refresh() {
    try {
      const d = await api('/me');
      MembersState.user = d.user;
      MembersState.favorites = new Set(d.user ? d.favorites : readLocal());
    } catch {
      MembersState.user = null;
      MembersState.favorites = readLocal();
    }
    MembersState.ready = true;
    emit();
  }

  MembersState.isFavorite = (slug) => MembersState.favorites.has(slug);

  MembersState.toggleFavorite = async function (slug) {
    const had = MembersState.favorites.has(slug);
    // optimistic — the heart responds instantly, we reconcile after
    had ? MembersState.favorites.delete(slug) : MembersState.favorites.add(slug);
    emit();
    if (!MembersState.user) { writeLocal(MembersState.favorites); return; }
    try {
      const d = await api('/favorites', {
        method: had ? 'DELETE' : 'POST',
        body: JSON.stringify({ slug }),
      });
      MembersState.favorites = new Set(d.favorites);
    } catch (e) {
      had ? MembersState.favorites.add(slug) : MembersState.favorites.delete(slug); // revert
      if (e.status === 401) { MembersState.user = null; }
    }
    emit();
  };

  MembersState.signup = async function ({ email, password, name, newsletter }) {
    const local = [...readLocal()];
    const d = await api('/signup', { method: 'POST', body: JSON.stringify({ email, password, name, newsletter }) });
    MembersState.user = d.user;
    MembersState.favorites = new Set(d.favorites);
    if (local.length) await mergeLocal(local);
    emit();
  };

  MembersState.login = async function ({ email, password }) {
    const local = [...readLocal()];
    const d = await api('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    MembersState.user = d.user;
    MembersState.favorites = new Set(d.favorites);
    if (local.length) await mergeLocal(local);
    emit();
  };

  async function mergeLocal(slugs) {
    try {
      const d = await api('/favorites/merge', { method: 'POST', body: JSON.stringify({ slugs }) });
      MembersState.favorites = new Set(d.favorites);
      localStorage.removeItem(LOCAL_FAVS); // now lives in the account
    } catch {}
  }

  MembersState.logout = async function () {
    try { await api('/logout', { method: 'POST' }); } catch {}
    MembersState.user = null;
    MembersState.favorites = readLocal();
    emit();
  };

  refresh();
})();
