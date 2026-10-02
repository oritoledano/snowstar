/* ═══════════ Money — one price, read in the buyer's currency ═══════════
 *
 * The shekel remains the unit of account everywhere it matters: pricing.js
 * computes in shekels, the licence stores shekels, the invoice is issued in
 * shekels, and the card is charged in shekels — hyp.js sends Coin:'1' and
 * rejects a reply in anything else. This file changes what a buyer READS, and
 * nothing about what they are charged.
 *
 * That distinction is load-bearing rather than pedantic, so it is never
 * blurred: a screen that only informs may show dollars alone, and a screen that
 * commits somebody to paying must also say the shekel figure their card will
 * actually take. isSettlement() is how a caller asks which kind it is.
 *
 * The admin dashboard is deliberately NOT a client of this file. The owner
 * banks in shekels, reconciles against HYP in shekels and files in shekels;
 * converting the money screens would make the books harder to read, not easier.
 */
(function () {
  const STORE = 'ss_currency';
  const DEFAULT = 'USD';

  /* Baked so the first paint never waits on a network round trip. These are
     refreshed from /api/fx the moment it answers; the gap between the two is
     well under a percent, so a price that corrects itself does so invisibly.
     Keep in step with FALLBACK in worker/src/fx.js. */
  const FALLBACK = { ILS: 1, USD: 0.3252, EUR: 0.2884 };

  /* One locale for all three, and it is the page's own. Formatting by each
     currency's home locale looked right in isolation and wrong in a row: he-IL
     returns the shekel wrapped in RTL marks, which bleed into the English
     sentence around them, and de-DE puts the euro sign after the number, so
     "$81" and "72 €" sat in the same switcher disagreeing about where a symbol
     goes. en-US renders all three symbol-first and unadorned. */
  const META = {
    ILS: { symbol: '₪', locale: 'en-US', name: 'Shekel' },
    USD: { symbol: '$', locale: 'en-US', name: 'US dollar' },
    EUR: { symbol: '€', locale: 'en-US', name: 'Euro' },
  };

  let rates = { ...FALLBACK };
  let code = DEFAULT;
  const subs = new Set();

  // localStorage throws in a locked-down browser; a currency is not worth an
  // exception on boot.
  const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* fine */ } };

  const saved = read(STORE);
  if (saved && META[saved]) code = saved;

  // A rate table from the last visit beats the baked one and costs no request.
  try {
    const c = JSON.parse(read('ss_fx') || 'null');
    if (c && c.rates && c.rates.USD) rates = { ...rates, ...c.rates };
  } catch { /* fine */ }

  /** Shekels in, a number in the active currency out. */
  function convert(shekels, to) {
    const r = rates[to || code];
    return (Number(shekels) || 0) * (r || 1);
  }

  /* Whole units. Every price on this site is in the hundreds, and "$214" is a
     price where "$213.58" is an exchange-rate artefact wearing a price's
     clothes — it invites somebody to check the arithmetic against a figure
     that was never what they would be charged anyway. */
  function fmt(shekels, opts) {
    const o = opts || {};
    const to = o.in || code;
    const m = META[to] || META.ILS;
    const n = convert(shekels, to);
    const dp = o.decimals != null ? o.decimals : (Math.abs(n) < 10 && n !== 0 ? 2 : 0);
    try {
      return new Intl.NumberFormat(m.locale, {
        style: 'currency', currency: to,
        minimumFractionDigits: dp, maximumFractionDigits: dp,
      }).format(n);
    } catch {
      return m.symbol + n.toFixed(dp);
    }
  }

  const Money = {
    get code() { return code; },
    get rates() { return { ...rates }; },
    currencies: ['USD', 'ILS', 'EUR'],
    meta: META,
    symbol: (c) => (META[c || code] || META.ILS).symbol,

    /** True when what is shown is also what is charged — i.e. shekels. */
    isSettlement: () => code === 'ILS',

    fmt,
    /** The same amount given in agorot, which is how the database stores it. */
    fmtAgorot: (a, opts) => fmt((Number(a) || 0) / 100, opts),
    /** Always shekels, whatever is selected — for "your card will be charged". */
    ils: (shekels, opts) => fmt(shekels, { ...(opts || {}), in: 'ILS' }),
    ilsFromAgorot: (a, opts) => fmt((Number(a) || 0) / 100, { ...(opts || {}), in: 'ILS' }),

    set(next) {
      if (!META[next] || next === code) return;
      code = next;
      write(STORE, next);
      document.documentElement.setAttribute('data-currency', next);
      Money.paint();
      subs.forEach((fn) => { try { fn(next); } catch { /* a bad subscriber must not stop the rest */ } });
    },

    onChange(fn) { subs.add(fn); return () => subs.delete(fn); },

    /** Rewrite every [data-ils] on the page. Static markup carries the shekel
     *  figure as the attribute and its own currency as the text, so a visitor
     *  with JS off still reads a real price rather than an empty box. */
    paint(root) {
      (root || document).querySelectorAll('[data-ils]').forEach((el) => {
        const v = parseFloat(el.getAttribute('data-ils'));
        if (!Number.isFinite(v)) return;
        const dp = el.getAttribute('data-dp');
        el.textContent = fmt(v, dp == null ? undefined : { decimals: +dp });
      });
    },

    /** Live rates. Resolves either way — a price list must not hang on a rate. */
    async load() {
      try {
        const d = await fetch('/api/fx').then((r) => (r.ok ? r.json() : null));
        if (d && d.rates && d.rates.USD) {
          rates = { ...rates, ...d.rates };
          write('ss_fx', JSON.stringify({ rates: d.rates, ts: d.ts }));
          Money.paint();
        }
      } catch { /* the baked table is already in place */ }
      return rates;
    },

    /** A switcher, built where it is asked for. */
    mount(el) {
      if (!el) return;
      el.classList.add('cur-pick');
      el.innerHTML = Money.currencies.map((c) =>
        `<button type="button" data-cur="${c}"${c === code ? ' aria-current="true"' : ''}>${
          META[c].symbol}<span>${c}</span></button>`).join('');
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-cur]');
        if (!b) return;
        Money.set(b.dataset.cur);
        el.querySelectorAll('button').forEach((x) =>
          x.toggleAttribute('aria-current', x.dataset.cur === code));
      });
    },
  };

  window.Money = Money;
  document.documentElement.setAttribute('data-currency', code);

  const start = () => {
    document.querySelectorAll('[data-currency-switcher]').forEach((el) => Money.mount(el));
    Money.paint();
    Money.load();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
