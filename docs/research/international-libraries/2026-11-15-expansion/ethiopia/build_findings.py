import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from probe import robots_decision

def meta(name):
    return json.loads((ROOT / 'evidence' / (name + '.json')).read_text())

def robots(name, target):
    m = meta(name)
    d = robots_decision(ROOT / 'evidence' / (name + '.json'), target)
    return dict(url=m['url'], status=m['status'], checked_at_utc=m['checked_at_utc'], evidence_path=m['metadata_path'], decision=d['decision'], note=d['note'], policy=d)

def query(name, text, count, note):
    m = meta(name)
    return dict(text=text, method=m['method'], url=m['url'], payload=m['payload'], checked_at_utc=m['checked_at_utc'], http_status=m['status'], effective_url=m['effective_url'], result_count=count, count_note=note, match_type='exact_title', evidence_path=m['evidence_path'], metadata_path=m['metadata_path'])

def size(value, unit, url, evidence, quality='official', date='undated; observed 2026-11-15', note=''):
    return dict(value=value, unit=unit, date=date, source_url=url, evidence_path=evidence, quality=quality, note=note)

def book(title, author, record_id, url, isbn, holdings, evidence):
    return dict(title=title, author=author, record_id=record_id, record_url=url, isbn=isbn, holdings=holdings, evidence_path=evidence)

