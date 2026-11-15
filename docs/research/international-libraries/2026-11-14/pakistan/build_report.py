"""Assemble the research artifact from saved responses; does not make requests."""
import json
from pathlib import Path

ROOT = Path(__file__).parent
def read(path):
    return json.loads((ROOT / path).read_text())

def source(url, claim, year=None, evidence=None):
    return dict(url=url, claim=claim, as_of=year or 'Undated page, observed 2026-11-15', evidence=evidence)

libraries = []
def add(id, name, scale, lms, metadata, query, count, books, holdings, access, robots, adapter, evidence, **extra):
    row = dict(id=id, name=name, scale=scale, lms=lms, query=query, result_count=count,
               response=metadata, returned_books=books, holdings=holdings, membership_access=access,
               robots=robots, terms='No automated reuse licence or institution agreement established. Public search is not permission to ingest or republish.',
               adapter=adapter, live_query_verified=True, app_adapter_verified=False, policy_cleared=False,
               evidence=evidence, **extra)
    libraries.append(row)

for id,name,scale,access in [
 ('umt','University of Management and Technology — Khurram Murad LRC',source('https://library.umt.edu.pk/About-LRC.aspx','155,000 print books/volumes; digital holdings separate',evidence='sources/umt.html'),'Academic library; faculty/student focus. Off-campus delivery exists with conditions; general-public lending not established.'),
 ('duhs','Dow University of Health Sciences library system',source('https://www.duhs.edu.pk/library/dow-medical-college-library-dmc/','DMC branch: about 27,000 books; not a system total. Ten branch choices observed in catalog.','Page last updated 2024-12-18', 'sources/duhs-size.html'),'Students, faculty and staff borrow under library rules; no general-public borrowing demonstrated.'),
 ('quest','Quaid-e-Awam University (QUEST), Nawabshah',source('https://quest.edu.pk/adm20/Prospectus2020.pdf','69,655 central-library books; 16,415 titles. Current catalog homepage describes 21+ seminar libraries.','Prospectus 2020'),'Enrolled students register for membership; reference material not for circulation. No public borrowing established.'),
 ('iiui','International Islamic University Islamabad union catalog',source('https://www.iiu.edu.pk/libraries/dr-hamidullah-library/','Hamidullah constituent library alone: about 180,000 mixed items; not a union catalog total.',evidence='sources/iiui-hamid.html'),'University/research libraries; observed central-library reference copy is NOT FOR LOAN. General-public borrowing not established.')]:
    x=read(f'evidence/{id}-title/result.json')
    counts={'umt':2,'duhs':25,'quest':None,'iiui':2}
    authors={'umt':'Rehana Saeed Hashmi','duhs':'Human Rights Watch (Organization), contributor','quest':'Pakistan Standards (catalog author); Pakistan Standards Institution (publisher)','iiui':'Pakistan: Population Census Organization'}
    books=x['returned_books'][:3]
    books[0]['author']=authors[id]
    robot=dict(status=x['robots']['status'],url=x['robots']['url'],finding='No robots file (404); this is not a reuse licence.')
    if id=='umt': robot.update(finding='BLOCKED: User-agent:* Disallow:/cgi-bin/koha/opac-search.pl. Initial Python robotparser incorrectly allowed query; corrected by app-parser review. No subsequent requests.', disallowed=True)
    add(id,name,scale,{'product':'Koha','version':None,'evidence':'Public opac-search.pl/opac-detail.pl and Koha HTML; version not established'},x['response'],x['query'],counts[id],books,x.get('holdings_excerpt'),access,robot,
        'Existing Koha adapter is the likely starting point; observed catalog query is not an app integration test. '+('HTTP origin/port 9194 needs app allowlist support.' if id=='iiui' else '')+(' Automated search prohibited by observed robots.' if id=='umt' else ''),
        [f'evidence/{id}-title/search.html',f'evidence/{id}-title/record.html',f'evidence/{id}-title/result.json',f'evidence/{id}-title/robots.txt'],
        result_count_note='Single-result search redirected to record 7655; no numeric total rendered.' if id=='quest' else None)

