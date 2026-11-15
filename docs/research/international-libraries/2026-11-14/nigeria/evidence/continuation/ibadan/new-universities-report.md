# Additional federal-university scouting — 15 November 2026

**One additional live title-search success: Federal University Lokoja.** Treat it as a reserve candidate with limited demonstrated online coverage, not a proven member of Nigeria's ten largest libraries. All work is research only; no app adapter or integration permission was tested.

## Federal University Lokoja

The [official library website](https://library.fulokoja.edu.ng/) links its [Koha OPAC](https://opac.fulokoja.edu.ng/). At **07:10:43 UTC**, GET of the exact query **The Wiley-Blackwell Companion to Sociology** returned HTTP 200 and automatically resolved to [record 11](https://opac.fulokoja.edu.ng/cgi-bin/koha/opac-detail.pl?biblionumber=11). A separate record GET also returned HTTP 200.

- Catalogued creator: **GEORGE RITZER**; publication: **Blackwell Publishing Ltd, UK, 2012**; ISBN **978-1-4443-3039-7**.
- Holdings: **one available book**, Federal University Lokoja Library, General stacks, Non-fiction, call number **HM561THE**, barcode **2026-0014**.
- Exact search URL: `https://opac.fulokoja.edu.ng/cgi-bin/koha/opac-search.pl?q=The%20Wiley-Blackwell%20Companion%20to%20Sociology`.
- The exact query redirected to the sole record, so the final response displayed no result count. A prior broad query for `the` returned two records. `economics` and `biology` each returned zero. This is positive evidence for one real book, not proof of broad catalog coverage.
- An [official 9 December 2019 statement](https://www.fulokoja.edu.ng/news-page.php?a=updated-ful-vc-prof-angela-miri-holds-pre-convocation-press-briefing-unveils-achievements&i=280) reports **9,000 book titles** and admits non-staff/non-students subject to library rules. The number is historical, not a current total. Current borrowing eligibility was not independently verified.
- Anonymous search and holdings access worked. Patron account and hold functions require login. OPAC robots returned 404; the app's current policy treats that as no robots restriction. Published terms/privacy links also returned 404; integration permission remains unresolved.
- The Koha family is potentially reusable, subject to parser replay and live adapter testing. The exact-title redirect to a detail page needs explicit handling. Both broad-results HTML and detail HTML are saved.
- The catalog's RSS alias, `opac-fulokoja.koha.org.ng`, returned a different institution's branding, **Proposed Al-Ummah University**, on its robots-error page. It is excluded as an unreliable alternate tenant; use the official university OPAC domain.

Full query, timestamp and holdings details are in `lokoja-success.json`; raw search/record responses are in `lokoja-title-search.html`, `lokoja-record-11.html`, and `lokoja-the.html`.

## Exclusions and blockers

| Institution | Observed result | Counted? |
|---|---|---|
| Nigerian Defence Academy | Official page claims 45,000+ volumes/books, but current discovery embeds only eight materials: seven magazines/reports and one biography. A biography detail page works; title-query response is a client-rendered shell without verified rendered results. Its “KOHA” link points to the generic Koha community site. | No |
| Federal University Wukari | Official library page and robots returned HTTP 421 SNI mismatch; no alternative public OPAC recovered. | No |
| Federal University Kashere | Official page works and links `fukdiglib.fukashere.edu.ng`; that host's robots returns an explicit environment upstream-address error. | No |
| Federal University Gusau | Official library host returns 404. Main-site collection counts contradict each other and the page contains unrelated spam; no size count accepted. | No |
| JOSTUM / Agriculture Makurdi | Robots HTTP 503, upstream connection timeout; stopped under current application policy. | No |
| Federal University Dutsin-Ma | Official homepage links a library host whose robots returns HTTP 503, connection termination; stopped under current policy. | No |
| Federal University Birnin Kebbi | Current homepage library label has no link. Historically published library host returns explicit environment upstream-address error. | No |
| Federal University Gashua | Current homepage exposes no OPAC; historically published library page returns 404. | No |

These failures do not establish that an institution's books or local catalog are absent, or that any service is nationally unavailable. Default TLS validation was preserved; no login, routing bypass, private address, or blocked machine route was used. `new-universities.json` contains the compact institution inventory and evidence manifest; request-side timestamps and statuses are retained in the individual JSON files.
