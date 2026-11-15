import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from probe import robots_decision
from bs4 import BeautifulSoup

def meta(name):
    return json.loads((ROOT / 'evidence' / (name + '.json')).read_text())

# Normalize the four early robots captures without making new requests.
for name in ['seals', 'wits', 'unisa', 'cape-town']:
    n = name + '-robots'
    m = meta(n)
    old = ROOT / 'evidence' / (n + '.txt')
    if old.exists():
        (ROOT / 'evidence' / (n + '.html')).write_bytes(old.read_bytes())
    m.update(name=n, evidence_path='evidence/' + n + '.html', metadata_path='evidence/' + n + '.json')
    (ROOT / 'evidence' / (n + '.json')).write_text(json.dumps(m, indent=2) + '\n')

sources = [
    ('durban-size', 'https://economic.durban.gov.za/uploads/0000/6/2025/08/11/metro-ezasegagasini-23-jul-2021-english.pdf', 'Municipal newspaper dated 23 July–5 August 2021 reports three million books and more than 96 public libraries; historical network scale, not a current stocktake.', 'evidence/durban-size-discovery.json'),
    ('unisa-size', 'https://www.unisa.ac.za/sites/corporate/default/Library/Search-library-resources', 'Official resource-search page reports over 1.5 million printed book items.', 'evidence/size-discovery-1.json'),
    ('wits-size', 'https://www.wits.ac.za/media/wits-university/study/postgraduate/documents/wits-pg-studies-brochure2025.pdf', '2025 postgraduate brochure reports over one million book volumes across two main and nine branch libraries.', 'evidence/size-discovery-1.json'),
    ('uct-size', 'https://uct.ac.za/uct-libraries', 'Official overview reports more than 1.2 million print volumes.', 'evidence/size-discovery-1.json'),
    ('cape-size', 'https://www.capetown.gov.za/media-and-news/city-libraries-open-doors-to-learning-jobs-and-opportunity/', '22 January 2026 announcement reports 102 public libraries, free membership and SmartCape access.', 'evidence/size-discovery-2.json'),
    ('joburg-size', 'https://joburg.org.za/play_/Pages/Overview-.aspx', 'Municipal overview reports a network of 89 libraries.', 'evidence/size-discovery-2.json'),
    ('pretoria-size', 'https://drupalwebprod-files.up.ac.za/Public/2025-12/up-postgraduate-brochure-2025.zp260832.pdf?VersionId=HkGeBCBkWYsbe30ymXgBHdvrujMPz7JK', '2025 brochure reports over 700,000 printed books across 11 faculty libraries, separately from licensed ebooks.', 'evidence/size-discovery-2.json'),
    ('stellenbosch-size', 'https://files.su.ac.za/public/about-library/documents/2026-01/annual-report-2023.pdf', '2023 annual report reports 1.2 million physical volumes, not all necessarily monographs.', 'evidence/size-network-discovery-3.json'),
    ('nlsa-size', 'https://www.nlsa.ac.za/using-the-library/', 'Official description reports over one million books and periodicals in the General Reading Room; this is not an institution-wide book-only count.', 'evidence/size-network-discovery-3.json'),
    ('uj-proxy', 'https://uj.ac.za.libguides.com/gis', 'Institutional guide documents APK and DFC campus library services and the university-wide UJLink catalogue; university network is the scale proxy, with no numeric stock count used.', 'evidence/uj-source.html'),
    ('sabinet', 'https://sabinet.co.za/30-years-of-connecting-south-african-libraries-to-the-world/', '2026 vendor account documents South African cataloguing integration into WorldCat in 2006 and WMS introduction in 2013, with cataloguing and resource-sharing services.', 'evidence/sabinet-source.html'),
    ('seals', 'https://www.seals.ac.za/', 'SEALS identifies Nelson Mandela, Rhodes, Fort Hare and Walter Sisulu member universities; its historical Millennium account is superseded for the live route by the observed Primo redirect.', None),
    ('rhodes-migration', 'https://www.ru.ac.za/library/latestnews/rhodes_university_library_management_system_upgrade-1.html', 'Institutional announcement confirms Sierra-to-Alma migration and replacement of separate OPAC/Summon search with Primo; electronic-resource access requires OpenAthens.', 'evidence/size-network-discovery-3.json'),
    ('rustenburg', 'https://sajim.co.za/index.php/sajim/article/view/1769/2678', '2024 study of 35 Rustenburg library staff finds heavy manual-system reliance and limited use of available systems. This is municipality-specific evidence of uneven access, not national LMS market share.', 'evidence/rustenburg-study.html'),
    ('uwc-current', 'https://www.uwc.ac.za/campus-life/resources/library', 'Current institutional page embeds an EBSCO Discovery guest search; historical Alma/Primo adoption does not prove the present discovery interface.', 'evidence/uwc-source.html'),
    ('dut-current', 'https://library.dut.ac.za/', 'Current institutional page links its catalogue to an EBSCOhost guest-profile route.', 'evidence/dut-source.html'),
    ('cput', 'https://www.cput.ac.za/research/libraries', 'Official CPUT description names seven library branches across seven campuses and Alma/Primo.', None),
    ('western-cape', 'https://westerncapelibraries.co.za/online-catalog/', 'Provincial directory links the online catalogue at wc.slims.gov.za; distinct from Cape Town municipal catalogue.', None),
    ('cape-history', 'https://library.ifla.org/1083/1/207-ruppelt-en.pdf', '2015 institutional IFLA paper identifies Cape Town Brocade; this is historical. Later official Cape Town links use /client/en_US/ Sirsi-style routes, whose present backend was not verified.', None),
    ('cape-current-route', 'https://www.capetown.gov.za/Media-and-news/Celebrate%20South%20African%20Library%20Week%20with%20the%20City%27s%20libraries', 'Official 2021 article links opac.capetown.gov.za/client/en_US/a/.', None),
    ('durban-access', 'https://www.durban.gov.za/page/community-services', 'Official municipal guidance states free library entry, library-card borrowing, and ID/address membership documentation; direct fetch failed but indexed official source was read.', None),
    ('cornerstone', 'https://library.cornerstone.ac.za/', 'Institutional homepage links Koha; catalog origin robots fetch failed with tunnel HTTP403.', 'evidence/cornerstone-source.html'),
]
src = {s[0]: {'url':s[1], 'claim':s[2], 'evidence_path':s[3]} for s in sources}

