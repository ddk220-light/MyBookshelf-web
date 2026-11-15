"""Assemble the Ghana dossier from manually inspected bounded responses.

This is an offline formatter, not a catalog crawler. Uses ../probe.py solely to
record policy decisions for the exact observed/proposed public routes.
"""
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from probe import robots_decision

def meta(name):
    return json.loads((HERE / 'evidence' / f'{name}.json').read_text())

def policy(name, target):
    m = meta(name + '-robots')
    p = robots_decision(HERE / 'evidence' / f'{name}-robots.json', target)
    return dict(url=m['url'], status=m['status'], checked_at_utc=m['checked_at_utc'],
                evidence_path=m['metadata_path'], decision=p['decision'], note=p['note'],
                parsed_decision=p)

def size(value, unit, source, path=None, quality='official', note='', date='undated; accessed 2026-11-15'):
    return dict(value=value, unit=unit, date=date, source_url=source,
                evidence_path=path, quality=quality, note=note)

def entry(slug, name, scope, sz, qname, qtext, count, match, book, access, notes, family='Koha'):
    q = meta(qname)
    return dict(id='ghana-' + slug, name=name, recommendation='reserve', scope=scope, size=sz,
                platform=dict(family=family, name='SLiMS 9 (Bulian)' if family=='SLiMS' else 'Koha; version not established',
                              proof='SLiMS 9 (Bulian) footer and index.php forms' if family=='SLiMS' else 'Koha footer, /cgi-bin/koha/ search and detail routes, Koha item table',
                              evidence_path=q['evidence_path']),
                query=dict(text=qtext,method=q['method'],url=q['url'],payload=q['payload'],checked_at_utc=q['checked_at_utc'],
                           http_status=q['status'],effective_url=q['effective_url'],result_count=count,
                           count_note='Displayed result total; includes related records and is not a collection-size estimate.',
                           match_type=match,evidence_path=q['evidence_path'],metadata_path=q['metadata_path']),
                books=[book],robots=policy(slug,q['url']),reader_access=access,
                integration=dict(existing_adapter='new family' if family=='SLiMS' else 'candidate reuse',
                                 needs=notes,blockers=['Collection size or physical-catalog coverage is insufficient to promote this reserve into the requested ten substantial targets.'],
                                 live_app_tested=False))

