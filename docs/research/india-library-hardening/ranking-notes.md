# Indian library hardening: size evidence and frozen cohort

The run uses **50 connected institutions selected by documented collection size where available**, with official IndCat contribution counts filling evidence gaps. This is a size-led priority cohort, **not a proven list of India's 50 largest libraries**. Twenty selections still use partial contributed catalog records as a proxy. No observed search success, response speed, or availability result was used to select institutions.

The cohort was frozen on **15 November 2026 UTC** for the task started on 14 November. `selectedLibraryIds` and `selectedForHardening` in [candidates.json](candidates.json) are the run manifest. `provisionalTop50` is an equal compatibility flag; “provisional” qualifies the national size claim, not whether the test cohort is frozen.

## Scope and method

- The input is the app's merged Indian directory snapshot: **6,704 entries**. Its SHA-256 is recorded in the JSON. An entry means a configured catalog integration, not verified current connectivity or public borrowing access.
- The inventory contains **98 candidate institutions at the freeze, plus one later sensitivity candidate**: the 75 largest connected IndCat contributions, additional major universities with lower contributions, and major direct/public catalog candidates. This is a bounded candidate screen, not a census of every institution's physical holdings.
- Use an official institutional physical collection count where found. Preserve whether it counts books, mixed volumes, documents, or a whole university system. Prefer a printed subtotal over a total that includes licensed ebooks. Do not add titles and copies, sections already included in a total, or central and whole-system counts together.
- Otherwise use the official institution-scoped IndCat contributed-record count. This reflects searchable catalog coverage, not all physical stock. Those counts are not converted to book copies. Official provenance gives high confidence in the published number; it does not make different metrics or dates comparable.
- Order the chosen evidence values numerically to create an operational priority list. This intentionally simple heuristic gives a reproducible cohort; it cannot establish exact physical-size rank. `exactNationalSizeRank` is null throughout. Institutions near the cutoff are particularly uncertain.
- The selected cohort contains **41 IndCat institutions, four Koha institutions, two eGranthalaya members, two community catalogs, and IIT Madras's Chamo catalog**. Of these, **28 have institutional collection evidence, two use current member catalog holdings, and 20 use IndCat contributions**.

## Institution identity and catalog scope

Each institution counts once. Roja Muthiah's active `discovery-community:rmrl-chennai` entry and older `catalog:rmrl-chennai` link are one library. CUSAT's IndCat institution and native `koha:cusat-union-ul` are one institution; other CUSAT departmental branches are not extra selections. Patna's IndCat institution and `egranthalaya:universities-patnauni` are also one institution. Alternate entries are retained in the JSON so test results can be attributed without inflating the denominator. Whole university collection figures may span multiple campuses while the connected catalog covers only part of that stock.

The merged directory's names, slugs, and aliases were checked for the National Library in Kolkata, Delhi Public Library, Connemara, Khuda Bakhsh, Rampur Raza, Saraswathi/Sarasvati Mahal, and the Asiatic libraries. No matching configured institution was identified. Kerala State Central Library was likewise not identified. These prominent institutions cannot be silently treated as connected selections. This is a directory identification result, not a claim that they have no public catalog; their connection status needs separate directory research.

## Source evidence and limits

Every quantitative candidate has source URL, observation date, publication/collection date when known, material unit, scope, source confidence, and comparison confidence in the JSON. Undated pages remain explicitly undated: the observation date is not a holdings date.

