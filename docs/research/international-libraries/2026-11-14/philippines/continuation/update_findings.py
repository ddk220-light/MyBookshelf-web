import json,pathlib,datetime,copy
ROOT=pathlib.Path(__file__).resolve().parent.parent
P=ROOT/'continuation'; E=P/'evidence'
def meta(stem):
 d=json.load(open(E/(stem+'.json')))
 o={k:d[k] for k in ['url','checked_at_utc','status','final_url','error','method','post_payload','post_json'] if k in d}
 if 'post_payload' in d:o['method']='POST'
 o['evidence_metadata']='continuation/evidence/'+stem+'.json'
 if d.get('evidence_file'):o['raw_response']='continuation/'+d['evidence_file']
 return o
f=ROOT/'findings.json'; d=json.load(open(f))
backup=P/'findings-before-replacement.json'
if not backup.exists():backup.write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n')
# Preserve binary response bodies using their real media type. The AIIAS bulletin
# was deliberately bounded; cite the independently read official PDF and HTML.
for stem,newname,partial in [('aiias-bulletin','aiias-bulletin.pdf.partial',True),('lst-library-policies','lst-library-policies.pdf',False)]:
 md=json.load(open(E/(stem+'.json')));old=E/(stem+'.html');new=E/newname
 if old.exists():old.rename(new)
 md['evidence_file']='evidence/'+newname;md['bounded_body_truncated']=partial
 md.pop('text',None);md.pop('links',None);md.pop('forms',None)
 (E/(stem+'.json')).write_text(json.dumps(md,indent=2,ensure_ascii=False)+'\n')
for x in d['verified_targets']:
 query, separator, note = x['query'].partition('; ')
 if separator:
  x['query'] = query
  x['query_note'] = note
 x['recommendation']='reserve' if x['id'] in ['imus','butuan'] else 'verified_target'
 if x['id'] in ['imus','butuan']:
  x['recommendation_reason']='Observed public-library pilot retained as reserve; replaced in recommended ten by an institution with official substantial collection-size evidence.'