priorities = [
    ('eThekwini Municipal Libraries', 'Three million books; >96 public libraries (municipal newspaper, 2021; historical).', 'durban-size', 'verified_target'),
    ('National Library of South Africa', 'Over one million books and periodicals in General Reading Room (undated official page); legal-deposit institution.', 'nlsa-size', 'unverified; official homepage HTTP503 prevented discovery of a reliable current catalogue route'),
    ('University of South Africa Library', 'Over 1.5 million printed book items (undated official page).', 'unisa-size', 'restricted; OASIS disallows searches and applicable AI agents'),
    ('University of Cape Town Libraries', 'More than 1.2 million print volumes (undated official overview).', 'uct-size', 'restricted; Primo search/API disallowed'),
    ('Stellenbosch University Library and Information Service', '1.2 million physical volumes (2023 annual report).', 'stellenbosch-size', 'restricted; Primo search/API disallowed'),
    ('University of the Witwatersrand Library', 'Over one million book volumes; two main and nine branch libraries (2025 brochure).', 'wits-size', 'restricted; classic catalogue search and applicable AI agents disallowed'),
    ('University of Pretoria Department of Library Services', 'Over 700,000 printed books across 11 faculty libraries (2025 brochure).', 'pretoria-size', 'restricted; WorldCat Discovery disallows all automated paths'),
    ('City of Cape Town Library and Information Services', '102 public libraries (22 January 2026); network proxy.', 'cape-size', 'unresolved; catalogue robots HTTP503, no query attempted'),
    ('City of Johannesburg Library and Information Services', '89 public libraries (undated official overview); network proxy.', 'joburg-size', 'unresolved; MyLibrary robots HTTP503, no query attempted'),
    ('University of Johannesburg Library', 'University campus network; APK and DFC library services documented, no numeric collection count established.', 'uj-proxy', 'restricted; UJLink search and applicable AI agents disallowed'),
]

q = meta('durban-query')
r = meta('durban-robots')
d = meta('durban-detail-ajax')
detail = json.loads((ROOT/'evidence/durban-detail-ajax.html').read_text())
soup = BeautifulSoup(detail['content'], 'html.parser')
record_url = soup.select_one('[data-url]')['data-url']
(ROOT/'evidence/durban-detail-readable.txt').write_text(soup.get_text(' ',strip=True)+'\n')