libraries = [
    entry('wisconsin','Wisconsin International University College, Ghana Library',
          'One institutional library system including Accra and Kumasi; its campuses are not counted separately.',
          size(None,'current print volume count unknown; institutional proxy: Main, Nursing, Law, City and Kumasi components',
               'https://wiuc-ghana.edu.gh/library/','evidence/wisconsin-source.html','institutional proxy',
               'Official page identifies the multi-location system but supplies no current stock total. Reserve; record IDs are not size estimates.'),
          'wisconsin-query','Principles of economics',93,'exact_title',
          dict(title='Principles of economics.',author='N. Gregory Mankiw',record_id='8417',
               record_url='https://opac.wiuc-ghana.edu.gh/cgi-bin/koha/opac-detail.pl?biblionumber=8417',
               isbn='9781305046818',isbns_as_cataloged=['9781305046818','9781305046811'],
               edition='7th ed.; London: Cengage, 2014',
               holdings='Two Available rows at WIUC Ghana Kumasi Library, General Stacks; call numbers HB171.5.M26(7e) and HB171.5.M261(7e); barcodes K/552/552/19 and K/553/553/19.',
               evidence_path='evidence/wisconsin-detail.html',detail_metadata_path='evidence/wisconsin-detail.json'),
          'Anonymous search and detail succeeded. Official library page includes non-members among its service audience; borrowing eligibility and current guest conditions were not established. The Law Library is described as reference-only.',
          ['Map WIUC-KL and WIUC-1 branches without counting them as institutions.','Preserve edition/record identity and both cataloged ISBN strings without correcting or merging them.','Handle modern Koha templates and retain reference locations; public search is not a reuse licence.']),
    entry('usted','USTED / AAMUSTED Library',
          'One university library system: Kumasi and NASKA II, Mampong. Homepage uses USTED; item holdings retain AAMUSTED names.',
          size(4200,'plus cataloged titles (not volumes)',
               'https://opac.usted.edu.gh/cgi-bin/koha/opac-main.pl','evidence/usted-home.html','official',
               'Homepage advertises 4,200+ titles and two campus libraries. This is an interface claim, not an audited full print stock. Selection uses the explicit two-campus public-university scope, not a largest-collection claim.'),
          'usted-query','Principles of economics',20,'exact_title',
          dict(title='Principles of economics',author='N. Gregory Mankiw',record_id='7',
               record_url='https://opac.usted.edu.gh/cgi-bin/koha/opac-detail.pl?biblionumber=7',
               isbn='9781305585126',isbns_as_cataloged=['9781305585126','1305585127','9781337552134','1337552135'],
               edition='8th ed.; Cengage Learning, [2018]',
               holdings='Two Available item rows at AAMUSTED Library, Kumasi; HB171.5 .M264 2018. Reserve Book Shelf, barcode 0000000031, copy number 2; Lending Book Shelf, barcode 0000000014, copy number 1. Search summary calls both available for loan; reserve location must be retained.',
               evidence_path='evidence/usted-detail.html',detail_metadata_path='evidence/usted-detail.json'),
          'Anonymous search/detail succeeded. Library homepage distinguishes physical LIBCAT from licensed databases and registration-required ProQuest/MyLOFT. Guest entry and borrowing entitlements remain unverified.',
          ['Resolve current USTED/AAMUSTED institution naming while preserving holding labels.','Retain Reserve Book Shelf versus Lending Book Shelf; Available alone does not establish take-home eligibility.','Recheck Cloudflare content signals: search=yes, ai-train=no, use=reference; no affirmative metadata reuse licence.']),
    entry('parliament','Parliament of Ghana Library',
          'One national legislative special library; the observed Main Library holding is not a second institution.',
          size(5000,'plus books, with parliamentary documents also described',
               'https://library.parliament.gh/about.html','evidence/parliament-source.html','official',
               'Official history describes over 5,000 books and more than 40 seats. Selection uses its national legislative/research function and verified physical report; this is not a national large-library ranking.'),
          'parliament-query','Constitution',215,'subject',
          dict(title='Report of the Committee of Experts (1992 Constitution) on Proposal for a Draft Constitution of Ghana presented to the PNDC',
               author='Republic of Ghana',record_id='45',
               record_url='https://opac.parliament.gh/cgi-bin/koha/opac-detail.pl?biblionumber=45',isbn=None,
               edition='Accra: Republic of Ghana, 1991; vi, 328 pages (publisher misspelled Repulic in catalog)',
               holdings='One Available row, item type Reports, Main Library, Reference; call number 342.02R 1370 C1, copy number 1. No barcode text exposed. Search calls it available for loan, while detail preserves Reference.',
               evidence_path='evidence/parliament-detail.html',detail_metadata_path='evidence/parliament-detail.json'),
          'Anonymous catalog is public. Official mission includes the general public, but visitor admission/borrowing rights were not established. The returned item is a book-length government report, not a journal or an ebook.',
          ['Retain reference location and report material type.','Subject search returns parliamentary reports; do not label all 215 results as exact matches.','Institution branding comes from official catalog link and footer despite generic Koha heading.']),
    entry('upsa','University of Professional Studies, Accra — Joshua Alabi Library Online',
          'One UPSA online library; this response proves bibliographic/ebook discovery, not the full physical Joshua Alabi Library collection.',
          size(None,'physical stock and online catalog coverage unknown; institutional proxy: university library',
               'https://upsa.edu.gh/docx/publications/annual-report-2021.pdf',None,'indexed official',
               '2021 annual report explicitly identifies library.upsavirtual.site as the library virtual site and says ebooks were uploaded there. No physical-copy total inferred.','2021 annual report'),
          'upsa-query3','Management',29,'subject',
          dict(title='Marketing and Multicultural Diversity',author='C.P. Rao',record_id='89',
               record_url='https://library.upsavirtual.site/index.php?p=show_detail&id=89&keywords=Management',
               isbn='0-7546-4326-3',edition='Ashgate Publishing Limited, England, 2006',
               holdings='Detail explicitly says No copy data and has a file-attachment link. No physical location, barcode, circulation status or copy quantity verified; attachment was not downloaded.',
               evidence_path='evidence/upsa-detail.html',detail_metadata_path='evidence/upsa-detail.json'),
          'Anonymous search/detail succeeded. This is an ebook-oriented virtual catalog; no entitlement to download, borrow or reuse full text was tested.',
          ['New SLiMS adapter required; include submit-button parameter search=search.','Treat No copy data as unknown physical availability.','Exact phrase Marketing and Multicultural Diversity returned zero although the Management subject query returns that record; search semantics need validation.','Do not infer Indonesian language is correct: detail displays Indonesia and may contain default metadata.'],family='SLiMS')
]