# Avoid duplicate additions when rerun for artifact corrections.
d['verified_targets']=[x for x in d['verified_targets'] if x['id'] not in ['lst','aiias']]
lstq=meta('lst-title-query'); lstr=meta('lst-record')
lst={
'id':'lst','name':'Loyola School of Theology — Ralph B. Gehring Library','category':'graduate_research_library','recommendation':'verified_target',
'platform':'TLC Library.Solution legacy PAC (official HTTP catalog)','catalog_success':True,
'query':'Confessions of Saint Augustine','query_note':'Public keyword form searches titles, subjects and authors.',
'search_result_count':2,'query_evidence':lstq,
'query_match_note':'The query returned two related book titles, not an exact Confessions edition. Both have LST holdings. Subsequent exact-title attempts returned empty HTTP200 bodies; no claim of successful exact-edition matching or stable repeated searching.',
'returned_records':[
 {'title':"Heidegger’s confessions : the remains of Saint Augustine in Being and Time and beyond",'author':'Ryan Coyne','record_id':'73889','record_url':next(x['url'] for x in json.load(open(E/'lst-title-query.json'))['links'] if 'RecordNumber=73889' in x['url']),'holdings_observation':'LST Library, General Circulation, B3279 H49C696 2015, displayed Available in actual search result.'},
 {'title':'The mysticism of Saint Augustine : rereading The confessions','author':'John Peter Kenney','record_id':'70459','record_url':lstr['url'],'holdings_observation':'Routledge2005, ISBN0-415-28833-9. Search and detail both show LST Library, General Circulation, BR65 A91K37 2005, Available. Detail reports four historical checkouts and zero holds; these are not additional copies.'}],
'record_evidence':lstr,
'scale_evidence':{'value':113000,'qualifier':'approximately','unit':'volumes of books and periodicals','as_of':'Undated current official library overview accessed2026-11-15','source_url':'https://lst.edu/gehring-library/','raw_response':'continuation/evidence/lst-home.html','caveat':'Mixed book/periodical volumes, not unique titles. Separate LST-owned/administered catalog scope; not a verification of the Ateneo de Manila Rizal Library.'},
'robots_evidence':meta('lst-http-robots'),
'policy_status':'Official linked HTTP origin robots404; no automated-path exclusion observed there. HTTPS origin returned proxy503 and is not policy-cleared. Terms/license and production-use clearance not completed.',
'adapter_readiness':'New legacy TLC PAC adapter, potentially shared with USC. Reliability unresolved: first query and detail succeeded, three later title-query submissions returned74-byte empty HTTP200 pages; a subsequent ordinary SearchForm load failed502. Must map empty bodies to unknown, not not-held. HTTP-origin policy, repeated search reliability, edition matching and state handling need validation.',
'reliability_evidence':[meta(x) for x in ['lst-exact-title','lst-fulltitle','lst-specific-book']],
'public_access':'Anonymous catalog search. Official April2026 library policy primarily serves LST faculty/students; external researchers require an endorsement letter, permission and a fee, and may use materials on site without borrowing. Ateneo-affiliated cross-registrants have separately defined privileges.',
'access_policy_source':'https://lst.edu/wp-content/uploads/2026/05/Library-Policies-Apr-15-2026.pdf',
'access_policy_evidence':'continuation/evidence/lst-library-policies.pdf','integrated_into_app':False}
aiias={
'id':'aiias','name':'Adventist International Institute of Advanced Studies — Leslie Hardinge Library','category':'graduate_research_library','recommendation':'verified_target',
'platform':'TLC LS2 PAC5.9.0; public UI JavaScript documents anonymous JSON search','catalog_success':True,
'query':'Research design : why thinking about design matters','query_note':'Public LS2 searchTerm JSON.','search_result_count':5,'query_evidence':meta('aiias-specific-query'),
'returned_records':[{'title':'Research design : why thinking about design matters','author':'Julianne Cheek; Elise Oby (detail statement)','record_id':'502930612; hostBibliographicId328641','record_url':'https://lhl.aiias.edu/#/resource/502930612','holdings_observation':'SAGE2023, ISBN9781544350899. One Leslie Hardinge Lib. circulation holding, barcode2099029, H62 .C44.R4. Search/resource JSON and bibliographic detail independently confirm the record; no copy-level loan-status endpoint was verified, so current availability is unknown.'}],
'record_evidence':meta('aiias-record'),'resource_evidence':meta('aiias-resource'),
'scale_evidence':{'value':70000,'qualifier':'more than','unit':'volumes of reference and circulating books','as_of':'2024–2026 Academic Bulletin, p18; official PDF dated2024-09-12','source_url':'https://www.aiias.edu/wp-content/uploads/2024/09/AIIAS_AB_2024-2026_20240912.pdf','corroborating_source_url':'https://www.aiias.edu/admissions/','raw_response':'continuation/evidence/aiias-scale.html','caveat':'Book volumes, not unique titles. Current admissions page independently says about70000volumes. PDF body retained as bounded partial response; published passage was also read via web source.'},
'robots_evidence':meta('aiias-robots'),
'policy_status':'Robots404 at checked catalog origin; no search-path restriction observed. This is not terms/license or production-use clearance.',
'adapter_readiness':'New LS2 JSON adapter could share core search/holding schema with Ateneo de Davao. Version5.9 has a newer public UI/deep-link format. Preserve resource/host record IDs and format. Search can return related records; match editions individually. A different Creswell record combines2003/2014/2018/2023 publication/holding years and multipleISBNs, so do not assume all ISBNs map to a single edition or copy.',
'platform_evidence':'continuation/evidence/aiias-home.html','public_api_documentation_evidence':'continuation/evidence/aiias-main-js.html',
'public_access':'Anonymous catalog. Visitors generally need valid school/organizationID, referral letter, a PHP50library fee and signed agreement; research visits Monday–Thursday08:00–17:00. Borrowing generally limited to AIIAS students/faculty and approved user classes.',
'access_policy_source':'https://library.aiias.edu/visitors/','access_policy_evidence':'continuation/evidence/aiias-visitors.html','integrated_into_app':False}
# Selected targets first, observed reserves last.
existing=d['verified_targets'];d['verified_targets']=[x for x in existing if x['recommendation']=='verified_target']+[lst,aiias]+[x for x in existing if x['recommendation']=='reserve']
d['summary'].update(verified_institutions=12,selected_verified_institutions=10,reserve_verified_institutions=2,verified_independent_catalog_endpoints=10,selected_independent_catalog_endpoints=8,verified_national_or_academic_institutions=10,supplemental_local_public_pilots=2,ten_largest_successfully_verified=False,important_caveat='Twelve observed institution lookups across ten endpoints; ten recommended institutions across eight endpoints plus two public-library reserves. Official size evidence strengthened by LST and AIIAS, but this is not a nationally ranked largest-ten list. DSWD/CHED collection ranks remain unproven; selected eLib records are historical; LST repeated-search reliability is unresolved.')
d['selected_target_ids']=[x['id'] for x in d['verified_targets'] if x['recommendation']=='verified_target']
d['reserve_target_ids']=['imus','butuan'];d['generated_at_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
d['marketplace']['recommended_second_family']='TLC Library.Solution/LS2: four substantial academic libraries with observed queries (USC,LST legacyPAC; Ateneo de Davao,AIIAS LS2), requiring two frontend adapters. LST repeated-search reliability remains unresolved.'
d['marketplace']['largest_partnership_option']='Follett Destiny:89of312accessible academic sites in the2026study. No permissible automated search verified in this research. CPU,PNU,UE,MSU-IIT,VSU,Benguet,FEU,SLU,WVSU,BukSU disallow all; AUP root policy disallows query-string paths including its normal site-entry URL.'
d['ten_major_priority_targets_caveat']='Initial major-candidate shortlist, not definitive size ranking and distinct from selected_target_ids. Six initial candidates produced book queries; four remain blocked. Continuation additionally verified LST and AIIAS with official substantial collection-size evidence, replacing Imus and Butuan in the selected ten.'
# Update existing Silliman record with its newly discovered official current route.
s=next(x for x in d['blocked_or_unverified_candidates'] if x['id']=='silliman');s['previous_route_evidence']=s['evidence'];s['evidence']=meta('silliman-locate-robots');s['official_route_evidence']=meta('silliman-virtual');s['platform']='Current EBSCO Locate route; library site references FOLIO. Old port8080route is not current proof.';s['reason']='Official SU2020 virtual-library announcement links sulibraryph.com; current library site links sulib.locate.ebsco.com. Current Locate robots200 Disallow:/, so no query sent. Prior old port8080 timeout retained separately.';s['current_catalog_url']='https://sulib.locate.ebsco.com/search';s['official_route_source']='https://su.edu.ph/news/su-library-goes-virtual-offers-online-services-activities/'
newblocks=[
('feu','Far Eastern University Libraries','feu-robots','Follett Destiny','Catalog homepage200; robots200 Disallow:/. No search.','https://www.feu.edu.ph/library/','University-library system proxy; collection total not verified.'),
('slu','Saint Louis University Baguio Libraries','slu-robots','Follett Destiny22.5','Official quick-links catalog200; robots200 Disallow:/. No search.','https://www.slu.edu.ph/quick-links/','University system and catalog lists3institutions; no verified current volume total.'),
('cnu','Cebu Normal University Library','cnu-alt-robots','Not verified current catalog','Two catalog addresses linked by official library homepage: one timed out, one returned503; robots unresolved. No search.','https://library.cnu.edu.ph/history/','Official undated history reports over50000bookvolumes.'),
('adamson','Adamson University Library','adamson-home','Koha login page','Catalog homepage and robots path render login. No anonymous catalog query attempted.','https://libwebopac.adamson.edu.ph/','Major university proxy; comparable primary collection total not established.'),
('up-manila','University of the Philippines Manila Library','upm-ilib-robots','iLib named by official guide','HTTP403 proxy says no approved upstreamIPv4address; not an origin outage finding.','https://sites.google.com/up.edu.ph/upcplibrary/basic-guide/ilib','UP constituent-university scope; no comparable current book count established.'),
('up-visayas','University of the Philippines Visayas Library','upv-opac-info','Temporary OPAC route unresolved','Official library and temporary-OPACinformation URL returned proxy503 connection failure; current distinct catalog route unresolved.','https://library.upv.edu.ph/index.php/library-resources/opac/temporary-opac','UP constituent-university scope; no comparable current book count established.'),
('san-beda','San Beda University Library','sanbeda-about','Unresolved','Official about-library route returned proxy503. No catalog query.','https://sanbeda.edu.ph/library/225/about-us-1554359191','University proxy only; current comparable size not established.'),
('lpu-manila','Lyceum of the Philippines University Manila Academic Resource Center','lpu-opac-info','Unresolved','Official ARC FAQ returned403 challenge. No bypass or catalog query.','https://manila.lpu.edu.ph/about-lpu/departments/academic-resource-center/arc-faqs/','University proxy only; current comparable size not established.'),
('ateneo-naga','Ateneo de Naga James J. O’Brien Library','adnu-locate-robots','EBSCO Locate','Official library homepage links adnulib.locate.ebsco.com; robots200 Disallow:/. No query.','https://adnulib.adnu.edu.ph/','Official100000volumes statement is shelving capacity, NOT actual holdings; not used as a collection total.'),
('bulsu','Bulacan State University Library','bulsu-robots','Koha inferred from indexed official catalog, not live-verified','Catalog and robots403 Cloudflare challenge. No search or bypass.','https://www.bulsu.edu.ph/library','State-university proxy; no comparable current total established.'),
('bicol','Bicol University Library System','bicol-home','Current union OPAC unresolved','Two officially branded GoogleSites library portals redirect to Google sign-in in this environment. No catalog endpoint/query established.','https://sites.google.com/bicol-u.edu.ph/buls/home','Multi-campus union scope described in official indexed page; no comparable current volume total established.'),
('tsu','Tarlac State University Libraries','tsu-robots','Follett per official2016report, current deployment unverified','Officially linked catalog and robots returned proxy503 connection termination; no search.','https://tsu.edu.ph/academics/offices/office-of-the-library-management-and-services/e-resources/','University-library system proxy; no current comparable count established.'),
('usm','University of Southern Mindanao Kundo E. Pahm Learning Resource Center','usm-robots','Follett Destiny per official library page','Official linked OPAC and robots returned an origin-style503 Service Unavailable page. No search; not a national-outage inference.','https://www.usm.edu.ph/student/kundo-e-pahm-learning-resource-center/','University research-library proxy; comparable collection total not established.'),
('wvsu','West Visayas State University Library','wvsu-robots','Follett Destiny22.5','Officially linked catalog200; robots200 Disallow:/. No search.','https://ulrc.wvsu.edu.ph/','University research-library proxy; comparable current collection total not established.'),
('buksu','Bukidnon State University Library','buksu-robots','Follett Destiny22.5','Official online-services directory links live catalog; robots200 Disallow:/. No search.','https://buksu.edu.ph/online-services/','University research-library proxy; comparable current collection total not established.'),
('neust','Nueva Ecija University of Science and Technology Libraries','neust-portal','Unresolved','Official library homepage200; NEUST OPAC link refers back to same portal. No independent public catalog search route established.','https://library.neust.edu.ph/','Multi-campus university proxy; no comparable current collection count established.'),
('aup','Adventist University of the Philippines John Lawrence Detwiler Memorial Library','aup-robots','Follett Destiny22.0','Catalog homepage200 under/opac/. Root robots permits some paths but disallows/*?and/*&, blocking the ordinary/opac/common/welcome.jsp?site=100 entry link. No search and no URL-method workaround attempted.','https://jldmlibrary.aup.edu.ph/','Official2020overview describes approx54000print/nonprintmaterials; not directly validated here. Directory100000volumes is not treated as primary scale proof.')]
known={x['id'] for x in d['blocked_or_unverified_candidates']}
for ident,name,stem,platform,reason,source,scale in newblocks:
 if ident not in known:d['blocked_or_unverified_candidates'].append({'id':ident,'name':name,'evidence':meta(stem),'catalog_success':False,'platform':platform,'reason':reason,'scale_source':source,'scale_note':scale})
d['continuation']={'checked_at_utc_date':'2026-11-15','objective':'Replace two small public pilots with substantial academic collections; clarify permitted Follett routes.','replacement_ids':['lst','aiias'],'reserve_ids':['imus','butuan'],'additional_blocked_or_unverified_institutions':len(newblocks),'newly_verified_platform_families':0,'notes':['No new Follett automated search was verified.','Official current Silliman route corrects stale endpoint assumptions.','Public search success, exact edition matching, availability, adapter implementation and policy clearance remain separate.']}
f.write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n')
print('Selected',len(d['selected_target_ids']),'observed',len(d['verified_targets']),'blocked',len(d['blocked_or_unverified_candidates']))
