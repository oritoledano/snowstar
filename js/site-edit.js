/* ═══════════ Site editor — text overrides, section visibility, markup notes ═══════════
   Loaded by BOTH sites. Two very different jobs share this file:

   1. HYDRATION (every visitor): fetch the owner's saved text overrides and
      apply them to [data-txt] elements; hide sections he switched off.
      Elements without an override keep their built-in copy — zero flicker.

   2. EDITOR (owner only): a floating pill offering
        · Texts — click any outlined text and type straight into the page
        · Draw & note — pencil strokes + numbered note pins, saved with the
          page so Claude can read them ("check my site notes") and do the work
        · Sections — show/hide whole sections
   Styles are injected here so both sites' stylesheets stay untouched. */
(function () {
  const PAGE = location.pathname.replace(/^\/(index.html)?$/, '/') || '/';

  /* A hidden section must also vanish from the menus: a numbered menu link to
     a display:none anchor is a dead click. Any nav link pointing at a hidden
     section's id is hidden with it, and the 01/02 numbering closes ranks so
     the menu never counts ghosts. Runs at hydration and again on every save. */
  function syncMenus(hiddenIds) {
    document.querySelectorAll('nav a[href^="#"]').forEach((a) => {
      const id = a.getAttribute('href').slice(1);
      a.style.display = hiddenIds.includes(id) ? 'none' : '';
    });
    renumberMenus();
  }

  /** 01/02/03 closes ranks so the menu never counts something it is not
   *  showing. Called by both the section sync and the property sync. */
  function renumberMenus() {
    /* Per panel, not per menu: each vertical's pages are their own 01, 02, 03. A menu with no
       rail (the artist pages' own, say) is still numbered as one list. */
    const boxes = [...document.querySelectorAll('.ss-pane')];
    document.querySelectorAll('nav').forEach((n) => { if (!n.dataset.ssRail) boxes.push(n); });
    boxes.forEach((nav) => {
      let n = 0;
      nav.querySelectorAll('a').forEach((a) => {
        const num = a.querySelector('i');
        if (!num || a.style.display === 'none') return;
        n += 1;
        num.textContent = String(n).padStart(2, '0');
      });
    });
  }

  /* ── properties: a vertical, hidden across the whole site ──────────────────
     Sections are per page and anchor-linked. A PROPERTY is a whole vertical —
     its own page, its teaser on the home page, and a link in every menu on
     every other page. The Sections panel could hide the teaser, but only on the
     page you happened to be standing on, and it cannot touch a link to another
     page at all: syncMenus matches a[href^="#"] and a product link is
     "snowstash.html". So taking Snowstash down meant five separate saves and
     still left every menu pointing at it.

     One switch, stored once under a site-wide key, applied on every page by the
     hydration every visitor already runs. Section and menu are separate because
     they answer different questions: "stop advertising this" and "stop showing
     this", and the owner may well want the first without the second. */
  /* One row per vertical. `role` is the word under its mark in the menu's rail (Studio,
     Catalog, Shop); `links` is what the rail opens beside it — written here so that ANY page
     can show ANY vertical's menu without loading it. The page you are actually on ignores
     this list and uses its own markup, so its wording, numbering and anchors stay the page's
     own. An href starting with # is relative to that vertical's page. */
  const PROPERTIES = [
    { id: 'snowstar',  label: 'Snowstar',  role: 'Studio',  page: 'index.html',
      lock: 'assets/rail-snowstar.png?v=3', lockW: 47, lockH: 63, product: true,
      links: [['Work', '#work'], ['Services', '#services'], ['Clients', '#clients'],
              ['About', '#about'], ['Contact', '#contact']] },
    { id: 'mutra',     label: 'Mutra',     role: 'Catalog', page: 'mutra.html',
      lock: 'assets/rail-mutra.png?v=3', lockW: 112, lockH: 63, product: true,
      links: [['Browse', '#catalog'], ['How licensing works', '#faq'],
              ['Submit music', '/artists.html'], ['Get in touch', '#contact']] },
    /* The shop. Its panel is the apps themselves (the two rows below), and a small crumb
       leads to /apps/ for anyone who wants to see the shop itself — no "All apps" row. */
    { id: 'apps',      label: 'Apps',      role: 'Shop',    page: 'apps/',
      lock: 'assets/rail-apps.png?v=3', lockW: 68, lockH: 63, product: true, group: true },
    { id: 'streamdaw', label: 'StreamDAW', page: 'streamdaw.html', dir: 'apps/',
      mark: 'assets/sdaw-word-trim.png?v=1',     product: true, under: 'apps' },
    { id: 'audioctor', label: 'Audioctor', page: 'audioctor.html', dir: 'apps/',
      mark: 'assets/audioctor-word-trim.png?v=1', product: true, under: 'apps' },
    { id: 'snowstash', label: 'Snowstash', role: 'Royalties', page: 'snowstash.html',
      lock: 'assets/rail-snowstash.png?v=3', lockW: 156, lockH: 63, product: true,
      links: [['Overview', '#hero'], ['How it works', '#how'], ['Run a check', '#cand']] },
    // Not a vertical of its own — the artists' door into Mutra, listed with Mutra's pages.
    { id: 'artists',   label: 'For artists', page: 'artists.html', ofVert: 'mutra' },
  ];
  const PROP_KEY = 'config.properties';

  /* ── look: size and air, in steps, never in pixels ────────────────────────
     Two things the owner asked for on 2026-11-16: make a text bigger or smaller,
     and give a block more room, without either one breaking on a phone.

     SIZE is a percentage on a <span class="se-fs"> wrapped round the block's own
     contents, so it rides in the saved HTML with the text and needs no CSS of its
     own (the editor's stylesheet is admin-only — a visitor never loads it). A
     percentage on font-size resolves against the PARENT, and the parent here is
     the block itself, whose size is whatever its clamp()/vw rule works out to at
     that viewport. So 125% is a quarter bigger at every width, and the authored
     responsive scale is still the thing doing the scaling.

     AIR is em of padding added above or below, stored per block in one row per
     page. padding, not margin, because padding ADDS to the margin the stylesheet
     already gave the block instead of replacing it: there is no breakpoint at
     which this can fight the CSS, and nothing responsive is ever frozen into a
     number. em, so the gap tracks the block's own responsive font-size. The one
     cost is a block with authored padding of its own (a table cell, a card),
     where the override replaces it — visible at once in the page, and one step
     back to 0 undoes it.

     Both are clamped to a fixed list of steps here AND again on the way in from
     the API, so a bad stored value can only ever mean "no override". */
  const LAYOUT_KEY = 'layout.' + PAGE;
  const FS_STEPS = [70, 80, 90, 100, 110, 125, 150, 175, 200];
  const SP_STEPS = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4];
  let layout = {};          // data-txt key -> { t, b } em of added air
  let layout0 = '';         // what the server last said, for Discard
  const spStep = (n) => (SP_STEPS.includes(+n) ? +n : null);
  const touched = new Set();

  /** Applied on hydration for everyone, and again on every step in the editor. */
  function applyLayout(map) {
    for (const [key, v] of Object.entries(map || {})) {
      let el = null;
      try { el = document.querySelector(`[data-txt="${key}"]`); } catch { continue }
      if (!el) continue;
      touched.add(el);
      const t = spStep(v && v.t), b = spStep(v && v.b);
      el.style.paddingTop = t ? t + 'em' : '';
      el.style.paddingBottom = b ? b + 'em' : '';
    }
  }

  /* A span round block-level children would be invalid markup and would drag those
     children's own sizes with it, so only a leaf text block can be scaled. */
  const BLOCKISH = 'p,div,section,article,aside,header,footer,nav,form,table,figure,ul,ol,li,h1,h2,h3,h4,h5,h6';
  const canSize = (el) => !el.querySelector(BLOCKISH);
  /* Vertical padding on a non-replaced `display:inline` box paints but adds no layout space,
     so Air on one of those does nothing at all — and autoKeys does key inline blocks (a,
     button, label, and any span it reaches). The control is disabled there rather than left
     to click with no effect. inline-block and inline-flex do honour padding, so only exactly
     `inline` is refused. */
  const canAir = (el) => { try { return getComputedStyle(el).display !== 'inline'; } catch { return true } };
  const sizeOf = (el) => {
    const s = el.querySelector('span.se-fs');
    const n = s ? parseFloat(s.style.fontSize) : 100;
    return FS_STEPS.includes(n) ? n : 100;
  };
  /** Idempotent: every existing wrapper is unwrapped first, so stepping twice
   *  cannot nest two spans and multiply the scale. */
  function setSize(el, pct) {
    el.querySelectorAll('span.se-fs').forEach((s) => {
      while (s.firstChild) s.parentNode.insertBefore(s.firstChild, s);
      s.remove();
    });
    el.normalize();
    if (pct === 100 || !FS_STEPS.includes(pct)) return;
    const s = document.createElement('span');
    s.className = 'se-fs';
    s.style.fontSize = pct + '%';
    while (el.firstChild) s.appendChild(el.firstChild);
    el.appendChild(s);
  }

  /** Is this page the property's own page? */
  function isCurrent(p) {
    const path = location.pathname;
    const own = '/' + (p.dir || '') + p.page;
    // a directory page and its index.html are the same page
    if (p.page.endsWith('/')) return path === own || path === own + 'index.html';
    // and only the site root is the Snowstar page: /apps/index.html is not
    if (p.page === 'index.html') return path === '/' || path === '/index.html';
    return path.endsWith('/' + p.page) || path === own;
  }

  /** Does this href point at that property's page? Matches 'snowstash.html',
   *  '/snowstash.html', '../snowstash.html' and 'apps/streamdaw.html' alike,
   *  and tolerates a query or a hash on the end. */
  function pointsAt(href, page) {
    const bare = String(href || '').split('?')[0].split('#')[0];
    return bare.endsWith(page);
  }

  /* ── the Products block, from one list ─────────────────────────────────────
     It was written by hand in seven files, which is why it had already drifted:
     every page listed itself except the home page, which left Snowstar out
     entirely. Adding a vertical meant seven edits and remembering all seven.

     The decision this settles: every vertical is listed on every page,
     INCLUDING the one you are on, where it is marked and made inert rather than
     removed. A menu that changes shape per page is a worse map of a business
     than one that always shows the same rooms and greys out the one you are
     standing in — and it is the behaviour three of the four pages already had.

     Hidden verticals are the same rule from the other side: a vertical switched
     off in the menu loses its row everywhere, its own page included. Static
     markup stays as the no-JS baseline; this only corrects it. */
  /* ── the menu: a rail of verticals, a panel of pages ───────────────────────
     Ori, 2026-10-23, with Waves' menu as the reference: "clicking a vertical shows that
     vertical's menu beside it". So the Products list is gone. In its place the rail carries
     one button per vertical — its mark, and the word for what it is — and beside it stands
     that vertical's own pages. Pressing a vertical shows what is inside it; it does not take
     you there. The links do that.

     The page you are on keeps ITS OWN markup as its panel, so the wording, the numbering and
     the anchors are the page's, not a copy of them here. Every other vertical's panel is
     built from PROPERTIES.links. With no JavaScript the static list in the markup is what
     shows, which is why it stays in all nine pages. */

  const ROOT_OF = { mutra: ['/mutra.html', '/artists.html', '/artist.html'] };

  /** Which vertical does this page belong to? */
  function vertHere() {
    const path = location.pathname;
    if (path.startsWith('/apps/')) return 'apps';
    if (ROOT_OF.mutra.some((x) => path === x || path.endsWith(x))) return 'mutra';
    if (path.endsWith('/snowstash.html')) return 'snowstash';
    return 'snowstar';
  }

  /** The mark, or the label set in the menu's own type when a vertical has no wordmark. */
  /* One baked image per vertical: the mark and the word under it are a single PNG, so their
     relationship is fixed, it is the same on every page whatever that page's fonts are, and
     there is no text in the rail to select, re-flow or mis-set. Drawn at 4x in
     scratchpad/lock/make.js, shown at a quarter of that. The art is white, so a light menu
     inverts it — dressRail decides that from the menu's own background. */
  function vertFace(p) {
    if (!p.lock) return `<span class="ss-name">${p.label}</span>`;
    return `<img class="ss-lock" src="/${p.lock}" alt="${p.label}"`
      + ` width="${p.lockW}" height="${p.lockH}" style="--w:${p.lockW}px">`;
  }

  /** '#faq' on the vertical's page, '/artists.html' as it stands, from any depth. */
  function hrefIn(p, href, onIt) {
    if (!href.startsWith('#')) return href;
    return onIt ? href : '/' + (p.dir || '') + p.page + href;
  }

  function buildMenu(hidden) {
    const here = vertHere();
    const verts = PROPERTIES.filter((p) => p.product && !p.under && !(hidden[p.id] || {}).menu);
    const kids = (id) => PROPERTIES.filter((p) => p.under === id && !(hidden[p.id] || {}).menu);

    document.querySelectorAll('nav').forEach((nav) => {
      const div = [...nav.children].find((n) => n.classList && n.classList.contains('menu-div'));
      if (!div || nav.dataset.ssRail) return;        // not a menu, or already built
      nav.dataset.ssRail = '1';
      if (nav.parentElement) nav.parentElement.dataset.ssMenu = '1';

      // the page's own links are everything before the divider; the old product list goes
      const own = [];
      for (let n = nav.firstElementChild; n && n !== div; ) {
        const next = n.nextElementSibling;
        if (n.tagName === 'A') own.push(n);
        n = next;
      }
      for (let n = div; n; ) { const next = n.nextElementSibling; n.remove(); n = next; }

      const rail = document.createElement('div');
      rail.className = 'ss-rail';
      rail.setAttribute('aria-label', 'Snowstar');
      const panes = document.createElement('div');
      panes.className = 'ss-panes';

      verts.forEach((p) => {
        const onIt = p.id === here;
        /* A link, not a button: hovering shows what is inside the vertical, pressing it goes
           to the vertical's own page — apple.com's rule, which is what Ori asked for. */
        const tab = document.createElement('a');
        tab.className = 'ss-vert' + (onIt ? ' ss-at on' : '');
        tab.href = '/' + (p.dir || '') + p.page;
        tab.dataset.vert = p.id;
        if (onIt) tab.setAttribute('aria-current', 'page');
        tab.innerHTML = vertFace(p) + (onIt ? '<i class="ss-dot" aria-hidden="true"></i>' : '');
        rail.appendChild(tab);

        const pane = document.createElement('div');
        pane.className = 'ss-pane';
        pane.dataset.vert = p.id;
        if (!onIt) pane.hidden = true;
        /* No heading inside the panel: the rail already says which vertical this is, and the
           name of it is a link in the rail rather than a line of type in here. */

        if (onIt && own.length) {
          own.forEach((a) => pane.appendChild(a));   // the page's own, moved across
        } else if (p.group) {
          kids(p.id).forEach((k) => {                // the shop: the apps themselves
            const a = document.createElement('a');
            a.href = '/' + (k.dir || '') + k.page;
            a.innerHTML = `<i></i><span class="lbl">${k.label}</span>`;
            a.classList.toggle('now', isCurrent(k));
            pane.appendChild(a);
          });
        } else {
          (p.links || []).forEach(([label, href]) => {
            const a = document.createElement('a');
            a.href = hrefIn(p, href, false);
            a.innerHTML = `<i></i><span class="lbl">${label}</span>`;
            pane.appendChild(a);
          });
        }
        panes.appendChild(pane);
      });

      nav.classList.add('ss-doors');
      nav.append(rail, panes);
      dressRail(nav);

      const show = (id) => {
        rail.querySelectorAll('.ss-vert').forEach((t) => t.classList.toggle('on', t.dataset.vert === id));
        panes.querySelectorAll('.ss-pane').forEach((x) => { x.hidden = x.dataset.vert !== id; });
        renumberMenus();
      };
      const over = (e) => { const t = e.target.closest('.ss-vert'); if (t) show(t.dataset.vert); };
      rail.addEventListener('mouseover', over);
      rail.addEventListener('focusin', over);
      /* With a mouse the panel is already open by the time the click lands, so the link goes
         where it says. With a finger there is no hover, so the first tap opens it and the
         second one goes — one rule covering both. */
      rail.addEventListener('click', (e) => {
        const t = e.target.closest('.ss-vert');
        if (t && !t.classList.contains('on')) { e.preventDefault(); show(t.dataset.vert); }
      });
    });
  }

  /* The rail's own type: a menu row's size lives on each page's own selector (.menu-nav a,
     .mmenu-nav a, .menu nav a, .sd-menu a), which a <button> matches in none of the six
     stylesheets. So the row's computed type is copied onto the rail, and every em inside it
     — the role word, the crumb, the wordmark slot — is measured against that. */
  /** White art on a light menu would vanish, so the rail asks the menu what colour it is. */
  function inkOrSnow(nav) {
    for (let el = nav; el && el !== document.documentElement; el = el.parentElement) {
      const bg = getComputedStyle(el).backgroundColor;
      const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(bg);
      if (!m || (m[4] !== undefined && +m[4] < 0.5)) continue;
      const lum = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
      return lum > 0.55 ? 'ink' : 'snow';
    }
    return 'snow';
  }

  function dressRail(nav) {
    const kin = nav.querySelector('.ss-pane a');
    if (!kin) return;
    const c = getComputedStyle(kin);
    nav.style.setProperty('--ss-row', `${c.fontStyle} ${c.fontWeight} ${c.fontSize}/${c.lineHeight} ${c.fontFamily}`);
    nav.style.setProperty('--ss-size', c.fontSize);
    nav.style.setProperty('--ss-track', c.letterSpacing === 'normal' ? '0' : c.letterSpacing);
    nav.style.setProperty('--ss-case', c.textTransform);
    nav.classList.toggle('ss-ink', inkOrSnow(nav) === 'ink');
  }

  /* ── the menu footer, from one definition ──────────────────────────────────
     Only the home page carried the contact block. Mutra, the artist pages and
     the dashboard had an email and a one-line note; Snowstash had a single
     line; StreamDAW had no footer at all. So "how do I reach these people"
     had a different answer depending on which door you came through.

     One block now, rendered into whatever footer each menu already has — or
     into a footer created for the menu that had none. The currency toggle
     rides here too rather than in the nav bar, which is where it was asked to
     go and also where it belongs: it is a preference, not a destination, and
     the nav bar is for destinations. */
  const CONTACT = {
    mail: 'hello@snowstar.company',
    tel: [['Israel', '+972.54.449.8389'], ['US', '+1.847.440.4615']],
    social: [
      ['Vimeo', 'https://vimeo.com/snowstarcompany',
       'M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609-3.268 4.247-6.026 6.37-8.29 6.37-1.409 0-2.578-1.294-3.553-3.881L5.322 11.4C4.603 8.816 3.834 7.522 3.01 7.522c-.179 0-.806.378-1.881 1.132L0 7.197a315.065 315.065 0 0 0 3.501-3.128C5.08 2.701 6.266 1.984 7.055 1.91c1.867-.18 3.016 1.1 3.447 3.838.465 2.953.789 4.789.971 5.507.539 2.45 1.131 3.674 1.776 3.674.502 0 1.256-.796 2.265-2.385 1.004-1.589 1.54-2.797 1.612-3.628.144-1.371-.395-2.061-1.614-2.061-.574 0-1.167.121-1.777.391 1.186-3.868 3.434-5.757 6.762-5.637 2.473.06 3.628 1.664 3.48 4.807z'],
      ['Instagram', 'https://www.instagram.com/snowstar.company',
       'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0 5.838a5.999 5.999 0 1 0 0 11.998 5.999 5.999 0 0 0 0-11.998zm0 9.896a3.897 3.897 0 1 1 0-7.794 3.897 3.897 0 0 1 0 7.794zm6.24-11.3a1.402 1.402 0 1 0 0 2.804 1.402 1.402 0 0 0 0-2.804z'],
      ['Facebook', 'https://www.facebook.com/snowstar.company',
       'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z'],
    ],
  };

  function footHtml() {
    return `<a class="ss-mail" href="mailto:${CONTACT.mail}">${CONTACT.mail}</a>
      <div class="ss-tel">${CONTACT.tel.map(([k, v]) =>
        `<span>${k}&nbsp;<a href="tel:${v.replace(/[^+\d]/g, '')}">${v}</a></span>`).join('<i>&middot;</i>')}</div>
      <div class="ss-row">
        <div class="ss-soc">${CONTACT.social.map(([name, href, d]) =>
          `<a href="${href}" target="_blank" rel="noopener" aria-label="${name}"><svg viewBox="0 0 24 24"
             width="20" height="20"><path fill="currentColor" d="${d}"/></svg></a>`).join('')}</div>
        <span class="ss-cur" data-currency-switcher aria-label="Currency"></span>
      </div>`;
  }

  function syncMenuFoot() {
    document.querySelectorAll('nav').forEach((nav) => {
      // only the real menus — the ones the rail was built into (buildMenu marks them)
      if (!nav.dataset.ssRail) return;
      const menu = nav.parentElement;
      if (!menu) return;
      let foot = menu.querySelector('[class*="menu-foot"], .ss-foot');
      if (!foot) {
        // StreamDAW's menu had no footer at all
        foot = document.createElement('div');
        foot.className = 'ss-foot';
        menu.appendChild(foot);
      }
      foot.classList.add('ss-foot');
      foot.innerHTML = footHtml();
      /* StreamDAW had already moved a switcher into its own menu before this
         existed, so without this the menu would end up with two. Exactly one,
         and it is the one in the canonical footer. */
      menu.querySelectorAll('[data-currency-switcher]').forEach((el) => {
        if (!foot.contains(el)) (el.closest('.menu-cur') || el).remove();
      });
      const cur = foot.querySelector('[data-currency-switcher]');
      /* money.js mounts at DOMContentLoaded and this runs after a fetch, so the
         switcher it is looking for does not exist yet when it looks. Mount it
         here instead; Money.mount is idempotent. */
      if (cur && window.Money) window.Money.mount(cur);
    });
  }

  /* Injected rather than added to four stylesheets, two of which live inside
     their own page. Everything inherits colour, so one block serves a night
     menu and a paper one. No flash to worry about: a menu footer is only ever
     seen after somebody opens the menu. */
  /* The one door's own styling, injected for the same reason the footer's is: the Products
     block appears in six stylesheets, two of them inside their own page. The rows inside a
     group are still <a> inside the menu's container, so every page's own type, colour and
     hover already reach them — only the disclosure itself needs dressing, and it inherits
     colour so one block serves a night menu and a paper one. */
  /* The rail's own styling, injected for the same reason the footer's is: the menu appears in
     six stylesheets, two of them inside their own page. Everything here inherits colour and
     type from the menu it lands in — one block serves a night menu and a paper one — and the
     links inside a panel are still <a> inside that menu's container, so each page's own row
     styling reaches them untouched. */
  function railCss() {
    if (document.getElementById('ss-rail-css')) return;
    /* the menu's own two faces, so every page's menu is set the same whatever that page
       otherwise loads (Anton for the pages, Barlow Condensed for their numbers) */
    const pre = document.createElement('link');
    pre.rel = 'preconnect'; pre.href = 'https://fonts.gstatic.com'; pre.crossOrigin = '';
    const f = document.createElement('link');
    f.rel = 'stylesheet';
    f.href = 'https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:wght@700&display=swap';
    document.head.append(pre, f);
    const st = document.createElement('style');
    st.id = 'ss-rail-css';
    st.textContent = `
      /* A row across the top, a panel underneath. Every vertical sits in a cell of the same
         width, so nothing moves when another one opens, and the row and the pages below share
         one left edge and one centre. No rules, no bars, no plates: what is open is lit, and
         the page you are on keeps a dot. */
      .ss-doors.ss-doors{display:flex;flex-direction:column;align-items:stretch;gap:0;
        width:100%;max-width:min(920px,100%);margin:0 auto}
      .ss-rail{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);
        width:100%;gap:0;padding:0;margin:0;border:0;justify-items:center}
      .ss-doors .ss-rail .ss-vert{display:flex;flex-direction:column;align-items:center;
        justify-content:flex-end;gap:0;position:relative;width:100%;min-width:0;max-width:none;
        min-height:0;padding:4px 2px 15px;margin:0;border:0;border-radius:0;background:none;
        box-shadow:none;cursor:pointer;color:inherit;text-align:center;opacity:.62;
        text-decoration:none;text-transform:none;letter-spacing:normal;outline:none;
        transform:none;transition:opacity .25s ease}
      .ss-doors .ss-rail .ss-vert:hover{opacity:.9;background:none;transform:none}
      .ss-doors .ss-rail .ss-vert.on{opacity:1}
      .ss-doors .ss-rail .ss-vert:focus-visible{outline:2px solid currentColor;outline-offset:1px}
      /* the mark and its word are one image, centred: fixed, and nothing to re-flow */
      .ss-doors .ss-rail .ss-vert img.ss-lock{display:block;height:auto;width:var(--w);
        max-width:100%;filter:none}
      .ss-doors.ss-ink .ss-rail .ss-vert img.ss-lock{filter:invert(1)}
      .ss-doors .ss-rail .ss-name{display:block;font-size:19px;line-height:1}
      /* the page you are actually on, marked without a line */
      .ss-doors .ss-rail .ss-vert .ss-dot{position:absolute;left:50%;bottom:5px;width:4px;height:4px;
        margin-left:-2px;border-radius:50%;background:currentColor;opacity:.8}
      .ss-panes{width:100%;padding:clamp(26px,3.2vw,44px) 0 0}
      .ss-pane{display:flex;flex-direction:column;gap:clamp(2px,.5vw,8px)}
      .ss-pane[hidden]{display:none}
      /* One face for the pages, on every page: a menu row used to be set in whatever display
         font that page happened to load, so Apps read differently from Mutra and from the
         studio. Three selectors deep, because each page styles its own menu links. */
      .ss-doors .ss-panes .ss-pane a{display:flex;align-items:baseline;gap:clamp(10px,1.2vw,18px);
        width:max-content;max-width:100%;min-height:0;padding:0;margin:0;border:0;border-radius:0;
        background:none;box-shadow:none;transform:none;
        font-family:Anton,"Arial Narrow",Impact,sans-serif;font-weight:400;font-style:normal;
        font-size:clamp(26px,3.8vw,48px);line-height:1.12;letter-spacing:.012em;
        text-transform:uppercase;text-decoration:none;color:inherit;opacity:.88;
        transition:opacity .2s ease,transform .25s ease}
      .ss-doors .ss-panes .ss-pane a:hover{opacity:1;transform:translateX(5px);background:none}
      .ss-doors .ss-panes .ss-pane a.now{opacity:.42}
      .ss-doors .ss-panes .ss-pane a i{font-style:normal;font-weight:700;line-height:1;flex:none;
        font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:.26em;
        letter-spacing:.2em;opacity:.5;min-width:2.6em;color:inherit}
      .ss-doors .ss-panes .ss-pane a .lbl{display:block;transform:none}
      /* a phone: two by two, so nothing is cut and nothing moves */
      @media (max-width:640px){
        .ss-rail{grid-auto-flow:row;grid-template-columns:repeat(2,minmax(0,1fr));
          grid-auto-columns:auto;gap:2px 8px}
        .ss-doors .ss-rail .ss-vert{padding:8px 2px 14px}
        .ss-panes{padding-top:20px}
      }
    `;
    document.head.appendChild(st);
  }

  function footCss() {
    if (document.getElementById('ss-foot-css')) return;
    const st = document.createElement('style');
    st.id = 'ss-foot-css';
    st.textContent = `
      .ss-foot{display:flex;flex-direction:column;align-items:flex-start;gap:12px;margin-top:auto}
      /* Every one of these menus styles its links by container — .sd-menu a,
         .st-menu a — at display size and uppercase, and this footer lives
         inside those containers. Without an explicit reset the phone numbers
         came out set at 3.2rem. Two classes deep so it outranks them rather
         than relying on being injected last. */
      .ss-foot a{font:inherit;font-size:inherit;letter-spacing:inherit;
        text-transform:none;line-height:1.35;display:inline;color:inherit;text-decoration:none}
      .ss-foot a.ss-mail{font-size:clamp(.98rem,2vw,1.3rem);font-weight:600;
        border-bottom:1px solid currentColor;padding-bottom:2px;line-height:1.2}
      .ss-foot .ss-tel{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:.76rem;
        letter-spacing:.09em;text-transform:uppercase;opacity:.62;line-height:1.4}
      .ss-foot .ss-tel a{font-size:inherit;letter-spacing:inherit;text-transform:inherit}
      .ss-foot .ss-tel a:hover{text-decoration:underline}
      .ss-tel i{font-style:normal;opacity:.5}
      .ss-row{display:flex;align-items:center;gap:18px;flex-wrap:wrap;width:100%}
      .ss-soc{display:flex;gap:14px}
      .ss-foot .ss-soc a{color:inherit;opacity:.55;transition:opacity .2s,transform .2s;display:block;
        font-size:0;border:0;padding:0}
      .ss-soc a:hover{opacity:1;transform:translateY(-2px)}
      .ss-cur{margin-left:auto}
      .ss-cur .cur-btn{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;
        border:1px solid color-mix(in srgb,currentColor 32%,transparent);background:none;
        color:inherit;font:600 .95rem/1 inherit;cursor:pointer;padding:0 0 1px;transition:.2s}
      .ss-cur .cur-btn:hover{border-color:currentColor}
    `;
    document.head.appendChild(st);
  }

  function applyProperties(state) {
    if (!state) return;
    PROPERTIES.forEach((p) => {
      const s = state[p.id] || {};
      if (s.section) {
        const el = document.getElementById(p.id);
        if (el) el.style.display = 'none';
      }
      if (s.menu) {
        /* Menus only, not every link in the page body. "Hide it from the menu"
           is about how the site advertises itself; a link inside an article is
           a sentence, and removing words from sentences is the Remove row tool
           doing a different job. */
        document.querySelectorAll('nav a[href], #mmenu a[href], .mmenu a[href]').forEach((a) => {
          if (pointsAt(a.getAttribute('href'), p.page)) a.style.display = 'none';
        });
      }
    });
    renumberMenus();
  }

  /* The two injected stylesheets go in before anything is fetched. They used to ride on the
     /api/texts promise, which left a window — first paint to the network settling — where the
     static menu door showed a browser's own disclosure triangle and a 16px label, and the
     contact block had no styling at all. Neither block depends on the answer. */
  /* Both of these are for the menu buildMenu() assembles, and buildMenu only ever runs on a
     nav that has a .menu-div child — 16 of the 25 pages. On the others they injected a
     stylesheet matching nothing plus two Google Fonts requests for Anton and Barlow
     Condensed, which nothing on such a page asks for. That was harmless until 2026-11-16,
     when this file started loading on pages with no menu at all so that their copy could be
     edited; dead weight on those pages is the thing to avoid, not to inherit. */
  if (document.querySelector('nav > .menu-div')) {
    footCss();
    railCss();
  }

  /* ── auto keys (2026-10-29): every text editable without naming it in the HTML ──
     A page whose <main> carries data-autotxt (the StreamDAW pages) gets a key on each text block that has
     none: "auto.<page>.<hash of its built-in words>". A key made from the words, not the block's place, so
     moving a block keeps its edit, and rewriting the built-in words starts it clean (the old edit was for
     other words). Blocks the page's own scripts fill or price (an id, data-usd/data-ils, a form field)
     are left alone: an edit there would freeze a live number. Runs before the texts are applied. */
  (function autoKeys() {
    const main = document.querySelector('main[data-autotxt]');
    if (!main) return;
    const BLOCK = 'p,h1,h2,h3,h4,h5,h6,li,figcaption,summary,dt,dd,td,th,blockquote,a,button,label';
    const LIVE = '[data-txt],[data-usd],[data-ils],[data-cur],[id],input,select,textarea,video,canvas,script';
    const slug = PAGE.toLowerCase().replace(/\.html$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(-40) || 'home';
    const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
    const seen = new Map();
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const picked = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const p = n.parentElement;
      if (!p || p.closest('svg,script,style,[data-txt],[contenteditable]')) continue;
      const el = p.closest(BLOCK) || p;
      if (!main.contains(el) || el === main || picked.has(el) || el.id || el.querySelector(LIVE) || el.closest('[data-txt]')) continue;
      picked.add(el);
    }
    picked.forEach((el) => {
      const words = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 400);
      const base = 'auto.' + slug + '.' + hash(words);
      const k = (seen.get(base) || 0) + 1; seen.set(base, k);
      el.dataset.txt = k > 1 ? base + '-' + k : base;
    });
  })();

  /* ── the editor's own attributes must never reach the stored HTML ─────────
     A keyed block can contain another keyed block — a <p> with a keyed <a> inside it,
     which autoKeys does on purpose, because both are text someone may want to change.
     enterText then puts class="se-editable" contenteditable="true" on BOTH, and
     putting them on the child CHANGES THE PARENT'S innerHTML. So the parent counted
     as dirty although nobody had touched it, and was saved with those attributes
     baked into its child.

     Found on 2026-11-16: five of the 52 rows live on snowstar.company carried
     contenteditable="true", which made that text editable for every visitor of the
     StreamDAW and Audioctor pages. Nothing showed it — .se-editable's outline is in
     the editor's own stylesheet, which only an admin ever loads.

     So: capture clean, compare clean, save clean — and strip on hydration too, which
     repairs the rows already stored for every visitor without a D1 write. The next
     save of each of those blocks writes the clean version back. */
  /* And what a paste brings (2026-11-17): copying one outlined block into another copies it
     with the browser's computed styles inline — the editor's own outline among them
     ("outline: … solid 1.5px !important"), which then framed Audioctor's hero for every
     visitor — and with that block's own key (data-txt="audioctor.last.title"), so the hero
     carried a second copy of the bottom headline's key. The outline goes, and a named key
     inside another block goes (an auto. key there is the page's own nesting, kept). */
  function strip(root) {
    root.querySelectorAll('[contenteditable],.se-editable').forEach((n) => {
      n.removeAttribute('contenteditable');
      n.classList.remove('se-editable');
      if (!n.classList.length) n.removeAttribute('class');
    });
    root.querySelectorAll('[style*="outline"]').forEach((n) => {
      n.style.removeProperty('outline'); n.style.removeProperty('outline-offset');
      if (!n.getAttribute('style').trim()) n.removeAttribute('style');
    });
    root.querySelectorAll('[data-txt]').forEach((n) => { if (!n.dataset.txt.startsWith('auto.')) n.removeAttribute('data-txt'); });
    return root;
  }
  const cleanOf = (el) => strip(el.cloneNode(true)).innerHTML;
  const cleanStr = (html) => {
    if (!/contenteditable|se-editable|outline|data-txt="(?!auto\.)/.test(html)) return html;   // the normal case, untouched
    const t = document.createElement('template');
    t.innerHTML = html;
    strip(t.content);
    return t.innerHTML;
  };

  // ── 1. hydration — runs for everyone, fails silent ──
  const hydrate = fetch('/api/texts')
    .then((r) => (r.ok ? r.json() : { texts: {} }))
    .then(({ texts }) => {
      let props = {};
      const rows = [];
      for (const [key, html] of Object.entries(texts)) {
        if (key === 'rows.removed.' + PAGE) {
          try { JSON.parse(html).forEach((sel) => {
            document.querySelectorAll(sel).forEach((el) => el.remove());
          }); } catch {}
          continue;
        }
        if (key === PROP_KEY) {
          try { props = JSON.parse(html) || {}; applyProperties(props); } catch {}
          continue;
        }
        if (key === 'sections.hidden.' + PAGE) {
          try {
            const ids = JSON.parse(html);
            ids.forEach((id) => {
              const el = document.getElementById(id);
              if (el) el.style.display = 'none';
            });
            syncMenus(ids);
          } catch {}
          continue;
        }
        if (key === LAYOUT_KEY) {
          layout0 = html;
          try { layout = JSON.parse(html) || {}; applyLayout(layout); } catch { layout = {}; }
          continue;
        }
        rows.push([key, html]);
      }
      /* Outermost block first. A keyed block can contain another keyed block — autoKeys
         keys a <p> and the <a> inside it on purpose, both being text someone may want to
         change — and assigning the parent's innerHTML throws away whatever the child's own
         row had just put there. Object.entries order is the D1 table's, not the document's,
         so with the two applied in table order the newer edit on the inner block was lost
         on about every other load, with nothing to show why. Depth is measured before any
         assignment, and each element is looked up again at the moment it is applied,
         because applying a parent replaces the child node the first lookup found. */
      const depthOf = (el) => { let d = 0; for (let n = el; n; n = n.parentElement) d += 1; return d; };
      rows
        .map(([key, html]) => {
          let el = null;
          try { el = document.querySelector(`[data-txt="${key}"]`); } catch { return null }
          return el ? { key, html, d: depthOf(el) } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.d - b.d)
        .forEach(({ key, html }) => {
          let el = null;
          try { el = document.querySelector(`[data-txt="${key}"]`); } catch { return }
          if (el) el.innerHTML = cleanStr(html);
        });
      /* Always, not only when a config exists — the home page needs its own
         Snowstar row inserted whether or not anything has ever been hidden. */
      buildMenu(props);
      syncMenuFoot();
      renumberMenus();
      return texts;
    })
    .catch(() => { buildMenu({}); syncMenuFoot(); renumberMenus(); return {}; });

  // ── 2. editor — only ever wakes up for the admin ──
  const M = window.SnowstarAccount;
  if (!M) return;
  let built = false;
  let pill, mode = null; // null | 'text' | 'draw'

  function boot() {
    if (!M.user || !M.user.admin || built) return;
    built = true;
    injectCss();
    buildPill();
  }
  M.onChange(boot);
  /* A microtask, not a straight call. boot() reaches buildPill() and from there loadPins(),
     and both touch `let` bindings declared further down this file — `pill`, then `pinLayer`.
     Calling boot() here synchronously only ever worked because account.js resolves the
     session over the network, so M.user was still null and boot returned at its first line;
     the moment a session was known at parse time it threw a TDZ ReferenceError and the admin
     got no editor at all, with the failure buried in the console. Moving one declaration up
     only moved the error to the next one — `pinLayer` proved that on 2026-11-16. A microtask
     runs after this whole script has been evaluated, so every binding exists, and it is
     still well before first paint. */
  queueMicrotask(boot);

  const api = async (path, body) => {
    const res = await fetch('/api' + path, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'request_failed');
    return d;
  };

  function toast(msg) {
    let t = document.querySelector('.se-toast');
    if (!t) { t = document.createElement('div'); t.className = 'se-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400);
  }

  // ─────────── floating pill ───────────
  hydrate.then((texts) => {
    try { savedSels = JSON.parse((texts && texts['rows.removed.' + PAGE]) || '[]'); } catch {}
  });

  function buildPill() {
    pill = document.createElement('div');
    pill.className = 'se-pill';
    pill.innerHTML = `
      <button data-m="text" title="Edit texts">✎ Texts</button>
      <button data-m="draw" title="Pencil + note pins">✏ Draw &amp; note</button>
      <button data-m="notes" title="Show/hide saved notes">◉ Notes</button>
      <button data-m="sections" title="Show/hide sections">▤ Sections</button>
      <button data-m="rows" title="Remove any row from this page">⌫ Remove row</button>`;
    document.body.appendChild(pill);
    pill.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const m = b.dataset.m;
      if (m === 'text') mode === 'text' ? exitText() : enterText();
      if (m === 'draw') mode === 'draw' ? exitDraw(true) : enterDraw();
      if (m === 'notes') toggleNotes();
      if (m === 'sections') sectionsPanel();
      if (m === 'rows') mode === 'rows' ? exitRows() : enterRows();
    });
    loadPins();
  }
  const lit = (m, on) => pill.querySelector(`[data-m="${m}"]`).classList.toggle('on', on);

  // ─────────── text editing ───────────
  let originals = new Map();
  let saveBar, cur = null, layoutDirty = false;

  function enterText() {
    if (mode === 'draw') exitDraw(false);
    mode = 'text'; lit('text', true);
    originals.clear();
    document.querySelectorAll('[data-txt]').forEach((el) => {
      originals.set(el, cleanOf(el));
      el.classList.add('se-editable');
      el.setAttribute('contenteditable', 'true');
      el.addEventListener('input', markDirty);
      el.addEventListener('focusin', pickBlock);
    });
    saveBar = document.createElement('div');
    saveBar.className = 'se-savebar';
    saveBar.innerHTML = `<span id="seHint">Click any outlined text and type</span>
      <span class="se-fmt" hidden>
        <b>Size</b>
        <button data-fs="-" title="Smaller">A&minus;</button><i data-v="fs">100%</i><button data-fs="+" title="Bigger">A+</button>
        <b>Air &uarr;</b>
        <button data-sp="t-" title="Less room above">&minus;</button><i data-v="t">0</i><button data-sp="t+" title="More room above">+</button>
        <b>Air &darr;</b>
        <button data-sp="b-" title="Less room below">&minus;</button><i data-v="b">0</i><button data-sp="b+" title="More room below">+</button>
      </span>
      <button class="se-primary" id="seSave" disabled>Save changes</button>
      <button id="seDiscard">Discard</button>`;
    document.body.appendChild(saveBar);
    saveBar.querySelector('#seSave').addEventListener('click', saveTexts);
    saveBar.querySelector('#seDiscard').addEventListener('click', exitText);
    saveBar.querySelector('.se-fmt').addEventListener('mousedown', (e) => e.preventDefault());
    saveBar.querySelector('.se-fmt').addEventListener('click', onFmt);
    cur = null;
  }

  /* ── size and air, on whichever block has the caret ─────────────────────── */
  /* The INNERMOST keyed block, from the event's target — not e.currentTarget. focusin
     bubbles, and a keyed block can sit inside another keyed block, so clicking into the
     <a> in a <li> fired this on the <a> and then again on the <li>, and the last one to
     run won: the toolbar always ended up pointing at the outer block, so the inner one
     could not be sized at all and the Air control claimed to work on a line where it
     cannot. Reading closest('[data-txt]') off the target gives the same answer whichever
     listener runs. */
  function pickBlock(e) {
    const t = e.target && e.target.closest ? e.target.closest('[data-txt]') : null;
    cur = t || e.currentTarget;
    syncFmt();
  }

  const stepped = (list, now, dir) => {
    const i = Math.max(0, list.indexOf(now));
    return list[Math.min(list.length - 1, Math.max(0, i + dir))];
  };

  function onFmt(e) {
    const b = e.target.closest('button');
    if (!b || !cur || !saveBar) return;
    if (b.dataset.fs) {
      if (!canSize(cur)) return;
      setSize(cur, stepped(FS_STEPS, sizeOf(cur), b.dataset.fs === '+' ? 1 : -1));
      markDirty();
    } else if (b.dataset.sp) {
      if (!canAir(cur)) return;
      const side = b.dataset.sp[0];
      const key = cur.dataset.txt;
      const row = layout[key] || (layout[key] = {});
      row[side] = stepped(SP_STEPS, spStep(row[side]) || 0, b.dataset.sp[1] === '+' ? 1 : -1);
      if (!row.t && !row.b) delete layout[key];
      touched.add(cur);
      cur.style.paddingTop = row.t ? row.t + 'em' : '';
      cur.style.paddingBottom = row.b ? row.b + 'em' : '';
      layoutDirty = true;
      markDirty();
    }
    syncFmt();
  }

  function syncFmt() {
    if (!saveBar) return;
    const fmt = saveBar.querySelector('.se-fmt');
    if (!cur) { fmt.hidden = true; return; }
    const row = layout[cur.dataset.txt] || {};
    fmt.hidden = false;
    fmt.querySelector('[data-v="fs"]').textContent = sizeOf(cur) + '%';
    fmt.querySelector('[data-v="t"]').textContent = String(spStep(row.t) || 0);
    fmt.querySelector('[data-v="b"]').textContent = String(spStep(row.b) || 0);
    const air = canAir(cur);
    fmt.querySelectorAll('[data-fs]').forEach((btn) => { btn.disabled = !canSize(cur); });
    fmt.querySelectorAll('[data-sp]').forEach((btn) => {
      btn.disabled = !air;
      btn.title = air ? btn.title.replace(/ — .*$/, '') : 'This block is inline — vertical padding adds no space';
    });
    if (!air) { fmt.querySelector('[data-v="t"]').textContent = '–'; fmt.querySelector('[data-v="b"]').textContent = '–'; }
  }

  function markDirty() {
    saveBar.querySelector('#seSave').disabled = false;
    saveBar.querySelector('#seHint').textContent = 'Unsaved changes';
  }

  async function saveTexts() {
    const dirty = [...originals].filter(([el, orig]) => cleanOf(el) !== orig);
    const btn = saveBar.querySelector('#seSave');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      for (const [el] of dirty) {
        await api('/texts', { key: el.dataset.txt, html: cleanOf(el) });
      }
      const air = layoutDirty;
      if (air) {
        const body = Object.keys(layout).length ? JSON.stringify(layout) : '';
        await api('/texts', { key: LAYOUT_KEY, html: body });
        layout0 = body; layoutDirty = false;
      }
      toast(`Saved ${dirty.length} text${dirty.length === 1 ? '' : 's'}${air ? ' and the spacing' : ''} — live now`);
      // keep the new text in place; just leave edit mode
      originals.clear();
      teardownText();
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Save changes';
      toast('Couldn’t save: ' + e.message);
    }
  }

  function exitText() {
    // revert anything unsaved — the text, and the air
    originals.forEach((html, el) => { if (cleanOf(el) !== html) el.innerHTML = html; });
    if (layoutDirty) {
      touched.forEach((el) => { el.style.paddingTop = ''; el.style.paddingBottom = ''; });
      try { layout = JSON.parse(layout0 || '{}') || {}; } catch { layout = {}; }
      applyLayout(layout);
      layoutDirty = false;
    }
    teardownText();
  }
  function teardownText() {
    document.querySelectorAll('[data-txt]').forEach((el) => {
      el.classList.remove('se-editable');
      el.removeAttribute('contenteditable');
      el.removeEventListener('input', markDirty);
      el.removeEventListener('focusin', pickBlock);
    });
    cur = null;
    if (saveBar) saveBar.remove();
    mode = null; lit('text', false);
  }

  // ─────────── pencil + note pins ───────────
  let canvas, ctx, strokes = [], stroke = null, overlay;

  const docH = () => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  const relX = (px) => px / document.documentElement.clientWidth;
  const relY = (px) => px / docH();

  function enterDraw() {
    if (mode === 'text') exitText();
    mode = 'draw'; lit('draw', true);
    overlay = document.createElement('div');
    overlay.className = 'se-overlay';
    canvas = document.createElement('canvas');
    canvas.width = document.documentElement.clientWidth;
    canvas.height = docH();
    overlay.appendChild(canvas);
    document.body.appendChild(overlay);
    ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#ff5470'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    strokes = [];

    canvas.addEventListener('pointerdown', (e) => {
      stroke = [[e.pageX, e.pageY]];
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!stroke) return;
      const [px, py] = stroke[stroke.length - 1];
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(e.pageX, e.pageY); ctx.stroke();
      stroke.push([e.pageX, e.pageY]);
    });
    canvas.addEventListener('pointerup', () => {
      if (stroke && stroke.length > 1) strokes.push(stroke);
      else if (stroke) pinAt(stroke[0][0], stroke[0][1]);   // a tap = a pin
      stroke = null;
    });

    saveBar = document.createElement('div');
    saveBar.className = 'se-savebar';
    saveBar.innerHTML = `<span>Draw with the pencil, or tap once to drop a note pin</span>
      <button class="se-primary" id="seDrawSave">Save note</button>
      <button id="seDrawCancel">Cancel</button>`;
    document.body.appendChild(saveBar);
    saveBar.querySelector('#seDrawSave').addEventListener('click', () => finishDrawing());
    saveBar.querySelector('#seDrawCancel').addEventListener('click', () => exitDraw(false));
  }

  function nearestText(x, y) {
    overlay.style.pointerEvents = 'none';
    const el = document.elementFromPoint(x - scrollX, y - scrollY);
    overlay.style.pointerEvents = '';
    const host = el && el.closest('[data-txt], h1, h2, h3, section, article');
    if (!host) return '';
    const key = host.dataset && host.dataset.txt ? host.dataset.txt + ': ' : '';
    return (key + (host.textContent || '').trim().replace(/\s+/g, ' ')).slice(0, 200);
  }

  async function pinAt(x, y) {
    const note = prompt('Note for Claude / yourself:');
    if (!note || !note.trim()) return;
    try {
      await api('/notes', { page: PAGE, x: relX(x), y: relY(y),
        vw: document.documentElement.clientWidth, near: nearestText(x, y), note: note.trim() });
      toast('Note pinned');
      loadPins(true);
    } catch (e) { toast('Couldn’t save the note: ' + e.message); }
  }

  async function finishDrawing() {
    if (!strokes.length) { exitDraw(false); return; }
    const note = prompt('What should happen here? (saved with the drawing)') || '';
    const [fx, fy] = strokes[0][0];
    const drawing = JSON.stringify(strokes.map((s) => s.map(([x, y]) => [relX(x), relY(y)])));
    try {
      await api('/notes', { page: PAGE, x: relX(fx), y: relY(fy),
        vw: document.documentElement.clientWidth, near: nearestText(fx, fy),
        note: note.trim(), drawing });
      toast('Drawing saved');
      exitDraw(false);
      loadPins(true);
    } catch (e) { toast('Couldn’t save: ' + e.message); }
  }

  function exitDraw(save) {
    if (overlay) overlay.remove();
    if (saveBar) saveBar.remove();
    strokes = []; stroke = null;
    mode = null; lit('draw', false);
  }

  // ─────────── viewing saved notes ───────────
  let pinsShown = true, pinLayer;

  async function loadPins(refresh) {
    if (pinLayer) { pinLayer.remove(); pinLayer = null; }
    if (!pinsShown) return;
    let notes;
    try {
      const res = await fetch('/api/notes?page=' + encodeURIComponent(PAGE), { credentials: 'same-origin' });
      const d = await res.json().catch(() => ({}));
      // A 403 or a 500 still parses as JSON, so without this check a broken
      // endpoint produced an empty list and looked exactly like "no notes".
      if (!res.ok || d.error) throw new Error(d.error || ('http_' + res.status));
      notes = d.notes || [];
    } catch (e) { lit('notes', false); toast('Notes unavailable: ' + e.message); return; }
    if (!notes.length) { lit('notes', false); return; }
    lit('notes', true);

    pinLayer = document.createElement('div');
    pinLayer.className = 'se-pinlayer';
    const H = docH(), W = document.documentElement.clientWidth;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    notes.forEach((n) => {
      if (!n.drawing) return;
      try {
        JSON.parse(n.drawing).forEach((s) => {
          const p = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
          p.setAttribute('points', s.map(([x, y]) => `${x * W},${y * H}`).join(' '));
          p.setAttribute('fill', 'none'); p.setAttribute('stroke', '#ff5470');
          p.setAttribute('stroke-width', '3'); p.setAttribute('stroke-linecap', 'round');
          svg.appendChild(p);
        });
      } catch {}
    });
    pinLayer.appendChild(svg);

    notes.forEach((n, i) => {
      const pin = document.createElement('button');
      pin.className = 'se-pin';
      pin.textContent = i + 1;
      pin.style.left = (n.x * W) + 'px';
      pin.style.top = (n.y * H) + 'px';
      pin.title = n.note || '(drawing)';
      pin.addEventListener('click', () => openPin(n, pin));
      pinLayer.appendChild(pin);
    });
    document.body.appendChild(pinLayer);
  }

  function openPin(n, pin) {
    document.querySelectorAll('.se-pop').forEach((p) => p.remove());
    const pop = document.createElement('div');
    pop.className = 'se-pop';
    pop.innerHTML = `<p>${(n.note || '(drawing only)').replace(/</g, '&lt;')}</p>
      <div><button class="se-primary" data-a="done">Mark done</button>
      <button data-a="del">Delete</button><button data-a="close">Close</button></div>`;
    pop.style.left = pin.style.left; pop.style.top = pin.style.top;
    pop.addEventListener('click', async (e) => {
      const a = e.target.dataset && e.target.dataset.a;
      if (!a) return;
      if (a === 'done') { await api('/notes', { id: n.id, status: 'done' }); toast('Done'); }
      if (a === 'del') { await api('/notes/delete', { id: n.id }); toast('Deleted'); }
      pop.remove();
      if (a !== 'close') loadPins(true);
    });
    pinLayer.appendChild(pop);
  }

  /* Pins are already on screen at boot, so this button only ever hides or
     re-shows them — and it used to do that with no feedback whatsoever. On the
     hide press loadPins() returned before reaching lit(), so the lamp never
     went out; with no notes on the page, pressing it changed nothing at all,
     which is why it read as broken rather than as empty. */
  async function toggleNotes() {
    pinsShown = !pinsShown;
    lit('notes', pinsShown);
    if (!pinsShown) { loadPins(); toast('Notes hidden'); return; }
    await loadPins();
    if (!pinLayer) toast('No notes on this page yet — drag on the page to leave one');
  }


  /* ─────────── remove a row ───────────────────────────────────────────────
     Sections hides the blocks the page declares; this removes ANY row the
     owner points at, whether or not anybody thought to give it an id. The
     element is taken out of the document rather than hidden, so its space
     goes with it — a hidden row still holds its parent's gap open.

     Every removal is stored as a CSS path and replayed for visitors at
     hydration. Undo pops the last path and puts the element back where it
     was, which is why the node is kept rather than discarded. */
  let rowsOn = false;
  let removed = [];            // [{ sel, el, parent, next }]
  let savedSels = [];          // what the server already knows about

  /** A path specific enough to find this element again, and short enough to
   *  survive small edits: an id wins outright, otherwise nth-of-type from the
   *  nearest id'd ancestor. */
  function pathOf(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let n = el;
    while (n && n !== document.body) {
      if (n.id) { parts.unshift('#' + CSS.escape(n.id)); break; }
      const tag = n.tagName.toLowerCase();
      const sibs = [...n.parentElement.children].filter((c) => c.tagName === n.tagName);
      parts.unshift(sibs.length > 1 ? `${tag}:nth-of-type(${sibs.indexOf(n) + 1})` : tag);
      n = n.parentElement;
    }
    return parts.join('>');
  }

  /** The block the owner means: walk up from the hovered node to the biggest
   *  ancestor that is still narrower than the page — a row, not the page. */
  function rowUnder(target) {
    let el = target;
    while (el && el !== document.body) {
      const r = el.getBoundingClientRect();
      if (r.height > 24 && r.width > 60
          && el.parentElement && el.parentElement !== document.body) return el;
      el = el.parentElement;
    }
    return null;
  }

  let hoverEl = null;
  const onOver = (e) => {
    if (!rowsOn) return;
    const el = rowUnder(e.target);
    if (el === hoverEl) return;
    if (hoverEl) hoverEl.classList.remove('se-rowpick');
    hoverEl = el;
    if (hoverEl) hoverEl.classList.add('se-rowpick');
  };
  const onPick = (e) => {
    if (!rowsOn) return;
    if (e.target.closest('.se-pill') || e.target.closest('.se-rowbar')) return;
    e.preventDefault(); e.stopPropagation();
    const el = rowUnder(e.target);
    if (!el) return;
    el.classList.remove('se-rowpick');
    const sel = pathOf(el);
    removed.push({ sel, el, parent: el.parentElement, next: el.nextElementSibling });
    el.remove();
    hoverEl = null;
    drawRowBar();
  };

  function enterRows() {
    if (mode === 'draw') exitDraw(false);
    if (mode === 'text') exitText();
    mode = 'rows'; rowsOn = true; lit('rows', true);
    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('click', onPick, true);
    drawRowBar();
    toast('Click any row to remove it');
  }

  function exitRows() {
    rowsOn = false; mode = null; lit('rows', false);
    document.removeEventListener('mouseover', onOver, true);
    document.removeEventListener('click', onPick, true);
    if (hoverEl) hoverEl.classList.remove('se-rowpick');
    hoverEl = null;
    const bar = document.querySelector('.se-rowbar'); if (bar) bar.remove();
  }

  function undoRow() {
    const last = removed.pop();
    if (!last) return;
    if (last.next && last.next.parentElement === last.parent) last.parent.insertBefore(last.el, last.next);
    else last.parent.appendChild(last.el);
    drawRowBar();
  }

  function drawRowBar() {
    let bar = document.querySelector('.se-rowbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'se-rowbar';
      document.body.appendChild(bar);
      bar.addEventListener('click', async (e) => {
        const a = e.target.dataset && e.target.dataset.a;
        if (a === 'undo') return undoRow();
        if (a === 'close') { while (removed.length) undoRow(); return exitRows(); }
        if (a === 'save') {
          const sels = [...savedSels, ...removed.map((r) => r.sel)];
          try {
            await api('/texts', { key: 'rows.removed.' + PAGE, html: sels.length ? JSON.stringify(sels) : '' });
            savedSels = sels; removed = [];
            toast('Rows removed — live now');
            exitRows();
          } catch (err) { toast('Couldn’t save: ' + err.message); }
        }
        if (a === 'restore') {
          try {
            await api('/texts', { key: 'rows.removed.' + PAGE, html: '' });
            savedSels = [];
            toast('All removed rows restored — reload to see them');
          } catch (err) { toast('Couldn’t restore: ' + err.message); }
        }
      });
    }
    bar.innerHTML = `<span>${removed.length} row${removed.length === 1 ? '' : 's'} removed</span>
      <button data-a="undo"${removed.length ? '' : ' disabled'}>Undo</button>
      <button class="se-primary" data-a="save"${removed.length ? '' : ' disabled'}>Save</button>
      <button data-a="restore" title="Bring back every row removed on this page">Restore all</button>
      <button data-a="close">Cancel</button>`;
  }

  // ─────────── section visibility ───────────
  async function sectionsPanel() {
    document.querySelectorAll('.se-pop').forEach((p) => p.remove());
    const key = 'sections.hidden.' + PAGE;
    const texts = await hydrate;
    let hidden = [];
    try { hidden = JSON.parse((texts && texts[key]) || '[]'); } catch {}
    const sections = [...document.querySelectorAll('main section[id], body > section[id]')];

    let props = {};
    try { props = JSON.parse((texts && texts[PROP_KEY]) || '{}') || {}; } catch {}

    /* Properties first, because they are the bigger lever and the one that
       works from whichever page you happen to be on. artists.html has no
       <main>, so the sections list below is empty there — which used to make
       this whole panel refuse to open. It opens now regardless. */
    const propRows = PROPERTIES.map((p) => {
      const s2 = props[p.id] || {};
      return `<label class="se-prop"><b>${p.label}</b>
        <span><input type="checkbox" data-prop="${p.id}" data-k="section"${s2.section ? ' checked' : ''}> hide section</span>
        <span><input type="checkbox" data-prop="${p.id}" data-k="menu"${s2.menu ? ' checked' : ''}> hide from menu</span>
      </label>`;
    }).join('');

    const pop = document.createElement('div');
    pop.className = 'se-pop se-sections';
    pop.innerHTML = '<p>Across the whole site</p>' + propRows
      + (sections.length
          ? '<p>Sections on this page</p>' + sections.map((s) => {
              const h = s.querySelector('h1,h2,h3');
              const label = (h ? h.textContent : s.id).trim().replace(/\s+/g, ' ').slice(0, 40);
              const off = hidden.includes(s.id) || s.style.display === 'none';
              return `<label><input type="checkbox" data-id="${s.id}" ${off ? '' : 'checked'}> ${label}</label>`;
            }).join('')
          : '<p class="se-none">No sections on this page</p>')
      + '<div><button class="se-primary" data-a="save">Save</button><button data-a="close">Close</button></div>';
    document.body.appendChild(pop);
    pop.style.position = 'fixed'; pop.style.right = '18px'; pop.style.bottom = '74px';
    pop.style.left = 'auto'; pop.style.top = 'auto';

    pop.addEventListener('click', async (e) => {
      const a = e.target.dataset && e.target.dataset.a;
      if (a === 'close') pop.remove();
      if (a === 'save') {
        // A ticked SECTION box means shown; a ticked PROPERTY box means hidden.
        // Opposite senses, because each reads naturally next to its own label.
        const off = [...pop.querySelectorAll('input[data-id]')]
          .filter((i) => !i.checked).map((i) => i.dataset.id);
        const next = {};
        pop.querySelectorAll('input[data-prop]').forEach((i) => {
          if (!i.checked) return;
          (next[i.dataset.prop] = next[i.dataset.prop] || {})[i.dataset.k] = true;
        });
        try {
          await api('/texts', { key, html: off.length ? JSON.stringify(off) : '' });
          await api('/texts', { key: PROP_KEY, html: Object.keys(next).length ? JSON.stringify(next) : '' });
          sections.forEach((s) => { s.style.display = off.includes(s.id) ? 'none' : ''; });
          syncMenus(off);
          /* Showing something again needs a reload: these only ever set
             display:none, so there is nothing to put back without re-reading
             the page's own markup. Hiding is live; unhiding says so. */
          /* The rail is built once per load from the list of visible verticals, so a vertical
             switched off now is removed by hand rather than rebuilt: applyProperties hides any
             link to it, and its rail button and panel go with it. */
          applyProperties(next);
          Object.keys(next).forEach((id) => {
            if (!(next[id] || {}).menu) return;
            document.querySelectorAll(`.ss-vert[data-vert="${id}"], .ss-pane[data-vert="${id}"]`)
              .forEach((el) => el.remove());
          });
          toast('Saved — hiding is live, showing again needs a reload');
          pop.remove();
        } catch (err) { toast('Couldn’t save: ' + err.message); }
      }
    });
  }

  // ─────────── styles ───────────
  function injectCss() {
    const css = `
    .se-pill{position:fixed;right:18px;bottom:18px;z-index:90;display:flex;gap:6px;padding:6px;
      border-radius:99px;border:1px solid rgba(235,225,210,.25);background:rgba(8,11,20,.92);
      backdrop-filter:blur(8px);box-shadow:0 12px 34px rgba(0,0,0,.5)}
    .se-pill button{border:0;background:none;color:#a8a29a;font:600 .72rem/1 system-ui,sans-serif;
      letter-spacing:.05em;text-transform:uppercase;padding:8px 11px;border-radius:99px;cursor:pointer;white-space:nowrap}
    .se-pill button:hover{color:#fff}
    .se-pill button.on{background:linear-gradient(100deg,#efe7d8,#e0b48b,#d9744a);color:#121110}
    .se-editable{outline:1.5px dashed rgba(224,180,139,.6)!important;outline-offset:3px;cursor:text;min-height:1em}
    .se-editable:hover,.se-editable:focus{outline-style:solid!important;outline-color:#e0b48b!important}
    .se-rowpick{outline:2px solid #ff3d8b!important;outline-offset:-2px;
      background:rgba(255,61,139,.10)!important;cursor:crosshair!important}
    .se-rowbar{position:fixed;left:50%;bottom:74px;transform:translateX(-50%);z-index:95;
      display:flex;gap:8px;align-items:center;padding:9px 12px;border-radius:12px;
      background:#161617;border:1px solid rgba(235,225,210,.16);
      box-shadow:0 12px 34px rgba(0,0,0,.5);font:600 .74rem/1 system-ui,sans-serif;color:#a8a29a}
    .se-rowbar button{border:0;background:rgba(235,225,210,.08);color:#e7e0d5;
      font:600 .72rem/1 system-ui,sans-serif;padding:7px 12px;border-radius:8px;cursor:pointer}
    .se-rowbar button:disabled{opacity:.4;cursor:default}
    .se-rowbar .se-primary{background:#ff3d8b;color:#fff}
    .se-savebar{position:fixed;left:50%;transform:translateX(-50%);bottom:18px;z-index:95;display:flex;
      flex-wrap:wrap;justify-content:center;max-width:min(96vw,1000px);
      gap:10px;align-items:center;padding:10px 16px;border-radius:14px;border:1px solid rgba(235,225,210,.25);
      background:rgba(8,11,20,.95);color:#a8a29a;font:500 .82rem system-ui,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.5)}
    .se-savebar button{border:1px solid rgba(235,225,210,.25);background:none;color:#f2ede4;font:600 .78rem system-ui;
      padding:8px 14px;border-radius:9px;cursor:pointer}
    .se-savebar button:disabled{opacity:.45;cursor:default}
    .se-fmt{display:inline-flex;align-items:center;gap:3px;flex-wrap:wrap;padding:0 10px;
      border-left:1px solid rgba(235,225,210,.18);border-right:1px solid rgba(235,225,210,.18)}
    .se-fmt b{margin:0 3px 0 7px;font:600 .6rem/1 system-ui,sans-serif;letter-spacing:.09em;
      text-transform:uppercase;opacity:.6;white-space:nowrap}
    .se-fmt b:first-child{margin-left:0}
    .se-fmt i{min-width:36px;text-align:center;font:600 .74rem/1 system-ui,sans-serif;font-style:normal;color:#f2ede4}
    .se-savebar .se-fmt button{padding:5px 9px;font-size:.72rem;line-height:1}
    .se-primary{background:linear-gradient(100deg,#efe7d8,#e0b48b,#d9744a)!important;color:#121110!important;border-color:transparent!important}
    .se-overlay{position:absolute;top:0;left:0;z-index:85;cursor:crosshair}
    .se-overlay canvas{display:block;touch-action:none}
    .se-pinlayer{position:absolute;top:0;left:0;width:100%;z-index:84;pointer-events:none}
    .se-pinlayer svg{position:absolute;top:0;left:0;pointer-events:none}
    .se-pin{position:absolute;transform:translate(-50%,-50%);width:26px;height:26px;border-radius:50%;
      border:2px solid #fff;background:#ff5470;color:#fff;font:700 .72rem system-ui;cursor:pointer;
      pointer-events:auto;box-shadow:0 4px 14px rgba(0,0,0,.45)}
    .se-pop{position:absolute;z-index:96;transform:translate(-50%,12px);max-width:300px;padding:12px 14px;
      border-radius:12px;border:1px solid rgba(235,225,210,.3);background:rgba(8,11,20,.97);color:#f2ede4;
      font:500 .84rem/1.45 system-ui;pointer-events:auto;box-shadow:0 16px 40px rgba(0,0,0,.55)}
    .se-pop p{margin:0 0 10px}
    .se-pop div{display:flex;gap:6px;flex-wrap:wrap}
    .se-pop button{border:1px solid rgba(235,225,210,.3);background:none;color:#f2ede4;font:600 .72rem system-ui;
      padding:6px 10px;border-radius:8px;cursor:pointer}
    .se-sections label{display:block;margin:6px 0;cursor:pointer;color:#c9d4e8}
    .se-sections p{margin:12px 0 4px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.6}
    .se-sections p:first-child{margin-top:0}
    .se-none{opacity:.45}
    .se-prop{display:flex;align-items:center;gap:10px;flex-wrap:wrap;
      border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:6px 9px;margin:5px 0}
    .se-prop b{min-width:86px;font-weight:600}
    .se-prop span{display:inline-flex;align-items:center;gap:4px;font-size:12px;opacity:.85}
    .se-sections div{margin-top:10px}
    .se-toast{position:fixed;left:50%;transform:translate(-50%,10px);bottom:64px;z-index:97;opacity:0;
      padding:9px 16px;border-radius:10px;background:rgba(8,11,20,.95);border:1px solid rgba(224,180,139,.4);
      color:#f2ede4;font:500 .82rem system-ui;transition:.25s;pointer-events:none}
    .se-toast.show{opacity:1;transform:translate(-50%,0)}
    @media (max-width:640px){.se-pill{right:10px;bottom:10px}.se-pill button{padding:8px 8px;font-size:.64rem}}`;
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }
})();
