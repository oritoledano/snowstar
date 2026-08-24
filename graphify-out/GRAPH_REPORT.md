# Graph Report - snowstar  (2026-08-24)

## Corpus Check
- 54 files · ~339,293 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 679 nodes · 1603 edges · 32 communities (30 shown, 2 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 79 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d4c3a32d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.js
- Mutra Catalogue Page
- Licence terms
- analytics.js
- licensing.js
- main.js
- dashboard.js
- works-admin.js
- bulk.js
- Mutra royalty-free music catalogue page
- site-edit.js
- users
- account-ui.js
- artists-page.js
- openPanel
- oauth.js
- Owner dashboard
- Snowstar agency homepage
- hyp.js
- account.js
- mutra-artist.js
- mutra-spotlight.js
- Privacy policy
- Track catalogue browse + search
- watermark.py
- schema-analytics.sql
- make-stream-renditions.sh
- schema-tracks.sql
- mutra-license.js
- stream.js
- artistreg.js
- works.js

## God Nodes (most connected - your core abstractions)
1. `handle()` - 100 edges
2. `Mutra royalty-free music catalogue page` - 33 edges
3. `appendPage()` - 19 edges
4. `Snowstar agency homepage` - 19 edges
5. `render()` - 18 edges
6. `load()` - 16 edges
7. `Owner dashboard` - 16 edges
8. `paint()` - 14 edges
9. `toggle()` - 14 edges
10. `Artist submission portal` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Countersign banner for tracks uploaded on the artist's behalf` --semantically_similar_to--> `Clearance status states (pending / cleared / rejected)`  [INFERRED] [semantically similar]
  artists.html → dashboard.html
- `Owner-side track upload and metadata editor` --semantically_similar_to--> `Multi-file track upload flow`  [INFERRED] [semantically similar]
  dashboard.html → artists.html
- `Upward tier change credits the earlier payment` --semantically_similar_to--> `Use tiers (digital, corporate, paid, TV, film, radio, commercial)`  [INFERRED] [semantically similar]
  refund.html → terms.html
- `Newsletter signup form` --semantically_similar_to--> `Signed-out account gate`  [INFERRED] [semantically similar]
  index.html → artists.html
- `Instant vs quote licensing lane` --semantically_similar_to--> `Get-a-quote tracks (someone else has a say)`  [INFERRED] [semantically similar]
  artists.html → terms.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Legal frame of a licence purchase (terms, refunds, privacy, contacts, entity)** — terms_licence_version, terms_use_tiers, terms_licence_term_multipliers, terms_vat_and_invoicing, refund_page, privacy_page, contact_email_routing, contact_legal_entity [INFERRED 0.85]
- **Rights clearance pipeline (artist declaration → owner review → licensable lane)** — artists_rights_declaration, artists_co_owner_shares, artists_controller_declaration, artists_countersign_claim, artists_instant_vs_quote_lane, dashboard_submissions_queue, dashboard_clearance_status, terms_quote_only_tracks [INFERRED 0.85]
- **One Snowstar account across catalogue, portal, dashboard and reset** — js_account, js_account_ui, css_account, artists_account_gate, reset_page, dashboard_page, privacy_account_data [INFERRED 0.85]

## Communities (32 total, 2 thin omitted)

### Community 0 - "index.js"
Cohesion: 0.05
Nodes (101): AUDIO_EXT, cleanupOrphanUploads(), createSubmission(), json(), listArtistsAdmin(), listSubmissions(), myUploads(), now() (+93 more)

### Community 1 - "Mutra Catalogue Page"
Cohesion: 0.07
Nodes (63): addCurateControls(), appendPage(), applyOverrides(), clearFilters(), closeDrawer(), closePlayer(), cycle(), drawDrop() (+55 more)

### Community 2 - "Licence terms"
Cohesion: 0.08
Nodes (35): ACUM / royalties-society registration flag, Who can approve a licence (any vs all), Co-owner share splits (batch or per-track), External controller declaration (label / publisher / distributor), Direct-child CSS selectors for nested checkbox labels, Instant vs quote licensing lane, Signed rights declaration on upload, CLAIM subject-line escalation path (+27 more)

### Community 3 - "analytics.js"
Cohesion: 0.28
Nodes (15): alertsMuted(), handleDownload(), handleJourney(), handleStats(), handleTrack(), json(), listAlerts(), logAlert() (+7 more)

### Community 4 - "licensing.js"
Cohesion: 0.16
Nodes (28): clean(), createRequest(), declineRequest(), freezeText(), GRANT_REASONS, grantFromDashboard(), grantLicence(), json() (+20 more)

### Community 5 - "main.js"
Cohesion: 0.07
Nodes (30): applyWorkFilter(), buildClientRows(), buildMarqueeRow(), buildWorkGrid(), cardObserver, categorize(), cg, FACETS (+22 more)

### Community 6 - "dashboard.js"
Cohesion: 0.22
Nodes (25): gate(), gauge(), load(), openDeclEditor(), openMember(), paint(), paintAlerts(), paintArtists() (+17 more)

### Community 7 - "works-admin.js"
Cohesion: 0.18
Nodes (23): build(), open(), paint(), requestClose(), addLogo(), api(), buildLogosModal(), buildModal() (+15 more)

### Community 8 - "bulk.js"
Cohesion: 0.16
Nodes (22): applyOps(), bulkArtist(), bulkEdit(), bulkUndo(), clean(), diffOf(), json(), keyOf() (+14 more)

### Community 9 - "Mutra royalty-free music catalogue page"
Cohesion: 0.16
Nodes (13): Artist profile page, Artist lookup by ?a= against MUTRA_SPOTLIGHTS, css/artist.css — artist profile styles, css/mutra.css — Mutra design system (warm palette), css/spotlight.css — spotlight styles, MUTRA_ARTIST_PROFILES, MUTRA_SOCIAL_PLATFORMS, MUTRA_SIMILAR (+5 more)

### Community 10 - "site-edit.js"
Cohesion: 0.27
Nodes (19): data-txt inline copy-editing hooks, boot(), buildPill(), enterDraw(), enterText(), exitDraw(), exitText(), finishDrawing() (+11 more)

### Community 11 - "users"
Cohesion: 0.16
Nodes (17): favorites_new, identities, oauth_states, password_resets, users_new, attempts, favorites, admin_log (+9 more)

### Community 12 - "account-ui.js"
Cohesion: 0.23
Nodes (18): close(), closeAcctPanel(), countFor(), drawerFor(), loadDrawer(), offerSignIn(), open(), paintAcctHead() (+10 more)

### Community 13 - "artists-page.js"
Cohesion: 0.22
Nodes (18): addCollabRow(), addControllerRow(), api(), collabData(), controllerData(), initBehalf(), paintClaim(), paintCredits() (+10 more)

### Community 14 - "openPanel"
Cohesion: 0.21
Nodes (17): build(), clearAll(), openPanel(), applyAvatar(), artistNames(), describe(), fmt(), paintSuggestions() (+9 more)

### Community 15 - "oauth.js"
Cohesion: 0.31
Nodes (16): b64url(), bounce(), claimHandoff(), enc, finishOAuth(), issueSession(), KILL_LEGACY_COOKIE, linkAndSignIn() (+8 more)

### Community 16 - "Owner dashboard"
Cohesion: 0.14
Nodes (18): Countersign banner for tracks uploaded on the artist's behalf, Credits: tracks where you are listed as a rights holder, Artist submission portal, Multi-file track upload flow, Upload on behalf of another artist, css/account.css — auth UI styles, css/skins.css — per-product skin variables, Alert kill switch with state-coloured rail (+10 more)

### Community 17 - "Snowstar agency homepage"
Cohesion: 0.15
Nodes (16): css/style.css — homepage design system, Audio Branding service, Mutra teaser section on the homepage, Organization JSON-LD structured data, Original Music service, Snowstar agency homepage, Post Sound / SFX service, Four services section (+8 more)

### Community 18 - "hyp.js"
Cohesion: 0.33
Nodes (13): configured(), CP1255, decodeValue(), handleReturn(), hypStatus(), json(), listStale(), now() (+5 more)

### Community 19 - "account.js"
Cohesion: 0.24
Nodes (11): Signed-out account gate, Newsletter signup form, adopt(), api(), enter(), refresh(), Account data: email, name, favorites, hashed password, Identical reply whether or not the address has an account (+3 more)

### Community 20 - "mutra-artist.js"
Cohesion: 0.36
Nodes (6): quoteMailto(), render(), socialHtml(), tagsHtml(), trackRow(), wire()

### Community 21 - "mutra-spotlight.js"
Cohesion: 0.42
Nodes (8): buildCard(), buildRow(), openMail(), playable(), NOTE: no mouseenter/mouseleave/focus/blur handlers, on purpose. The, NOTE: scrolling the row out of view no longer stops anything. It used to,, syncFromPlayer(), togglePlay()

### Community 22 - "Privacy policy"
Cohesion: 0.25
Nodes (6): Outbound mail log panel, Anonymous play/page analytics honouring DNT and GPC, Privacy policy, Sub-processors: Cloudflare, GitHub Pages, Resend, GitHub Pages deployment + custom domain, Dependency-free static site (no build step)

### Community 23 - "Track catalogue browse + search"
Cohesion: 0.20
Nodes (8): MUTRA, MUTRA_HL, Track catalogue browse + search, Genre / mood / instrument / scale filter bar, Highlights playback toggle, Sticky bottom player with seek and volume, Content editing via js/data.js and js/mutra-data.js, No change-of-mind refunds on instant delivery

### Community 24 - "watermark.py"
Cohesion: 0.57
Nodes (6): duration(), loudness(), offsets(), Tag placement. Returns [] only when the track is too short to carry one. The…, run(), watermark()

### Community 26 - "schema-analytics.sql"
Cohesion: 0.50
Nodes (3): events, meta, sessions_seen

### Community 29 - "mutra-license.js"
Cohesion: 0.21
Nodes (26): build(), buyerId(), cards(), close(), crumbs(), go(), goToCard(), onCards() (+18 more)

### Community 30 - "stream.js"
Cohesion: 0.46
Nodes (7): breadthExceeded(), handleStream(), json(), looksLikePlayback(), now(), parseRange(), serve()

### Community 31 - "artistreg.js"
Cohesion: 0.62
Nodes (6): ensureArtists(), json(), listArtists(), now(), saveArtist(), splitNames()

### Community 32 - "works.js"
Cohesion: 0.21
Nodes (18): cleanUrl(), CREDIT_KEYS, deleteLogo(), deleteWork(), dropCdnFiles(), json(), listLogos(), listWorks() (+10 more)

## Knowledge Gaps
- **82 isolated node(s):** `SHOWREEL`, `PROJECTS`, `CLIENT_LOGOS`, `nav`, `menuBtn` (+77 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Mutra royalty-free music catalogue page` connect `Mutra royalty-free music catalogue page` to `Mutra Catalogue Page`, `Licence terms`, `works-admin.js`, `site-edit.js`, `account-ui.js`, `openPanel`, `Owner dashboard`, `Snowstar agency homepage`, `account.js`, `mutra-artist.js`, `mutra-spotlight.js`, `Privacy policy`, `Track catalogue browse + search`, `mutra-license.js`?**
  _High betweenness centrality (0.202) - this node is a cross-community bridge._
- **Why does `Snowstar agency homepage` connect `Snowstar agency homepage` to `main.js`, `works-admin.js`, `Mutra royalty-free music catalogue page`, `site-edit.js`, `account-ui.js`, `Owner dashboard`, `account.js`, `Privacy policy`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Why does `Owner dashboard` connect `Owner dashboard` to `Licence terms`, `dashboard.js`, `Mutra royalty-free music catalogue page`, `account-ui.js`, `Snowstar agency homepage`, `account.js`, `Privacy policy`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `render()` (e.g. with `matches()` and `wireBpmRange()`) actually correct?**
  _`render()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `SHOWREEL`, `PROJECTS`, `CLIENT_LOGOS` to the rest of the system?**
  _82 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05293931731984829 - nodes in this community are weakly interconnected._
- **Should `Mutra Catalogue Page` be split into smaller, more focused modules?**
  _Cohesion score 0.0741687979539642 - nodes in this community are weakly interconnected._