add('nlp','National Library of Pakistan',source('https://nlp.gov.pk/resources.html','500,000 total collection units, including books, newspapers, microfiche and other formats; not 500,000 searchable book titles.',evidence='sources/nlp.html'),
    {'product':'SLiMS (Senayan)','version':None,'evidence':'SLiMS branded catalog and index.php search/detail routes'},read('evidence/nlp-title/response.json'),'Honour unmasked',1,
    [{'title':'Honour unmasked: Gender violence, Law, and power in Pakistan.','author':'Nafisa Shah','record_id':'208085','url':'https://nlp.slims.pk/index.php?p=show_detail&id=208085','isbn':'9780199403431'}],
    'Search/detail: one available copy, PE071325, call 344.3745491 NAF. Generic available-for-loan wording does not establish external borrowing eligibility.',
    'Official reading-room page explicitly describes a reference library. Pakistani citizens above20 and foreign residents/workers can become members; do not advertise home borrowing from generic SLiMS wording.',
    {'status':200,'url':'https://nlp.slims.pk/robots.txt','finding':'Empty response; no explicit robot exclusion observed.','evidence':'evidence/nlp-robots/response.json'},
    'New SLiMS provider needed. JSONLD and resultXML export links are exposed but were not tested; potential reuse with Indonesia.',
    ['evidence/nlp-title/search.html','evidence/nlp-title/response.json','evidence/nlp-detail/search.html','evidence/nlp-robots/response.html'])

add('pu','University of the Punjab — central/departmental union catalog',source('https://pucit.edu.pk/library/','583,777+ collection described as books but includes 22,000+ manuscripts and 65,000+ bound journals; central library only. Official central-library website describes 56 independent departmental libraries.','December 2020'),
    {'product':'Custom PHP OPAC; current LMS vendor unconfirmed','version':None,'evidence':'Official pulibrary.edu.pk links IP-hosted /opac1; custom card results. Do not infer current LMS from older LIMS/MLIMS references.'},read('evidence/pu-title/response.json'),'Pakistan the formative phase',12,
    [{'title':'Pakistan the formative phase','author':'Khalid Bin Sayeed','record_id':None,'url':None,'edition':'Oxford University Press, 1968','call_number':'954.9 K55P (central library)'}],
    'Department and call number shown. No copy availability or stable item/detail ID observed in returned page. Other entries include Philosophy and Law departments.',
    'Academic library; borrowing generally under university membership rules. Public search does not confer entry/loan rights.',
    {'status':404,'url':'http://111.68.103.2/robots.txt','finding':'No robots file; reuse terms unconfirmed.','evidence':'evidence/pu-robots/response.json'},
    'New custom provider and HTTP origin exception needed. Stable identifiers/ISBNs and holdings status unresolved. Do not follow private 10.0.34.29 download links present in results.',
    ['evidence/pu-title/search.html','evidence/pu-title/response.json','evidence/pu-robots/response.json'],stable_record_identifier_verified=False)

x=read('evidence/fast-book/result.json')
add('fast','FAST-NUCES Network of Libraries',source('https://www.nu.edu.pk/Services/Library','Six campus libraries explicitly named; total collection and seating count placeholders on source are blank. Major network proxy, not collection-ranked.',evidence='sources/fast.html'),
    {'product':'Insignia ILS / Discovery Layer','version':'8.9.2','evidence':'Search footer reports Database Version and Web Portal 8.9.2.'},x,x['query'],4,
    [{'title':'100 business leaders of pakistan','author':'Ijaz Nisar','record_id':'27806','url':'https://nu.insigniails.com/Library/ItemDetail?l=All&i=27806&ti=0','edition':'2012, Manager Today publication'}],
    'Search row: availability 1 of 1, call 658.42105491 NIS 2012. Four returned records across Islamabad, Karachi and Lahore facets; two records are books, others project/thesis-type material.',
    'University community; memberships/accounts required for borrowing and reservations. Network offers interlibrary loans between campuses.',
    {'status':404,'url':'https://nu.insigniails.com/robots.txt','finding':'No robots file; licence/partner approval not established.','evidence':'evidence/fast-robots/response.json'},
    'New Insignia adapter with anonymous session cookies. Home visit then DoSearch follows SearchResult. Specific title phrase via Keywords succeeded; t=Title attempt produced SQL-like server error/zero and is not counted.',
    ['evidence/fast-book/search.html','evidence/fast-book/result.json','evidence/fast-title/search.html','evidence/fast-robots/response.json'])

add('sbp','State Bank of Pakistan Library',source('https://sbplibrary.sbp.org.pk/index/content/key/printed_resources','Over 100,000 volumes of books and research reports. Intro page says over 5,000 registered members.',evidence='evidence/sbp-size/response.html'),
    {'product':'Library Online 2.0 — custom PHP interface','version':'2.0 branding; vendor unconfirmed','evidence':'Page title and /search/results /book/detail routes'},read('evidence/sbp-title/response.json'),'Breaking the curfew',2,
    [{'title':'Breaking the curfew: a political journey through Pakistan','author':'Emma Duncan','record_id':'70814','url':'https://sbplibrary.sbp.org.pk/book/detail/70814/1','isbn':'0099737906','edition':'1990, Arrow Books'}],
    'Accession 70814, call 320.9547 DUN. Detail has bibliographic metadata; copy-status/checkout availability not shown.',
    'Official SBP library information welcomes general public; membership and lending rules apply. Some reference sections are in-library use only.',
    {'status':403,'url':'https://sbplibrary.sbp.org.pk/robots.txt','finding':'Access-denied page, not readable robots rules. Policy unknown; app 4xx fallback alone is not clearance.','evidence':'evidence/sbp/robots.json'},
    'New custom provider. Advanced search requires org=1 and language=-1; omitted organization initially yielded zero. Other organizational options were not individually verified.',
    ['evidence/sbp-title/response.html','evidence/sbp-title/response.json','evidence/sbp-detail/response.html','evidence/sbp/robots.html'])