for lib in libraries:
    if lib['id'] in ['ghana-usted','ghana-parliament']:
        lib['recommendation']='verified_target'
        lib['selection_basis']='Institutional-scale proxy: two-campus public-university library system, supported by the official library site and actual physical holdings.' if lib['id']=='ghana-usted' else 'Institutional-scale proxy: national legislative research library with over 5,000 books and a verified physical book-length government report; specialized mission, not a claim of very large stock.'
        lib['integration']['blockers']=['Revalidate institutional access/reuse terms before integration; public search does not establish a reuse licence.']
    else:
        lib['selection_basis']='Reserve: current collection scope/stock is unquantified and institutional scale is weaker than the major public-university priorities.' if lib['id']=='ghana-wisconsin' else 'Reserve: observed virtual-catalog subset exposes no physical-copy data.'

priorities = [
    ('Ghana Library Authority (including George Padmore/public-network roles)','139 functioning public libraries reported by the acting director in September 2025; stock is not a catalog count.',
     'https://www.graphic.com.gh/news/general-news/ghana-news-ghana-has-only-139-public-libraries-authority-cries-for-more.html','Public OPDS search timed out; no attributed physical holding verified.'),
    ('University of Ghana Library System / Balme Library','Balme official page: more than 400,000 printed volumes; university-wide holdings may be larger.',
     'https://balme.ug.edu.gh/index.php','UGCat robots returned HTTP503; catalog search stopped.'),
    ('KNUST Library System','Official home advertises access to over 500,000 books and research materials; mixed access wording is not a measured physical stock.',
     'https://library.knust.edu.gh/','Official libcat origin robots HTTP503; no query.'),
    ('University of Cape Coast / Sam Jonah Library','Institutional network proxy: Main, Faculty, Departmental and Hall libraries; no current comparable total established.',
     'https://ucc.edu.gh/main/explore-ucc/corporate-strategic-plan/library','koha.ucc.edu.gh robots timed out; no query.'),
    ('University of Education, Winneba Library','Official print-collection page states over 130,000 volumes (indexed official source).',
     'https://uew.edu.gh/uewlibrary/collections/print-books','Official WINNOPAC origin robots disallows /; no query.'),
    ('University for Development Studies Library System','Official WACWISA handbook describes about 55,000 book volumes; historical system scope may predate institutional changes.',
     'https://wacwisa.uds.edu.gh/wp-content/uploads/2020/09/WACWISA-Student-Guidelines-Handbook.pdf','Robots forbids opac-search.pl. CKT-UTAS and SDD-UBIDS branch selectors are not separately counted.'),
    ('GIMPA Library System','Official library page: about 70,000 volumes and over 20,000 electronic resources; separate units and undated counts.',
     'https://gimpa.edu.gh/library/','GIMOPAC robots HTTP503; no query.'),
    ('University of Mines and Technology Library','Major specialized public university proxy; homepage advertises access to over 500,000 books, catalogs and research materials, not a verified print-stock total.',
     'https://library.umat.edu.gh/','Official elib.umat.edu.gh robots transport tunnel403; no query.'),
    ('University of Energy and Natural Resources Library','University-wide research-library proxy; official site describes print/electronic books, journals and archives and identifies Koha, without a count.',
     'https://uenrlbr.uenr.edu.gh/','Official librarycatalog origin robots HTTP503; no query.'),
    ('University of Health and Allied Sciences Library','Official catalog page: over 14,000 print materials.',
     'https://library.uhas.edu.gh/catalogue','Official hosted OPAC at ghlibrary.online:1004 disallows /.'),
    ('Central University Library','Official page describes nine libraries; university network proxy, no current volume count.',
     'https://central.edu.gh/library','Two valid public searches returned zero: Things fall apart; Principles of economics. No absence claim.'),
    ('Catholic University of Ghana Library','Official homepage indexed claim: 20,000+ print books.',
     'https://library.cug.edu.gh/','Source fetch HTTP403; indexed OPAC points to shared ghlibrary host but exact tenant route not established.'),
    ('Valley View University Library System','Official page: main Walton Whaley Library about 15,000 volumes and three branch libraries each approximately 5,000+ books; approximate, not summed into an audited total.',
     'https://www.vvu.edu.gh/library_resources.php','Official public page and iSchool entry discovered; no current public catalog search route established.'),
    ('Kumasi Technical University Library','Official network proxy: Adako Jachie campus main library, Research Commons and FCAT library; not separately counted.',
     'https://library.kstu.edu.gh/libraries/adako-jachie-library','Official libcat origin robots transport tunnel403; no query.'),
    ('USTED / AAMUSTED Library','Official catalog: 4,200+ titles and two campus libraries; not an audited volume total.',
     'https://opac.usted.edu.gh/cgi-bin/koha/opac-main.pl','Selected using two-campus public-university scope; exact book and copies observed.'),
    ('Wisconsin International University College, Ghana Library','Official institutional proxy: Main, Nursing, Law, City and Kumasi library components.',
     'https://wiuc-ghana.edu.gh/library/','Observed exact book and copies; reserve because current stock unquantified.'),
    ('Parliament of Ghana Library','Official history: over 5,000 books; specialist national legislative collection.',
     'https://library.parliament.gh/about.html','Selected using national legislative scope; 328-page report and reference-location copy observed.'),
    ('UPSA Joshua Alabi Library','Major university library proxy; virtual-site link supported by official 2021 annual report.',
     'https://upsa.edu.gh/docx/publications/annual-report-2021.pdf','Observed book metadata with No copy data; digital reserve only.'),
    ('CSIR Forestry Research Institute of Ghana Library','Official page: about 6,000 books; over 4,000 books and 700 journal articles cataloged with Koha.',
     'https://csir-forig.org.gh/library/','Koha documented but no public query route on official page; no speculative endpoint queried.'),
]

