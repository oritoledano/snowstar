# Graph Report - snowstar  (2026-08-24)

## Corpus Check
- 53 files · ~337,342 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 571 nodes · 1339 edges · 35 communities (27 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d2ae6663`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.js
- mutra-page.js
- licensing.js
- main.js
- oauth.js
- dashboard.js
- works-admin.js
- bulk.js
- account-ui.js
- artists-page.js
- site-edit.js
- openPanel
- hyp.js
- Snowstar.Company — new website
- mutra-license.js
- mutra-artist.js
- mutra-spotlight.js
- stream.js
- watermark.py
- artistreg.js
- account.js
- data.js
- mutra-artist-data.js
- mutra-data.js
- mutra-highlights.js
- mutra-similar.js
- mutra-spotlight-data.js
- mutra-waves.js
- make-stream-renditions.sh
- users
- analytics.js
- schema-analytics.sql
- schema-tracks.sql

## God Nodes (most connected - your core abstractions)
1. `handle()` - 100 edges
2. `appendPage()` - 19 edges
3. `render()` - 18 edges
4. `load()` - 16 edges
5. `paint()` - 14 edges
6. `toggle()` - 14 edges
7. `openEditor()` - 12 edges
8. `finishOAuth()` - 12 edges
9. `json()` - 12 edges
10. `openPanel()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `paint()` --indirect_call--> `mount()`  [INFERRED]
  js/mutra-artist-lightbox.js → js/works-admin.js
- `favorites_new` --references--> `users`  [EXTRACTED]
  worker/schema-account.sql → worker/schema.sql
- `identities` --references--> `users`  [EXTRACTED]
  worker/schema-account.sql → worker/schema.sql
- `password_resets` --references--> `users`  [EXTRACTED]
  worker/schema-account.sql → worker/schema.sql
- `handle()` --calls--> `handleTrack()`  [EXTRACTED]
  worker/src/index.js → worker/src/analytics.js

## Import Cycles
- None detected.

## Communities (35 total, 8 thin omitted)

### Community 0 - "index.js"
Cohesion: 0.06
Nodes (95): AUDIO_EXT, cleanupOrphanUploads(), createSubmission(), json(), listArtistsAdmin(), listSubmissions(), myUploads(), now() (+87 more)

### Community 1 - "mutra-page.js"
Cohesion: 0.07
Nodes (63): addCurateControls(), appendPage(), applyOverrides(), clearFilters(), closeDrawer(), closePlayer(), cycle(), drawDrop() (+55 more)

### Community 2 - "licensing.js"
Cohesion: 0.28
Nodes (18): clean(), createRequest(), declineRequest(), freezeText(), GRANT_REASONS, grantFromDashboard(), grantLicence(), json() (+10 more)

### Community 3 - "main.js"
Cohesion: 0.07
Nodes (30): applyWorkFilter(), buildClientRows(), buildMarqueeRow(), buildWorkGrid(), cardObserver, categorize(), cg, FACETS (+22 more)

### Community 4 - "oauth.js"
Cohesion: 0.14
Nodes (29): b64url(), bounce(), claimHandoff(), enc, facebookDataDeletion(), finishOAuth(), issueSession(), KILL_LEGACY_COOKIE (+21 more)

### Community 5 - "dashboard.js"
Cohesion: 0.22
Nodes (25): gate(), gauge(), load(), openDeclEditor(), openMember(), paint(), paintAlerts(), paintArtists() (+17 more)

### Community 6 - "works-admin.js"
Cohesion: 0.18
Nodes (23): build(), open(), paint(), requestClose(), addLogo(), api(), buildLogosModal(), buildModal() (+15 more)

### Community 7 - "bulk.js"
Cohesion: 0.16
Nodes (22): applyOps(), bulkArtist(), bulkEdit(), bulkUndo(), clean(), diffOf(), json(), keyOf() (+14 more)

### Community 8 - "account-ui.js"
Cohesion: 0.23
Nodes (18): close(), closeAcctPanel(), countFor(), drawerFor(), loadDrawer(), offerSignIn(), open(), paintAcctHead() (+10 more)

### Community 9 - "artists-page.js"
Cohesion: 0.22
Nodes (18): addCollabRow(), addControllerRow(), api(), collabData(), controllerData(), initBehalf(), paintClaim(), paintCredits() (+10 more)

### Community 10 - "site-edit.js"
Cohesion: 0.29
Nodes (18): boot(), buildPill(), enterDraw(), enterText(), exitDraw(), exitText(), finishDrawing(), injectCss() (+10 more)

### Community 11 - "openPanel"
Cohesion: 0.21
Nodes (17): build(), clearAll(), openPanel(), applyAvatar(), artistNames(), describe(), fmt(), paintSuggestions() (+9 more)

### Community 12 - "hyp.js"
Cohesion: 0.33
Nodes (13): configured(), CP1255, decodeValue(), handleReturn(), hypStatus(), json(), listStale(), now() (+5 more)

### Community 13 - "Snowstar.Company — new website"
Cohesion: 0.15
Nodes (12): Brand assets in the nav, Editing content, Live deployment (GitHub Pages — free), MutrA is its own page, MutrA music catalog (built), Point snowstar.company at it (when ready to leave Wix), Production TODO, Run locally (+4 more)

### Community 14 - "mutra-license.js"
Cohesion: 0.40
Nodes (10): build(), close(), goToCard(), open(), openMail(), paint(), resumePending(), showPaymentOutcome() (+2 more)

### Community 16 - "mutra-artist.js"
Cohesion: 0.36
Nodes (6): quoteMailto(), render(), socialHtml(), tagsHtml(), trackRow(), wire()

### Community 17 - "mutra-spotlight.js"
Cohesion: 0.42
Nodes (8): buildCard(), buildRow(), openMail(), playable(), NOTE: no mouseenter/mouseleave/focus/blur handlers, on purpose. The, NOTE: scrolling the row out of view no longer stops anything. It used to,, syncFromPlayer(), togglePlay()

### Community 18 - "stream.js"
Cohesion: 0.46
Nodes (7): breadthExceeded(), handleStream(), json(), looksLikePlayback(), now(), parseRange(), serve()

### Community 19 - "watermark.py"
Cohesion: 0.57
Nodes (6): duration(), loudness(), offsets(), Tag placement. Returns [] only when the track is too short to carry one. The…, run(), watermark()

### Community 20 - "artistreg.js"
Cohesion: 0.62
Nodes (6): ensureArtists(), json(), listArtists(), now(), saveArtist(), splitNames()

### Community 21 - "account.js"
Cohesion: 0.60
Nodes (4): adopt(), api(), enter(), refresh()

### Community 22 - "data.js"
Cohesion: 0.50
Nodes (3): CLIENT_LOGOS, PROJECTS, SHOWREEL

### Community 32 - "users"
Cohesion: 0.16
Nodes (17): favorites_new, identities, oauth_states, password_resets, users_new, attempts, favorites, admin_log (+9 more)

### Community 33 - "analytics.js"
Cohesion: 0.15
Nodes (26): alertsMuted(), handleDownload(), handleJourney(), handleStats(), handleTrack(), json(), listAlerts(), logAlert() (+18 more)

### Community 34 - "schema-analytics.sql"
Cohesion: 0.50
Nodes (3): events, meta, sessions_seen

## Knowledge Gaps
- **75 isolated node(s):** `SHOWREEL`, `PROJECTS`, `CLIENT_LOGOS`, `nav`, `menuBtn` (+70 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `handle()` connect `index.js` to `analytics.js`, `licensing.js`, `oauth.js`, `bulk.js`, `hyp.js`, `stream.js`, `artistreg.js`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `handleStream()` connect `stream.js` to `index.js`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `finishOAuth()` connect `oauth.js` to `index.js`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `render()` (e.g. with `matches()` and `wireBpmRange()`) actually correct?**
  _`render()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `SHOWREEL`, `PROJECTS`, `CLIENT_LOGOS` to the rest of the system?**
  _75 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0578790141896938 - nodes in this community are weakly interconnected._
- **Should `mutra-page.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0741687979539642 - nodes in this community are weakly interconnected._