add('gcuf','Government College University Faisalabad library system',source('https://library.gcuf.edu.pk/about.php','About 85,000 volumes; main library plus eighteen faculty/department/institute/college libraries. Undated figure; not a national top-ten claim.',evidence='evidence/gcuf-size/response.html'),
    {'product':'Custom PHP library application','version':None,'evidence':'Powered by IT services GCUF; dynamic form posts TITLE to search.php'},read('evidence/gcuf-title/response.json'),'Diversity in Myxomycetous Fungi of Pakistan',4,
    [{'title':'Diversity in Myxomycetous Fungi of Pakistan','author':'Kishwar Sultana','record_id':'Acc Main 69092 / Acc Department BOT-1654','url':None,'call_number':'579.5095491'}],
    'Four accession rows; Allama Iqbal Library (Jhang Road) and Armstrong Library (Main Campus). IDs include BOT-1654/69092, 69089, 69090. No live loan/copy status shown.',
    'Card-controlled entry; visitors must contact librarian. Home loans for university categories and specifically approved outsiders; rules saved.',
    {'status':404,'url':'https://library.gcuf.edu.pk/robots.txt','finding':'No robots file; no automatic reuse licence.','evidence':'evidence/gcuf-robots/response.json'},
    'New custom PHP adapter. GET TITLE phrase works; normal form also accepts POST TITLE=<phrase>&submit=Search. Accession-level rows must be deduplicated into book/holding records.',
    ['evidence/gcuf-title/response.html','evidence/gcuf-title/response.json','evidence/gcuf-query/search.html','evidence/gcuf-rules/response.html','evidence/gcuf-robots/response.json'])

add('numl','National University of Modern Languages — Sir Syed main library',source('https://library.numl.edu.pk/lib/opac/index.aspx','Over 140,000 mixed holdings (books, journals, documents, non-book material). Undated catalog homepage. Another official page says 129,000, so do not treat as audited current total.',evidence='evidence/numl-main-discover/response.html'),
    {'product':'LibMax by Max Intelligence','version':None,'evidence':'LibMax OPAC page title and Max Intelligence footer; .aspx search/detail'},read('evidence/numl-title/response.json'),'Constitutional and political history of Pakistan',3,
    [{'title':'Constitutional and political history of Pakistan','author':'Hamid Khan','record_id':'232899','url':'https://library.numl.edu.pk/lib/opac/BookDetail.aspx?id=232899','isbn':'9780195979756','edition':'2005, Oxford University Press'}],
    'Available Yes; accessions D-35065, D-35069, D-35074, D-35076, D-35077, D-35080, D-35084, D-35085; call 954.91 HAC.',
    'Academic membership and circulation policies. UN reference section has broader researcher access but does not imply general-public borrowing for this book.',
    {'status':None,'url':'https://library.numl.edu.pk/robots.txt','finding':'Request timed out; policy unknown.','evidence':'evidence/numl-main-robots/response.json'},
    'New LibMax provider. SearchBook.aspx?pagenumber=1&column=Title&criteria=<phrase> returns HTML; BookDetail.aspx?id=<id> exposes availability. Eight regional catalog links use separate SLiMS deployments, not this main catalog; not individually queried.',
    ['evidence/numl-title/response.html','evidence/numl-title/response.json','evidence/numl-detail/response.html','evidence/numl-main-robots/response.json'])

