# Morocco: library expansion research

**15 November 2026 UTC — 3 observed book-search successes: 1 selected substantial target and 2 specialist reserves. The target of ten selected institutions is short by nine.** Twenty-nine blocked or unverified observations preserve the larger opportunities. This is completed research with a shortfall, not a completed integration or a national largest-ten ranking.

The practical reusable family is **PMB**, observed at two working specialist libraries and an older faculty interface. The only selected success is USMBA’s FLSH Saïs custom GLB catalogue. The largest potential reach lies in **CBM’s federation, the Ministry of Culture’s shared service, and university catalogues**, but this run did not establish their public book responses. IMIST’s physical catalogue must be distinguished from its national thesis repository and journal/e-resource services.

## Marketplace and platform strategy

Morocco combines a national deposit library, ministerial and municipal public libraries, large university collections, specialist institutes and foundations, and foreign cultural-institute networks. Arabic and French are both essential; the successful French title search at Saïs returned an Amazigh translation, so language/edition identity cannot be inferred from the query.

Public-network statistics have different scopes and dates. The [CESE reading report](https://www.cese.ma/media/2024/08/Rapport-Promouvoir-la-lecture.pdf) discusses 609 public libraries in 2016, including 329 under the ministry, while [HCP social indicators](https://www.hcp.ma/file/244142/) reports 272 libraries for 2023. These should not be combined into a current market denominator. No national LMS-share claim is made.

| Family/service | Evidence and implication |
|---|---|
| PMB | Live CJB and INAU searches; FLSH Agadir search-summary interface; [ENA’s official documentation](https://ena.enarabat.ac.ma/cente-de-documentation/) also names PMB. A useful family to adapt, with materially different forms/templates. Existing MyBookshelf PMB code is deployment-specific. |
| Koha | IMIST’s [official homepage](https://bibliotheque.imist.ma/) contains a Koha search form; Ibn Tofail’s official indexed catalogue uses Koha routes. Both catalogue robots requests failed, preventing searches. Existing Koha code is a reuse candidate, not demonstrated compatibility. |
| Symphony | [Library Technology Guides](https://librarytechnology.org/library/196802) records the ministry’s shared system as Symphony from 2015, with an updated entry in November 2026. The live catalogue root independently says Symphony and redirects to a public CGI form; that form timed out. No branch census or book response was established. |
| Virtua / Innovative | [BNRM’s official policy](https://www.bnrm.ma/bnrm/fr/appels-a-candidature/itemlist/category/25-politique-bibliographique.html) documents Virtua historically. Cited Chameleon/Encore routes remain unverified. Hassan II mosque directly links an III catalogue, whose robots excludes searches and records. |
| Medad | AUI’s current portal is a JavaScript application. Its [technology record](https://librarytechnology.org/library/2093/) lists Medad ILS/Portal from 2024 and earlier Sierra/Millennium; historic Millennium references should not drive a new integration. |
| GLB | Saïs explicitly identifies its own GLB system. It needs a new parser and copy-data validation. |

**CBM** is the highest strategic federation opportunity: its [official description](https://cbm.bnrm.ma/) identifies BNRM and Fondation Abdul-Aziz as founding partners and describes cross-library discovery. Its portal failed robots retrieval. The independently cited MUC route reached only a JavaScript-required shell after normal anonymous session initialization; no member holding was verified. The ministry root identified Symphony, but its linked search form timed out. Ministry and university shared catalogues cannot be counted as branch-level coverage.

The [Institut français network](https://if-maroc.org/mediatheques/) spans 12 cities but its shared catalogue excludes all automated paths. Culturethèque’s digital-document total is separate from physical holdings. [IMIST](https://bibliotheque.imist.ma/) explicitly separates its own Koha catalogue, Toubkal theses, PRSM journals and electronic resources: membership in the latter services adds no verified physical-book library here.

## Ten substantial priorities

These priorities preserve inaccessible large collections. Units and dates differ; ordering is not a size ranking. All source extracts or direct responses are retained in `evidence/` and indexed in [findings.json](findings.json).

| Institution/network | Size evidence or explicit proxy | Observed outcome |
|---|---|---|
| BNRM | [Official open-access subset](https://www.bnrm.ma/bnrm/bibliotheque/nos-collections/monographies/monographies-en-libre-acc%C3%A8s.html): 81,318 public and 12,310 researcher monographs, 16 June 2014; not whole collection/current stock. | Main/Encore robots 503; legacy Chameleon tunnel 403. |
| Fondation du Roi Abdul-Aziz Al Saoud | [Research-library and documentation-centre role](https://bib.cjb.ma/index.php?id_article=79&lvl=cmspage&pageid=4), plus CBM founding partnership; institutional proxy, current book count unknown. | Main robots 503; observed OPAC port 8086 timeout. |
| Hassan II University / Mohamed Sekkat | [2020–2021 report, p.153](https://www.univh2c.ma/sites/default/files/2025-03/Rapport_activite_UH2C_2020-2021_VF_23032023-Small_compressed.pdf): 80,000+ mixed documents; current official page describes university-wide catalogue. | Linked catalogue robots 503. |
| Al Akhawayn / Mohammed VI Library | [Spring 2023 handbook](https://aui.ma/hubfs/PDFs/LC%20Faculty%20Handbook%20Spring%202023.pdf?hsLang=fr): 99,500 print copies within 336,000+ total volumes. | Current portal shell only; legacy robots 503. |
| Hassan II Mosque Foundation media library | [Live homepage](https://www.mediatheque-fmh2.ma/): 122,357 multiformat documents, 860 seats; undated. | III catalogue search/record paths disallowed. |
| Ibn Tofail University central library | [2023 official page](https://www.uit.ac.ma/bibliotheque/): capacity wording of 30,000 books and 100 seats. | Koha robots 503; capacity is not a verified stock count. |
| IMIST–CNRST | [Official page](https://bibliotheque.imist.ma/index.php/bibliotheque): 4,565.4 m² and five thematic spaces; space/institution proxy. | Linked physical OPAC robots 503. |
| Mohammed Premier University, Oujda | [Official network description](https://www.ump.ma/fr/formations/bibliotheque-de-luniversite): 40,000+ books and eight named institutions; undated. | Official origin tunnel 403. |
| USMBA FLSH Saïs, Fès | [Live homepage](https://www.fls.usmba.ac.ma/glb/index.php): 60,000+ monographs; theses counted separately. | **Selected success**; advertised scale not independently audited. |
| Institut français du Maroc | [Official network](https://if-maroc.org/mediatheques/): 12 city media libraries, counted once. | Catalogue robots `Disallow: /`; no searches. |

Further meaningful alternatives included Cadi Ayyad’s multi-faculty portal, Ibn Zohr’s FLSH Agadir, UIR, IRCAM, INSAP, UM6P, UM6SS, INPT and ENA. UIR’s [2023–2024 booklet](https://uir.ac.ma/upload/media/659ecddc95d83682524537.pdf) reports 20,000+ books; UM6P’s [2023-hosted brochure](https://isti.um6p.ma/wp-content/uploads/2023/01/1-Brochure-Institutionnelle-FR-UM6P.pdf) reports 13,000+. They were not silently replaced by small successes.

## Actual successful queries

| Selection | Submitted query and returned book | Record and physical-use evidence |
|---|---|---|
| **Selected: USMBA FLSH Saïs** | GET [`search=Le+petit+prince`](https://www.fls.usmba.ac.ma/glb/home/book?search=Le+petit+prince), HTTP 200 at **08:01:09 UTC**. Returned *Amnukal Mezzyn = Le petit prince – trad. de Larbi Moumouch*, Antoine de Saint-Exupéry, ed.IDGL 2007. | UI record ID **21662**, call **801.41SAP**, one total/one available copy. No durable record URL demonstrated: the title invokes reservation, which was not used. Related translated edition, not proof of a French original. [Raw](evidence/usmba-search-fr.html), [request](evidence/usmba-search-fr.json). |
| **Reserve: Centre Jacques-Berque** | POST `user_query=L'invention du quotidien` with observed PMB fields and fresh anonymous CSRF token, HTTP 200 at **07:59:09 UTC**; **2 numbered-volume records**. | [12203, *Arts de faire*](https://bib.cjb.ma/index.php?lvl=notice_display&id=12203), Michel de Certeau, Gallimard 2020; ISBN **9782070325764**. Copy **CJB2001712**, **306.4 MIC**, Accès public, **Consultation sur place / Exclu du prêt**. [Search](evidence/cjb-search.html), [detail](evidence/cjb-detail.html), [request](evidence/cjb-search.json). |
| **Reserve: INAU** | POST `look_ALL=1&user_query=The green city`, HTTP 200 at **07:58:33 UTC**. The broad search reported **110 titles**, including the exact target first. | [2473, *The green city*](https://inau.ac.ma/binau/index.php?lvl=notice_display&id=2473), Roger Johnson, MacMillan 1979. Copy **5621**, **710/JOH**, Salle de lecture / Urbanisme; **Consultation sur place** alongside **Disponible**. [Search](evidence/inau-search.html), [detail](evidence/inau-detail.html), [request](evidence/inau-search.json). |

CJB’s [official page](https://www.cjb.ma/presentation-de-la-bibliotheque/) reports 12,000+ documents and no lending service. INAU’s [official page](https://inau.ac.ma/centre-de-documentation-fr/) reports 5,400+ books, free on-site consultation, and institutional borrowing eligibility. Both remain specialist reserves. Their accessibility does not establish that they belong in a national ten-largest set.

Saïs’s initial Arabic query `قافية الرحيل` failed with a tunnel 502. The French alternative succeeded, but unrelated homepage cards sometimes report available copies exceeding total copies. Treat the selected record’s counts as displayed metadata until circulation semantics are validated. No total result count is inferred from pagination.

## Blockers and limitations

- **Policy:** Institut français blocks all paths. Hassan II mosque’s III policy explicitly blocks `/search`, `/record=` and `/iii`. UM6P’s HTTP 200 robots response is an **Access Denied security page**, not a permissible HTML fallback. These candidates were stopped.
- **Connectivity:** robots retrieval failed for major BNRM, Fondation, IMIST OPAC, Ibn Tofail, Hassan II, IRCAM, UMP, UIR, INPT and ENA routes. Several independently discovered `biblio.ma` tenants returned Cloudflare origin 502. No TLS, bot or authentication bypass was attempted.
- **False positives excluded:** Cadi Ayyad’s observed `phrase=physique&field=1` query returned only a catalogue frame with zero category counters. Agadir’s Arabic `مقدمة ابن خلدون` search returned a 382-hit summary; submitting its supplied ordinary “afficher” form returned 403. Neither supplied a book record and neither is counted. UM6SS’s replacement page described physical lending but exposed no usable catalogue query.
- **Client application gaps:** AUI and CBM/MUC need browser-level public-flow investigation; this bounded request run did not produce book searches. AUI’s linked asset is retained as a deliberately truncated 1.5 MB response, not as proof of any API.
- **Counting and access:** no network/branch double counting, no repository or journal membership counted as book coverage, no failed response treated as absence. Public catalogue access is separate from admission, borrowing and reuse permission. Copies marked on-site-only remain on-site-only.

[findings.json](findings.json) contains exact methods, semantic payloads, timestamps, statuses, evidence paths, access notes and all 29 blocked/unverified observations. CJB replay requires a fresh anonymous form/session; cookies were never saved, and ephemeral CSRF values have been redacted from retained material. No application, adapter, deployment or account changes were made.
