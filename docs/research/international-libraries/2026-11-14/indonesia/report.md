# Indonesia: ten major library candidates, verified with book queries

Ten distinct institutions or library networks returned actual books from specific-title queries on **15 November 2026 UTC**. These are **ten major integration candidates, not a verified national top ten by collection size**. The National Library, UI, UGM and Hasanuddin are important larger prospects that did not pass this run's access/query checks. Replacing them with reachable institutions does not establish a size ranking.

The strongest first public-library pilot is **Jakarta/Jaklitera**: its result for *Laskar pelangi* exposes four available print copies at Cikini and one checked-out copy at Koja. For reusable adapters, start with **INLISLite** at Airlangga/Brawijaya and **SLiMS** at Padjadjaran/Diponegoro. These are not named adapters in the current MyBookshelf provider implementation inspected for this study. All ten searches were research probes; no product integration, authorization clearance, outreach or deployment occurred.

## Marketplace and the largest unlock

Indonesia already has substantial library software and national discovery infrastructure. The opportunity is to connect fragmented local catalogs, explain branch-level availability and user access, and improve the search experience. It should not be described as a country without library infrastructure. The ten successful candidates are all Java-based, so this sample does not establish feasibility for rural or outer-island libraries.

- **SLiMS is the best evidenced broad reusable ecosystem in this investigation.** The project's official registered-user list reports **1,923 Indonesian institutions and 52 Union Catalogue Server users**, last updated **11 February 2020**. These are historical registrations, not a current deployment census or market-share ranking. Live SLiMS union searches succeeded at two large universities. [Official SLiMS list](https://slims.web.id/web/news/daftar-pengguna-slims/)
- **INLISLite is the other priority, especially for public-sector libraries.** It is supported by the National Library and formally designated in 2016. Live examples here include Brawijaya and Airlangga's customized AILiS; West Java's portal also identifies INLISLite 3.1 but its title searches failed. Record IDs, form parameters and holdings presentation vary. No defensible current nationwide SLiMS-versus-INLISLite share estimate was found. [Official INLISLite description](https://www.perpusnas.go.id/p3smpt/inlislite/), [2016 designation](https://jdih.perpusnas.go.id/file_peraturan/SK_19_2016_Penetapan_INLIS_ttd.pdf)
- **Indonesia OneSearch is the largest identified national discovery partnership route:** the National Library reported **4,215 connected institutions** in November 2025. Its partner program explicitly uses OAI-PMH with systems including SLiMS and INLISLite. That potentially unlocks bibliographic metadata across libraries, repositories, archives and museums; it does not mean 4,215 live circulating-library adapters or current copy availability. A harvest is not a circulation API. Direct access to the source article returned 403; the official article and figure were corroborated through the web search index. [National Library announcement](https://www.perpusnas.go.id/berita/dukung-akses-informasi-publik-tanpa-batas-perpusnas-tunjukkan-inovasi-dalam-keterbukaan-dan-layanan-inklusif), [partner/OAI-PMH program](https://www.perpusnas.go.id/berita/koordinasi-dan-advokasi-dengan-mitra-jejaring-mitra-indonesia-one-search-di-sumatera-utara-tahun-anggaran-2023)
- **Large universities are heterogeneous.** ITB WebPAC, ITS SPITS/Linspro, IPB Readily, Telkom Open Library and UIN Sunan Kalijaga's custom SRU interface require additional work. UMS demonstrates Koha exists in the market, but its search served a challenge, so it is not a successful integration candidate from this run. One Koha adapter alone would miss much of the reachable opportunity.

## Ten verified institutions/networks

Collection quantities below retain their source scope and date. Current figures, historical figures and institutional proxies cannot be combined into a league table. One union catalog is one institution/network here; its branches and alternative frontends are not counted again.

| Institution/network | Scale evidence | Query / actual returned book | System | Result |
|---|---|---|---|---|
| Perpustakaan Jakarta / Jaklitera public-library network | [141,896 titles and 583,315 copies, government report 9 May 2025. Scope combines formats/collections; do not treat all as unique print books or only Cikini.](https://m.beritajakarta.id/read/144445/pramono-apresiasi-layanan-perpustakaan-jakarta-pds-hb-jassin) | [Laskar Pelangi](https://perpustakaan.jakarta.go.id/book?keyword=Laskar+Pelangi) → Laskar pelangi / Andrea Hirata; editor Suhindrati A. Shinta | Jaklitera custom frontend; INLIS-style record identifiers, underlying backend version unverified | HTTP 200; book returned |
| Universitas Airlangga Library / AILiS | [Official live dashboard displays 246,606 physical copies, observed 15 Nov 2026; not a count of unique book titles.](https://ailisx.lib.unair.ac.id/stats-ailis/index) | [Metode penelitian sosial](https://ailisx.lib.unair.ac.id/opac/pencarian-sederhana?action=pencarianSederhana&katakunci=Metode+penelitian+sosial&ruas=Judul&bahan=Semua+Jenis+Bahan&location=Perpustakaan+Pusat) → Metode penelitian sosial / Ulber Silalahi | INLISLite X AILIS (explicit footer) | HTTP 200; book returned |
| Universitas Brawijaya Library | [68,152 book titles reported during PIP Semarang library’s July 2018 institutional visit, published 14 Nov 2018. Historical book-title evidence, not a current census. The 2009 government directory reports a different mixed-format scope.](https://elibrary.pip-semarang.ac.id/perpustakaan-pip-semarang-kunjungan-studi-banding-ke-perpustakaan-universitas-brawijaya-malang-830b07) | [Calculus with analytic geometry](https://digilib.ub.ac.id/opac/pencarian-sederhana?action=pencarianSederhana&katakunci=Calculus+with+analytic+geometry&ruas=Judul&bahan=Semua+Jenis+Bahan) → Calculus with analytic geometry / Edwin J. Purcell | INLISLite v3.0 (footer) | HTTP 200; book returned |
| Universitas Diponegoro Integrated Library | [Economics and Business faculty alone reports 17,598 book titles / 31,715 copies through 2024 in its official 2025/26 handbook, p105. This is a faculty subset; the whole university union-catalog total remains unknown.](https://feb.undip.ac.id/wp-content/dokumen/buku_pedoman_akademik/Buku%20Pedoman%20Akademik%20FEB%20Undip%202025.pdf) | [Harry Potter and the Deathly Hallows](https://lib.undip.ac.id/index.php?search=search&keywords=Harry%20Potter%20and%20the%20Deathly%20Hallows) → Harry Potter and the Deathly Hallows : Harry Potter dan Relikui Kematian / J.K. Rowling | SLiMS; explicit footer | HTTP 200; book returned |
| Institut Teknologi Bandung Library | [Government directory (2009), p23: 228,393 titles / 238,246 copies across mixed formats. ITB’s own 3 May 2006 article separately reports 227,000 book copies. Historical scale only; current total unverified.](https://repositori.kemendikdasmen.go.id/12869/1/Direktori%20Profil%20Perpusdiknas%202009.pdf) | [Calculus and linear algebra](https://webpac.lib.itb.ac.id/find/goMatch?q=Calculus+and+linear+algebra&bFind=title) → Calculus and linear algebra, vol.1: vectors in the plane and one-variable calculus / Wilfred Kaplan; Donald J. Lewis | Custom ITB WebPAC; no vendor inferred | HTTP 200; book returned |
| Institut Teknologi Sepuluh Nopember Library | [42,753 textbook titles/100,171 copies on official undated collection page. Reserve-book text says 22,846, table 22,868; do not sum possibly overlapping counts.](https://www.its.ac.id/perpustakaan/koleksi-umum-dan-tandon/) | [Brief calculus with applications](https://library.its.ac.id/opac/) → Brief calculus with applications / James W. Burgmeier; Monte B. Boisen Jr.; Max D. Larsen | SPITS; engine supported by Linspro (footer) | HTTP 200; book returned |
| IPB University Library / Readily | [Historical 2010 holdings: 45,837 text/research-report titles 72,201 copies plus 5,221 reference titles; official profile published 1 Jan 2011. Dated scale evidence, not current census.](https://lib.ipb.ac.id/2011/01/profil/) | [Kimia dasar](https://readily.ipb.ac.id/opac/search?q=Kimia%20dasar&category=judul_buku&page=1&per_page=10) → Kimia dasar / Not supplied by returned record | Readily custom public JSON frontend; older INLIS lineage not assumed current API contract | HTTP 200; book returned |
| UIN Sunan Kalijaga Library | [Official Data & Facts page displays 124,281 Buku (books), 58,563 final projects and 3,328 references, observed 15 Nov 2026. The page does not specify whether Buku counts titles or copies or state a census date; do not sum categories or use as a comparable print-title total.](https://lib.uin-suka.ac.id/data-fakta) | [Harry Potter And The Cursed Child](https://opac.uin-suka.ac.id/?version=1.1&operation=searchRetrieve&query=Harry%20Potter%20And%20The%20Cursed%20Child) → Harry Potter and the cursed child / J.K. Rowling | Custom OPAC; explicitly advertises SRU 1.1 and OAI. Backend LMS unverified. | HTTP 200; book returned |
| Telkom University Open Library | [Official university facilities page reports >80,500 collection titles/123,937 copies; page indexed as 2019, underlying count date unspecified and mixed collection types. Current four-campus scope differs.](https://telkomuniversity.ac.id/en/fasilitas-belajar/) | [Laskar Pelangi](https://openlibrary.telkomuniversity.ac.id/home/catalog.html) → Laskar pelangi / Andrea Hirata | Custom Open Library; vendor/backend unverified | HTTP 200; book returned |
| Universitas Padjadjaran / Kandaga Library | [Government directory (2009), p25: 62,708 copies at CISRAL, the central library predecessor. Historical central-library scope, not the current multi-faculty union total; 19 catalog location filters observed.](https://repositori.kemendikdasmen.go.id/12869/1/Direktori%20Profil%20Perpusdiknas%202009.pdf) | [Dasar-dasar mikrobiologi](https://opac.unpad.ac.id/index.php?search=search&keywords=Dasar-dasar%20mikrobiologi) → Dasar-dasar mikrobiologi / Michael J. Pelzcar [catalog spelling]; E.C.S. Chan | SLiMS union OPAC; modern Kandaga custom public API also verified | HTTP 200; book returned |

## Reproducible query and integration evidence

### 1. Perpustakaan Jakarta / Jaklitera public-library network — Jakarta

- **Request:** GET [https://perpustakaan.jakarta.go.id/book?keyword=Laskar+Pelangi](https://perpustakaan.jakarta.go.id/book?keyword=Laskar+Pelangi)
- **Verified:** 2026-11-15T06:15:16.251058+00:00; HTTP 200. Displayed count: 12. 12 visible cards; no declared full total.
- **Returned book:** *Laskar pelangi* — Andrea Hirata; editor Suhindrati A. Shinta. Record identifier: `JAKPU-12139000001531`. [Returned record](https://perpustakaan.jakarta.go.id/book/detail?cn=JAKPU-12139000001531).
- **Copies/status:** Print edition: 4 available copies at Cikini; 1 checked out at Koja. Search also returned a Daisy talking-book edition, which must not be conflated with print.
- **Public eligibility:** Public search; official report includes Jakarta and non-Jakarta members. Registration and loan eligibility remain library-controlled.
- **Policy check:** 200 generic empty Disallow; public search/detail accessible. No bulk-reuse permission or partner agreement verified.
- **Integration:** New Jaklitera adapter: GET /book?keyword=, detail keyed cn, parse per-branch copies and status; preserve ISBN/format. Eight location filters observed.
- **Saved evidence:** [query response](evidence/jaklitera-specific.html), [request metadata](evidence/jaklitera-specific.json), [detail response](evidence/jaklitera-print-detail.html), [robots response](evidence/jaklitera-robots.html).

### 2. Universitas Airlangga Library / AILiS — Surabaya

- **Request:** GET [https://ailisx.lib.unair.ac.id/opac/pencarian-sederhana?action=pencarianSederhana&katakunci=Metode+penelitian+sosial&ruas=Judul&bahan=Semua+Jenis+Bahan&location=Perpustakaan+Pusat](https://ailisx.lib.unair.ac.id/opac/pencarian-sederhana?action=pencarianSederhana&katakunci=Metode+penelitian+sosial&ruas=Judul&bahan=Semua+Jenis+Bahan&location=Perpustakaan+Pusat)
- **Verified:** 2026-11-15T06:12:41.843765+00:00; HTTP 200. Displayed count: 15. Displayed count, not library collection size.
- **Returned book:** *Metode penelitian sosial* — Ulber Silalahi. Record identifier: `271a48ea5da859f9d7b0d3a86a9b5b09ea2eb504`. [Returned record](https://ailisx.lib.unair.ac.id/opac/detail-opac?id=271a48ea5da859f9d7b0d3a86a9b5b09ea2eb504).
- **Copies/status:** Barcode220912211, call 001.42 Sil m3, central RBU KKC, Koleksi Umum, Tersedia, Dapat dipinjam. ISBN979-1073-61-9.
- **Public eligibility:** Public metadata and copy status; university circulation membership and external visitor rights require institution-specific confirmation.
- **Policy check:** 200; named AhrefsBot/PetalBot/Amazonbot exclusions, no matching generic disallow for research paths. No bulk-reuse permission or partner agreement verified.
- **Integration:** New INLISLite family adapter; AILiS hashed record IDs and location parameter are variants. Preserve central/faculty rooms; count 15 search results.
- **Saved evidence:** [query response](evidence/unair-search2.html), [request metadata](evidence/unair-search2.json), [detail response](evidence/unair-detail.html), [robots response](evidence/ailisx.lib.unair.ac.id-robots.html).

### 3. Universitas Brawijaya Library — Malang

- **Request:** GET [https://digilib.ub.ac.id/opac/pencarian-sederhana?action=pencarianSederhana&katakunci=Calculus+with+analytic+geometry&ruas=Judul&bahan=Semua+Jenis+Bahan](https://digilib.ub.ac.id/opac/pencarian-sederhana?action=pencarianSederhana&katakunci=Calculus+with+analytic+geometry&ruas=Judul&bahan=Semua+Jenis+Bahan)
- **Verified:** 2026-11-15T06:12:45.559806+00:00; HTTP 200. Displayed count: 10. Displayed count, not library collection size.
- **Returned book:** *Calculus with analytic geometry* — Edwin J. Purcell. Record identifier: `1364 / INLIS000000000001364`. [Returned record](https://digilib.ub.ac.id/opac/detail-opac?id=1364).
- **Copies/status:** Search displays1 of1 copies; detail barcode018901355, call515.15 PUR c k.1, Dapat dipinjam, Perpustakaan Pusat RUANG LABEL MERAH. Detail status cell not independently interpretable in text.
- **Public eligibility:** Public catalog; borrowing and visitor access depend on university membership rules, not catalog visibility.
- **Policy check:** 200 generic empty Disallow. No bulk-reuse permission or partner agreement verified.
- **Integration:** New INLISLite adapter. Direct title GET returned 10 bibliographic records; detail provides MARC and Dublin Core export links.
- **Saved evidence:** [query response](evidence/ub-specific.html), [request metadata](evidence/ub-specific.json), [detail response](evidence/ub-detail.html), [robots response](evidence/digilib.ub.ac.id-robots.html).

### 4. Universitas Diponegoro Integrated Library — Semarang

- **Request:** GET [https://lib.undip.ac.id/index.php?search=search&keywords=Harry%20Potter%20and%20the%20Deathly%20Hallows](https://lib.undip.ac.id/index.php?search=search&keywords=Harry%20Potter%20and%20the%20Deathly%20Hallows)
- **Verified:** 2026-11-15T06:14:52.319664+00:00; HTTP 200. Displayed count: 3. Displayed count, not library collection size.
- **Returned book:** *Harry Potter and the Deathly Hallows : Harry Potter dan Relikui Kematian* — J.K. Rowling. Record identifier: `Fakultas Ilmu Budaya:7128`. [Returned record](https://lib.undip.ac.id/index.php?p=show_detail&id=7128&in=Fakultas%20Ilmu%20Budaya).
- **Copies/status:** Detail item 33930PC1 says Tersedia; header also says Tidak Tersedia and location is unset. Treat as conflicting availability, not unequivocally borrowable.
- **Public eligibility:** Public catalog; no universal external borrowing entitlement verified.
- **Policy check:** 200 generic empty Disallow. No bulk-reuse permission or partner agreement verified.
- **Integration:** New SLiMS adapter with union variant; record key must include in=faculty plus id. Three records matched. Parse item-level state and retain conflicting header as unknown.
- **Saved evidence:** [query response](evidence/undip-specific.html), [request metadata](evidence/undip-specific.json), [detail response](evidence/undip-detail.html), [robots response](evidence/undip-robots.html).

### 5. Institut Teknologi Bandung Library — Bandung

- **Request:** GET [https://webpac.lib.itb.ac.id/find/goMatch?q=Calculus+and+linear+algebra&bFind=title](https://webpac.lib.itb.ac.id/find/goMatch?q=Calculus+and+linear+algebra&bFind=title)
- **Verified:** 2026-11-15T06:12:43.040948+00:00; HTTP 200. Displayed count: 69533. Displayed69.533; broad token semantics, not exact title matching.
- **Returned book:** *Calculus and linear algebra, vol.1: vectors in the plane and one-variable calculus* — Wilfred Kaplan; Donald J. Lewis. Record identifier: `68422`. [Returned record](https://webpac.lib.itb.ac.id/find/detail/68422).
- **Copies/status:** Central library has one cataloged copy, accession 19731675, marked Penyiangan 1 (weeded). This proves record discovery, not present circulation availability.
- **Public eligibility:** Public catalog; lending privileges vary by member category.
- **Policy check:** 200 HTML404 page at robots route, no usable robots rules; policy unknown. No bulk-reuse permission or partner agreement verified.
- **Integration:** Custom adapter /find/goMatch?q=&bFind=title and /find/detail/{id}; displayed 69.533 results appears broad token matching, not exact-title count. Holdings need status vocabulary including withdrawn/weeded.
- **Saved evidence:** [query response](evidence/itb-specific.html), [request metadata](evidence/itb-specific.json), [detail response](evidence/itb-detail.html), [robots response](evidence/webpac.lib.itb.ac.id-robots.html).

### 6. Institut Teknologi Sepuluh Nopember Library — Surabaya

- **Request:** POST [https://library.its.ac.id/opac/](https://library.its.ac.id/opac/)
- **POST form payload:** `{"f": "judul", "q": "Brief calculus with applications", "Submit": "Cari"}`
- **Verified:** 2026-11-15T06:12:44.529023+00:00; HTTP 200. Displayed count: 2. Displayed count, not library collection size.
- **Returned book:** *Brief calculus with applications* — James W. Burgmeier; Monte B. Boisen Jr.; Max D. Larsen. Record identifier: `007557411X`. [Returned record](https://library.its.ac.id/opac/index.php?go=detil).
- **Copies/status:** Two item barcodes 3100093027024 and 3100093027025, both DI-GUDANG-KAN (stored in warehouse). Returned book is not immediately borrowable.
- **Public eligibility:** Public search. Official lending-rules page distinguishes internal members and external reading-on-site: https://www.its.ac.id/perpustakaan/id/aturan-peminjaman/
- **Policy check:** robots route returns an HTML portal/network-restriction notice; usable robots rules unknown. Public catalog query/detail itself succeeds. No bulk-reuse permission or partner agreement verified.
- **Integration:** Custom POST adapter. Search payload f=judul,q=title,Submit=Cari. Detail POST /opac/index.php?go=detil with id=007557411X; preserve ISBN-like id, not numeric-only. Two search records.
- **Saved evidence:** [query response](evidence/its-specific.html), [request metadata](evidence/its-specific.json), [detail response](evidence/its-detail.html), [robots response](evidence/library.its.ac.id-robots.html).

### 7. IPB University Library / Readily — Bogor

- **Request:** GET [https://readily.ipb.ac.id/opac/search?q=Kimia%20dasar&category=judul_buku&page=1&per_page=10](https://readily.ipb.ac.id/opac/search?q=Kimia%20dasar&category=judul_buku&page=1&per_page=10)
- **Verified:** 2026-11-15T06:13:26.995951+00:00; HTTP 200. Displayed count: 86. meta.total 86 but data array has3 records on per_page10 request.
- **Returned book:** *Kimia dasar* — Not supplied by returned record. Record identifier: `52722`. [Returned record](https://readily.ipb.ac.id/opac/detail-buku?id=52722).
- **Copies/status:** Search JSON JML_BUKU 1 / ALL_BUKU 1 but meanings not independently established; detail HTML copy table empty (likely client-loaded). Do not call confirmed live availability.
- **Public eligibility:** Public search. University and branch-specific access eligibility unresolved; subscriptions are separate from catalog discovery.
- **Policy check:** robots route404; public frontend-disclosed search API accessible without login. No bulk-reuse permission or partner agreement verified.
- **Integration:** Custom Readily adapter GET /opac/search?q=&category=judul_buku&page=1&per_page=10. API meta total 86 but returned data array 3 (pagination/filter discrepancy). CatalogId stable; detail /opac/detail-buku?id=. Public JS evidence ipb-js.html.
- **Saved evidence:** [query response](evidence/ipb-specific.html), [request metadata](evidence/ipb-specific.json), [detail response](evidence/ipb-detail.html).

### 8. UIN Sunan Kalijaga Library — Yogyakarta

- **Request:** GET [https://opac.uin-suka.ac.id/?version=1.1&operation=searchRetrieve&query=Harry%20Potter%20And%20The%20Cursed%20Child](https://opac.uin-suka.ac.id/?version=1.1&operation=searchRetrieve&query=Harry%20Potter%20And%20The%20Cursed%20Child)
- **Verified:** 2026-11-15T06:18:28.749743+00:00; HTTP 200. Displayed count: 1. Displayed count, not library collection size.
- **Returned book:** *Harry Potter and the cursed child* — J.K. Rowling. Record identifier: `No stable record ID exposed; SRU position1 is not an ID`.
- **Copies/status:** SRU returns 1 DC record. Separate HTML title search identifies floor 4, rack 700, call SR792.028 ROW h, Sphere 2017, 329 pages, John Tiffany coauthor. Copy/circulation state not exposed.
- **Public eligibility:** Public catalog and shelf location. Circulation is member-controlled; reference/reserve books may be onsite-only per official services: https://lib.uin-suka.ac.id/layanan/read/sirkulasi
- **Policy check:** robots route404. Public OPAC explicitly advertises SRU developer support; bulk reuse still not authorized. No bulk-reuse permission or partner agreement verified.
- **Integration:** Prefer advertised SRU endpoint; response has DC title/creator/date/publisher but no identifier/ISBN. Need stable-record mapping agreement or link to reproducible search; cannot invent record IDs. POST title form behaves differently from SRU (full-title POST returned none, SRU succeeded).
- **Saved evidence:** [query response](evidence/uinsuka-sru.html), [request metadata](evidence/uinsuka-sru.json).

### 9. Telkom University Open Library — Bandung, Jakarta, Purwokerto, Surabaya

- **Request:** POST [https://openlibrary.telkomuniversity.ac.id/home/catalog.html](https://openlibrary.telkomuniversity.ac.id/home/catalog.html)
- **POST form payload:** `{"search[title]": "Laskar Pelangi", "submit": "Cari"}`
- **Verified:** 2026-11-15T06:21:38.618478+00:00; HTTP 200. Displayed count: 5. Displayed count, not library collection size.
- **Returned book:** *Laskar pelangi* — Andrea Hirata. Record identifier: `220777 / ittp.0003396`. [Returned record](https://openlibrary.telkomuniversity.ac.id/home/catalog/id/220777/slug/laskar-pelangi.html).
- **Copies/status:** Four available print copies: 3 at Purwokerto Rectorate floor 1, 1 at floor 5; barcode A5889,A5903,A5944,A5940. ISBN979-3062-79-7. Five query results include DVD and thesis: filter by type.
- **Public eligibility:** Public online search. Official 2022 regulations allow external visitors with ID but prohibit take-home borrowing for non-civitas: https://openlibrary.telkomuniversity.ac.id/uploads/Peraturan%20perpustakaan_2022.pdf
- **Policy check:** Named GPTBot, ClaudeBot, Amazonbot and SemrushBot disallowed; Googlebot allowed; no generic rule. Technical test used unchanged transparent MyBookshelfResearch UA. Do not infer permission for AI crawlers or production; policy agreement required. No bulk-reuse permission or partner agreement verified.
- **Integration:** Custom POST adapter search[title]=,submit=Cari at /home/catalog.html; returned detail path /home/catalog/id/{id}/slug/{slug}. Preserve campus/location and type. No named generic product adapter.
- **Saved evidence:** [query response](evidence/telkom-specific.html), [request metadata](evidence/telkom-specific.json), [detail response](evidence/telkom-detail.html), [robots response](evidence/telkom-robots.html).

### 10. Universitas Padjadjaran / Kandaga Library — Jatinangor / Bandung

- **Request:** GET [https://opac.unpad.ac.id/index.php?search=search&keywords=Dasar-dasar%20mikrobiologi](https://opac.unpad.ac.id/index.php?search=search&keywords=Dasar-dasar%20mikrobiologi)
- **Verified:** 2026-11-15T06:23:06.005841+00:00; HTTP 200. Displayed count: not reliably extracted. Many title-matching records across pages; no reliable overall total extracted.
- **Returned book:** *Dasar-dasar mikrobiologi* — Michael J. Pelzcar [catalog spelling]; E.C.S. Chan. Record identifier: `Fakultas Perikanan dan Ilmu Kelautan:6634`. [Returned record](https://opac.unpad.ac.id/index.php?node=Fakultas+Perikanan+dan+Ilmu+Kelautan&p=show_detail&id=6634&keywords=Dasar-dasar+mikrobiologi).
- **Copies/status:** Eleven displayed copies at Fisheries/Marine Science faculty, barcodesTbD100486 throughTbD100496, all Tersedia, call2D1. ISBN979-8034-57-0.
- **Public eligibility:** Public search and availability. Reference materials onsite-only; general borrowing membership needs confirmation: https://kandaga.unpad.ac.id/panduan/layanan-koleksi
- **Policy check:** 200 explicit User-agent:* Allow:/. Kandaga separate host robots404; public documented API uses status=published,access_level=public. No bulk-reuse permission or partner agreement verified.
- **Integration:** New SLiMS union adapter; key by node+id, not id alone. Also verified public Kandaga API title Damar Wulan, author Zuber Usman, UUID 1a95b854-2e35-4b14-8877-66042676b36a; detail shows 2 available copies. Do not double-count both frontends as separate institutions.
- **Saved evidence:** [query response](evidence/unpad-opac-specific.html), [request metadata](evidence/unpad-opac-specific.json), [detail response](evidence/unpad-detail.html), [robots response](evidence/unpad-opac-robots.html).

For UIN Sunan Kalijaga, the exact-title SRU result has no stable identifier: `recordPosition=1` is only its position in that response. The older HTML query shows shelf location but no deep link. This is a real search success with an unresolved production record-mapping requirement. [HTML shelf proof](evidence/uinsuka-specific.html)

For Padjadjaran, the newer Kandaga public API also returns *Damar Wulan* by Zuber Usman. Its public detail page shows two available copies and ISBN 9786022601319. The API request is the one used by the public search JavaScript, with `status=published` and `access_level=public`; no credentials or private routes were used. This is a second route for the same university, not an eleventh institution. [API response](evidence/unpad-api-specific.html), [detail](evidence/unpad-modern-detail.html)

## Larger or otherwise valuable candidates that failed verification

- **[National Library of Indonesia / Perpusnas](https://opac.perpusnas.go.id/):** HTTP403; no book query success Scale: Official 13 Aug 2026 reports >3.6 million titles / 9.9 million copies, mixed formats; not all necessarily indexed online. [Source](https://perpusnas.go.id/berita/siaran-pers-pustakawan-penjaga-memori-kolektif-identitas-dan-pengetahuan-bangsa-di-era-teknologi-digital).
- **[Universitas Gadjah Mada](https://opac.lib.ugm.ac.id/):** Home200; exact title form POST repeatedly returns application error including same-session submission. Not query verified. Scale: 423,979 book titles reported 2023 across university collections. [Source](https://ugm.ac.id/en/news/ugm-library-holds-423979-book-titles-in-its-collection/). [Evidence](evidence/ugm-specific.json).
- **[Universitas Indonesia](https://lib.ui.ac.id/):** 25second read timeout; official alternate Lontar robots request tunnel403. No query verified. Scale: Official faculty page describes 1.5 million collections across central/faculties, undated/mixed; not comparable print-title total. [Source](https://ir.fisip.ui.ac.id/fasilitas/).
- **[Universitas Hasanuddin](https://opac-library.unhas.ac.id/opac/):** robots disallow all; no catalog query performed. Scale: Official profile ≈516,000 volumes, mixed books/theses/reports/serials/electronic/audio-visual. [Source](https://library.unhas.ac.id/profil-perpustakaan-en/). [Evidence](evidence/opac-library.unhas.ac.id-robots.html).
- **[Universitas Sebelas Maret (UNS)](https://unsla.uns.ac.id/):** SLiMS home reachable; robots wildcard exclusions cover search and keywords query parameters. No query performed. [Evidence](evidence/uns-robots.html).
- **[UIN Syarif Hidayatullah Jakarta](https://tulis.uinjkt.ac.id/):** Home reachable but robots disallow all; no query. Scale: 48,363 book titles, official 2025. [Source](https://www.uinjkt.ac.id/index.php/id/perkuat-literasi-dan-riset-perpustakaan-uin-jakarta-tambah-koleksi-hingga-48363-judul-buku). [Evidence](evidence/uinjkt-robots.html).
- **[West Java provincial public library](https://ilms.jabarprov.go.id/opac):** INLISLite 3.1 home 200; two actual title-query variants 404. Indexed search results alone do not count. Named GPTBot exclusion also present. [Evidence](evidence/jabar-search2.json).
- **[Universitas Muhammadiyah Surakarta](https://opac-lib.ums.ac.id/):** Koha home 200; actual title query 200 only koha_fast_challenge script stub; stopped without solving challenge. [Evidence](evidence/ums-specific.html).
- **[Universitas Pendidikan Indonesia](https://perpustakaan.upi.edu/opacnew/opac/):** HTTP503
- **[Universitas Negeri Yogyakarta](https://opac.uny.ac.id/search/index.php):** Tunnel403
- **[Universitas Sumatera Utara](https://digilib.usu.ac.id/):** HTTP503
- **[Universitas Negeri Malang](https://opac.lib.um.ac.id/):** Official library home 418; dedicated OPAC tunnel403.
- **[Soeman HS / Riau provincial library](https://pustaka.riau.go.id/):** HTTP503
- **[Grhatama / Yogyakarta provincial library](https://balaiyanpus.jogjaprov.go.id/opac/):** HTTP503

## Implementation consequences

1. Build SLiMS and INLISLite adapters from saved public fixtures, then validate with the app's actual provider interface. Union IDs require the faculty/node component; Indonesian availability strings and copy-level rows need explicit normalization.
2. Pilot Jakarta for a broad public audience; Airlangga/Brawijaya and Padjadjaran/Diponegoro for reuse across software families. Preserve library membership restrictions and onsite-only/withdrawn/warehouse statuses in the UI.
3. Treat OneSearch as an aggregation/partnership opportunity. Clarify metadata rights, endpoint stability, update cadence and institutional coverage, then retain direct institution links or a live holdings layer.
4. Resolve per-host robots, terms, rate limits and data-use arrangements before production. Telkom expressly excludes several named AI crawlers; successful transparent research requests do not settle that policy question. Unusable or missing robots files also do not constitute permission.
5. Obtain comparable current collection statistics from candidates before claiming “largest ten.” Favor verified print-book counts when evaluating a borrowing/discovery product; separate thesis/repository totals, titles, copies and subscription entitlements.

## Verification method and limitations

The research used low-volume public GET and read-only catalog search POST requests with the unchanged transparent user agent `MyBookshelfResearch/1.0 (public catalog feasibility check)`, TLS verification enabled, 25-second timeouts, and a one-megabyte response cap. A homepage, indexed snippet, HTTP 200 challenge page, repository-only search or successful book detail without an actual query was not counted. Search results were paired with returned records and available item metadata. Robots exclusions, explicit challenges and access failures were retained, not bypassed.

The initial snapshot contains **10 selected query successes**; the continuation below adds **one reserve**. Across all eleven there are **0 tested product integrations and 0 permission-cleared production integrations**. Public catalog search does not grant membership, permission to borrow, access to subscription full text, or rights for bulk collection. ITB's sampled copy is weeded, ITS's sampled copies are in storage, Diponegoro has conflicting availability text, and IPB's count/pagination and unloaded holdings need follow-up. Those limits are part of the evidence rather than hidden behind the success count.

The structured [findings.json](findings.json) includes exact methods, URLs, payloads, UTC times, HTTP status, titles/authors, stable identifiers where exposed, size basis, access policy and per-library integration notes. Raw files retain `.html` extensions even when the response is XML or JSON. The directory name reflects the parent study start date; the actual probes occurred on 15 November 2026 UTC. No product code changed, so no application test suite was run.

## Continuation: collection sizes, record mapping and one reserve

The original ten selected institutions are preserved. **Eleven distinct institutions/faculty libraries now have observed book-query successes: ten selected targets and one reserve.** None is a tested product integration, and the national largest-ten requirement remains unproven.

The additional collection research replaces five institution-only proxies with qualified numerical evidence. Brawijaya has a historical 2018 report of 68,152 book titles from a visiting public institution. ITB and Padjadjaran have 2009 government-directory figures, retained with their mixed-format and central-library scopes. Diponegoro's official 2025/26 handbook reports 17,598 book titles / 31,715 copies through 2024 for the Economics and Business faculty alone. UIN Sunan Kalijaga's current official page displays 124,281 “Buku,” but does not identify titles versus copies or a census date. These improve scale evidence; they cannot support an ordered national ranking. Sources are linked in the table above. [Government directory, selected pages](continuation-evidence/government-directory-2009-selected-pages.txt), [original PDF](continuation-evidence/government-directory-2009.pdf), [Diponegoro faculty handbook excerpt](continuation-evidence/undip-feb-2024-size-selected-pages.txt), [UIN official figures](continuation-evidence/uinsuka-facts.html)

One government-directory figure was explicitly rejected: Diponegoro's 2009 entry lists more titles than copies (57,986 versus 25,761). It was not silently corrected or used to rank the library. Brawijaya's 2009 mixed-format total is also not comparable to its 2018 book-title count.

UIN Sunan Kalijaga's stable-record requirement remains unresolved after bounded checks. Its advertised OAI-PMH service ignores a tested date filter; an advertised numeric record link returns only the home/search frame. The RSS title permalink does the same. Its official postgraduate SLiMS alternative returned tunnel403, so no query was attempted there. The original SRU result remains valid search evidence; it does not establish persistent catalog identity. [OAI response](continuation-evidence/uinsuka-entryday.html), [record-link response](continuation-evidence/uinsuka-oai-record60.html), [RSS permalink response](continuation-evidence/uinsuka-rss-permalink.html), [postgraduate-host failure](continuation-evidence/uinsuka-pasca-robots.json)

UGM's current official library homepage advertises a GET search form distinct from the previously failing POST. The new request for *Laskar Pelangi* returned the unchanged latest-books homepage, so it is not counted as a search success. No new National Library physical-catalog route was established, and its restricted OPAC was not retried. [UGM official form](continuation-evidence/ugm-official-home.html), [GET response](continuation-evidence/ugm-official-get-search.html)

### Reserve: Universitas Indonesia — Fasilkom faculty library only

The [official LONTAR faculty catalog](https://lontar.cs.ui.ac.id/Lontar/opac/themes/newui/index.jsp) displays **12,034 book-category records**, observed 15 November 2026. This is narrower than UI's central collection, whose catalog remains unresolved. It is retained as a useful reserve rather than substituted for one of the ten larger candidates.

- **Specific query:** GET [Introduction to Natural Language Processing](https://lontar.cs.ui.ac.id/Lontar/opac/themes/newui/hasilcari.jsp?query=Introduction%20to%20Natural%20Language%20Processing); 2026-11-15T07:09:29.849064+00:00; HTTP 200. The displayed 3,559 results include broad token matches and mixed documents; the exact requested book is a real search row, not just a recent-books sidebar.
- **Returned record:** [Introduction to Natural Language Processing](https://lontar.cs.ui.ac.id/Lontar/opac/themes/newui/detail.jsp?id=57139&lokasi=lokal) — Jacob Eisenstein; ID `57139|lokasi=lokal`. Faculty library call006.35 Eis i; item26/13254 marked fotocopy with return date2027-05-02, so no currently available copy established. Catalog reports MIT Press2018; do not correct edition metadata by title matching.
- **Returned record:** [Natural language processing in LISP: an introduction to computational linguistics](https://lontar.cs.ui.ac.id/Lontar/opac/themes/newui/detail.jsp?id=29764&lokasi=lokal) — Gerald Gazdar; ID `29764|lokasi=lokal`. Addison-Wesley1989; faculty item91/1023 call410.28 Gaz n marked TERSEDIA (available). Same item row appears twice; count as one unique item, not two copies.
- **Access/policy:** Anonymous catalog search works. Official faculty profile says service extends to UI and other public/private-university students; general-public borrowing rights not established. robots.txt returned HTTP404; no explicit exclusion obtained. Current app treats ordinary404 as no disallow rules. This does not establish reuse permission. No credentials, login or access bypass used.
- **Integration:** New LONTAR JSP adapter. Parse actual search rows, preserve id plus lokasi, fetch stock tab data included in detail HTML, normalize availability and deduplicate repeated item IDs. Faculty coverage only; central UI remains unresolved.
- **Evidence:** [search response](continuation-evidence/ui-computing-specific.html), [request metadata](continuation-evidence/ui-computing-specific.json), [Eisenstein detail](continuation-evidence/ui-computing-detail.html), [Gazdar detail](continuation-evidence/ui-computing-gazdar-detail.html).

The continuation kept the same transparent research user agent and TLS checks. Catalog bodies remain bounded to one megabyte. The 450KB government PDF is retained; the 26.2MB official Diponegoro handbook was temporarily downloaded with a 30MB cap and only its relevant page text retained. Current app robots semantics were used when assessing exclusions, including wildcard paths and longest-rule precedence. No challenge, explicit exclusion or credential requirement was bypassed.