# Continuation: preserve every initial observation while improving target selection.
pu = next(x for x in libraries if x['id']=='pu')
pu['previous_query_observations']=[dict(response=pu['response'],returned_books=pu['returned_books'],holdings=pu['holdings'],evidence=list(pu['evidence']))]
pu['response']=read('evidence/continuation/pu-old-title/response.json')
pu['returned_books']=[dict(title='Pakistan the formative phase 1857-1948',author='Khalid B. Sayeed',record_id='MFN=181711; LibId=67',url='http://111.68.103.2/opac/Detail.aspx?MFN=181711&LibId=67&FRM=',isbn='9780195771145',edition='Oxford University Perss [catalog spelling], 1968',accession='284990')]
pu['holdings']='Stable MFN181711 + LibId67, accession284990 and call954.9 K55P shown in detail. No live loan/availability status shown. Do not infer checkout availability from accession existence.'
pu['lms']=dict(product='Custom ASP.NET legacy Web OPAC plus newer custom PHP catalog; vendor unconfirmed',version=None,evidence='Official university administrative page still links opac.pu.edu.pk/opac/index.aspx; its form returned12 title rows with MFN+LibId detail URLs.')
pu['adapter']='New custom provider. Official legacy ASP.NET form POST requires fresh hidden form fields, lstSearchIn=opac_report.Title, Editor=<phrase>, ddlDepartment=99, cmdSearch=Search. Follow returned MFN+LibId detail URLs; both public HTTP origins need app origin configuration. New PHP cards alone lack identifiers; no cross-interface ID mapping was invented.'
pu['robots'].update(additional_origin=dict(url='http://opac.pu.edu.pk/robots.txt',status=404,evidence='evidence/continuation/pu-old-robots/response.json'))
pu['stable_record_identifier_verified']=True
pu['evidence'] += ['evidence/continuation/pu-old-title/response.html','evidence/continuation/pu-old-title/response.json','evidence/continuation/pu-detail/response.html','evidence/continuation/pu-detail/response.json','evidence/continuation/pu-old-robots/response.json']
numl=next(x for x in libraries if x['id']=='numl')
numl['robots']['recheck']=read('evidence/continuation/numl-robots-recheck/response.json')
numl['robots']['finding']='Two bounded requests timed out, most recently2026-11-15T07:01:55.586204Z; policy remains unknown.'
numl['evidence'].append('evidence/continuation/numl-robots-recheck/response.json')

add('ndu','National Defence University — Sahabzada Yaqub Khan Library',source('https://www.ndu.edu.pk/fcs/downloads/Prospectus%20Fall-2026.pdf','105,000 printed books;26,067 ebooks separately. Older OPAC homepage says96,000 mixed materials; prefer dated prospectus.','Fall 2026 prospectus, PDF pages 150–151 (printed 148–149)', 'sources/ndu-prospectus-excerpt.md'),
    dict(product='LibMax by Max Intelligence',version=None,evidence='LibMax page title, Max Intelligence footer and SearchBook.aspx/BookDetail.aspx routes.'),read('evidence/continuation/ndu-title/response.json'),'Constitutional and political history of Pakistan',4,
    [dict(title='Constitutional and Political History of Pakistan',author='Hamid Khan',record_id='82880',url='http://syklibrary.ndu.edu.pk/libmax/opac/BookDetail.aspx?id=82880',edition='2023, Oxford University Press; catalog edition field says 4rd',isbn=None)],
    'Available Yes, accessions51342 and52875, call954.9/342 HAM. No ISBN populated on observed detail.',
    'Research/university membership context; university includes civilian academic programs. Public catalog access does not establish public borrowing or campus-entry rights.',
    dict(status=404,url='http://syklibrary.ndu.edu.pk/robots.txt',finding='No robots file at the officially documented HTTP catalog origin. HTTPS had503 proxy upstream-connection failures; HTTP works without certificate bypass.',evidence='evidence/continuation/ndu-http-robots/response.json'),
    'New LibMax provider could share implementation with NUML main. Needs HTTP origin support; four returned edition/catalog identities must remain distinct. Not app-tested or permission-cleared.',
    ['evidence/continuation/ndu-title/response.html','evidence/continuation/ndu-title/response.json','evidence/continuation/ndu-detail/response.html','evidence/continuation/ndu-detail/response.json','evidence/continuation/ndu-http-robots/response.json'])

ndu=next(row for row in libraries if row['id']=='ndu')
ndu['scale'].update(raw_source_evidence='sources/ndu-prospectus-fall2026.pdf',source_request_evidence='sources/ndu-prospectus-request.json',text_evidence='sources/ndu-prospectus-pages150-152.txt')

sau=read('evidence/continuation/sau-title/result.json')
add('sau','Sindh Agriculture University — Central Library, Tandojam',source('https://opac.sau.edu.pk/lib/vice-chancellor.html','Official page describes hundreds of thousands of mixed volumes; no precise audited count or observation year established. Major specialist institution proxy, retained as reserve.',evidence='sources/sau-vice-chancellor.html'),
    dict(product='Koha',version=None,evidence='Koha generator and opac-search.pl/opac-detail.pl routes; no version established.'),sau['response'],'Soil fertility and fertilizers',42,
    [dict(title='Soil fertility and fertilizers',author='J. L. Havlin (catalog abbreviation Havlin,J.L.)',record_id='4157',url='https://opac.sau.edu.pk/cgi-bin/koha/opac-detail.pl?biblionumber=4157',edition='2005, Pearson Education, New Delhi')],
    'Reference Section; Available; barcode54046, call631.8 HAV. Search says available for loan but official rules make reference books non-loan. Report as available for reference/in-library use, not borrowable.',
    'Only registered SAU students, faculty and staff can borrow. Reference books, journals, theses and rare books cannot be taken out. Official rules prohibit bulk downloading/sharing credentials; no bulk activity performed.',
    dict(status=404,url='https://opac.sau.edu.pk/robots.txt',finding='404 Koha error page; no explicit robot prohibition observed. No agreement or reuse licence established.',evidence='evidence/continuation/sau-title/result.json'),
    'Existing Koha provider candidate, but must preserve Reference Section/non-loan policy instead of treating generic Available as borrower eligibility. Offline parser compatibility separate.',
    ['evidence/continuation/sau-title/search.html','evidence/continuation/sau-title/record.html','evidence/continuation/sau-title/result.json','evidence/continuation/sau-rules/response.html'])