libraries = [
    dict(id='eth-abrehot', name='Abrehot Library', recommendation='verified_target', scope='One public library in Addis Ababa; excludes Adwa Victory Memorial',
         size=size(103385, 'homepage catalog entries, not deduplicated volumes', 'https://abrehot.org.et/', 'evidence/abrehot-home.html', note='Homepage newest-books widget says 1–12 of 103,385. Separately displays 400K books held at collection capacity: capacity is not measured current stock.'),
         platform=dict(family='Custom', name='Laravel/Livewire public catalog', proof='HTML contains wire:snapshot, showBookDetails(record ID), and /livewire/livewire.min.js with /livewire/update; no underlying LMS identified.', evidence_path='evidence/abrehot-query.html'),
         query=query('abrehot-query', 'Things Fall Apart', None, 'Ten visible result cards on page 1. Total matching records not exposed. Exact Achebe titles, one Amharic translation and related titles returned; no edition merging.'),
         books=[book('Things Fall Apart', 'Achebe  Chinua', '91099', None, None, 'Search card: Available; Shelf No: 9; English. No copy count or circulation detail verified.', 'evidence/abrehot-query.html'),
                book('Things Fall Apart', 'Achebe, Chinua', '41266', None, None, 'Search card: Available; Shelf No: 7; Literature. Distinct record from 91099.', 'evidence/abrehot-query.html'),
                book('ለየቅል (things Fall Apart)', 'ቺንዋ አቸቤ, ሰሎሞን ዳኜ ቸኮል(ተርጓሚ)', '95708', None, None, 'Search card: Available; Shelf No: 7; 2 ኛ እትም. Translation record kept separate.', 'evidence/abrehot-query.html')],
         robots=robots('abrehot-catalog-robots', meta('abrehot-query')['url']),
         reader_access='Anonymous catalog search works. Public homepage describes open-to-all reading rooms; catalog has member login. Borrowing eligibility and 24/7 operational hours were not independently tested.',
         integration=dict(existing_adapter='new custom adapter', needs=['Parse server-rendered .book-card results and wire:click record IDs', 'Preserve Amharic text, translations and separate edition identities', 'No durable detail GET link observed: View Details is a Livewire action', 'Verify normal anonymous detail flow and interpretation of Available before integration'], blockers=['Underlying LMS and public record permalink unverified', 'Search card availability is not a verified live copy count'], live_app_tested=False)),
    dict(id='eth-admas', name='Admas University Library', recommendation='verified_target', scope='One university library network across campus libraries in Addis Ababa, Bishoftu and Mekelle; counted once',
         size=size(60000, 'books, lower bound (>60,000)', 'https://admasuniversity.edu.et/?page_id=2546', 'evidence/indexed-adoption-sources.txt', quality='indexed official', note='Undated official indexed library page separately reports >60,000 books and 50,000 ebooks, and supplies the public catalog IP. Direct source URL now redirects to the university homepage. Current volume count not re-established.'),
         platform=dict(family='Koha', name='Koha; version unverified', proof='Live catalog title Admas University Library, /cgi-bin/koha/opac-search.pl form, record links and Koha Administrator error footer.', evidence_path='evidence/admas-query.html'),
         query=query('admas-query', 'Principles of marketing', 56, '56 results on three pages; first 20 observed. Exact-title records coexist with related marketing titles. Some records explicitly have No items available.'),
         books=[book('Principles of Marketing', 'Kotler Philip; Gary Armstrong', '93', 'http://5.77.63.215:8080/cgi-bin/koha/opac-detail.pl?biblionumber=93', None, "Search row: USA, Pearson, 2016; Items available for loan: Bishoftu Campus Library (2); call number shown as 630'2/KOT. Preserve unusual source call number. Detail request timed out.", 'evidence/admas-query.html'),
                book('Principles of marketing', 'Kotler, Philip; Armstrong, Gary (Gary M.)', '1743', 'http://5.77.63.215:8080/cgi-bin/koha/opac-detail.pl?biblionumber=1743', None, 'Sixteenth edition; Boston: Pearson [2015]; Items available for loan: Mekelle Campus Library (1); call number 658.8/WER.', 'evidence/admas-query.html'),
                book('Principles of Marketing', 'Kotler,Philip; Armstrong , Gary', '289', 'http://5.77.63.215:8080/cgi-bin/koha/opac-detail.pl?biblionumber=289', None, 'New Jersey: PEARSON Custom Publishing 2004; No items available. This remains distinct from available records.', 'evidence/admas-query.html')],
         robots=robots('admas-robots', meta('admas-query')['url']),
         reader_access='Anonymous search returns campus holdings. University borrowing and visitor eligibility not verified. Catalog transport is plain HTTP on an official indexed public IP; no credentials submitted.',
         integration=dict(existing_adapter='candidate reuse: existing Koha adapter', needs=['Scope one university network; keep branch holding labels', 'Preserve unavailable records, edition identities and unusual call numbers', 'Establish current official hostname/HTTPS deployment and normal reliability before production', 'Confirm stable detailed holdings on a later authorized check'], blockers=['Homepage and one detail request timed out although robots404 and title query succeeded', 'No encrypted catalog transport verified'], live_app_tested=False)),
    dict(id='eth-african-union', name='African Union Commission Library', recommendation='verified_target', scope='AUC Library at African Union headquarters, Addis Ababa; physical collection, not the continent-wide AKSP repository',
         size=size(50000, 'volumes of books, lower bound (>50,000)', 'https://library.au.int/', 'evidence/auc-home.html', note='Homepage separately reports about 150 print/digital journal subscriptions; electronic article totals excluded.'),
         platform=dict(family='Custom', name='Drupal 7 public catalog; underlying ILS unknown', proof='generator=Drupal 7, custom search_api_views_fulltext form at /search-page and node-type-collections record pages.', evidence_path='evidence/auc-detail.html'),
         query=query('auc-query', 'Things Fall Apart', 7, 'Seven mixed record types: two Book/Monograph, four Journal article, and one site question node. One exact Achebe monograph verified in detail.'),
         books=[book('Things fall apart', 'Achebe, Chinua', '232162', 'https://library.au.int/things-fall-apart-14', '0435900013', 'Book/Monograph, London: Heinemann, 1958, viii, 150p.; call no. 820-31(669) ACH; English; African Writers Series 1. No copy count, branch-level stock or circulation status exposed. Citation wording Available at refers to the record URL, not loan availability.', 'evidence/auc-detail.html')],
         robots=robots('auc-robots', meta('auc-query')['url']),
         reader_access='Anonymous catalog works. Official FAQ says AU/embassy staff use badges; researchers/students need institutional support letter and valid photo ID to obtain a library card. Borrowing was not tested.',
         integration=dict(existing_adapter='new custom adapter', needs=['Separate Book/Monograph from articles and ordinary site nodes', 'Resolve human-readable record URLs to stable node IDs', 'Honor 10-second crawl-delay and only permitted paths', 'Display cataloged book with circulation unknown'], blockers=['Underlying ILS and item-status interface unverified'], live_app_tested=False))
]