lib = {
    'id':'zaf-ethekwini', 'name':'eThekwini Municipal Libraries', 'recommendation':'verified_target',
    'scope':'One metropolitan public-library network; all branches combined, counted once.',
    'size':{'value':3000000,'unit':'books across municipal network','date':'2021-07-23','source_url':src['durban-size']['url'],'evidence_path':src['durban-size']['evidence_path'],'quality':'indexed official','note':'Historical newspaper claim; not a November 2026 stocktake. Its >96-library count differs from later 95-library statements; no forced reconciliation.'},
    'platform':{'family':'SirsiDynix Enterprise/Portfolio','name':'Sirsi Corporation Portfolio Version 5.2.1.5','proof':'Live search footer names Sirsi and Portfolio 5.2.1.5; records carry SD_ILS identifiers. Backend Symphony inferred from SD_ILS family only, not independently certified.','evidence_path':'evidence/durban-query.html'},
    'query':{'text':'Long walk to freedom','method':q['method'],'url':q['url'],'payload':q['payload'],'checked_at_utc':q['checked_at_utc'],'http_status':q['status'],'effective_url':q['effective_url'],'result_count':49,'count_note':'Local results total includes multiple formats and related records; format facet lists 43 Books. These are not 49 identical editions or 49 available copies.','match_type':'exact_title','evidence_path':q['evidence_path'],'metadata_path':q['metadata_path'],'reproduction':'GET public home, parse anonymous searchform hidden state, POST q with empty targetValue/limitValue/restrictionValue and Search action; follow redirect. Hidden form state is transient and must be refreshed.'},
    'books':[{'title':'Long walk to freedom','author':'Nelson Mandela; Chris Van Wyk; Paddy Bouma (illustrator)','record_id':'SD_ILS:1126617','record_url':record_url,'isbn':'9781405091886','holdings':'Detail lists local copy rows including Asherville Library J 920 MAND (Juvenile Non-Fiction), Don Africana Library DON 920 MAND (Reference Non-Fiction), and Pinetown Library RE MAND (Juvenile English Fiction). Live status fields remain Searching... / Unknown; subsequent normal public lookup returned no item statuses. No available-to-borrow assertion.','evidence_path':'evidence/durban-detail-ajax.html','edition_note':"London: Macmillan Children's Books, 2009, illustrated children's adaptation; not treated as the original adult autobiography edition.",'detail_request':{'method':'GET','url':d['url'],'headers':{'X-Requested-With':'XMLHttpRequest'},'checked_at_utc':d['checked_at_utc'],'http_status':d['status'],'metadata_path':d['metadata_path']}}],
    'robots':{'url':r['url'],'status':r['status'],'checked_at_utc':r['checked_at_utc'],'evidence_path':r['metadata_path'],'decision':'no_published_rules','note':'HTTP404 before query/detail; no affirmative reuse licence inferred.'},
    'reader_access':'Municipal public network. Official guidance describes free entry, membership with ID and address evidence, and card-based borrowing. Public catalogue access does not guarantee visitor borrowing; reference copy restrictions remain meaningful.',
    'integration':{'existing_adapter':'new family','needs':['Sirsi/Tapestry form and AJAX detail handling','Refresh anonymous form state; do not persist it as credentials','Map SD_ILS record identity and edition ISBN exactly','Preserve reference locations and unknown circulation status','Policy/reuse review and request budget before production'],'blockers':['Live copy statuses were not returned by the normal detail availability lookup','No existing app integration or stable-share-link replay tested'],'live_app_tested':False},
}