for row in libraries:
    row['recommendation']='reserve' if row['id'] in ['umt','sau'] else 'verified_target'
    if row['id']=='umt': row['recommendation_reason']='Observed query retained, but explicit robots search prohibition excludes it from the ten selected targets.'
    if row['id']=='sau': row['recommendation_reason']='Live Koha reserve; precise collection scale and reference-use interpretation need resolution. NDU has stronger dated size evidence.'
    if row['id']=='ndu': row['recommendation_reason']='Replaces UMT:105,000 printed books in dated2026 official source, actual book and holding query, no observed robots exclusion at official HTTP origin. Smaller than UMT155,000 but a substantial research collection, not a national top-ten claim.'

priority = [
 dict(name='University of the Punjab',scale='583,777+ mixed collection, Dec 2020',source='https://pucit.edu.pk/library/',status='Specific title verified; continuation resolved stable MFN+LibId and accession through official legacy OPAC. Availability still unknown; custom provider needed.'),
 dict(name='Hamdard Bait al-Hikmah',scale='Over 500,000 books in official prospectus; undated. Other official page says over 450,000.',source='https://admissions.hamdard.edu.pk/admissions/prospectus/introduction.pdf',status='Official link to PASTIC :5723; initial HTTP link redirected without query to homepage. Canonical HTTPS robots explicitly Disallow:/. No returned book query.'),
 dict(name='National Library of Pakistan',scale='500,000 mixed collection units, undated',source='https://nlp.gov.pk/resources.html',status='Specific title and holding verified; new SLiMS provider.'),
 dict(name='University of Karachi — Dr Mahmud Husain Library',scale='Over 350,000 books, plus comparable journal volume count, undated',source='https://www.uok.edu.pk/library/',status='Official services page says Koha adopted and public online link coming soon. No public query endpoint established.'),
 dict(name='Government College University Lahore',scale='349,797 books, October 2019',source='https://gcu.edu.pk/about.php?pg=overview',status='Official OPAC link http://103.4.95.67:10015 timed out; no verified result.'),
 dict(name='LUMS — Gad and Birgit Rausing Library',scale='Over 300,000 books/documents, Academic Report 2025; electronic resources separate',source='https://lums.edu.pk/academic-report/ar2025/office-library.php',status='Current Primo/Alma discovery; robots disallow discovery/search, nde/search and primaws. Not queried.'),
 dict(name='University of Agriculture Faisalabad',scale='266,120 mixed collection, undated official indexed page; current raw page changed',source='https://web.uaf.edu.pk/Library',status='Official OPAC points uafopac.freedev.app; JavaScript AES challenge. No attempt to bypass; no query result.'),
 dict(name='Quaid-i-Azam University — DRSM',scale='Over 230,000 books/CDs/DVDs +35,000 journal volumes; undated page includes 2010–11 references',source='https://qau.edu.pk/libraries/',status='PASTIC-hosted :5505 robots disallow all. Not queried.'),
 dict(name='IIUI library system',scale='Hamidullah constituent library 180,000 mixed items, undated; union total unknown',source='https://www.iiu.edu.pk/libraries/dr-hamidullah-library/',status='Specific title and central-library reference holding verified; HTTP port9194.'),
 dict(name='UMT — Khurram Murad LRC',scale='155,000 print volumes/books, undated official page',source='https://library.umt.edu.pk/About-LRC.aspx',status='Specific query observed, but robots explicitly prohibit automated search. Policy blocked.')
]