priorities = [
 ('National Archives and Library of Ethiopia', 'National-library mandate is the institution proxy; HMML reports >800 manuscript items, a specialist subset, not total books; undated, observed 2026-11-15.', 'https://hmml.org/collections/repositories/ethiopia/national-archives-and-library-of-ethiopia/', 'Soutron portal redirects to licence error; no title search possible.', 'evidence/nala-size.html'),
 ('Abrehot Library', '103,385 entries displayed in homepage catalog widget (2026-11-15); 400K is labeled collection capacity, not current book stock.', 'https://abrehot.org.et/', 'Verified title query; selected.', 'evidence/abrehot-home.html'),
 ('Addis Ababa University Libraries', 'Official indexed page: library branches across 10 colleges; JFK seating capacity 1,500+, undated institutional/network proxy.', 'https://www.aau.edu.et/pages/Library/detail?title=Branch~Libraries', 'Observed catalog address libcat.aau.edu.et robots timed out; no title query.', 'evidence/indexed-size-sources.txt'),
 ('Jimma University Library System', 'JiT branch reports >24,600 print automated volumes; undated branch-only evidence, not university total.', 'https://ju.edu.et/jit/collection/', 'Official OPAC gateway source returned proxy503; public title route unresolved.', 'evidence/indexed-size-sources.txt'),
 ('Haramaya University Library and Information Services', 'Official page lists 11 library branches with unit-specific seat capacities; institutional/network proxy, undated.', 'https://www.haramaya.edu.et/facilities/library-information-system/', 'Official hulirs hostname robots returned403: No approved upstream IPv4 address; no query.', 'evidence/haramaya-source.html'),
 ('Bahir Dar University Libraries', 'University network proxy; College of Science page confirms physical books/reference collection. No comparable university-wide book count established.', 'https://bdu.edu.et/coss/node/151', 'Indexed Koha physical catalog; live robots proxy503, so no query.', 'evidence/bdu-size.html'),
 ('Mekelle University Libraries', '2015 Jimma-hosted thesis cites2013 account: seven libraries and >300,000 mixed books/journals/papers/ebooks/ejournals; historical network proxy, not present print count.', 'https://repository.ju.edu.et/bitstream/handle/123456789/4555/Open%20source%20library%20management%20final%20document%20%20.pdf?isAllowed=y&sequence=1', 'Historical ABCD adoption documented; no current public physical-book search route established; repository excluded.', 'evidence/indexed-market-sources.txt'),
 ('University of Gondar Library', 'Official indexed dashboard: 214,350 collections (unit undefined), 11 branch libraries, 26 digital libraries; undated. Use branches as network proxy.', 'https://library.uog.edu.et/', 'Official OPAC points to private10.139.5.18; not probed.', 'evidence/indexed-market-sources.txt'),
 ('Hawassa University Libraries', '>80,000 books on official page, undated, observed2026-11-15. Page says nine branches but enumerates ten service points; discrepancy retained.', 'https://www.hu.edu.et/library', 'Official Koha statement and lis.hu.edu.et OPAC link; robots proxy503, no query.', 'evidence/hawassa-source.html'),
 ('Adama Science and Technology University Library', 'Four branch libraries plus four special library/reading spaces listed; institution proxy, page updated2026-08-17.', 'https://www.research.astu.edu.et/library-services', 'Official page says OPAC under development; repository/digital library are separate.', 'evidence/astu-source.html'),
 ('Admas University Library', '>60,000 books; 50,000 ebooks separately; undated indexed official source with multi-campus scope.', 'https://admasuniversity.edu.et/?page_id=2546', 'Verified Koha title query with actual campus holdings; selected as meaningful alternative.', 'evidence/indexed-adoption-sources.txt'),
 ('African Union Commission Library', '>50,000 volumes of books on undated official homepage, observed2026-11-15.', 'https://library.au.int/', 'Verified exact book query and detail; selected specialist research alternative.', 'evidence/auc-home.html'),
 ('United Nations Economic Commission for Africa Library', 'Official archived general-collection page reports about90,000 physical-resource titles; undated historical figure, not current count.', 'https://archive.uneca.org/archive1/kss/pages/general-collection.html', 'Current official link leads to Primo ECA view; robots disallows /discovery/search and /primaws; no query.', 'evidence/uneca-size.html')
]