blocked = [
    ('Ghana Library Authority public catalog','https://opds.library.gov.gh/search.atom?page=1&q=Things+fall+apart','Official frontend uses public OPDS search; robots permits it, but anonymous query timed out. OPDS describes digital formats; no physical holding validated.','ghla-opds-query'),
    ('University of Ghana / UGCat','https://sierra.ug.edu.gh/','Robots HTTP503 remote connection failure; no catalog query.','ug-robots'),
    ('KNUST','https://libcat.knust.edu.gh/','Robots HTTP503 connection timeout; no catalog query.','knust-robots'),
    ('University of Cape Coast','https://koha.ucc.edu.gh/','Robots read timeout; no catalog query.','ucc-robots'),
    ('University of Education, Winneba','http://library2.uew.edu.gh:8080/','Robots wildcard Disallow: /; no query.','uew-robots'),
    ('University for Development Studies','https://libcatalogue.uds.edu.gh/','Robots wildcard forbids /cgi-bin/koha/opac-search.pl despite Allow: /; longest-match exclusion respected.','uds-robots'),
    ('GIMPA','https://gimopac.gimpa.edu.gh/','Robots HTTP503 remote connection failure; no query.','gimpa-robots'),
    ('UMaT','https://elib.umat.edu.gh/','Robots transport failed with tunnel403; no query or TLS bypass.','umat-robots'),
    ('UENR','https://librarycatalog.uenr.edu.gh/','Robots HTTP503 connection timeout; no query.','uenr-robots'),
    ('UHAS','http://ghlibrary.online:1004/','Official institution page links this tenant; robots wildcard Disallow: /, not a permissioned shared catalog.','uhas-robots'),
    ('Central University','https://opac.central.edu.gh/','Robots404; two HTTP200 title queries returned no results. This is not proof that either book is absent.','central-query2'),
    ('Ashesi University','https://opac.ashesi.edu.gh/','Robots explicitly disallows ChatGPT-User and OAI-SearchBot. No query; wildcard Allow does not override named applicable restrictions.','ashesi-robots'),
    ('Presbyterian University, Ghana','http://ghlibrary.online:1002/','Official E-Services page links this tenant; robots wildcard Disallow: /. No query.','presby-robots'),
    ('Catholic University of Ghana','https://library.cug.edu.gh/','Official source fetch HTTP403; indexed source shows a hosted OPAC but exact tenant route not established. No bypass.','cug-source'),
    ('Kumasi Technical University','https://libcat.kstu.edu.gh/','Robots transport tunnel403; no query.','kstu-robots'),
    ('UniMAC Library','https://opac.unimac.edu.gh/','Official library links OPAC; robots read timeout; no query.','unimac-robots'),
    ('Pentecost University','http://library.pentvars.edu.gh/','Official help describes Destiny and public route; robots HTTP403 No approved upstream IPv4 address. No private address attempted.','pentecost-robots'),
    ('KAIPTC Library','http://library.kaiptc.org:8098/','Official FAQs give this public OPAC; robots timed out.','kaiptc-robots'),
    ('Ghana Communication Technology University','https://library.gctu.edu.gh/','Library Catalogue (OPAC) link is # in inspected official homepage; no real catalog request endpoint established.','gctu-source'),
    ('Valley View University','https://www.vvu.edu.gh/library_resources.php','Official library page and iSchool entry identified; no anonymous catalog route established.','valley-source'),
    ('CSIR-FORIG','https://csir-forig.org.gh/library/','Official Koha adoption/stock evidence, but no public OPAC endpoint established.','forig-source'),
    ('Regent University College, Ghana','https://lirgjournal.org.uk/index.php/lir/article/download/764/758/3381','2017 librarian-authored implementation study verifies historical Koha adoption, not a current working public endpoint.','regent-study'),
]