rejections = [
 ('PASTIC hosted QAU, IUB, BZU, University of Sargodha, ICCBS','Robots Disallow:/; not queried. Membership does not equal permissible automated access.'),
 ('UET Lahore; NUST; University of Peshawar; NED current catalog','Robots prohibited queries; no live query counted.'),
 ('Riphah; UOL; IBA','Search HTTP403/access denial; cause not always distinguishable between proxy and origin; no success counted.'),
 ('City School Network','HTTP200 response was frame/challenge-like without returned books; not a query success.'),
 ('AIOU; NDU HTTPS','HTTP503 bodies say upstream connect/reset remote connection failure: likely research network/proxy reachability, not proof that library is offline. NDU subsequently verified via its explicitly documented HTTP catalog.'),
 ('COMSATS Islamabad','Official OPAC on port82 timed out; robots response503. Not verified.'),
 ('Government Punjab Public Library','Official homepage503 upstream connection timeout; online query not established. Major public-library candidate omitted from ranking because official scale source not captured.'),
 ('PIDE','Official website points to private172.31.0.4:8001; not followed. Public external catalog unverified.'),
 ('Chughtai Public Library network','Official Koha homepage has14 branch options; robots disallow /cgi-bin/koha/. No query. Strong public-reach partnership prospect.'),
 ('Air University','Official page Cloudflare403 block; not bypassed.'),
 ('University of Sindh; FCC','Sindh official main site points PASTIC:5419, whose robots explicitly disallow all; no query. FCC429 encountered in discovery; no title query counted.'),
 ('Mehran University (MUET)','Official library site reports180,700 books and links opac.muet.edu.pk. Both HTTP/HTTPS robots returned521; stopped before query. Internal repository/circulation IP links were not followed.'),
 ('Liaquat Memorial Library; University of Education candidate host','Liaquat old host returned403 No approved upstream IPv4 address. Guessed UE library host tunnel403; neither established as a working catalog.')
]

data = dict(country='Pakistan',checked_date_utc='2026-11-15',scope='Public catalog research, no product edits, no outreach, no deployment',
    outcome=dict(live_specific_title_query_systems=12,selected_verified_targets=10,reserves=2,systems_with_known_explicit_robots_search_prohibition_among_successes=1,selected_systems_with_known_explicit_robots_search_prohibition=0,app_integrations_verified=0,policy_cleared=0,
                 limitation='Ten selected query-verified major/academic/special library systems plus two reserves, not a verified national top ten. UMT is a policy-blocked reserve; Punjab stable identity was resolved via official legacy OPAC. NUML robots remain unknown. No complete production-ready ten-largest set established.'),
    market=dict(recommendation='Promising second-wave country: large population and reusable Koha skills, but access-policy/endpoint work materially reduces immediate coverage.',
      common_lms='Koha is the strongest reusable platform lead; nationwide dominance or market share not established.',
      independent_lms_evidence=source('https://www.sciencedirect.com/science/article/pii/S009913332300126X','2023 study of27 university libraries in Khyber Pakhtunkhwa: Koha10/27 (37%). Regional institutional sample, not a national census.','2023'),
      largest_networks=[
       source('https://koha.pastic.gov.pk/members.html','193 membership entries; some duplicates/branches/offline entries. Koha Cloud homepage reports41 hosted catalogs. Neither number is a verified count of distinct usable endpoints.',evidence='sources/pastic-directory.html'),
       source('https://pakcat.pastic.gov.pk/','157 participating libraries self-reported, fast cached and live search modes. Requires Z39.50 per onboarding guide; backend catalogue is not proof of current holdings.',evidence='evidence/pakcat-discover/response.html')],
      best_unlock='PASTIC/PakCat partnership for permitted national catalog access/Z39.50 or agreed API; robots currently block /result and /api/ and tested PASTIC-hosted Koha instances block all bots.',
      public_reach='National Library (reference only), State Bank and public/nonprofit libraries have wider access potential. Academic libraries dominate verified endpoints but borrowing/entry is generally restricted. A discovery result is not a lending entitlement.',
      platform_mix='Selected ten: three Koha, one SLiMS, one Insignia, two LibMax and three custom catalogs. Two additional Koha reserves (UMT blocked; SAU scale uncertain). This convenience sample is not market share.'),
    priority_large_libraries=priority,query_verified_libraries=libraries,rejected_or_blocked=[dict(name=n,reason=r) for n,r in rejections],
    methodology=['Live urllib HTTP requests with identifying MyBookshelfResearch user-agent; exact synthetic title phrases, not real user data. No auth/captcha/certificate bypass.','Bounded response HTML saved (maximum2MB per generic response); timestamps from UTC environment clock. Search engine indexing used to discover/source scale, never counted as successful catalog query.','No credential use, registration, borrowing transaction, outreach or deployment. Hidden private download links not followed.','Initial urllib.robotparser allowed UMT incorrectly; corrected using longest-match/app-parser audit. Raw successful query evidence retained with explicit policy-blocked classification.','Most collection statistics are mixed holdings and undated or historical. Do not sum them or claim a national size ranking.'])
(ROOT/'findings.json').write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n')