blocked = [
 ('National Archives and Library of Ethiopia','http://wemezeker.nala.gov.et/NALA/Portal/Default/en-GB/Search/SimpleSearch','Robots404, but official public portal redirects to Soutron Licence Error. No administrative action attempted.','evidence/nala-home.json'),
 ('Addis Ababa University Libraries','http://libcat.aau.edu.et/','Robots timeout22s. Source address indexed by public catalog directory; no policy clearance or catalog request.','evidence/aau-robots.json'),
 ('Jimma University Library System','https://ju.edu.et/ju-library/opac/','Official OPAC source gateway returned proxy503; endpoint not established. Indexed title holdings are not query proof.','evidence/ju-source.json'),
 ('Haramaya University','http://hulirs.haramaya.edu.et/','Official source link; robots403 No approved upstream IPv4 address. Environment/routing failure, not proof that library is closed.','evidence/hu-robots.json'),
 ('Bahir Dar University','https://catalog.bdu.edu.et/','Robots503 upstream connection timeout; stopped before search. Indexed Koha records are discovery evidence only.','evidence/bdu-robots.json'),
 ('Mekelle University','https://repository.mu.edu.et/','Public discovery found research repository and historical ABCD study, no verified current physical catalog endpoint. Repository not tested as a substitute.','evidence/indexed-market-sources.txt'),
 ('University of Gondar','https://library.uog.edu.et/automation-system/','Official OPAC is private-IP10.139.5.18; no private address request made.','evidence/gondar-source.json'),
 ('Hawassa University','https://lis.hu.edu.et/','Official catalog robots503 upstream connection timeout.','evidence/hawassa-robots.json'),
 ('Adama Science and Technology University','https://www.research.astu.edu.et/library-services','Official page states physical catalog/OPAC under development.','evidence/astu-source.json'),
 ('United Nations Economic Commission for Africa Library','https://unog.primo.exlibrisgroup.com/discovery/search?vid=41UNOG_INST:ECA','Robots explicitly disallows /discovery/search and /primaws. No search/API call made.','evidence/uneca-robots.json'),
 ('Ambo University','http://libcat.ambou.edu.et/','Official indexed route; robots22s timeout; source gateway also503. Nine-branch library network reported by indexed official source; not verified success.','evidence/ambo-robots.json'),
 ('Dire Dawa University','http://opac.ddu.edu.et/','Official manual and library pages identify route; robots403 No approved upstream IPv4 address. Manual2025 also says campus network required.','evidence/ddu-robots.json'),
 ('Ethiopian Graduate School of Theology','https://libcat.egst.edu.et/','Indexed Koha specialist library; robots503 on canonical host and separately indexed www host. No title query.','evidence/egst-robots.json'),
 ('Adwa Victory Memorial','https://avm.abrehot.org.et/explore?q=The+Battle+of+Adwa','Allowed public route returned HTTP200 but0 titles for specific query; catalog landing also reports0 titles. Not a successful book response.','evidence/avm-query.json'),
 ("St. Mary's University",'http://library.smuc.edu.et/','Three-library university network and OPAC route on live official page; robots22s timeout.','evidence/smuc-robots.json'),
 ('Arba Minch University','https://amu.edu.et/en/library-and-information-service','Live official page documents Koha adoption; no current public physical-catalog URL established from page.','evidence/arbaminch-source.json')
]