sources = [
    ('https://aamusted.edu.gh/appointment-of-principal-and-university-librarian/','Official institution describes Act1026 establishment and two former UEW campuses, supporting USTED/AAMUSTED institutional scope.','evidence/usted-institution-source.html'),
    ('https://librarymap.ifla.org/countries/ghana?print_country=1','National structure: no national library; public network centralized under GhLA; academic institutions separate; CARLIGH training/e-resources.','evidence/ifla-source.html'),
    ('https://www.carligh.org/','Consortium purpose, e-resource access, training and institutional cooperation; not proof of a physical holdings union.','evidence/carligh-source.html'),
    ('https://lirgjournal.org.uk/index.php/lir/article/download/764/758/3381','Darko-Ampem 2017 Regent implementation study and historical CARLIGH Koha workshops, PDF pp85-109.','evidence/regent-study.pdf'),
    ('https://www.library.gov.gh/','Official public frontend and observed asset imports leading to OPDS catalog; no successful book response.','evidence/ghla-source.html'),
    ('https://library.uhas.edu.gh/catalogue','14,000+ print materials and exact official hosted OPAC link.','evidence/uhas-source.html'),
    ('https://www.presbyuniversity.edu.gh/site/e-services/','Exact official Presbyterian tenant link http://ghlibrary.online:1002/.','evidence/presby-eservices.html'),
    ('https://library.unimac.edu.gh/','Official UniMAC catalog links and search family evidence.','evidence/unimac-source.html'),
    ('https://library.unimac.edu.gh/cataloguing-classification-unit','Official UniMAC explanation of Koha, MARC21 and Z39.50 cataloging (indexed).',None),
    ('https://uenrlbr.uenr.edu.gh/','Official UENR Koha adoption, collections and catalog link (indexed).',None),
    ('https://www.uew.edu.gh/uewlibrary/systems','Official WINNOPAC link; historical Virtua attribution requires separate study (indexed).',None),
    ('https://pentvars.edu.gh/research/welcome-to-our-library/library-help/','Official Destiny guide allows non-student catalog access and gives public catalog hostname (indexed); private address was not queried.',None),
    ('https://www.kaiptc.org/media-centre/faqs/','Official KAIPTC public OPAC address and explicit distinction from ebooks (indexed).',None),
]
for n, claim, url, outcome in priorities:
    paths={'https://balme.ug.edu.gh/index.php':'evidence/ug-size-source.html','https://library.knust.edu.gh/':'evidence/knust-size-source.html',
           'https://ucc.edu.gh/main/explore-ucc/corporate-strategic-plan/library':'evidence/ucc-size-source.html',
           'https://wiuc-ghana.edu.gh/library/':'evidence/wisconsin-source.html','https://library.parliament.gh/about.html':'evidence/parliament-source.html',
           'https://csir-forig.org.gh/library/':'evidence/forig-source.html','https://www.vvu.edu.gh/library_resources.php':'evidence/valley-source.html',
           'https://opac.usted.edu.gh/cgi-bin/koha/opac-main.pl':'evidence/usted-home.html'}
    if url not in [s[0] for s in sources]: sources.append((url,claim,paths.get(url)))