lines=['# Pakistan — library expansion research','',
 '**Checked 15 November 2026 UTC. Twelve independent catalog systems returned books for specific title phrases: ten selected targets and two reserves. This is not a verified list of Pakistan’s ten largest libraries, and none is yet an approved production integration.** Continuation replaced the restricted UMT target with National Defence University (105,000 printed books, Fall2026 prospectus), resolved Punjab’s stable record IDs, and added Sindh Agriculture University as a reserve. NUML’s robots policy remains unknown after a bounded recheck.','',
 '## Country and platform recommendation','',
 'Pakistan is a credible second-wave expansion market. The practical route is universities and large research libraries, followed by wider-public-access institutions. Koha is the best reusable starting point, but the accessible market is heterogeneous: National Library uses SLiMS, FAST uses Insignia, NUML main uses LibMax, LUMS uses Primo discovery, and several large university/special libraries have custom catalogs. An existing Koha adapter therefore does not unlock the whole country.','',
 'A [2023 Khyber Pakhtunkhwa study](https://www.sciencedirect.com/science/article/pii/S009913332300126X) found Koha in 10 of 27 university libraries (37%). This supports Koha as a leading platform in one region, not a national market-share claim. Our discovery deliberately sought Koha-compatible catalogs and is biased toward public academic endpoints.','',
 'The largest promising coordination route is **PASTIC/PakCat**. The [Koha directory](https://koha.pastic.gov.pk/members.html) has 193 membership entries and its service reports 41 hosted catalogs. Entries include duplicates, institutional branches and offline catalogs. Separately, [PakCat](https://pakcat.pastic.gov.pk/) reports 157 participating libraries, with cached and live search modes. Its [registration guide](https://pakcat.pastic.gov.pk/help/register-your-library) requires Z39.50. These overlapping self-reported numbers must not be added. Neither is verified active coverage. Tested hosted Koha catalogs disallow bots; PakCat robots disallow `/result` and `/api/`. A permitted API/Z39.50 arrangement with PASTIC could unlock much more than institution-by-institution scraping, but has not been agreed or tested.','',
 'The largest collection segment encountered was university/research libraries. Catalogs at Punjab, IIUI, FAST, QUEST, Dow and GCUF cover multiple institutional libraries. National Library and State Bank offer better public-reach prospects; National Library explicitly describes itself as a reference library, so generic SLiMS loan wording must not be advertised as home borrowing. Chughtai is an interesting public/nonprofit network with14 catalog branch options, but its robots prohibit automated Koha access. University catalogs are public discovery tools while entry, loans and licensed ebooks remain limited by membership.','',
 '## Ten selected query-verified catalog systems','',
 'All searches below returned HTTP200 through live HTTP requests. Dates/times, full query URLs, response paths, records, robot observations and access limits are in `findings.json`. Counts are returned catalog rows/records, not necessarily unique works or available copies.','',
 '| Library/system | Scale and date | LMS | Specific phrase → observed result | Holding / integration implication |','|---|---|---|---|---|']
for x in sorted((x for x in libraries if x['recommendation']=='verified_target'),key=lambda x:['pu','nlp','iiui','numl','ndu','sbp','gcuf','quest','fast','duhs'].index(x['id'])):
    b=x['returned_books'][0]
    meta=x['response'];url=meta.get('search_url') or meta.get('url')
    count=str(x['result_count']) if x['result_count'] is not None else 'single-record redirect'
    status={'duhs':'Available branch copy; Koha adapter candidate.','quest':'Reference copy available; single-result redirect needs handling.','iiui':'Reference copy NOT FOR LOAN; HTTP/port exception needed.','nlp':'One available copy; new SLiMS adapter.','pu':'MFN181711+LibId67; accession284990. Form POST; availability unknown; custom adapter.','fast':'1 of1 available; cookie/session-aware Insignia adapter.','sbp':'Accession70814; availability unknown; custom adapter.','gcuf':'Four accession rows in2 libraries; availability unknown; custom adapter.','numl':'AvailableYes, eight accession IDs; new LibMax adapter.','ndu':'AvailableYes, accessions51342/52875; LibMax provider may share work with NUML; HTTP origin.'}[x['id']]
    lines.append(f"| {x['name']} | [{x['scale']['claim']}]({x['scale']['url']}) ({x['scale']['as_of']}) | {x['lms']['product']} | [{x['query']}]({url}) → {count}; {b['title']} — {b.get('author','')} | {status} |")