blocked = [
    ('National Library of South Africa','https://www.nlsa.ac.za/','Homepage HTTP503; web tool also timed out. No reliable current catalogue route established; not evidence of absent catalogue or holdings.','nlsa-source'),
    ('University of South Africa Library','https://oasis.unisa.ac.za/','robots disallows /search and /record=; also ChatGPT-User and OAI-SearchBot /. No title query sent.','unisa-robots'),
    ('University of the Witwatersrand Library','https://innopac.wits.ac.za/','robots disallows /search and /record= plus applicable AI agents /. No title query sent.','wits-robots'),
    ('University of Johannesburg Library','https://ujlink.uj.ac.za/','robots disallows /search and /record= plus applicable AI agents /. No title query sent.','uj-robots'),
    ('University of Cape Town Libraries','https://uct.primo.exlibrisgroup.com/','robots disallows /primaws, /discovery/search and /nde/search. No query sent.','uct-robots'),
    ('Stellenbosch University Library and Information Service','https://sun.primo.exlibrisgroup.com/','robots disallows /primaws, /discovery/search and /nde/search. No query sent.','stellenbosch-robots'),
    ('University of Pretoria Department of Library Services','https://univofpretoria.on.worldcat.org/','robots wildcard Disallow: /. No query sent.','pretoria-robots'),
    ('City of Cape Town Library and Information Services','https://opac.capetown.gov.za/','robots HTTP503; policy unresolved. No query sent. Historical Brocade evidence not used to assert current platform.','cape-town-robots'),
    ('City of Johannesburg Library and Information Services','https://mylibrary.joburg.org.za/client/en_US/home','robots HTTP503; policy unresolved. No query sent.','joburg-robots'),
    ('SEALS: Nelson Mandela, Rhodes, Fort Hare and Walter Sisulu universities','https://seals-network.primo.exlibrisgroup.com/nde/home?vid=27SEALS_NETWORK:NETWORK_UNION','Officially linked old opac.seals.ac.za robots route redirected to Primo NDE shell. Independently checked new-origin robots prohibits search and API. No member-specific holding query made; no member or union success counted.','seals-primo-robots'),
    ('Western Cape provincial library catalogue','https://wc.slims.gov.za/','robots wildcard Disallow: /. Provincial service distinct from Cape Town municipal system.','western-cape-robots'),
    ('KwaZulu-Natal provincial library catalogue','https://kzn.slims.gov.za/desktop/desktopkzn','Route directly linked by eThekwini catalogue. robots wildcard Disallow: /. No query sent.','kzn-robots'),
    ('University of the Western Cape Library','https://research.ebsco.com/c/y3j5xa/results','Current UWC institutional page supplies guest EBSCO search form. research.ebsco.com robots disallows all, including ChatGPT-User. No query sent.','eds-robots'),
    ('Durban University of Technology Library','https://search.ebscohost.com/login.aspx?authtype=ip,guest&custid=s5210036&groupid=main&profile=eds','Current official library catalogue link is EBSCO guest route, but robots specifically disallows ChatGPT-User. No request past robots.','dut-eds-robots'),
    ('Cape Peninsula University of Technology Libraries','https://library.cput.ac.za/','Official current description identifies seven branches and Alma/Primo. Library landing request HTTP503; did not invent a tenant endpoint.','cput-source'),
    ('Cornerstone Institute Library (smaller alternative)','https://koha.cornerstone.ac.za/','Official homepage identifies Koha link, but robots request tunnel HTTP403; origin unavailable. Unquantified candidate not promoted to selected target.','cornerstone-robots'),
]