data = dict(country='Ghana',country_code='GHA',research_date_utc='2026-11-15',status='complete_with_shortfall',
            counts=dict(observed_successes=4,selected=2,reserves=2,physical_holdings_successes=3,physical_holdings_reserves=1,digital_metadata_only_reserves=1,target_selected=10,selected_shortfall=8),
            market=dict(summary='Ghana has a centralized public library system under Ghana Library Authority, separately operated university libraries, and specialist research/legislative collections. IFLA says the country lacks a national library; some national-library functions are performed by special libraries. CARLIGH shares e-resource access and training, not a verified nationwide physical-book union. This research observed four public book/monograph catalogs but verified no ten-library substantial-target set.',
                        platform_strategy='Prioritize Koha adapter reuse only where policy and scale checks pass. Three observed physical-holding systems use Koha (two selected institutional targets and one reserve); further official university sources describe Koha. This is a feasibility-selected sample, not national market share. UPSA exposes SLiMS9 with ebook metadata and no copy data. UGCat needs its Sierra/Millennium family revalidated once accessible; UEW historical Virtua and Pentecost Destiny are separate families. The GhLA public catalog frontend uses OPDS digital feeds and needs a different integration from physical holdings.',
                        adoption_evidence=[dict(claim='Koha returned actual book/monograph results and item tables at WIUC, USTED and Parliament.',scope='Three tested accessible institution systems, not a national share estimate.',date='2026-11-15',source_url='https://opac.usted.edu.gh/',evidence_path='evidence/usted-query.html'),
                                           dict(claim='Regent adopted Koha in-house in 2015; CARLIGH had offered Koha workshops by the publication date.',scope='Librarian-authored Regent case study and historical consortium training.',date='2017',source_url='https://lirgjournal.org.uk/index.php/lir/article/download/764/758/3381',evidence_path='evidence/regent-study.pdf'),
                                           dict(claim='UENR explicitly describes management of the Koha LMS; UniMAC describes Koha and MARC21/Z39.50 cataloging.',scope='Two official institution pages; no national count.',date='undated; accessed 2026-11-15',source_url='https://uenrlbr.uenr.edu.gh/'),
                                           dict(claim='UPSA public virtual site runs SLiMS9; record89 has no copy data.',scope='One virtual catalog only.',date='2026-11-15',source_url='https://library.upsavirtual.site/',evidence_path='evidence/upsa-detail.html')],
                        network_opportunities=[dict(name='Ghana Library Authority',scope='Centralized public library network; 139 libraries reported September2025, not 139 verified catalog participants.',source_url='https://www.library.gov.gh/',verification='Official public frontend uses OPDS search; robots allowed one anonymous title query, which timed out. No physical branch holdings verified.',integration_implication='Potentially broadest public-network partnership, but public digital discovery cannot establish physical-book availability. No outreach performed.'),
                                               dict(name='CARLIGH',scope='Consortium of independent academic and research libraries.',source_url='https://www.carligh.org/',verification='Official site and IFLA document training, e-resource access and cooperation; no live physical union queried.',integration_implication='Potential coordination route for policy, metadata agreements and Koha templates; cannot unlock all members merely by adding an endpoint.'),
                                               dict(name='ghlibrary.online hosted tenants',scope='Official UHAS and Presbyterian pages link different ports on one host; Catholic homepage also links host without a captured tenant address.',source_url='https://library.uhas.edu.gh/catalogue',verification='UHAS:1004 and Presbyterian:1002 robots both disallow /. No institution-specific results.',integration_implication='Hosting/template reuse opportunity only; separate institutional catalogs and explicit policy blockers, not a union or allowed workaround.')]),
            major_library_priorities=[dict(name=n,size_claim=s,source_url=u,outcome=o) for n,s,u,o in priorities],
            libraries=libraries,
            blocked_or_unverified=[dict(name=n,url=u,reason=r,evidence_path='evidence/'+p+'.json') for n,u,r,p in blocked],
            limitations=['No national largest-ten ranking established; counts use different dates, units and institution scopes.',
                         'Two selected institutional targets and two reserves after major institutions and meaningful alternatives were investigated; the target of ten was not met. Both selected use explicit institutional-scale proxies, not a national collection ranking.',
                         'Three observed systems expose physical holdings; UPSA exposes book metadata and a file attachment but explicitly no copy data.',
                         'Available is a timestamped catalog statement, not a guarantee of current circulation or eligibility; Reference and Reserve locations are retained.',
                         'No member of a union, university campus or branch is separately counted from its institution.',
                         '403,503,timeouts,robots exclusions and zero-result queries do not prove a book is absent.',
                         'No authentication, credentials, holds, ebook downloads, outreach, app configuration, production integration, TLS bypass or challenge bypass occurred.',
                         'Public anonymous forms contain transient anti-CSRF values in returned HTML, but no cookies or browser state were persisted or replayed.',
                         'A public frontend configuration contained an API key; it was not used and is redacted from retained evidence.',
                         'Some scale and access claims are indexed official evidence rather than successful direct source captures; source URLs and evidence quality are explicit.'],
            sources=[dict(url=u,claim=c,evidence_path=p) for u,c,p in sources])