lines += ['',
 '**Record checks:** National Library record208085 (Nafisa Shah, ISBN9780199403431); IIUI27223 (Census Atlas); Dow38033 (Crime or custom?); QUEST7655 (Pakistan Standards Catalogue); FAST27806 (Ijaz Nisar); SBP70814 (Emma Duncan); NUML232899 (Hamid Khan, ISBN9780195979756); NDU82880 (Hamid Khan,2023 Oxford University Press). GCUF exposes accession69092/BOT-1654 rather than a detail link. Punjab’s continuation returned [MFN181711+LibId67](http://111.68.103.2/opac/Detail.aspx?MFN=181711&LibId=67&FRM=), ISBN9780195771145, accession284990.','',
 '**Punjab request:** GET the official-linked `http://opac.pu.edu.pk/opac/index.aspx` form, then POST its fresh hidden fields plus `lstSearchIn=opac_report.Title`, `Editor=Pakistan the formative phase`, `ddlDepartment=99`, `cmdSearch=Search` to the same URL. This returned12 records and actual MFN/LibId links. The POST payload and HTTP200 timestamp07:04 UTC are saved. The newer PHP interface still lacks identifiers; no mapping between its cards and legacy records was invented.','',
 '**Adapter work:** Koha is a candidate for reuse, not an app-tested result here. QUEST returns a detail page for a one-result search. IIUI requires an HTTP origin on port9194. FAST needs an anonymous cookie session and uses Insignia8.9.2. NUML main and NDU are LibMax; NUML’s eight regional OPAC links are separate SLiMS catalogs and were not individually queried. SLiMS may create a useful shared provider investment with Indonesia. Custom providers for Punjab, State Bank and GCUF need conservative availability handling; Punjab now has stable observed identifiers.','',
 '**Policy status:** National Library returned empty200 robots; Dow, QUEST, IIUI, Punjab, FAST, GCUF and the documented NDU HTTP origin returned404 robots. State Bank returned403 access denial instead of rules; NUML robots timed out twice. Absence of a robots prohibition is not a licence or partnership agreement, and all ten retain `policy_cleared=false`. No app request, registration or deployment was made.','',
 '## Retained observed reserves','',
 '- **UMT (155,000 print volumes):** original title query returned two results, including Politics of ethnicity in Pakistan by Rehana Saeed Hashmi, record106615. Robots prohibit automated searches, so this remains an observed but restricted reserve. NDU is smaller, but its105,000 printed books have a dated2026 official source and its documented public catalog was actually queried. This is an explicit feasibility tradeoff, not a claim that NDU is larger.',
 '- **Sindh Agriculture University:** [Soil fertility and fertilizers](https://opac.sau.edu.pk/cgi-bin/koha/opac-search.pl?q=Soil+fertility+and+fertilizers&idx=ti) returned42 rows (HTTP200,07:06:25 UTC); record4157 is the2005 Pearson Education title attributed to J.L.Havlin, barcode54046, call631.8 HAV. Robots404; Koha. The official vice-chancellor page says hundreds of thousands of mixed volumes but gives no precise dated count, so it is a major-institution proxy reserve. Record says Reference Section/Available while official rules make reference books non-loan; do not present it as borrowable.',
 '',
 '## Large-library priorities retained despite blockers','',
 'This is a size-informed shortlist of ten major collections, not a national league table. Formats, observation years and branch scope differ, and some major public libraries remain unmeasured. Smaller query successes above are not substituted into a claim that these are the largest ten.','',
 '| Institution | Published collection scale | Catalog outcome |','|---|---|---|']
for x in priority: lines.append(f"| {x['name']} | [{x['scale']}]({x['source']}) | {x['status']} |")
lines += ['', '## Blocked and rejected discovery', '']
for n,r in rejections: lines.append(f'- **{n}:** {r}')
lines += ['', '## Evidence and limits','',
 '- `findings.json` is the machine-readable catalog/market/shortlist record. `evidence/` contains bounded HTML, robot responses and HTTP metadata. `sources/` contains supporting official pages. `probe.py` is the read-only research probe; `build_report.py` assembles these artifacts offline.',
 '- Search results were verified with actual requests; indexed snippets were used only for discovery and collection-size sources. Source statistics can be dated, mixed-format, or based on only one constituent library. QUEST’s69,655 books is from the **2020** prospectus; the initially guessed2021 path404s. GCU Lahore’s349,797 figure is explicitly October2019. Punjab’s583,777+ is December2020. LUMS is Academic Report2025.',
 '- Initial UMT requests were made after a Python robots parser incorrectly accepted an early Allow rule. Offline QA found the longer Disallow rule. Metadata was corrected, raw evidence retained, and no subsequent UMT queries were made. This makes UMT an observed query success with an automation block, not a permitted integration.',
 '- Proxy bodies explicitly reporting upstream connection failure were classified as research-environment reachability failures, not proof the library was offline. Explicit robots exclusions,403 responses, timeouts and challenge pages remain different failure classes.',
 '- Public availability labels do not establish that a particular app user can borrow. No broad membership eligibility, public-domain status or full-text reuse rights were inferred.',
 '- The target of **ten largest libraries already verifiably integrable** is not established: twelve systems have observed specific queries, ten are selected and two retained as reserves, but larger catalogs still need permission/reachability work and every integration needs adapter/policy validation.','']
(ROOT/'report.md').write_text('\n'.join(lines))
print(f'Wrote {len(libraries)} query-verified systems and {len(priority)} size-priority candidates.')