sources = [
 ('https://eifl.net/country/ethiopia','EIFL currently says64 Ethiopian institutions through CEARL; institutional reach, not number of public book catalogs.','evidence/cearl-source.html'),
 ('https://icolc.net/participating-consortia/consortium-ethiopian-academic-and-research-libraries','CEARL functions include collection sharing, licensing, interlibrary loan, training and automation expertise.','evidence/cearl-network.html'),
 ('https://www.ethiopiareads.org/projects/libraries/','Over80 libraries established across all regions; development-network reach, not one union OPAC.','evidence/ethiopiareads-source.html'),
 ('https://www.hu.edu.et/library','Explicit Koha adoption; >80K books; branch-count discrepancy; official OPAC link.','evidence/hawassa-source.html'),
 ('https://amu.edu.et/en/library-and-information-service','Official description of installed Koha and MARC/Z39.50 functionality; page dates to2011 and contains mixed tenses.','evidence/arbaminch-source.html'),
 ('https://repository.ju.edu.et/handle/123456789/4555?show=full','2015-10 thesis scopes ABCD evidence to Jimma and Mekelle; does not establish current deployment.','evidence/indexed-adoption-sources.txt'),
 ('https://repository.ju.edu.et/handle/123456789/4562','2018-11 study scopes Koha implementation to Addis Ababa, Debre Berhan and Wolkite convenience sample; primary indexed source. No national market-share estimate.',None),
 ('https://ndl.ethernet.edu.et/','Indexed national OER/digital aggregation description; direct source fetch503. Not a physical-holdings union.','evidence/ndle-source.json'),
 ('https://library.au.int/faq','Institutional letter/photo-ID requirements for students/researchers, separate from anonymous search.','evidence/auc-access.html')
]
for name, claim, url, outcome, evidence in priorities:
    sources.append((url, claim, evidence))