findings = {
    'country':'South Africa','country_code':'ZAF','research_date_utc':'2026-11-15','status':'complete',
    'completion_note':'Research complete with explicit shortfall: one selected observed network; nine additional verified substantial institutions still needed. No reserve success.',
    'market':{
        'summary':'South Africa has substantial mature academic and municipal collections, shared cataloguing/interlending and commercial cloud discovery. Access remains uneven across communities and institutions. The feasible opportunity is federating permitted physical-book holdings and accurately guiding readers to usable copies; it is not building missing national infrastructure from scratch.',
        'platform_strategy':'Start a bounded Sirsi Enterprise/Portfolio pilot at eThekwini. Seek a supported, licensed Sabinet/OCLC holdings arrangement for broader coverage; explore institution-approved Primo/Alma and SITA/Brocade SLIMS routes. Current restrictive robots policies prevent automatic production assumptions. South African SLIMS is not Indonesian Senayan SLiMS. Existing Koha adapter does not unlock the major sampled collections.',
        'adoption_evidence':[
            {'claim':src['sabinet']['claim'],'scope':'Vendor-described South African cooperative services; not LMS national market share','date':'2026','source_url':src['sabinet']['url']},
            {'claim':src['rhodes-migration']['claim'],'scope':'Rhodes University; supported by observed SEALS redirect, not an inferred full member migration census','date':'undated current announcement','source_url':src['rhodes-migration']['url']},
            {'claim':'Live eThekwini catalogue identifies Sirsi Portfolio 5.2.1.5.','scope':'One municipal network','date':'2026-11-15','source_url':q['effective_url']},
            {'claim':src['rustenburg']['claim'],'scope':'35 library staff in Rustenburg municipality only','date':'2024-03-13','source_url':src['rustenburg']['url']},
            {'claim':src['uwc-current']['claim'],'scope':'Current UWC discovery interface; backend LMS not inferred','date':'2026-11-15','source_url':src['uwc-current']['url']}
        ],
        'network_opportunities':[
            {'name':'Sabinet SabiCat / SACat / WorldCat and ReQuest','scope':'Cooperative cataloguing and interlibrary services across Southern African institutions','source_url':src['sabinet']['url'],'verification':'Service existence/source confirmed; no licensed API or institution-filtered holdings query tested','integration_implication':'Highest plausible partnership reach. Keep bibliographic holding membership separate from live copy circulation; journal databases and licensed ebooks are not substitutes for physical-book location.'},
            {'name':'SEALS','scope':'Nelson Mandela, Rhodes, Fort Hare and Walter Sisulu universities','source_url':src['seals']['url'],'verification':'Membership documented; old shared catalogue redirects to Primo NDE; new-origin robots checked and restrictive','integration_implication':'Shared integration could cover four independent institutions only after approved scope-filtered holding queries prove each; no branch/union double-counting.'},
            {'name':'Provincial SITA/Brocade SLIMS','scope':'Western Cape and KwaZulu-Natal public-library catalogues observed','source_url':src['western-cape']['url'],'verification':'Catalog routes observed; both robots disallow all','integration_implication':'Potential broad public reach through supported agreement; not an enabled scraper and not the Indonesian SLiMS family.'},
            {'name':'eThekwini Municipal Libraries','scope':'One large metropolitan public network','source_url':'https://library.durban.gov.za/client/en_US/default/','verification':'Actual anonymous title query and detail returned local copy locations','integration_implication':'Concrete initial Sirsi-family feasibility target; unknown live statuses must be retained.'}
        ]
    },
    'major_library_priorities':[{'name':n,'size_claim':z,'source_url':src[s]['url'],'outcome':o,'evidence_path':src[s]['evidence_path']} for n,z,s,o in priorities],
    'libraries':[lib],
    'blocked_or_unverified':[{'name':n,'url':u,'reason':why,'evidence_path':'evidence/'+e+'.json'} for n,u,why,e in blocked],
    'limitations':[
        'Ten substantial verified targets were not reached: 1 selected, 0 reserves, 9-target shortfall.',
        'No national largest-ten ranking established; dates and book/volume/periodical/network units differ.',
        'Feasibility-selected platforms and one successful query are not a national LMS market-share survey.',
        'Published size evidence often came through indexed official pages/PDFs; raw discovery outputs are retained and explicitly distinguished from direct catalogue requests.',
        'Public searching is not borrowing permission, a reuse licence, or a guarantee that a physical copy is present now.',
        'eThekwini item status remained unknown; the illustrated adaptation is distinct from adult autobiography editions.',
        'Restrictive and failing origins were not circumvented. No authentication, cookie jar, outreach, holds or application/product changes.',
        'All network branches are counted once; SEALS members and provincial branch selectors are not counted without institution-specific returned holdings.'
    ],
    'sources':list(src.values())
}
(ROOT/'findings.json').write_text(json.dumps(findings,ensure_ascii=False,indent=2)+'\n')

policy=[]
for n,u,_,e in blocked:
    if e.endswith('robots'):
        target=u.rstrip('/')+'/search' if e in ['wits-robots','unisa-robots','uj-robots'] else u
        if 'primo' in u:target=u.split('/nde/')[0].rstrip('/')+'/discovery/search'
        decision=robots_decision(ROOT/'evidence'/f'{e}.json',target)
        policy.append({'name':n,'target_url':target,**decision})
(ROOT/'evidence/policy-decisions.json').write_text(json.dumps(policy,indent=2)+'\n')
print('Wrote findings: 1 selected, 0 reserves, 10 priorities,',len(blocked),'blocked/unverified entries')
