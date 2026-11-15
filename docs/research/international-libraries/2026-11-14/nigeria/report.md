# Nigeria library expansion research

**Result: ten institutions returned books for specific-title queries: six selected candidates and four reserves. The goal of ten large selected targets remains unmet.** Four of the ten major-priority institutions passed live query verification. KASU and NIALS are useful selected candidates whose national size rank remains unproven; the four reserves below do not fill the large-collection gap.

Checks ran on **15 November 2026 UTC**; the parent research directory retains 14 November as its task date. All successes below came from direct HTTP responses saved in `evidence/`, not indexed snippets. No live app integration test was run and no integration permission was obtained; the separate offline parser audit does not establish live connector readiness.

## Market and highest-value unlock

Start with **Koha and NOUN**. A 2025 published survey reports Koha at 21 of 40 responding federal-university libraries (52.5%, target 43). This is evidence of concentration in that segment, not a national market-share estimate. Its table mixes repositories with ILS and its individual installations need current verification; for example, this investigation sees NewGenLib at Lagos and Benin. [Study and methods](https://acadrespub.com/index.php/oijlis/article/view/83).

NOUN has one functioning integrated catalog with **42 named branch/unit choices** covering study centres and faculty/central units. Those are candidate holdings locations, not 42 separately verified libraries or 42 deployments. A targeted search returned a headquarters record with two available copies. Reusing the Koha family potentially gives the best first deployment-to-location ratio; confirm actual coverage branch by branch. [Live catalog](https://koha.nou.edu.ng/).

The National Library offers the largest documented public-service opportunity: approximately **5.2 million titles / 13.9 million volumes and presence in 33 states plus FCT**, reported 20 August 2024. None of these counts proves OPAC index coverage. Its robots policy disallows automated search and detail paths, so it is an institutional-partnership candidate rather than a verified connector. [Official collection/network statement](https://www.nln.gov.ng/news-details.php?post_Id=97&title=National+Library+Engages+Stakeholders+in+Southwest).

Other significant networks include ABU’s main/academic/research complex (about 10 libraries in its 2023/24 handbook), and Babcock’s main library plus 10 branches. Babcock advertises 90,477+ volumes and external/community membership, but its catalog disallows all wildcard crawlers; no query was sent. Branch counts, buildings, and independent catalog deployments must remain separate. [Babcock official service/eligibility page](https://www.babcock.edu.ng/library).

Nigeria is feasible as a **partner-led university rollout**, with a weaker currently verified public-library pathway. Ten book-query successes show concrete technical opportunity, with six selected candidates and four smaller or unquantified reserves. Many other major catalogs either declare automation restrictions, require authentication, or did not answer these probes. This does not establish nationwide outages or lack of infrastructure. Discoverability alone also does not make an academic library’s books borrowable by every app user.

## Ten major priorities, not an asserted national top ten

No comparable recent national ranking was found. Counts mix books, volumes and journals, and come from different years. This is a deliberately major-collection/network shortlist, with dates and scope exposed. NOUN is selected for network reach instead of an unverified size total.

|Institution|Scale evidence (source date)|Platform|Live result|
|---|---|---|---|
|National Library of Nigeria|[Approximately 5.2 million titles/13.9 million volumes; presence in 33 states plus FCT. Collection and geographical presence are not searchable OPAC volume or proven catalog deployments.](https://www.nln.gov.ng/news-details.php?post_Id=97&title=National+Library+Engages+Stakeholders+in+Southwest) (2024-08-20)|Koha|Robots disallows searches/details; no book query attempted.|
|University of Ibadan — Kenneth Dike Library|[Over two million mixed physical volumes across the university library system; books, journals, dissertations, reports and monographs. Current guide names medical plus 26 faculty/department/institute libraries; not solely the Kenneth Dike building.](https://library.ui.edu.ng/library-guide) (undated; observed 2026)|UIILS (official current guide)|Old IP route timed out; published ils.library.ui.edu.ng returns an explicit environment routing error. No live book query recovered.|
|Obafemi Awolowo University|[Over 800,000 volumes on undated current official page. Earlier official 2023 recruitment advert gives 700,000; not a current audited census.](https://holibrary.oauife.edu.ng/about-us/) (undated; observed 2026)|Koha|Verified: My watch, 2 records; one with 3 available copies.|
|University of Nigeria — Nnamdi Azikiwe Library|[735,157 books and 99,760 bound journal volumes, undated official page. Not asserted as 2026 inventory.](https://www.unn.edu.ng/academics/overview/) (undated; observed 2026)|Koha|Specific title query 503 from this environment.|
|University of Lagos Library|[Over 500,000 volumes on undated official postgraduate-school library page.](https://spgs.unilag.edu.ng/?page_id=4213) (undated; observed 2026)|NewGenLib|Verified: Things fall apart, 5 results; availability unknown.|
|Ahmadu Bello University — Kashim Ibrahim Library|[490,000 volumes books/bound and 76,000 periodical volumes; about 10 major academic/research libraries in complex. These are not 10 independently tested catalogs.](https://abu.edu.ng/wp-content/uploads/2024/03/updated-student-handbook-for-2023-2024-session.pdf) (2023/2024 handbook)|Koha current indexed catalog|Specific title query 503 from this environment.|
|University of Benin — John Harris Library|[Over 267,501 book volumes; main John Harris and faculty libraries. Exact inventory reference year not established.](https://uniben.edu/STUDENTHANDBOOK.pdf) (undated handbook; web index indicates approximately 2022/23)|NewGenLib|Verified: Things fall apart, 1 result; local availability unknown.|
|Federal University of Agriculture Abeokuta — Nimbe Adedipe Library|[214,162 books/monographs and 16,365 bound journals; historical plan values, not 2026 audited stock.](https://funaab.edu.ng/wp-content/uploads/FUNAAB-2021-2025-Strategic-Plan.pdf) (2021–2025 strategic plan)|Koha|Homepage 503 and specific-title timeout from this environment.|
|University of Ilorin Library|[Over 100,000 volumes on official undated page.](https://universitylibrary.unilorin.edu.ng/about/achievements/) (undated; observed 2026)|Koha|Official OPAC returned 401; stopped at auth boundary.|
|National Open University of Nigeria library network|[42 named branch/unit choices in branch selector, one integrated catalog; no current institution-wide print collection total established.](https://koha.nou.edu.ng/) (2026-11-15 live observation)|Koha|Verified: specific title redirects to record 2553 with 2 Available copies.|

## Six selected specific-title successes

All were anonymous requests; each requires separate permission, eligibility and app integration validation. Records with matching titles remain separate editions/catalog identities.

### National Open University of Nigeria integrated library catalog

Abuja headquarters; nationwide study centres/faculty units · Federal distance-learning university network · **Koha**. [Scale/selection source](https://koha.nou.edu.ng/): 42 named branch/unit choices in branch selector, one integrated catalog; no current institution-wide print collection total established.

**Query:** `The foundations of behavioral economic analysis`. [Exact executed search](https://koha.nou.edu.ng/cgi-bin/koha/opac-search.pl?idx=ti&q=The%20foundations%20of%20behavioral%20economic%20analysis). HTTP 200 at `2026-11-15T06:12:27.633707+00:00`; 5.62s. Displayed count: Specific title search redirects directly to record 2553; no displayed count inferred. Snapshot: `evidence/noun-specific.html`.

- [The foundations of behavioral economic analysis](https://koha.nou.edu.ng/cgi-bin/koha/opac-detail.pl?biblionumber=2553) — Sanjit S. Dhami; record `2553`. Detail lists 2 copies, both Available at Gabriel Afolabi Ojo Central Library (Headquarters), HB74 .D43 2016.

**Policy and access:** robots.txt returned 404; no retrieved prohibition; terms/permission not cleared. Anonymous search and detail access confirmed. Borrowing and licensed resources require institutional eligibility; general-public lending not verified.

**App work:** Existing server/providers/koha.js family is a candidate for reuse; requires provider configuration, holdings semantics and deadline checks. Direct query success is not adapter success.

### University of Lagos Library

Lagos (Akoka/Yaba) · Federal university · **NewGenLib**. [Scale/selection source](https://spgs.unilag.edu.ng/?page_id=4213): Over 500,000 volumes on undated official postgraduate-school library page.

**Query:** `Things fall apart`. [Exact executed search](http://librarydb.unilag.edu.ng/newgenlibctxt/Search?searchText=Things+fall+apart&SelectedUnixNames=&From=Library&ResultSetOffset=1&LibraryId=1&FormName=Books&ApplyFacet=false&AuthorSearch=&SubjectSearch=&ClassNumberSearch=&NewSearch=false&ExactAFId=&SortField=&Index=Title). HTTP 200 at `2026-11-15T06:12:52.429148+00:00`; 2.47s. Displayed count: 5. Snapshot: `evidence/lagos-specific.html`.

- [Things fall apart](http://librarydb.unilag.edu.ng/newgenlibctxt/View?From=Library&CatId=24417&OwnLibId=1&Position=1&RecordsFound=5&CurrentPage=1&LibraryId=1) — Chinua Achebe; record `24417`. Public detail has call number PR9899 .A2 .T5; holdings tab empty. Public availability-summary POST 200 with empty contents; local copies and loan availability unknown.
- [Things Fall Apart](http://librarydb.unilag.edu.ng/newgenlibctxt/View?From=Library&CatId=63645&LibraryId=1) — Chinua, Achebe; record `63645`. Separate record from search; not merged with 24417.

**Policy and access:** Official OPAC is HTTP; /robots.txt returned 404. No permission clearance. Anonymous search and details confirmed; registration/ID and separate credentials govern borrowing/reservation.

**App work:** NewGenLib has no existing provider or discoveryAcademic kind; new adapter required. Public title search works, but local copy availability was not returned by tested detail/holdings views. HTTP-only official origin also needs explicit engineering review.

### Obafemi Awolowo University — Hezekiah Oluwasanmi Library

Ile-Ife · Federal university · **Koha**. [Scale/selection source](https://holibrary.oauife.edu.ng/about-us/): Over 800,000 volumes on undated current official page. Earlier official 2023 recruitment advert gives 700,000; not a current audited census.

**Query:** `My watch`. [Exact executed search](https://opac.oauife.edu.ng/cgi-bin/koha/opac-search.pl?idx=ti&q=My%20watch). HTTP 200 at `2026-11-15T06:13:10.847960+00:00`; 14.39s. Displayed count: 2. Snapshot: `evidence/oau-specific.html`.

- [My watch](https://opac.oauife.edu.ng/cgi-bin/koha/opac-detail.pl?biblionumber=330) — Olusegun Obasanjo; record `330`. Search states no items available. Detail request timed out.
- [My watch](https://opac.oauife.edu.ng/cgi-bin/koha/opac-detail.pl?biblionumber=585) — Olusegun Obasanjo; record `585`. Search states 3 copies available for loan at Hezekiah Oluwasanmi Library; call DT515.83 .Ob1.

**Policy and access:** robots.txt attempts timed out; permission status unresolved. Anonymous search confirmed. University borrower eligibility applies; outsiders not verified.

**App work:** Existing server/providers/koha.js family is a candidate for reuse; requires provider configuration, holdings semantics and deadline checks. Direct query success is not adapter success. Specific search took 14.39 s and record fetch timed out, so app deadline/reliability needs validation.

### University of Benin — John Harris Library

Benin City · Federal university · **NewGenLib**. [Scale/selection source](https://uniben.edu/STUDENTHANDBOOK.pdf): Over 267,501 book volumes; main John Harris and faculty libraries. Exact inventory reference year not established.

**Query:** `Things fall apart`. [Exact executed search](https://ir.uniben.edu/newgenlibctxt/Search?searchText=Things+fall+apart&SelectedUnixNames=&From=Library&ResultSetOffset=1&LibraryId=1&FormName=Books&ApplyFacet=false&AuthorSearch=&SubjectSearch=&ClassNumberSearch=&NewSearch=true&ExactAFId=&SortField=&Index=Title). HTTP 200 at `2026-11-15T06:17:58.333026+00:00`; 1.8s. Displayed count: 1. Snapshot: `evidence/benin-specific.html`.

- [Things fall apart](https://ir.uniben.edu/newgenlibctxt/View?From=Library&CatId=145&OwnLibId=1&Position=0&RecordsFound=1&CurrentPage=1&LibraryId=1) — Chinua Achebe; record `145`. Public record has call 808.3 ACT 1958; local holdings tab and availability-summary response empty. MARC contains imported EWU/Oxford fields; those are not proof of Benin holdings.

**Policy and access:** robots wildcard Allow: /; Cloudflare Content-Signal search=yes, ai-train=no, use=reference. Named training bots disallowed. No reuse/partnership permission inferred. Anonymous search/detail and public statistics confirmed. University membership governs borrowing; login required for actions.

**App work:** NewGenLib has no existing provider or discoveryAcademic kind; new adapter required. Public title search works, but local copy availability was not returned by tested detail/holdings views.

### Kaduna State University Library

Kaduna · State university · **Koha**. [Scale/selection source](https://kasu.edu.ng/library/): Official state-university library and school-ID eligibility. No defensible current institution-wide collection total located. Departmental5,000-volume template pages not summed.

**Query:** `Principles of Economics`. [Exact executed search](https://opac.kasu.edu.ng/cgi-bin/koha/opac-search.pl?idx=ti&q=Principles%20of%20Economics). HTTP 200 at `2026-11-15T06:20:28.528238+00:00`; 7.65s. Displayed count: 2. Snapshot: `evidence/kasu-specific.html`.

- [Principles of Economics](https://opac.kasu.edu.ng/cgi-bin/koha/opac-detail.pl?biblionumber=1989) — N. Gregory Mankiw; record `1989`. Detail explicitly has 0 holdings/no physical items.
- [Principles of Economics](https://opac.kasu.edu.ng/cgi-bin/koha/opac-detail.pl?biblionumber=1774) — David C. Colander; record `1774`. Search shows 11th edition, McGraw-Hill 2016,1 copy available for loan at Kaduna State University Library. Detail request returned 500.

**Policy and access:** robots.txt returned 404; no retrieved prohibition; terms/permission not cleared. Anonymous search/detail confirmed. Official library page requires school identity card. External borrowing not verified.

**App work:** Existing server/providers/koha.js family is a candidate for reuse; requires provider configuration, holdings semantics and deadline checks. Direct query success is not adapter success.

### Nigerian Institute of Advanced Legal Studies — Taslim Elias Olawale Library

Lagos (Akoka/Yaba) · Federal legal research institute · **Koha**. [Scale/selection source](https://nials-nigeria.org/nwlt/newsletter_jun2009.pdf): 13,102 titles / 48,997 monograph and periodical volumes. Historical only; national top ten rank not established.

**Query:** `The economics of justice`. [Exact executed search](https://opac.nials.edu.ng/cgi-bin/koha/opac-search.pl?idx=ti&q=The%20economics%20of%20justice). HTTP 200 at `2026-11-15T06:20:28.528997+00:00`; 3.89s. Displayed count: 2. Snapshot: `evidence/nials-specific.html`.

- [The economics of justice](https://opac.nials.edu.ng/cgi-bin/koha/opac-detail.pl?biblionumber=308) — Richard A. Posner; record `308`. 1981 Harvard University Press; detail shows1 Available copy, Ground Floor, KA35 .P6.
- [The Economics of Justice](https://opac.nials.edu.ng/cgi-bin/koha/opac-detail.pl?biblionumber=3821) — Richard A. Posner; record `3821`. Search shows1 available copy at Ademola Adetokunbo Collections and 1 at First Floor, JC578 .P67.

**Policy and access:** robots.txt returned 404; no retrieved prohibition; terms/permission not cleared. Anonymous search/detail confirmed. Postgraduate legal research mission; general-public membership/borrowing not verified.

**App work:** Existing server/providers/koha.js family is a candidate for reuse; requires provider configuration, holdings semantics and deadline checks. Direct query success is not adapter success.









<!-- continuation-reserves:start -->
## Four additional query-verified reserves

These are genuine searches with saved book records. They are **not substitutes for the largest-library targets**: current collection scale is smaller, unquantified, or online coverage appears sparse. All four remain untested in the app and lack integration permission clearance.

### Nigerian Institute of Social and Economic Research Library

Ibadan, Oyo State · Federal social and economic policy research institute · **ERAILS custom Django OPAC** · **Reserve**.

**Scale:** About 18,000 bound volumes personally observed in January 1972 (Library of Congress, 1973, printed page 5). Historical specialist scale only; current physical collection total unknown. The current 13K+ e-resource counter is not a print-holdings count. [Source](https://files.eric.ed.gov/fulltext/ED089698.pdf#page=10).

**Query:** `Nigeria: Crisis and Beyond`. [Exact executed search](https://publications.niser.gov.ng/library/opac/initial/?attr=Title&type=Book&search=Nigeria:%20Crisis%20and%20Beyond). HTTP 200 at `2026-11-15T07:10:01.387213+00:00`. One matching book card observed; no explicit total-results count captured. Snapshot: `continuation-additional/evidence/niser-get-query.html`.

- [Nigeria: Crisis and Beyond](https://publications.niser.gov.ng/opac/819/) — JOHN OYINBO; record `819`. NISER LIBRARY selected; Shelf Number 13; classification 966.9OYI. Detail says Call Numbers: Not Registered. No loan status stated.

**Policy and access:** Robots returned 404. No retrieved path prohibition; this is not permission clearance. Anonymous book query and detail verified. External membership and borrowing eligibility were not established.

**App work:** Unauthenticated GET replay works; initial search form POST uses anonymous CSRF cookie. Custom parser needed; no patron login used.

**Limitations:** Current physical collection total and largest status unproven; historical 18,000 bound volumes is a 1972 observation, not current inventory. Institution main about page returned unrelated casino content; do not rely on that page for authority or scale. OPAC has official niser.gov.ng subdomain and NISER LIBRARY selector.

### Bishop Gabriel Oloniyo Public Digital Library / Ekiti State Library Board

Ado-Ekiti, Ekiti State · State public library · **Koha** · **Reserve**.

**Scale:** State-owned public library, inaugurated 2024; board manages state services and supports local/school libraries, but this OPAC has only one verified branch. Do not treat all Ekiti local/school libraries as already integrated or claim largest status. [Source](https://www.ekitistate.gov.ng/archives/29079).

**Query:** `English for Business Communication`. [Exact executed search](https://opac.ekitistatelibrary.org/cgi-bin/koha/opac-search.pl?idx=ti&q=English+for+Business+Communication). HTTP 200 at `2026-11-15T07:05:05.305691+00:00`. Exact title search redirects to record 50; no displayed result count inferred. Snapshot: `continuation-additional/evidence/ekiti-exact.html`.

- [English for Business Communication (Routledge Applied English Language Introductions).](https://opac.ekitistatelibrary.org/cgi-bin/koha/opac-detail.pl?biblionumber=50) — Chan, Mable; record `50`. Bishop Gabriel Oloniyo Public Digital Library, Ekiti State; General stacks; call number 808.066; Available; barcode 2026-0050.

**Policy and access:** Robots returned 404. No retrieved path prohibition; this is not permission clearance. State public-library service and anonymous catalog access verified; borrowing registration, fees and eligibility remain unverified. Only one OPAC branch verified.

**App work:** Koha HTML adapter likely reusable; exact title auto-redirects to detail and exposes a local holding. Query Things fall apart returned zero (not a success); English returned multiple real book records.

**Limitations:** Unknown physical collection total; useful public-access pilot rather than demonstrated national-largest institution.

### Mountain Top University Library

Ibafo, Ogun State · Private university · **Lopac (current OPAC footer; older library webpage mentions Koha)** · **Reserve**.

**Scale:** Main Library facet displays 11,722 on both one-result title searches; four library options: Main, CBAS, CHMS, Medical. Facet appears global, including unrelated author facets. Treat 11,722 only as displayed metadata, not audited physical volumes or book count. [Source](https://opac.mtu.edu.ng/).

**Query:** `Introduction To Conflict Resolution`. [Exact executed search](https://opac.mtu.edu.ng/search?idx=ti&q=Introduction+To+Conflict+Resolution). HTTP 200 at `2026-11-15T07:09:23.916212+00:00`. Displayed result count: 1. Snapshot: `continuation-additional/evidence/mtu-query.html`.

- [Introduction To Conflict Resolution](https://opac.mtu.edu.ng/record/9204) — COBB, Sara, FEDERMAN, Sarah And CASTEL, Alison; record `9204`. Main Library; Main Stacks; Books; JZ5538.C63; barcode/accession 09907; accession date 2026-09-18; Available.

**Policy and access:** Robots returned 200 and allows the tested /search and /record/ routes. Raw rules mention branch/sort query restrictions; those facets were not used. The current app parser denies branch variants but permits sort variants because an equally specific Allow rule wins. No permission clearance inferred. Anonymous book query and detail verified. External membership and borrowing eligibility were not established.

**App work:** Custom Lopac HTML parser required. Tested routes: /search?idx=ti&q=... and /record/{id}. Preserve record identities and local holdings. Branch/sort facets were not used in this research.

**Limitations:** Current official library homepage under construction and old /library/404. Catalog is institution branded on edu.ng subdomain. Not proven national-largest; smaller university candidate with local holding proof.

### Federal University Lokoja Library

Lokoja, Kogi State · Federal academic university library · **Koha** · **Reserve**.

**Scale:** 9,000 book titles, historical institution-level count; current searchable coverage unknown. [Source](https://www.fulokoja.edu.ng/news-page.php?a=updated-ful-vc-prof-angela-miri-holds-pre-convocation-press-briefing-unveils-achievements&i=280).

**Query:** `The Wiley-Blackwell Companion to Sociology`. [Exact executed search](https://opac.fulokoja.edu.ng/cgi-bin/koha/opac-search.pl?q=The%20Wiley-Blackwell%20Companion%20to%20Sociology). HTTP 200 at `2026-11-15T07:10:43.450192+00:00`. Exact title query resolves directly to the one matching record; no search-results count displayed in final response. Snapshot: `evidence/continuation/ibadan/lokoja-title-search.html`.

- [THE WILEY-BLACKWELL COMPANION TO SOCIOLOGY](https://opac.fulokoja.edu.ng/cgi-bin/koha/opac-detail.pl?biblionumber=11) — GEORGE RITZER; record `11`. One Available copy at Federal University Lokoja Library, General stacks, Non-fiction; call number HM561THE; barcode 2026-0014.

**Policy and access:** 404: application policy treats as no robots restrictions; origin returned Koha 404 page. Published Terms of Use and Privacy Policy links returned 404; integration permission not established. Anonymous title search and record/holdings retrieval succeeded. Holds and patron account functions require login. Historic 2019 university statement opens library to non-staff/non-students subject to rules; borrowing eligibility not independently verified.

**App work:** Koha family potentially reusable. Live app adapter not tested. Exact-title query auto-resolves to detail page; existing result parser must handle/verify this path. Broad search HTML saved for offline parser replay.

**Limitations:** 9,000 titles is a 2019 historical count, not proof of current large collection or national top ten. Economics and biology returned 0 and the query “the” returned only 2; online coverage may be very sparse. Do not treat two campuses as two institutions. RSS alias opac-fulokoja.koha.org.ng currently identifies Proposed Al-Ummah University; wrong tenant, excluded. Current app integration and permission clearance remain unverified.

The full request metadata and additional title probes are in `continuation-additional/evidence.json` and `evidence/continuation/ibadan/lokoja-success.json`. The focused NISER/Ekiti size assessment is in `continuation-additional/size-evidence.md`. Collection evidence is kept separate from live catalog counts.

<!-- continuation-reserves:end -->

## Failures, exclusions and follow-up

The detailed machine-readable probe inventory is in `findings.json`; per-probe JSON records preserve request time, URL, status/error and snapshot path. Major unsuccessful candidates remain in the ten-priority table; additional checks included Jos, Central Bank, Abuja, Babcock, Covenant, LAUTECH, FUNAAB, Ilorin, Port Harcourt, Calabar, FUTMinna/FUTO/FUTA, LASU/Uyo/Bayero, and further universities.

- **Automation restriction:** National Library, Jos, Nile, Redeemer’s, Bowen, Adeleke, Babcock and Covenant. Covenant uses Primo/COLRIS; its robots disallows `/discovery/search` and `/primaws`. These search restrictions were not bypassed.
- **Auth boundary:** Ilorin’s OPAC returned 401. ESUT’s live official search and detail links redirected to login. Lagos Business School returned an Anubis anti-bot page. No credentials or access bypass attempted.
- **No returned books:** Abuja’s two publicly indexed Koha hosts returned real zero-result pages for broad searches; its main OPAC also returned zero for a known indexed title. University of Africa Toru-Orua returned zero for economics and the homepage-listed title Pragmatics. Neither is counted as a success, and neither result proves that the collection contains no books.
- **Current official endpoints that failed here:** Port Harcourt links `http://delopac.uniport.edu.ng`; Calabar’s libraryLinktree points to `http://38.17.48.240:8080/newgenlibctxt/`; FUTMinna’s resources page links `http://opac.futminna.edu.ng:8054/`. Each timed out. LASU’s official eLibrary redirected to a suspended-host page.
- **503/timeouts from this environment:** ABU, UNN, FUNAAB, Central Bank, AUN, LAUTECH and others. Secondary web-tool exact-title retrievals were also unavailable for ABU, CBN, ABUAD, KWASU and LAUTECH. Origin-versus-egress fault was not established; no general outage claim is made.
- **Final large-university checks:** Bayero has a current official homepage but its displayed search field has no submitted parameter or search action/handler. UNIZIK’s official footer links `https://opac.unizik.edu.ng:83`; this endpoint was tested separately. Modibbo Adama’s official library page describes credentialed terminals and off-campus databases, but no public physical-catalog search was identified. Usmanu Danfodiyo’s repository labels a homepage self-link OPAC; its linked eLibrary was investigated separately. These are not counted as book-query successes.
- **Important metadata limitation:** Benin’s public statistics show25,085 book titles / 33,085 copies, far below the handbook’s institution-wide 267,501+ book volumes. Its tested record includes imported MARC holdings labels from other institutions; these must not be interpreted as local copy availability. Lagos and Benin both return empty public availability summaries for the tested records.

- **Continuation recovery:** newly published ABU public IP and CBN HTTP portal timed out; FUNAAB’s legacy portal stopped at robots 503. Ibadan and a UNN legacy alias returned the explicit environment diagnostic “No approved upstream IPv4 address”; this is not an origin-outage finding. FULafia’s official Koha form points to a private 10.x campus address. FUOYE discovery returned no records. Maiduguri’s retrieved eLibrary resource list contained sparse/demo-like data and no physical holdings, so it was excluded. Naijacat’s live demo-scale entries do not substantiate its nationwide marketing counts.

## Engineering recommendation

Pilot NOUN first, then evaluate OAU, KASU and NIALS using the existing Koha family with real adapter tests and explicit terms/permission review. OAU’s successful request took 14.39 s, while its detail timed out; performance must be tested against the app’s deadline. NewGenLib requires a new family for Lagos/Benin, including the public holdings AJAX semantics and edition identity preservation. The official Lagos endpoint is HTTP, which needs explicit handling; never silently disableTLSverification.

There are **ten observed query-verified institutions, six selected candidates and four reserves**. The remaining gap is four additional sufficiently large selected targets, plus collection-rank evidence; six of the ten major-priority institutions still lack verified live searches. Institution-assisted validation or explicit agreements for restricted major catalogs would have more impact than padding the shortlist with smaller sites. This report does not claim permission, production readiness or a national top-ten ranking.

## Evidence and reproducibility

`probe.py`, `expand*.py`, `final_probes.py` and `save_sources.py` document the bounded direct-request approach. Catalog and web-page snapshots are capped at 1.5 MB per response. The three historical NISER primary-source PDFs are retained as complete documents; the largest is about 7.1 MB. `evidence-manifest.json` records exact sizes and SHA-256 hashes. `build_report.py` generates the initial report; `merge_continuation.py` then merges preserved continuation evidence without network requests. Both stages are required to regenerate the complete report and `findings.json`. The continuation uses the app’s current robots parser; saved responses support offline parser replay. Re-running probes contacts external sites and must respect their then-current policies; the output alone is sufficient for offline parser replay.