findings = dict(
 country='Ethiopia', country_code='ETH', research_date_utc='2026-11-15', status='complete',
 observed_success_count=3, selected_count=3, reserve_count=0, selected_shortfall=7,
 market=dict(
  summary='University library networks form the strongest repeated automation opportunity. National heritage services, the large Abrehot public library, NGO-supported children\'s libraries and Addis Ababa-based AU/UN research libraries have different access models. CEARL is the best evidenced academic coordination point; no functioning national union of physical holdings was verified. A feasibility sample of three successful public catalogs is not national LMS market share.',
  platform_strategy='Prioritize Koha adapter reuse and CEARL-led discovery of official public endpoints: live Admas proves one usable implementation; Hawassa and Arba Minch explicitly document Koha, with historical study evidence at AAU/Debre Berhan/Wolkite. Build separate custom parsers for accessible Abrehot Livewire and AU Drupal catalogs. NALA uses Soutron but its portal currently reports a licence error; UNECA links to Primo but policy prevents automated searches. Historical ABCD evidence must not be relabeled current Koha. No app integration performed.',
  adoption_evidence=[
   dict(claim='Live Koha public title query and campus holdings', scope='Admas University network only',date='2026-11-15',source_url=meta('admas-query')['url']),
   dict(claim='Officially describes Koha automation, MARC cataloging and OPAC',scope='Hawassa University',date='undated; observed2026-11-15',source_url='https://www.hu.edu.et/library'),
   dict(claim='Official installed-Koha description, with dated/mixed-tense narrative',scope='Arba Minch University',date='page originally2011; observed2026-11-15',source_url='https://amu.edu.et/en/library-and-information-service'),
   dict(claim='2018 Koha implementation study; convenience sample, not national survey',scope='Addis Ababa, Debre Berhan, Wolkite universities',date='2018-11',source_url='https://repository.ju.edu.et/handle/123456789/4562'),
   dict(claim='Historical ABCD implementation study',scope='Jimma and Mekelle universities',date='2015-10',source_url='https://repository.ju.edu.et/handle/123456789/4555?show=full')],
  network_opportunities=[
   dict(name='CEARL / EIFL',scope='EIFL current country page:64 institutions; linked2024 membership list is a separate older snapshot.',source_url='https://eifl.net/country/ethiopia',verification='Official EIFL/ICOLC partnership/function descriptions; no shared physical-title endpoint verified.',integration_implication='Highest-leverage institutional coordination and Koha endpoint inventory, rather than assuming one federation adapter.'),
   dict(name='Ethiopia Reads',scope='Over80 libraries established across Ethiopia, at least one in every region.',source_url='https://www.ethiopiareads.org/projects/libraries/',verification='Official network description; no shared OPAC identified.',integration_implication='Potential public/children\'s-library discovery coverage; cannot claim live holdings from network membership.'),
   dict(name='National Academic OER & Digital Library of Ethiopia / EthERNet',scope='National digital and OER aggregation',source_url='https://ndl.ethernet.edu.et/',verification='Official indexed description; direct gateway503. Distinct from physical library circulation.',integration_implication='Potential free-reading discovery route, not evidence that a local library holds a printed edition.')]),
 major_library_priorities=[dict(name=n,size_claim=c,source_url=u,outcome=o,evidence_path=e) for n,c,u,o,e in priorities],
 libraries=libraries,
 blocked_or_unverified=[dict(name=n,url=u,reason=r,evidence_path=e) for n,u,r,e in blocked],
 limitations=[
  'No national largest-ten ranking established. Thirteen major priorities retain inaccessible libraries; sizes have different dates and units.',
  'Only three substantial institutional catalogs produced actual book search responses; zero reserves; seven short of ten selected. No private-IP, authentication, challenge or TLS bypass used.',
  'Proxy503/403 or timeout is an observation from this environment, not proof of a nationwide outage or absent holdings.',
  'Public search does not establish visitor admission, borrowing rights, permission to reuse metadata, or live circulation.',
  'Admas search succeeded despite homepage/detail timeouts; its size/source route is indexed official, not a currently retrievable library-page assertion.',
  'Abrehot page labels Available and shelf numbers but no copy count or durable record URL verified. AU gives a physical-book call number but no circulation status.',
  'Repositories, journals, ebooks and digitized manuscripts were not counted as successful physical-book catalogs; university branches were not counted again.',
  'No live app adapter test, product configuration, outreach, account registration or deployment occurred.'
 ],
 sources=[dict(url=u,claim=c,evidence_path=e) for u,c,e in sources])
(ROOT / 'findings.json').write_text(json.dumps(findings, ensure_ascii=False, indent=2) + '\n')

audits=[]
for lib in libraries:
    audits.append(dict(name=lib['name'], target_url=lib['query']['url'], robots=lib['robots']))
audits.append(dict(name='UNECA', target_url='https://unog.primo.exlibrisgroup.com/discovery/search?vid=41UNOG_INST:ECA', robots=robots('uneca-robots','https://unog.primo.exlibrisgroup.com/discovery/search?vid=41UNOG_INST:ECA')))
(ROOT/'policy-audit.json').write_text(json.dumps(audits,ensure_ascii=False,indent=2)+'\n')
print('Wrote',len(libraries),'successes and',len(priorities),'priorities')
