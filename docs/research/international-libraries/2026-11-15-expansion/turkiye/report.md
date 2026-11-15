# Türkiye (TUR): library integration research

Checked 2026-11-15 UTC. **2 institutions returned actual books: 1 substantial selected institution and 1 small reserve.** Three title-search submissions were made to three distinct catalog origins; two returned books, while İSAM's query returned HTTP503. No union member or branch is counted separately. Ten substantial successes could not be established; 41 blocked or unverified candidate routes are retained in the evidence, including major institutions. This is a feasibility screen, not a national largest-ten or LMS-share ranking.

The strongest evidenced national leverage is **KYGM's centralized Koha public-library network**, but its catalog explicitly disallows automated access. The [Ministry's 2023 architecture note](https://kygm.ktb.gov.tr/Eklenti/118018%2Ckygm-koha-bilgilendirme-notu---2023pdf.pdf?0=) describes 1,300 public, specialist, children's and other libraries, including Rami, and 21 million registered materials. The note dates Koha use to 2014 and its then-version to 20.11 in January 2023. These are historical network/material totals, not current books or separate integration targets. An authorized network connection could reuse the existing Koha adapter after template and circulation validation.

For academic discovery, [TO-KAT's official statistics](https://veri.ulakbim.gov.tr/hizmet/14) report over 200 collections and 14 million records, with 179 universities in the 2025 table. Its catalog robots returned HTTP403, so no title or member holding was verified. An approved union connection could cover many universities, but union records cannot stand in for real-time copy status, reader eligibility or borrowing. The portal warns that its counts can differ from local institutions. Do not add the union and its members together.

**Yordam is the strongest directly observed new adapter opportunity.** Millet returned Turkish-language HTML book and shelf records. İSAM exposes a Yordam homepage with collection totals, but its title query returned HTTP503. Other major Yordam deployments returned explicit slider challenges and were left untouched. [Yordam's customer references](https://www.yordam.com/tr/referanslar) show university, municipal and specialist customers, but do not establish current national market share. Koha is directly observed at the small Isparta Applied Sciences reserve and independently confirmed by [METU's official catalog configuration](https://lib.metu.edu.tr/en/z3950-configuration). SirsiDynix Enterprise-style, Innovative-style and Primo routes also occur in the sampled candidates; a route pattern alone is not a definitive current LMS audit. No app adapter was edited or tested.

## Ten major library priorities

The order is a research/integration priority list. Units and dates differ; records, mixed resources, print books and institutional proxies must not be compared as a physical-book ranking.

| Priority | Library/network | Source-backed scale or proxy | Observed outcome |
|---|---|---|---|
| 1 | Kültür ve Turizm Bakanlığı / KYGM public-library network | [1,300 libraries; 21 million registered materials (2023; includes Rami; not all books).](https://kygm.ktb.gov.tr/Eklenti/118018%2Ckygm-koha-bilgilendirme-notu---2023pdf.pdf?0=) | Restricted: wildcard Disallow /; no book query. Largest evidenced centralized public-network leverage here. |
| 2 | Cumhurbaşkanlığı Millet Kütüphanesi | [5,190,940 printed resources; undated current homepage snapshot, 2026-11-15.](https://mk.gov.tr/) | Verified Yordam title response and CMK shelf holdings. |
| 3 | Millî Kütüphane | [1,989,018 books (2025; TÜİK statistics reported by Anadolu Agency).](https://www.aa.com.tr/tr/gundem/turkiyede-kutuphane-sayisi-2025-yili-itibariyla-45-bin-327-oldu/3963613) | KAŞİF robots timed out; no query or reader eligibility established. |
| 4 | İstanbul Üniversitesi | [1,628,309 TO-KAT records (portal default 2025; all types, proxy).](https://veri.ulakbim.gov.tr/hizmet/14) | Catalog wildcard Disallow /; no query. |
| 5 | Ankara Üniversitesi | [731,459 TO-KAT records (portal default 2025; all types, proxy).](https://veri.ulakbim.gov.tr/hizmet/14) | Catalog wildcard Disallow /; no query. |
| 6 | Marmara Üniversitesi | [718,372 TO-KAT records (portal default 2025; all types, proxy).](https://veri.ulakbim.gov.tr/hizmet/14) | Yordam homepage slider verification; stopped. |
| 7 | Orta Doğu Teknik Üniversitesi (ODTÜ / METU) | [542,728 printed books; current official page, observed 2026-11-15.](https://lib.metu.edu.tr/tr/kitap-koleksiyonu) | Koha catalog robots HTTP503; no query. |
| 8 | İhsan Doğramacı Bilkent Üniversitesi | [614,303 books combining print, electronic and audio; undated official facts page.](https://w3.bilkent.edu.tr/bilkent/university-facts/) | Enterprise-style public route; robots HTTP403. |
| 9 | Boğaziçi Üniversitesi | [878,481 works; undated official page.](https://bogazici.edu.tr/tr/pages/kutuphane/79) | Current collections catalog robots returned explicit verification page; stopped. |
| 10 | Hacettepe Üniversitesi | [Four university libraries across two campuses; institutional network proxy.](https://universitem.hacettepe.edu.tr/kutuphaneler/) | Catalog robots HTTP403; no query. |

İSAM is an additional substantial specialist candidate: its [public catalog homepage](https://katalog.isam.org.tr/?dil=0) reports 335,545 **book records**, with theses and serials separately listed. This is not a physical-volume inventory. İstanbul Gelişim is a substantial blocked alternative with [192,025 printed books dated 2025-10-01](https://kddb.gelisim.edu.tr/tr/idari-icerik-igu-kutuphane-istatistikleri). [Başkent's official site](https://lib.baskent.edu.tr/tr/hakkimizda/kutuphanemiz-hakkinda) provides a building/service proxy of 12,500 m² and 1,627 seats. Smaller or partial collections were retained rather than used to fill the selected ten.

## Actual specific-book results

All three attempted title queries submitted the Turkish title **Nutuk**; the following two returned actual books. A broad title search can include editions and related works; a response count is not a copy count. Raw HTML and exact request metadata are retained for each result.

### Cumhurbaşkanlığı Millet Kütüphanesi — selected

Single presidential library; internal departments and named collections not counted separately. Scale: **5,190,940 printed resources (mixed material types)**, undated; observed 2026-11-15; [source](https://mk.gov.tr/). Not a physical-book total. National statistics distinguish books from serials; avoid combining with ebook/archive counts.

- Query: `GET` [https://katalog.mk.gov.tr/?p=1&q=Nutuk&alan=qEser_txt](https://katalog.mk.gov.tr/?p=1&q=Nutuk&alan=qEser_txt); payload `none`. Checked `2026-11-15T08:14:36.981470+00:00`; HTTP200. Effective URL: [https://katalog.mk.gov.tr/?p=1&q=Nutuk&alan=qEser_txt](https://katalog.mk.gov.tr/?p=1&q=Nutuk&alan=qEser_txt).
- Response count: 1440; classification `related_titles`. Broad title-field result set includes editions and related titles; only first page inspected.
- Platform: **Yordam**. Footer links www.yordam.com; Yordam export control; observed HTML result cards with data-recordid and data-demirbas.
- Policy: [https://katalog.mk.gov.tr/robots.txt](https://katalog.mk.gov.tr/robots.txt) returned HTTP200, `allowed_path`. Public research path check; no reuse licence inferred Crawl-delay 300 seconds.
- Evidence: [evidence/millet-nutuk.html](evidence/millet-nutuk.html), [evidence/millet-nutuk.json](evidence/millet-nutuk.json).

**Returned book:** Nutuk (Söylev) : günümüz Türkçesi ile (fotoğraflı ve genişletilmiş) — Mustafa Kemal Atatürk; hazırlayan Ahmet Köklügiller. Milliyet Yayınları, 1996. Record `2766999`; ISBN `not verified`; accession `00013931`. Result title opens JavaScript detail; no durable GET record URL verified. Exact saved search and data-recordid identify this edition.

**Observed holdings:** CMK; Gençlik Kütüphanesi; Zemin Kat; DR 592 .K4 A3 1996; Rafta (on shelf). This is not a promise of external borrowing.

**Reader access:** Anonymous discovery. General collections open-shelf; rare works closed-stack. Search also returns Ödünç Verilemez (cannot be loaned) on rare-item rows; must retain both shelf and loan restrictions. Reader identity/entry and external loan rights not established by this query.

**Integration needs:** New Yordam HTML adapter; Turkish and Ottoman titles/diacritics; Preserve data-recordid separately from accession and edition; Honor 300-second delay; durable cache/permission strategy required for interactive use; Preserve Rafta alongside Ödünç Verilemez and room/department; JavaScript detail routing not verified.

### Isparta Uygulamalı Bilimler Üniversitesi Merkez Kütüphanesi — reserve

One university library; not Süleyman Demirel University. Scale: **5,428 printed books**, undated; indexed official page observed 2026-11-15; [source](https://kutuphane.isparta.edu.tr/). Small print collection; no promotion to selected substantial target.

- Query: `GET` [https://opac.isparta.edu.tr/cgi-bin/koha/opac-search.pl?idx=ti&q=Nutuk](https://opac.isparta.edu.tr/cgi-bin/koha/opac-search.pl?idx=ti&q=Nutuk); payload `none`. Checked `2026-11-15T08:09:44.266400+00:00`; HTTP200. Effective URL: [https://opac.isparta.edu.tr/cgi-bin/koha/opac-detail.pl?biblionumber=1790](https://opac.isparta.edu.tr/cgi-bin/koha/opac-detail.pl?biblionumber=1790).
- Response count: 1; classification `exact_title`. One bibliographic record returned via search-to-detail redirect; no separate search-total field was shown. The record separately displays one holding.
- Platform: **Koha**. Powered by Koha; footer says adapted and installed by ZeGeSoft; /cgi-bin/koha routes.
- Policy: [https://opac.isparta.edu.tr/robots.txt](https://opac.isparta.edu.tr/robots.txt) returned HTTP404, `no_published_rules`. HTTP404; not an affirmative reuse licence
- Evidence: [evidence/isparta-nutuk.html](evidence/isparta-nutuk.html), [evidence/isparta-nutuk.json](evidence/isparta-nutuk.json).

**Returned book:** Nutuk — Atatürk, Mustafa Kemal, 1881-1938. Bilgi Yayınevi, 2019. Record `1790`; ISBN `9789752206960`. [Record](https://opac.isparta.edu.tr/cgi-bin/koha/opac-detail.pl?biblionumber=1790).

**Observed holdings:** 1 Kitap; Isparta Uygulamalı Bilimler Üniversitesi Merkez Kütüphanesi; Genel Koleksiyon; Roman dışı; 815.42 ATA 2019; k.1; Available; barcode 001185.

**Reader access:** Anonymous catalog and holdings observed. Institutional membership, visitor entry and borrowing rights not verified. Homepage also links a VuFind discovery interface; it is the same institution, not another target.

**Integration needs:** Candidate Koha adapter reuse; Verify Turkish labels, exact edition matching and search-to-detail redirect; Do not conflate this university with SDÜ or its shared reader-access arrangements.

İSAM's failed exact attempt: GET [https://katalog.isam.org.tr/?dil=0&p=1&q=Nutuk&alan=qEser_txt](https://katalog.isam.org.tr/?dil=0&p=1&q=Nutuk&alan=qEser_txt), no payload, at `2026-11-15T08:21:46.276406+00:00`; HTTP503 upstream connection failure, with no book record. [Request metadata](evidence/isam-nutuk.json), [raw response](evidence/isam-nutuk.html). The query followed its normal homepage by over 353 seconds and was allowed by the saved robots policy. No retry followed.

## Blocked and unverified alternatives

Failures are not evidence that a book is absent. HTTP503 and upstream timeouts may be transient or specific to this execution environment. A failed robots request leaves policy unresolved; no catalog query followed it. Explicit challenges were not bypassed. A library homepage, form, search-index excerpt or branch list does not count as a successful catalog query.

| Candidate route | Retained reason | Evidence |
|---|---|---|
| İSAM Kütüphanesi | Allowed Yordam homepage reports 335,545 book records; policy-compliant Nutuk query after the 300-second delay returned HTTP503. No book result verified. | [request](evidence/isam-nutuk.json) |
| TO-KAT | 403 robots; official legacy gov.tr route redirects to same blocked origin. | [request](evidence/tokat-robots.json) |
| KYGM public-library network | Wildcard Disallow /; no search. | [request](evidence/koha-robots.json) |
| Millî Kütüphane / KAŞİF | Robots read timeout; policy unresolved. | [request](evidence/national-home-robots.json) |
| Bilkent | HTTP403 robots. | [request](evidence/bilkent-robots.json) |
| METU | HTTP503 robots. | [request](evidence/metu-robots.json) |
| Hacettepe | HTTP403 robots. | [request](evidence/hacettepe-robots.json) |
| İstanbul Üniversitesi | Wildcard Disallow /. | [request](evidence/istanbul-robots.json) |
| Ankara Üniversitesi | Wildcard Disallow /. | [request](evidence/ankara-robots.json) |
| İstanbul Teknik Üniversitesi | Explicit ChatGPT-User and OAI-SearchBot Disallow /; not only a training restriction. | [request](evidence/itu-robots.json) |
| Marmara | Explicit slider security challenge on open catalog; no bypass. | [request](evidence/marmara-home.json) |
| Sakarya | Explicit slider security challenge; no bypass. | [request](evidence/sakarya-home.json) |
| Afyon Kocatepe | Explicit slider security challenge; no bypass. | [request](evidence/afyon-home.json) |
| Çanakkale Onsekiz Mart | Explicit slider security challenge; no bypass. | [request](evidence/comu-home.json) |
| Boğaziçi | HTTP200 robots is explicit security verification, not a soft404. | [request](evidence/bogazici-home-robots.json) |
| Gazi | /search path disallowed; stopped. | [request](evidence/gazi-home-robots.json) |
| Sabancı | /discovery/search disallowed; stopped. | [request](evidence/sabanci-home-robots.json) |
| Koç | Official library-site robots HTTP403; discovery route not verified. | [request](evidence/koc-site-robots.json) |
| İstanbul Bilgi | HTTP503 robots. | [request](evidence/bilgi-home-robots.json) |
| İstanbul Gelişim | HTTP503 robots; 192,025 print books (2025-10-01) makes it a substantial blocked alternative. | [request](evidence/gelisim-home-robots.json) |
| Bursa Uludağ central | HTTP503 robots. | [request](evidence/uludag-home-robots.json) |
| Bursa Uludağ theology | HTTP503 robots; partial faculty route, not a second university. | [request](evidence/uludag-theology-home-robots.json) |
| Atatürk Üniversitesi | Official library-site robots HTTP500. | [request](evidence/ataturk-site-robots.json) |
| Başkent | HTTP503 catalog robots; official site describes 12,500 m²/1,627 seats. | [request](evidence/baskent-home-robots.json) |
| Anadolu | Official library-site robots HTTP503. | [request](evidence/anadolu-site-robots.json) |
| Fırat | Official library-site robots HTTP503; current catalog endpoint not established. | [request](evidence/firat-site-robots.json) |
| Yıldız Teknik | HTTP503 catalog robots. | [request](evidence/yildiz-home-robots.json) |
| TOBB ETÜ | HTTP503 robots. | [request](evidence/tobb-home-robots.json) |
| Balıkesir | Robots request failed; details in evidence. | [request](evidence/balikesir-home-robots.json) |
| Bilecik Şeyh Edebali | Koha search path explicitly disallowed; permitted homepage not counted. | [request](evidence/bilecik-home-robots.json) |
| Süleyman Demirel | VuFind robots HTTP503. | [request](evidence/sdu-home-robots.json) |
| İzmir Yüksek Teknoloji Enstitüsü | HTTP403 robots. | [request](evidence/iyte-home-robots.json) |
| Ankara Bilim | HTTP503 robots; smaller alternative not selected. | [request](evidence/ankara-bilim-home-robots.json) |
| biblioPera research network | Official homepage exposes Koha search, but catalog robots HTTP503. No union members counted. | [request](evidence/bibliopera-home-robots.json) |
| TBMM parliamentary library | HTTP503 robots. | [request](evidence/tbmm-home-robots.json) |
| Agriculture and Forestry library | HTTP503 robots; digital repository and book circulation must be separated. | [request](evidence/tarim-home-robots.json) |
| Selçuklu municipality | HTTP503 robots. | [request](evidence/selcuklu-home-robots.json) |
| Ankara metropolitan network | HTTP503 robots. | [request](evidence/ankara-city-home-robots.json) |
| İBB Atatürk Kitaplığı/network | HTTP503 robots. | [request](evidence/ibb-home-robots.json) |
| İzmir Millî Kütüphane | Official source robots HTTP503. | [request](evidence/izmir-national-site-robots.json) |
| Ege Üniversitesi | Current official catalog tile points to TO-KAT, whose robots are blocked; no independent query. | [request](evidence/ege-site.json) |

## Access, evidence and limitations

Millet and İSAM publish a 300-second crawl delay. Their actual title-query attempts were spaced more than 300 seconds after the preceding request on their respective catalog origins. This delay makes direct interactive requests unsuitable without a permitted cache or an institutional agreement. A procedural lapse is retained: the generic helper initially fetched Millet's homepage immediately after discovering that delay. No title query was made then; the helper was corrected to stop delayed origins, and Millet's actual title query followed its homepage by over 307 seconds. İSAM's robots, homepage and query follow the required spacing.

Public search establishes discovery only. `Rafta` means on shelf, and must coexist with `Ödünç Verilemez` where shown; neither establishes off-site borrowing. General and rare collections have different room/stack arrangements. Institution membership, visitor registration, copy rules and external loan eligibility were not tested. The union/source totals do not establish any of these rights.

Isparta Applied Sciences is a genuine Koha success but remains a reserve because its official indexed source reports only 5,428 print books; the live size-source robots failed. It is distinct from Süleyman Demirel University. Its other VuFind interface is not another institution. Partial faculty and branch routes, including Uludağ theology, do not produce extra institution counts.

The sample is deliberately constrained by policy and availability. It does not establish national platform share or a largest-ten ranking. Size sources have mixed dates and units. TO-KAT record counts are explicitly proxies; Bilkent's book total includes electronic and audio formats; Millet reports mixed printed resources; İSAM reports catalog book records. The ten-success shortfall remains visible instead of substituting small collections or counting unsuccessful routes.

No authentication, outreach, hold placement, app mutation, challenge bypass, TLS bypass or nonpublic endpoint probing was performed. Anonymous requests retain no saved cookies or accounts. Full source claims, exact request metadata, source dates/units, platform evidence and integration limits are in [findings.json](findings.json). Preserved raw bodies are bounded; only the first result page was inspected for each successful title search. Query counts exclude robots, homepage and source-document requests.
