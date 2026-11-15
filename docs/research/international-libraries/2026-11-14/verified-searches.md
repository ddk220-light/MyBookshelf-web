# Verified international book searches

**46 selected institutions or networks returned books; 10 additional observations are retained as reserves.** The selected shortlist remains short of ten in: Nigeria (4 missing). These are catalog observations, with institution-specific integration issues, rather than a national ranking or a completed rollout.

A network counts once; branch selectors are not additional verified institutions. Size evidence has different units, dates and completeness; no national top-ten ranking is established. Successful queries do not establish permission, current circulation data, public borrowing eligibility or app integration. UMT has an observed success but explicitly prohibits automated search; retained as a restricted reserve. LST returned related book titles, not the exact requested edition; repeated searches also failed. Matching and reliability remain unresolved. Country dossiers retain larger blocked candidates and collection-size evidence.

All requests shown below returned HTTP 200 with actual book records. Exact UTC timestamps, POST payloads, source sizes, policies, returned records and raw-response paths are available in [JSON](verified-searches.json) and [CSV](verified-searches.csv). A result count may include editions, broad title matches or visible cards; consult the country dossier for its definition. A blank count is not zero.

| Country | Selected | Reserves | Total observed |
|---|---:|---:|---:|
| Bangladesh | 10 | 1 | 11 |
| Pakistan | 10 | 2 | 12 |
| Nigeria | 6 | 4 | 10 |
| Philippines | 10 | 2 | 12 |
| Indonesia | 10 | 1 | 11 |

## Bangladesh

[Country analysis and integration qualifications](bangladesh/report.md)

