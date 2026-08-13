/* ═══════════ Snowstar account — state + API ═══════════
   One account across every Snowstar product. Talks to the Worker on the same
   origin (/api/*), so the session cookie is first-party and HttpOnly — this
   file never sees or stores a token.

   Saved items are scoped per product: the page declares which one it is with
   <html data-product="mutra">. Favorites work before signing in too (kept in
   localStorage, then merged into the account on the first sign-in). */
(function () {
  const API = '/api';
  const PRODUCT = document.documentElement.getAttribute('data-product') || 'mutra';
  const LOCAL_FAVS = 'snowstar_favs_' + PRODUCT;
  const LEGACY_FAVS = 'mutra_favs'; // pre-umbrella key, migrated on first read

  const Account = {
    user: null,
    favorites: new Set(),
    ready: false,
    product: PRODUCT,
  };
  window.SnowstarAccount = Account;
  window.MutraMembers = Account; // the catalog still calls it this

  const listeners = new Set();
  Account.onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

  // ── local (signed-out) favorites ──
  const readLocal = () => {
    try {
      const raw = localStorage.getItem(LOCAL_FAVS);
      if (raw) return new Set(JSON.parse(raw));
      const legacy = localStorage.getItem(LEGACY_FAVS);
      if (legacy && PRODUCT === 'mutra') {
        localStorage.setItem(LOCAL_FAVS, legacy);
        localStorage.removeItem(LEGACY_FAVS);
        return new Set(JSON.parse(legacy));
      }
      return new Set();
    } catch { return new Set(); }
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
    if (!res.ok) {
      throw Object.assign(new Error((data && data.error) || 'request_failed'),
        { code: data && data.error, status: res.status });
    }
    if (!data) throw Object.assign(new Error('empty_response'), { code: 'server_error', status: res.status });
    return data;
  }
  Account.api = api;

  const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });

  // ── session bootstrap ──
  async function refresh() {
    try {
      const d = await api('/me?product=' + encodeURIComponent(PRODUCT));
      Account.user = d.user;
      Account.favorites = new Set(d.user ? d.favorites : readLocal());
    } catch {
      Account.user = null;
      Account.favorites = readLocal();
    }
    Account.ready = true;
    emit();
  }
  Account.refresh = refresh;

  Account.isFavorite = (slug) => Account.favorites.has(slug);

  Account.toggleFavorite = async function (slug) {
    const had = Account.favorites.has(slug);
    // optimistic — the heart responds instantly, we reconcile after
    had ? Account.favorites.delete(slug) : Account.favorites.add(slug);
    emit();
    if (!Account.user) { writeLocal(Account.favorites); return; }
    try {
      const d = await api('/favorites', {
        method: had ? 'DELETE' : 'POST',
        body: JSON.stringify({ slug, product: PRODUCT }),
      });
      Account.favorites = new Set(d.favorites);
    } catch (e) {
      had ? Account.favorites.add(slug) : Account.favorites.delete(slug); // revert
      if (e.status === 401) Account.user = null;
    }
    emit();
  };

  /** Adopt whatever was saved while signed out, then hand over to the account. */
  async function adopt(local) {
    if (!local.length) return;
    try {
      const d = await post('/favorites/merge', { slugs: local, product: PRODUCT });
      Account.favorites = new Set(d.favorites);
      localStorage.removeItem(LOCAL_FAVS); // it lives in the account now
    } catch {}
  }

  async function enter(d, local) {
    Account.user = d.user;
    Account.favorites = new Set(d.favorites || []);
    await adopt(local);
    emit();
  }

  Account.signup = async function ({ email, password, name, newsletter }) {
    const local = [...readLocal()];
    await enter(await post('/signup', { email, password, name, newsletter, product: PRODUCT }), local);
  };

  Account.login = async function ({ email, password }) {
    const local = [...readLocal()];
    await enter(await post('/login', { email, password, product: PRODUCT }), local);
  };

  Account.logout = async function () {
    try { await post('/logout', {}); } catch {}
    Account.user = null;
    Account.favorites = readLocal();
    emit();
  };

  Account.requestReset = (email) => post('/reset/request', { email });
  Account.confirmReset = async function (token, password) {
    await enter(await post('/reset/confirm', { token, password, product: PRODUCT }), []);
  };

  refresh();
})();