# Keep the downloaded research PDF recognisable, with a text extraction for review.
old=HERE/'evidence/regent-study.html'; new=HERE/'evidence/regent-study.pdf'
if old.exists(): old.rename(new)
m=meta('regent-study'); m['evidence_path']='evidence/regent-study.pdf';m['text']=(HERE/'evidence/regent-study.txt').read_text()[:18000];m['text_note']='Extracted offline with pdftotext -layout; raw PDF retained.'
(HERE/'evidence/regent-study.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')

audit=[]
for f in sorted((HERE/'evidence').glob('*-robots.json')):
    m=json.loads(f.read_text()); target=m['url'].replace('/robots.txt','/cgi-bin/koha/opac-search.pl')
    if f.stem in ['uew-robots','kaiptc-robots']:target=m['url'].replace('/robots.txt','/search/query')
    if f.stem=='upsa-robots':target=m['url'].replace('/robots.txt','/index.php?keywords=Management&search=search')
    if f.stem=='ghla-opds-robots':target=m['url'].replace('/robots.txt','/search.atom?page=1&q=Things+fall+apart')
    if f.stem=='ghla-robots':target='https://www.library.gov.gh/chunk-JMT2SIBD.js'
    decision=dict(robots_metadata='evidence/'+f.name,target_url=target,**robots_decision(f,target))
    if f.stem=='ghla-robots':
        decision['manual_review']={'decision':'no_interpretable_published_policy','scope':'Limited reads of observed public frontend assets only',
                                   'basis':'HTTP200 ordinary Angular home document at /robots.txt, matching root SPA shell; no authentication/challenge or explicit prohibition. Separate OPDS robots was checked before the title query.'}
    audit.append(decision)
(HERE/'evidence/policy-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
(HERE/'findings.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
print('Wrote findings:',data['counts'])