| Library | Platform | Actual query | Returned book | Result count |
|---|---|---|---|---:|
| University of Chittagong Central Library | Koha | [Pride and prejudice](<https://opac.cu.ac.bd/cgi-bin/koha/opac-search.pl?q=Pride%20and%20prejudice>) | [Pride and prejudice](<https://opac.cu.ac.bd/cgi-bin/koha/opac-detail.pl?biblionumber=23458>) | 20 |
| Chittagong University of Engineering & Technology Central Library | Koha | [Introduction to algorithms](<http://103.99.128.14/cgi-bin/koha/opac-search.pl?q=Introduction%20to%20algorithms>) | [Introduction to algorithms](<http://103.99.128.14/cgi-bin/koha/opac-detail.pl?biblionumber=206>) | 10 |
| Khulna University of Engineering & Technology Central Library | Koha | [Introduction to algorithms](<https://library-backup.kuet.ac.bd/cgi-bin/koha/opac-search.pl?q=Introduction%20to%20algorithms>) | [Introduction to algorithms](<https://library-backup.kuet.ac.bd/cgi-bin/koha/opac-detail.pl?biblionumber=7590>) | 110 |
| Khulna University Kazi Nazrul Islam Central Library | Koha | [Introduction to algorithms](<https://opac.library.ku.ac.bd/cgi-bin/koha/opac-search.pl?q=Introduction%20to%20algorithms>) | [Introduction to algorithms](<https://opac.library.ku.ac.bd/cgi-bin/koha/opac-detail.pl?biblionumber=18404>) | 14 |
| Rajshahi University of Engineering & Technology Central Library | Koha | [Introduction to algorithms](<http://centrallibrary.ruet.ac.bd/cgi-bin/koha/opac-search.pl?q=Introduction%20to%20algorithms>) | [Introduction to algorithms](<http://centrallibrary.ruet.ac.bd/cgi-bin/koha/opac-detail.pl?biblionumber=4191>) | 3 |
| Islamic University of Technology Library | Koha | [Introduction to algorithms](<http://103.82.172.142:8081/cgi-bin/koha/opac-search.pl?q=Introduction%20to%20algorithms>) | [Introduction to algorithms](<http://103.82.172.142:8081/cgi-bin/koha/opac-detail.pl?biblionumber=8114>) | 12 |
| Jagannath University Central Library | Koha | [Research methodology](<https://opac.jnu.ac.bd/cgi-bin/koha/opac-search.pl?q=Research%20methodology>) | [Research methodology: methods and techniques](<https://opac.jnu.ac.bd/cgi-bin/koha/opac-detail.pl?biblionumber=34>) | 71 |
| Independent University, Bangladesh Library | Koha | [Principles of marketing](<https://opac.iub.edu.bd/cgi-bin/koha/opac-search.pl?q=Principles%20of%20marketing>) | [Principles of marketing](<https://opac.iub.edu.bd/cgi-bin/koha/opac-detail.pl?biblionumber=717>) | 44 |
| City University Library | Koha | [Principles of marketing](<http://opac.cityuniversity.ac.bd/cgi-bin/koha/opac-search.pl?q=Principles%20of%20marketing>) | [Principles of marketing](<http://opac.cityuniversity.ac.bd/cgi-bin/koha/opac-detail.pl?biblionumber=2>) | 6 |
| Sylhet Agricultural University Central Library | Koha | [Plant physiology](<https://opac.sau.ac.bd/cgi-bin/koha/opac-search.pl?q=Plant%20physiology>) | [Plant physiology and development](<https://opac.sau.ac.bd/cgi-bin/koha/opac-detail.pl?biblionumber=4075>) | 36 |

## Pakistan

[Country analysis and integration qualifications](pakistan/report.md)

| Library | Platform | Actual query | Returned book | Result count |
|---|---|---|---|---:|
| Dow University of Health Sciences library system | Koha | [Crime or custom](<https://koha.duhs.edu.pk/cgi-bin/koha/opac-search.pl?q=Crime+or+custom&idx=ti>) | [Crime or custom? : violence against women in Pakistan.](<https://koha.duhs.edu.pk/cgi-bin/koha/opac-detail.pl?biblionumber=38033>) | 25 |
| Quaid-e-Awam University (QUEST), Nawabshah | Koha | [Pakistan Standards Catalogue](<https://library.quest.edu.pk/cgi-bin/koha/opac-search.pl?q=Pakistan+Standards+Catalogue&idx=ti>) | [Pakistan Standards Catalogue](<https://library.quest.edu.pk/cgi-bin/koha/opac-detail.pl?biblionumber=7655>) |  |
| International Islamic University Islamabad union catalog | Koha | [Census Atlas of Pakistan](<http://opac.iiu.edu.pk:9194/cgi-bin/koha/opac-search.pl?q=Census+Atlas+of+Pakistan&idx=ti>) | [Census Atlas of Pakistan 1980-81 / Pakistan: Population Census Organization](<http://opac.iiu.edu.pk:9194/cgi-bin/koha/opac-detail.pl?biblionumber=27223>) | 2 |
| National Library of Pakistan | SLiMS (Senayan) | [Honour unmasked](<https://nlp.slims.pk/index.php?title=Honour+unmasked&search=search>) | [Honour unmasked: Gender violence, Law, and power in Pakistan.](<https://nlp.slims.pk/index.php?p=show_detail&id=208085>) | 1 |
| University of the Punjab — central/departmental union catalog | Custom ASP.NET legacy Web OPAC plus newer custom PHP catalog; vendor unconfirmed | POST: Pakistan the formative phase ([payload](pakistan/findings.json)) | [Pakistan the formative phase 1857-1948](<http://111.68.103.2/opac/Detail.aspx?MFN=181711&LibId=67&FRM=>) | 12 |
| FAST-NUCES Network of Libraries | Insignia ILS / Discovery Layer | [100 business leaders of pakistan](<https://nu.insigniails.com/Library/DoSearch?l=All&t=Keywords&k=100+business+leaders+of+pakistan&action=simple&p=1&ps=30&st=t02TitlesForOrderBy&ifs=0&c=c&sw=false&oldSearchType=Keywords>) | [100 business leaders of pakistan](<https://nu.insigniails.com/Library/ItemDetail?l=All&i=27806&ti=0>) | 4 |
| State Bank of Pakistan Library | Library Online 2.0 — custom PHP interface | [Breaking the curfew](<https://sbplibrary.sbp.org.pk/search/results?org=1&title=Breaking+the+curfew&language=-1&submit_button=Search&search_type=advanced>) | [Breaking the curfew: a political journey through Pakistan](<https://sbplibrary.sbp.org.pk/book/detail/70814/1>) | 2 |
| Government College University Faisalabad library system | Custom PHP library application | [Diversity in Myxomycetous Fungi of Pakistan](<https://library.gcuf.edu.pk/search.php?TITLE=Diversity+in+Myxomycetous+Fungi+of+Pakistan>) | Diversity in Myxomycetous Fungi of Pakistan (record link unresolved) | 4 |
| National University of Modern Languages — Sir Syed main library | LibMax by Max Intelligence | [Constitutional and political history of Pakistan](<https://library.numl.edu.pk/lib/opac/SearchBook.aspx?pagenumber=1&column=Title&criteria=Constitutional+and+political+history+of+Pakistan>) | [Constitutional and political history of Pakistan](<https://library.numl.edu.pk/lib/opac/BookDetail.aspx?id=232899>) | 3 |
| National Defence University — Sahabzada Yaqub Khan Library | LibMax by Max Intelligence | [Constitutional and political history of Pakistan](<http://syklibrary.ndu.edu.pk/libmax/opac/SearchBook.aspx?column=Title&criteria=Constitutional+and+political+history+of+Pakistan&pagenumber=1>) | [Constitutional and Political History of Pakistan](<http://syklibrary.ndu.edu.pk/libmax/opac/BookDetail.aspx?id=82880>) | 4 |

## Nigeria

[Country analysis and integration qualifications](nigeria/report.md)

| Library | Platform | Actual query | Returned book | Result count |
|---|---|---|---|---:|
| National Open University of Nigeria integrated library catalog | Koha | [The foundations of behavioral economic analysis](<https://koha.nou.edu.ng/cgi-bin/koha/opac-search.pl?idx=ti&q=The%20foundations%20of%20behavioral%20economic%20analysis>) | [The foundations of behavioral economic analysis](<https://koha.nou.edu.ng/cgi-bin/koha/opac-detail.pl?biblionumber=2553>) |  |
| University of Lagos Library | NewGenLib | [Things fall apart](<http://librarydb.unilag.edu.ng/newgenlibctxt/Search?searchText=Things+fall+apart&SelectedUnixNames=&From=Library&ResultSetOffset=1&LibraryId=1&FormName=Books&ApplyFacet=false&AuthorSearch=&SubjectSearch=&ClassNumberSearch=&NewSearch=false&ExactAFId=&SortField=&Index=Title>) | [Things fall apart](<http://librarydb.unilag.edu.ng/newgenlibctxt/View?From=Library&CatId=24417&OwnLibId=1&Position=1&RecordsFound=5&CurrentPage=1&LibraryId=1>) | 5 |
| Obafemi Awolowo University — Hezekiah Oluwasanmi Library | Koha | [My watch](<https://opac.oauife.edu.ng/cgi-bin/koha/opac-search.pl?idx=ti&q=My%20watch>) | [My watch](<https://opac.oauife.edu.ng/cgi-bin/koha/opac-detail.pl?biblionumber=330>) | 2 |
| University of Benin — John Harris Library | NewGenLib | [Things fall apart](<https://ir.uniben.edu/newgenlibctxt/Search?searchText=Things+fall+apart&SelectedUnixNames=&From=Library&ResultSetOffset=1&LibraryId=1&FormName=Books&ApplyFacet=false&AuthorSearch=&SubjectSearch=&ClassNumberSearch=&NewSearch=true&ExactAFId=&SortField=&Index=Title>) | [Things fall apart](<https://ir.uniben.edu/newgenlibctxt/View?From=Library&CatId=145&OwnLibId=1&Position=0&RecordsFound=1&CurrentPage=1&LibraryId=1>) | 1 |
| Kaduna State University Library | Koha | [Principles of Economics](<https://opac.kasu.edu.ng/cgi-bin/koha/opac-search.pl?idx=ti&q=Principles%20of%20Economics>) | [Principles of Economics](<https://opac.kasu.edu.ng/cgi-bin/koha/opac-detail.pl?biblionumber=1989>) | 2 |
| Nigerian Institute of Advanced Legal Studies — Taslim Elias Olawale Library | Koha | [The economics of justice](<https://opac.nials.edu.ng/cgi-bin/koha/opac-search.pl?idx=ti&q=The%20economics%20of%20justice>) | [The economics of justice](<https://opac.nials.edu.ng/cgi-bin/koha/opac-detail.pl?biblionumber=308>) | 2 |

## Philippines

[Country analysis and integration qualifications](philippines/report.md)

| Library | Platform | Actual query | Returned book | Result count |
|---|---|---|---|---:|
| National Library of the Philippines | Philippine eLib custom PHP union catalog; NLP direct OPAC is Koha | POST: Noli me tangere ([payload](philippines/findings.json)) | [Noli Me Tangere: a complete English translation of Noli Me Tangere from the Spanish of Dr. Jose Rizal](<https://www.elib.gov.ph/details.php?uid=ae8bf341fb63dc17d7ba28a04bf360da>) | 344 |
| University of the Philippines Diliman Library System | Philippine eLib custom PHP; current TUKLAS discovery is VuFind, underlying UP systems vary | POST: Noli me tangere ([payload](philippines/findings.json)) | [Noli me tangere; a complete English translation of Noli me tangere from the Spanish of Dr. Jose Rizal, by Camilo Osias](<https://www.elib.gov.ph/details.php?uid=679bb57a3da8f0e5e8b36d4bc7dfd97f>) | 173 |
| University of San Carlos Library System | TLC Library.Solution legacy web PAC | POST: Noli me tangere ([payload](philippines/findings.json)) | [Ang noli me tangere: nobela](<http://library.usc.edu.ph/TLCScripts/interpac.dll?LabelDisplay&LastResult=Search%26Config=sample%26FormId=1349865083%26Branch=,0,%26LimitsId=0%26StartIndex=0%26SearchField=1%26SearchType=1%26SearchData=Noli+me+tangere%26NotAddToHistory=1%26ItemsPerPage=20%26SortField=0%26PeriodLimit=-1%26SearchAvailableOnly=0&DataNumber=423498&RecordNumber=423498&SearchAvailableOnly=0&FormId=1349865083&ItemField=1&Config=sample&Branch=,0,>) | 39 |
| Ateneo de Davao University Libraries | TLC LS2 PAC5.7.6 (public JS and anonymous JSON search) | POST: Noli me tangere ([payload](philippines/findings.json)) | [Noli me tangere](<https://opaclibrary.addu.edu.ph/#section=resource&resourceid=1903720675&currentIndex=0&view=fullDetailsDetailsTab>) | 138 |
| DOST Science and Technology Information Institute Library | ScINET-PHIL custom Laravel/Inertia public catalog; not established as Koha | [Fundamentals of physics](<https://scinet.dost.gov.ph/search?keyword=Fundamentals%20of%20physics&material_type=BOOKS&field=title&location=STII>) | [Fundamentals of physics](<https://scinet.dost.gov.ph/catalog/248361>) | 3 |
| Mariano Marcos State University Library System | Koha | [Noli me tangere](<https://opac.mmsu.edu.ph/cgi-bin/koha/opac-search.pl?idx=ti&q=Noli%20me%20tangere>) | [Noli Me Tangere](<https://opac.mmsu.edu.ph/cgi-bin/koha/opac-detail.pl?biblionumber=22292>) | 10 |
| Department of Social Welfare and Development Libraries | Koha | [Social work with families](<https://e-library.dswd.gov.ph/cgi-bin/koha/opac-search.pl?idx=ti&q=Social%20work%20with%20families>) | [Social work with families: readings in social work](<https://e-library.dswd.gov.ph/cgi-bin/koha/opac-detail.pl?biblionumber=550>) |  |
| Commission on Higher Education Central Office Library | Philippine eLib custom PHP; separate current CHED catalog is Koha | POST: A Roadmap to quality education ([payload](philippines/findings.json)) | [A Roadmap to quality education: a new Philippine education highway: higher education for global competitiveness](<https://www.elib.gov.ph/details.php?uid=46296bb0dfe37e6a86d98ccfb387c336>) | 1 |
| Loyola School of Theology — Ralph B. Gehring Library | TLC Library.Solution legacy PAC (official HTTP catalog) | POST: Confessions of Saint Augustine ([payload](philippines/findings.json)) | [Heidegger’s confessions : the remains of Saint Augustine in Being and Time and beyond](<http://lstlibrary.admu.edu.ph/TLCScripts/interpac.dll?LabelDisplay&LastResult=Search%26Config=PAC%26FormId=350884%26Branch=,0,%26LimitsId=0%26StartIndex=0%26SearchField=7%26SearchType=1%26SearchData=Confessions+of+Saint+Augustine%26NotAddToHistory=1%26ItemsPerPage=10%26SortField=0%26PeriodLimit=-1%26SearchAvailableOnly=0&DataNumber=73889&RecordNumber=73889&SearchAvailableOnly=0&FormId=350884&ItemField=1&Config=PAC&Branch=,0,>) | 2 |
| Adventist International Institute of Advanced Studies — Leslie Hardinge Library | TLC LS2 PAC5.9.0; public UI JavaScript documents anonymous JSON search | POST: Research design : why thinking about design matters ([payload](philippines/findings.json)) | [Research design : why thinking about design matters](<https://lhl.aiias.edu/#/resource/502930612>) | 5 |

## Indonesia

[Country analysis and integration qualifications](indonesia/report.md)

| Library | Platform | Actual query | Returned book | Result count |
|---|---|---|---|---:|
| Perpustakaan Jakarta / Jaklitera public-library network | Jaklitera custom frontend; INLIS-style record identifiers, underlying backend version unverified | [Laskar Pelangi](<https://perpustakaan.jakarta.go.id/book?keyword=Laskar+Pelangi>) | [Laskar pelangi](<https://perpustakaan.jakarta.go.id/book/detail?cn=JAKPU-12139000001531>) | 12 |
| Universitas Airlangga Library / AILiS | INLISLite X AILIS (explicit footer) | [Metode penelitian sosial](<https://ailisx.lib.unair.ac.id/opac/pencarian-sederhana?action=pencarianSederhana&katakunci=Metode+penelitian+sosial&ruas=Judul&bahan=Semua+Jenis+Bahan&location=Perpustakaan+Pusat>) | [Metode penelitian sosial](<https://ailisx.lib.unair.ac.id/opac/detail-opac?id=271a48ea5da859f9d7b0d3a86a9b5b09ea2eb504>) | 15 |
| Universitas Brawijaya Library | INLISLite v3.0 (footer) | [Calculus with analytic geometry](<https://digilib.ub.ac.id/opac/pencarian-sederhana?action=pencarianSederhana&katakunci=Calculus+with+analytic+geometry&ruas=Judul&bahan=Semua+Jenis+Bahan>) | [Calculus with analytic geometry](<https://digilib.ub.ac.id/opac/detail-opac?id=1364>) | 10 |
| Universitas Diponegoro Integrated Library | SLiMS; explicit footer | [Harry Potter and the Deathly Hallows](<https://lib.undip.ac.id/index.php?search=search&keywords=Harry%20Potter%20and%20the%20Deathly%20Hallows>) | [Harry Potter and the Deathly Hallows : Harry Potter dan Relikui Kematian](<https://lib.undip.ac.id/index.php?p=show_detail&id=7128&in=Fakultas%20Ilmu%20Budaya>) | 3 |
| Institut Teknologi Bandung Library | Custom ITB WebPAC; no vendor inferred | [Calculus and linear algebra](<https://webpac.lib.itb.ac.id/find/goMatch?q=Calculus+and+linear+algebra&bFind=title>) | [Calculus and linear algebra, vol.1: vectors in the plane and one-variable calculus](<https://webpac.lib.itb.ac.id/find/detail/68422>) | 69533 |
| Institut Teknologi Sepuluh Nopember Library | SPITS; engine supported by Linspro (footer) | POST: Brief calculus with applications ([payload](indonesia/findings.json)) | Brief calculus with applications (POST detail; [request](indonesia/evidence/its-detail.json)) | 2 |
| IPB University Library / Readily | Readily custom public JSON frontend; older INLIS lineage not assumed current API contract | [Kimia dasar](<https://readily.ipb.ac.id/opac/search?q=Kimia%20dasar&category=judul_buku&page=1&per_page=10>) | [Kimia dasar](<https://readily.ipb.ac.id/opac/detail-buku?id=52722>) | 86 |
| UIN Sunan Kalijaga Library | Custom OPAC; explicitly advertises SRU 1.1 and OAI. Backend LMS unverified. | [Harry Potter And The Cursed Child](<https://opac.uin-suka.ac.id/?version=1.1&operation=searchRetrieve&query=Harry%20Potter%20And%20The%20Cursed%20Child>) | Harry Potter and the cursed child (record link unresolved) | 1 |
| Telkom University Open Library | Custom Open Library; vendor/backend unverified | POST: Laskar Pelangi ([payload](indonesia/findings.json)) | [Laskar pelangi](<https://openlibrary.telkomuniversity.ac.id/home/catalog/id/220777/slug/laskar-pelangi.html>) | 5 |
| Universitas Padjadjaran / Kandaga Library | SLiMS union OPAC; modern Kandaga custom public API also verified | [Dasar-dasar mikrobiologi](<https://opac.unpad.ac.id/index.php?search=search&keywords=Dasar-dasar%20mikrobiologi>) | [Dasar-dasar mikrobiologi](<https://opac.unpad.ac.id/index.php?node=Fakultas+Perikanan+dan+Ilmu+Kelautan&p=show_detail&id=6634&keywords=Dasar-dasar+mikrobiologi>) |  |

## Additional reserves

These 10 observed successes are excluded from the 46 selected targets. Reserve status can reflect missing scale evidence, a stronger replacement or a policy restriction; it does not mean integration readiness.

| Country | Library | Query | Returned book |
|---|---|---|---|
| Bangladesh | Atish Dipankar University of Science & Technology Library | [Principles of marketing](<https://opac.adust.edu.bd/cgi-bin/koha/opac-search.pl?q=Principles%20of%20marketing>) | [Principles of Marketing](<https://opac.adust.edu.bd/cgi-bin/koha/opac-detail.pl?biblionumber=33012>) |
| Pakistan | University of Management and Technology — Khurram Murad LRC **— automated search restricted** | [Politics of ethnicity in Pakistan](<https://lrc.umt.edu.pk/cgi-bin/koha/opac-search.pl?q=Politics+of+ethnicity+in+Pakistan&idx=ti>) | [Politics of ethnicity in Pakistan : issues of national integration / Rehana Saeed Hashmi](<https://lrc.umt.edu.pk/cgi-bin/koha/opac-detail.pl?biblionumber=106615>) |
| Pakistan | Sindh Agriculture University — Central Library, Tandojam | [Soil fertility and fertilizers](<https://opac.sau.edu.pk/cgi-bin/koha/opac-search.pl?q=Soil+fertility+and+fertilizers&idx=ti>) | [Soil fertility and fertilizers](<https://opac.sau.edu.pk/cgi-bin/koha/opac-detail.pl?biblionumber=4157>) |
| Nigeria | Nigerian Institute of Social and Economic Research Library | [Nigeria: Crisis and Beyond](<https://publications.niser.gov.ng/library/opac/initial/?attr=Title&type=Book&search=Nigeria:%20Crisis%20and%20Beyond>) | [Nigeria: Crisis and Beyond](<https://publications.niser.gov.ng/opac/819/>) |
| Nigeria | Bishop Gabriel Oloniyo Public Digital Library / Ekiti State Library Board | [English for Business Communication](<https://opac.ekitistatelibrary.org/cgi-bin/koha/opac-search.pl?idx=ti&q=English+for+Business+Communication>) | [English for Business Communication (Routledge Applied English Language Introductions).](<https://opac.ekitistatelibrary.org/cgi-bin/koha/opac-detail.pl?biblionumber=50>) |
| Nigeria | Mountain Top University Library | [Introduction To Conflict Resolution](<https://opac.mtu.edu.ng/search?idx=ti&q=Introduction+To+Conflict+Resolution>) | [Introduction To Conflict Resolution](<https://opac.mtu.edu.ng/record/9204>) |
| Nigeria | Federal University Lokoja Library | [The Wiley-Blackwell Companion to Sociology](<https://opac.fulokoja.edu.ng/cgi-bin/koha/opac-search.pl?q=The%20Wiley-Blackwell%20Companion%20to%20Sociology>) | [THE WILEY-BLACKWELL COMPANION TO SOCIOLOGY](<https://opac.fulokoja.edu.ng/cgi-bin/koha/opac-detail.pl?biblionumber=11>) |
| Philippines | City of Imus Public Library | [Noli me tangere](<https://library.cityofimus.gov.ph/cgi-bin/koha/opac-search.pl?idx=ti&q=Noli%20me%20tangere>) | [Noli me Tangere](<https://library.cityofimus.gov.ph/cgi-bin/koha/opac-detail.pl?biblionumber=851>) |
| Philippines | Butuan City Library | [Harry Potter And The Prisoner Of The Azkaban](<https://ils.butuan.gov.ph/cgi-bin/koha/opac-search.pl?idx=ti&q=Harry%20Potter%20And%20The%20Prisoner%20Of%20The%20Azkaban>) | [Harry Potter And The Prisoner Of The Azkaban](<https://ils.butuan.gov.ph/cgi-bin/koha/opac-detail.pl?biblionumber=3215>) |
| Indonesia | Universitas Indonesia — Faculty of Computer Science Library (Fasilkom only) | [Introduction to Natural Language Processing](<https://lontar.cs.ui.ac.id/Lontar/opac/themes/newui/hasilcari.jsp?query=Introduction%20to%20Natural%20Language%20Processing>) | [Introduction to Natural Language Processing](<https://lontar.cs.ui.ac.id/Lontar/opac/themes/newui/detail.jsp?id=57139&lokasi=lokal>) |

[Return to the cross-country report](README.md)
