# Graph Report - snowstar  (2026-08-28)

## Corpus Check
- 71 files · ~380,937 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 865 nodes · 2068 edges · 48 communities (46 shown, 2 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 88 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ccd3d352`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- mutra-agent.js
- mutra-page.js
- bulk.js
- rights.js
- licensing.js
- main.js
- dashboard.js
- works-admin.js
- catalog.js
- Mutra royalty-free music catalogue page
- site-edit.js
- users
- account-ui.js
- artists-page.js
- openPanel
- Licence terms
- Owner dashboard
- Snowstar agency homepage
- mutra-contact.js
- account.js
- mutra-artist.js
- mutra-spotlight.js
- Privacy policy
- Track catalogue browse + search
- watermark.py
- works.js
- schema-analytics.sql
- make-stream-renditions.sh
- schema-tracks.sql
- mutra-license.js
- analytics.js
- hyp.js
- index.js
- certificate.js
- oauth.js
- mutra-artist-panel.js
- clearlist.js
- artistreg.js
- jobs.js
- stream.js
- artists.js
- Portfolio years
- agent.js
- artistprofile.js
- trash.js
- Paying artists their cut
- mutra-analyse.js
- stacks.js

## God Nodes (most connected - your core abstractions)
1. `handle()` - 136 edges
2. `Mutra royalty-free music catalogue page` - 33 edges
3. `render()` - 22 edges
4. `load()` - 21 edges
5. `Snowstar agency homepage` - 19 edges
6. `paint()` - 18 edges
7. `buildRow()` - 18 edges
8. `toggle()` - 16 edges
9. `createRequest()` - 16 edges
10. `Owner dashboard` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Upward tier change credits the earlier payment` --semantically_similar_to--> `Use tiers (digital, corporate, paid, TV, film, radio, commercial)`  [INFERRED] [semantically similar]
  refund.html → terms.html
- `Owner-side track upload and metadata editor` --semantically_similar_to--> `Multi-file track upload flow`  [INFERRED] [semantically similar]
  dashboard.html → artists.html
- `Data deletion request path (30 days, Facebook auto-notify)` --semantically_similar_to--> `Credit note against the original tax invoice`  [INFERRED] [semantically similar]
  privacy.html → refund.html
- `Countersign banner for tracks uploaded on the artist's behalf` --semantically_similar_to--> `Clearance status states (pending / cleared / rejected)`  [INFERRED] [semantically similar]
  artists.html → dashboard.html
- `Instant vs quote licensing lane` --semantically_similar_to--> `Get-a-quote tracks (someone else has a say)`  [INFERRED] [semantically similar]
  artists.html → terms.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Legal frame of a licence purchase (terms, refunds, privacy, contacts, entity)** — terms_licence_version, terms_use_tiers, terms_licence_term_multipliers, terms_vat_and_invoicing, refund_page, privacy_page, contact_email_routing, contact_legal_entity [INFERRED 0.85]
- **Rights clearance pipeline (artist declaration → owner review → licensable lane)** — artists_rights_declaration, artists_co_owner_shares, artists_controller_declaration, artists_countersign_claim, artists_instant_vs_quote_lane, dashboard_submissions_queue, dashboard_clearance_status, terms_quote_only_tracks [INFERRED 0.85]
- **One Snowstar account across catalogue, portal, dashboard and reset** — js_account, js_account_ui, css_account, artists_account_gate, reset_page, dashboard_page, privacy_account_data [INFERRED 0.85]

## Communities (48 total, 2 thin omitted)

### Community 0 - "mutra-agent.js"
Cohesion: 0.44
Nodes (9): build(), catalogueVocab(), chip(), close(), interpret(), open(), paint(), rank() (+1 more)

### Community 1 - "mutra-page.js"
Cohesion: 0.06
Nodes (72): addCurateControls(), paintCls(), appendPage(), applyOverrides(), artistLinks(), buildRow(), clearFilters(), closeDrawer() (+64 more)

### Community 2 - "bulk.js"
Cohesion: 0.18
Nodes (20): applyOps(), bulkArtist(), bulkEdit(), bulkUndo(), clean(), diffOf(), json(), keyOf() (+12 more)

### Community 3 - "rights.js"
Cohesion: 0.23
Nodes (21): mailFrom(), mailLive(), amendDeclaration(), claimStatus(), cleanEmail(), countersignClaim(), createManagedArtist(), freezeText() (+13 more)

### Community 4 - "licensing.js"
Cohesion: 0.08
Nodes (56): applyCoupon(), burnCoupon(), checkCoupon(), clean(), couponAllowsClass(), couponProblem(), findCoupon(), json() (+48 more)

### Community 5 - "main.js"
Cohesion: 0.07
Nodes (30): applyWorkFilter(), buildClientRows(), buildMarqueeRow(), buildWorkGrid(), cardObserver, categorize(), cg, FACETS (+22 more)

### Community 6 - "dashboard.js"
Cohesion: 0.15
Nodes (33): commitReview(), gate(), gauge(), jobsShown(), load(), openDeclEditor(), openMember(), openReviewNote() (+25 more)

### Community 7 - "works-admin.js"
Cohesion: 0.18
Nodes (23): build(), open(), paint(), requestClose(), addLogo(), api(), buildLogosModal(), buildModal() (+15 more)

### Community 8 - "catalog.js"
Cohesion: 0.25
Nodes (16): clean(), deleteTrack(), json(), LIST_FIELDS, listOrigTitles(), listOverrides(), listUses(), now() (+8 more)

### Community 9 - "Mutra royalty-free music catalogue page"
Cohesion: 0.13
Nodes (18): Artist profile page, Artist lookup by ?a= against MUTRA_SPOTLIGHTS, Credits: tracks where you are listed as a rights holder, Artist submission portal, css/account.css — auth UI styles, css/artist.css — artist profile styles, css/mutra.css — Mutra design system (warm palette), css/skins.css — per-product skin variables (+10 more)

### Community 10 - "site-edit.js"
Cohesion: 0.27
Nodes (19): data-txt inline copy-editing hooks, boot(), buildPill(), enterDraw(), enterText(), exitDraw(), exitText(), finishDrawing() (+11 more)

### Community 11 - "users"
Cohesion: 0.16
Nodes (17): favorites_new, identities, oauth_states, password_resets, users_new, attempts, favorites, admin_log (+9 more)

### Community 12 - "account-ui.js"
Cohesion: 0.21
Nodes (20): calLink(), close(), closeAcctPanel(), countFor(), drawerFor(), loadDrawer(), offerSignIn(), open() (+12 more)

### Community 13 - "artists-page.js"
Cohesion: 0.22
Nodes (18): addCollabRow(), addControllerRow(), api(), collabData(), controllerData(), initBehalf(), paintClaim(), paintCredits() (+10 more)

### Community 14 - "openPanel"
Cohesion: 0.21
Nodes (17): build(), clearAll(), openPanel(), applyAvatar(), artistNames(), describe(), fmt(), paintSuggestions() (+9 more)

### Community 15 - "Licence terms"
Cohesion: 0.12
Nodes (23): CLAIM subject-line escalation path, Per-purpose email routing (hello / licensing / submissions / artists / legal), Trading name and sole-trader contracting entity, Contact page, License call-to-action from the player, Data deletion request path (30 days, Facebook auto-notify), Refundable cases (duplicate, failed delivery, unauthorised, rights problem), Credit note against the original tax invoice (+15 more)

### Community 16 - "Owner dashboard"
Cohesion: 0.10
Nodes (25): ACUM / royalties-society registration flag, Who can approve a licence (any vs all), Co-owner share splits (batch or per-track), External controller declaration (label / publisher / distributor), Countersign banner for tracks uploaded on the artist's behalf, Direct-child CSS selectors for nested checkbox labels, Instant vs quote licensing lane, Signed rights declaration on upload (+17 more)

### Community 17 - "Snowstar agency homepage"
Cohesion: 0.15
Nodes (16): css/style.css — homepage design system, Audio Branding service, Mutra teaser section on the homepage, Organization JSON-LD structured data, Original Music service, Snowstar agency homepage, Post Sound / SFX service, Four services section (+8 more)

### Community 18 - "mutra-contact.js"
Cohesion: 0.37
Nodes (12): build(), cards(), close(), crumb(), done(), form(), handoff(), open() (+4 more)

### Community 19 - "account.js"
Cohesion: 0.24
Nodes (11): Signed-out account gate, Newsletter signup form, adopt(), api(), enter(), refresh(), Account data: email, name, favorites, hashed password, Identical reply whether or not the address has an account (+3 more)

### Community 20 - "mutra-artist.js"
Cohesion: 0.36
Nodes (6): quoteMailto(), render(), socialHtml(), tagsHtml(), trackRow(), wire()

### Community 21 - "mutra-spotlight.js"
Cohesion: 0.33
Nodes (8): buildCard(), buildRow(), playable(), NOTE: no mouseenter/mouseleave/focus/blur handlers, on purpose. The, NOTE: scrolling the row out of view no longer stops anything. It used to,, showTrackRow(), syncFromPlayer(), togglePlay()

### Community 22 - "Privacy policy"
Cohesion: 0.25
Nodes (6): Outbound mail log panel, Anonymous play/page analytics honouring DNT and GPC, Privacy policy, Sub-processors: Cloudflare, GitHub Pages, Resend, GitHub Pages deployment + custom domain, Dependency-free static site (no build step)

### Community 23 - "Track catalogue browse + search"
Cohesion: 0.20
Nodes (8): MUTRA, MUTRA_HL, Track catalogue browse + search, Genre / mood / instrument / scale filter bar, Highlights playback toggle, Sticky bottom player with seek and volume, Content editing via js/data.js and js/mutra-data.js, No change-of-mind refunds on instant delivery

### Community 24 - "watermark.py"
Cohesion: 0.57
Nodes (6): duration(), loudness(), offsets(), Tag placement. Returns [] only when the track is too short to carry one. The…, run(), watermark()

### Community 25 - "works.js"
Cohesion: 0.21
Nodes (18): cleanUrl(), CREDIT_KEYS, deleteLogo(), deleteWork(), dropCdnFiles(), json(), listLogos(), listWorks() (+10 more)

### Community 26 - "schema-analytics.sql"
Cohesion: 0.50
Nodes (3): events, meta, sessions_seen

### Community 29 - "mutra-license.js"
Cohesion: 0.22
Nodes (26): build(), buyerId(), cards(), close(), crumbs(), go(), goToCard(), onCards() (+18 more)

### Community 30 - "analytics.js"
Cohesion: 0.13
Nodes (30): alert(), ALERT_KINDS, alertsMuted(), handleDownload(), handleJourney(), handleStats(), handleTrack(), json() (+22 more)

### Community 31 - "hyp.js"
Cohesion: 0.33
Nodes (13): configured(), CP1255, decodeValue(), handleReturn(), hypStatus(), json(), listStale(), now() (+5 more)

### Community 32 - "index.js"
Cohesion: 0.14
Nodes (30): cleanupOrphanUploads(), ALLOWED_ORIGINS, authed(), clearThrottle(), favoritesFor(), fetch(), handle(), json() (+22 more)

### Community 33 - "certificate.js"
Cohesion: 0.52
Nodes (6): certificate(), certificateSvg(), esc(), fmtDate(), json(), wrap()

### Community 34 - "oauth.js"
Cohesion: 0.10
Nodes (38): b64(), enc, pbkdf2(), PBKDF2_ITERS, peppered(), randB64(), safeEqual(), verifyPassword() (+30 more)

### Community 36 - "mutra-artist-panel.js"
Cohesion: 0.44
Nodes (8): albumsOf(), build(), close(), loadRoster(), open(), paint(), socialHtml(), tracksBy()

### Community 37 - "clearlist.js"
Cohesion: 0.42
Nodes (9): addChannel(), allChannels(), clean(), json(), listChannels(), now(), PLATFORMS, removeChannel() (+1 more)

### Community 38 - "artistreg.js"
Cohesion: 0.62
Nodes (6): ensureArtists(), json(), listArtists(), now(), saveArtist(), splitNames()

### Community 39 - "jobs.js"
Cohesion: 0.27
Nodes (10): clean(), exportJobs(), FIELDS, json(), listJobs(), MEDIA, now(), saveJob() (+2 more)

### Community 40 - "stream.js"
Cohesion: 0.46
Nodes (7): breadthExceeded(), handleStream(), json(), looksLikePlayback(), now(), parseRange(), serve()

### Community 41 - "artists.js"
Cohesion: 0.19
Nodes (18): AUDIO_EXT, createSubmission(), json(), listArtistsAdmin(), listSubmissions(), myUploads(), now(), queueReviewMail() (+10 more)

### Community 42 - "Portfolio years"
Cohesion: 0.50
Nodes (3): Not established — nothing found, Portfolio years, Worth a second look — medium confidence

### Community 43 - "agent.js"
Cohesion: 0.48
Nodes (6): clampBpm(), clampList(), extractJson(), interpretBrief(), json(), LIST_FIELDS

### Community 44 - "artistprofile.js"
Cohesion: 0.39
Nodes (11): approveClaim(), clean(), deleteProfile(), json(), listOf(), listProfiles(), managersFor(), parseJson() (+3 more)

### Community 45 - "trash.js"
Cohesion: 0.70
Nodes (4): emptyTrash(), json(), listTrash(), restoreFromTrash()

### Community 46 - "Paying artists their cut"
Cohesion: 0.29
Nodes (6): Paying artists their cut, Recommended strategy, The number to watch, What is built, What is deliberately not built, When to revisit

### Community 47 - "mutra-analyse.js"
Cohesion: 0.39
Nodes (7): analyse(), chroma(), correlate(), detectBpm(), detectKey(), detectVocals(), titleFrom()

### Community 49 - "stacks.js"
Cohesion: 0.70
Nodes (4): clean(), json(), listStacks(), saveStack()

## Knowledge Gaps
- **98 isolated node(s):** `SHOWREEL`, `PROJECTS`, `CLIENT_LOGOS`, `nav`, `menuBtn` (+93 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Mutra royalty-free music catalogue page` connect `Mutra royalty-free music catalogue page` to `mutra-page.js`, `works-admin.js`, `site-edit.js`, `account-ui.js`, `openPanel`, `Licence terms`, `Snowstar agency homepage`, `account.js`, `mutra-artist.js`, `mutra-spotlight.js`, `Privacy policy`, `Track catalogue browse + search`, `mutra-license.js`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._
- **Why does `Snowstar agency homepage` connect `Snowstar agency homepage` to `main.js`, `works-admin.js`, `Mutra royalty-free music catalogue page`, `site-edit.js`, `account-ui.js`, `Owner dashboard`, `account.js`, `Privacy policy`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `Owner dashboard` connect `Owner dashboard` to `dashboard.js`, `Mutra royalty-free music catalogue page`, `account-ui.js`, `Snowstar agency homepage`, `account.js`, `Privacy policy`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `render()` (e.g. with `matches()` and `wireBpmRange()`) actually correct?**
  _`render()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `SHOWREEL`, `PROJECTS`, `CLIENT_LOGOS` to the rest of the system?**
  _98 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `mutra-page.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06487341772151899 - nodes in this community are weakly interconnected._
- **Should `licensing.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07720782654680064 - nodes in this community are weakly interconnected._