[IndCat's official participating-institute page](https://indcat.inflibnet.ac.in/index.php/main/book) provided the common baseline. Its heading reported 440 participating institutes; 434 unique institution codes were parsed from the first institution list, and all **407 app IndCat scopes** matched. The first occurrence per code was used because the page also contains other update-count lists. Do not mix those later counts with total contributed-record counts. The frozen source data were inspected on 15 November 2026; no search-result count was substituted for institutional stock.

Several examples show why the proxy needs care:

- Allahabad reports **786,558 books and bound journal volumes as of 31 March 2026**, while its IndCat contribution is 129,714 records. Physical stock and the contributed catalog answer different questions.
- Kerala's official page describes nearly **one million books across its university system**, with over 358,000 in the central library. Count the institution once and do not add those two overlapping figures.
- Delhi's 1,653,277 printed-book volumes excludes its separately listed journals and theses. IIT Madras's **300,586 physical books** is a reproducible subtotal: 265,875 general + 17,698 gratis + 1,403 Hindi + 15,610 Book Bank, from its 2024–25 annual report. Its mixed 334,019 total is not substituted.
- Romain Rolland's fresh official member statistics report **405,020 holdings / 226,012 titles**; Harekrushna Mahtab reports **282,233 holdings / 184,604 titles**. Their eGranthalaya agent observations and exact timestamps are retained. These are catalog holdings, not unique works. Older tourism/RTI figures were not treated as current totals.
- Roja Muthiah's approximately **500,000 items** includes archives, periodicals, museum objects, and ephemera. It is not a 500,000-book claim. Panjab, AMU, BHU, GNDU, Pune, Punjabi, and National Science Library likewise use explicitly mixed units where their sources do.
- Anna Centenary's official page has a **625,000-book collection field** and older 500,000-book prose on the same page. The field is used, with the conflict retained. LBSNAA's dedicated collection page has **172,344 books**, while another official RTI page has 179,763; neither is silently treated as a precisely dated current census.
- Kalaignar's **364,521 books** comes from the government-authored 2025–26 policy note, but only a third-party mirror was retrieved. Official hosting was not verified, so source confidence is medium. Rajasthan's 508,000-book official excerpt and Patna's historical 250,000 mixed-volume lower bound were search-index visible while full source retrieval failed; they also carry medium confidence.
- JNU's statistics and collection-description pages differ in dates/material scope. The selected 350,000-book statistic excludes the separately named 200,000 ebooks. Madras's 293,128 books is the Chepauk central library count dated 30 September 2020, not a claim about every university campus in 2026.
- British Council India's physical total and Visakhapatnam Public Library's total were not verified. Digital subscription numbers and member counts were not substituted. They remain supplementary candidates rather than fabricated size selections.

Additional official counts discovered after the freeze should be recorded as sensitivity evidence, not used to swap out failing members. In particular, other eGranthalaya public members are being probed separately; a newly observed larger count would show cohort uncertainty, not justify retrospective selection by success.

## Late sensitivity finding: IIT Roorkee

The subsequent ranking audit found a connected institution omitted from the initial screen: **IIT Roorkee (`indcat:indcat-roor-247667`, scope `ROOR_247667`)**. Its [official 2024–25 annual report](https://iitr.ac.in/Careers/static/Institute/Annual_Reports/2024-2025/AnnualReportHindiVersion2024-25.pdf), printed page 108 / PDF page 114, reports **340,000 physical books**, separately listing 64,800 ebooks, 65,200 bound-journal volumes and 18,000+ theses/dissertations. IndCat lists only 38,306 contributed records for this institution. This gap illustrates how the initial contribution-led screen could omit a physically large institution.

Roorkee is appended as the **99th inventory candidate**, explicitly flagged as discovered after the freeze. Its physical count exceeds the frozen operational cutoff of 171,974. The same mixed-metric heuristic would place it around queue position 25, but this is not a national size rank. The frozen 50 remain unchanged so failed members cannot be replaced retrospectively. Roorkee receives a separate ten-book sensitivity check after the primary cohort and before smaller reserve candidates. IIT Kharagpur, IIT Kanpur and IISc were not identified as connected institutional entries in the bounded name check; a school located on an IIT campus must not be treated as the IIT library.

## Frozen 50-institution manifest

“Priority” below is the test queue order under the mixed evidence rule, not a national physical-size rank. The source and date for each figure are in the linked JSON.

| Priority | Institution | Evidence value and unit | App library ID |
| --- | --- | --- | --- |
| 1 | University of Delhi, Delhi | 1,653,277 printed book volumes | `indcat:indcat-deli-110007` |
| 2 | Banaras Hindu University,Varanasi | 1,600,000 collection volumes | `indcat:indcat-bhul-221005` |
| 3 | Aligarh Muslim University, Aligarh | 1,400,000 document volumes | `indcat:indcat-amul-202002` |
| 4 | University of Calcutta, Kolkata | 1,000,000 books | `indcat:indcat-clct-700073` |
| 5 | University of Kerala, Thiruvanathapuram | 1,000,000 books | `indcat:indcat-krla-695034` |
| 6 | Panjab University, Chandigarh | 800,000 publications | `indcat:indcat-pulc-160014` |
| 7 | University of Allahabad, Allahabad | 786,558 books and bound journal volumes | `indcat:indcat-alhb-211002` |
| 8 | Jadavpur University, Kolkata | 694,191 library collection items | `indcat:indcat-jdvp-700032` |
| 9 | University of Mumbai, Mumbai | 665,618 IndCat institution-scoped catalog records | `indcat:indcat-bomb-400032` |
| 10 | Anna Centenary Library | 625,000 books | `koha:anna-centenary-library` |
| 11 | Gujarat Vidyapith, Ahmedabad | 616,105 IndCat institution-scoped catalog records | `indcat:indcat-gjvl-380014` |
| 12 | University of Mysore, Mysore | 600,000 reference and textbooks | `indcat:indcat-mysr-570005` |
| 13 | Punjabi University, Patiala | 579,200 volumes | `indcat:indcat-pjbi-147002` |
| 14 | Osmania University, Hyderabad | 558,713 books | `indcat:indcat-ould-500007` |
| 15 | University of Lucknow, Lucknow | 555,264 books | `indcat:indcat-lutl-226007` |
| 16 | Guru Nanak Dev University, Amritsar | 543,357 books and documents | `indcat:indcat-gndu-143005` |
| 17 | University of Rajasthan, Jaipur | 508,000 books | `indcat:indcat-rjtn-302004` |
| 18 | Roja Muthiah Research Library | 500,000 mixed collection items | `discovery-community:rmrl-chennai` |
| 19 | Savitribai Phule Pune University | 477,173 printed books, bound periodicals and theses | `indcat:indcat-pune-411007` |
| 20 | Romain Rolland Library | 405,020 catalog holdings | `egranthalaya:pylib-rrlpy` |
| 21 | The Maharaja Sayajirao University of Baroda, Vadodara | 372,576 IndCat institution-scoped catalog records | `indcat:indcat-msub-390002` |
| 22 | Kalaignar Centenary Library | 364,521 books | `koha:kalaignar-centenary-library` |
| 23 | Annamalai University, Annamalainagar | 357,548 IndCat institution-scoped catalog records | `indcat:indcat-anml-608002` |
| 24 | Jawaharlal Nehru University, New Delhi | 350,000 books | `indcat:indcat-jnul-110067` |
| 25 | Kurukshetra University, Kurukshetra | 339,817 volumes | `indcat:indcat-krkt-132119` |
| 26 | Narmad Central Library | 339,711 books | `discovery-community:surat-1` |
| 27 | Andhra University, Waltair | 317,461 IndCat institution-scoped catalog records | `indcat:indcat-andh-530003` |
| 28 | Indian Institute of Technology Madras | 300,586 physical books | `chamo:iit-madras` |
| 29 | Indian Institute of Technology, Delhi | 300,000 documents | `indcat:indcat-iitd-110016` |
| 30 | University of Madras, Chennai | 293,128 books | `indcat:indcat-mdrs-600005` |
| 31 | Gauhati University, Guwahati | 283,475 book volumes | `indcat:indcat-ghti-781014` |
| 32 | Harekrushna Mahtab State Library | 282,233 catalog holdings | `egranthalaya:publiclibraries-hkmslib` |
| 33 | Dr. Babasaheb Ambedkar Marathwada University, Aurangabad | 275,977 IndCat institution-scoped catalog records | `indcat:indcat-mwun-431004` |
| 34 | University of Hyderabad, Hyderabad | 275,493 IndCat institution-scoped catalog records | `indcat:indcat-hydr-500046` |
| 35 | Indian Institute of Technology, Bombay | 270,057 IndCat institution-scoped catalog records | `indcat:indcat-iitb-400076` |
| 36 | Gujarat University, Ahmedabad | 252,893 IndCat institution-scoped catalog records | `indcat:indcat-gjul-380009` |
| 37 | National Science Library, CSIR-NIScPR | 251,000 printed science and technology documents | `koha:national-science-library` |
| 38 | Patna University, Patna | 250,000 books and journals | `indcat:indcat-ptna-800005` |
| 39 | Sardar Patel University, Vallabh Vidyanagar | 223,109 IndCat institution-scoped catalog records | `indcat:indcat-spun-388120` |
| 40 | Sri Venkateswara University, Tirupati | 217,502 IndCat institution-scoped catalog records | `indcat:indcat-svul-517502` |
| 41 | Gokhale Institute of Politics & Economics, Pune | 205,542 IndCat institution-scoped catalog records | `indcat:indcat-gipe-411004` |
| 42 | Maharshi Dayanand University, Rohtak | 201,217 IndCat institution-scoped catalog records | `indcat:indcat-mdnd-124001` |
| 43 | CHRIST University | 198,116 IndCat institution-scoped catalog records | `indcat:indcat-chri-560029` |
| 44 | Veer Narmad South Gujarat University, Surat | 192,943 IndCat institution-scoped catalog records | `indcat:indcat-sguj-395007` |
| 45 | North-Eastern Hill University, Shillong | 191,287 IndCat institution-scoped catalog records | `indcat:indcat-nehu-793022` |
| 46 | Bangalore University, Bengaluru | 178,589 IndCat institution-scoped catalog records | `indcat:indcat-bngl-560056` |
| 47 | Cochin University of Science & Technology, Cochin | 178,045 IndCat institution-scoped catalog records | `indcat:indcat-cust-682022` |
| 48 | Birla Institute of Technology and Science, Pilani | 175,394 IndCat institution-scoped catalog records | `indcat:indcat-bits-333031` |
| 49 | Gandhi Smriti Library, LBSNAA | 172,344 books | `koha:lbsnaa-gandhi-smriti` |
| 50 | Indian Institute of Management Ahmedabad | 171,974 IndCat institution-scoped catalog records | `indcat:indcat-iima-380015` |

## Interpreting the ten-book checks

The reliability run should retain the frozen institution denominator even when a host is inaccessible or a catalog restricts automation. Ten known member records per institution exercise search, identity-preserving record reads, and the app lookup contract. They do not estimate recall over the whole collection or prove that ten arbitrary popular books are held. A title collision, another member's record, catalog transport failure, and a confirmed absence must remain separate outcomes. Wider-platform checks should be reported separately from this fixed cohort to avoid turning successful catalogs into a replacement sample.
