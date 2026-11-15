"""Apply documented follow-up to the initial snapshot; does not run live requests."""
import json, pathlib

P = pathlib.Path(__file__).parent
d = json.loads((P / 'findings.json').read_text())
by_id = {x['id']: x for x in d['libraries']}
for x in d['libraries']:
    x['recommendation'] = 'reserve' if x['id'] == 'ui_fasilkom' else 'verified_target'

gov = 'https://repositori.kemendikdasmen.go.id/12869/1/Direktori%20Profil%20Perpusdiknas%202009.pdf'
def size(key, summary, url, date, kind, evidence):
    x = by_id[key]
    x.setdefault('initial_selection_basis', x['selection_basis'])
    x['selection_basis'] = dict(summary=summary, source_url=url, source_date=date,
                               measurement_kind=kind, evidence=evidence)

size('brawijaya',
     '68,152 book titles reported during PIP Semarang library’s July 2018 institutional visit, published 14 Nov 2018. Historical book-title evidence, not a current census. The 2009 government directory reports a different mixed-format scope.',
     'https://elibrary.pip-semarang.ac.id/perpustakaan-pip-semarang-kunjungan-studi-banding-ke-perpustakaan-universitas-brawijaya-malang-830b07',
     '2018-11-14', 'historical book titles reported by visiting public institution',
     'continuation-evidence/ub-2018-size.html')
size('diponegoro',
     'Economics and Business faculty alone reports 17,598 book titles / 31,715 copies through 2024 in its official 2025/26 handbook, p105. This is a faculty subset; the whole university union-catalog total remains unknown.',
     'https://feb.undip.ac.id/wp-content/dokumen/buku_pedoman_akademik/Buku%20Pedoman%20Akademik%20FEB%20Undip%202025.pdf',
     '2024', 'official faculty-only book titles and copies; not university aggregate',
     'continuation-evidence/undip-feb-2024-size-selected-pages.txt')
size('itb',
     'Government directory (2009), p23: 228,393 titles / 238,246 copies across mixed formats. ITB’s own 3 May 2006 article separately reports 227,000 book copies. Historical scale only; current total unverified.',
     gov, '2009', 'historical mixed-format titles and copies',
     'continuation-evidence/government-directory-2009-selected-pages.txt')
size('padjadjaran',
     'Government directory (2009), p25: 62,708 copies at CISRAL, the central library predecessor. Historical central-library scope, not the current multi-faculty union total; 19 catalog location filters observed.',
     gov, '2009', 'historical central-library copies; current union total unknown',
     'continuation-evidence/government-directory-2009-selected-pages.txt')
size('uinsuka',
     'Official Data & Facts page displays 124,281 Buku (books), 58,563 final projects and 3,328 references, observed 15 Nov 2026. The page does not specify whether Buku counts titles or copies or state a census date; do not sum categories or use as a comparable print-title total.',
     'https://lib.uin-suka.ac.id/data-fakta', None,
     'official observed book-category count with unit/census-date ambiguity',
     'continuation-evidence/uinsuka-facts.html')

by_id['itb']['supplementary_collection_size_evidence'] = [{
    'source_url': 'https://itb.ac.id/berita/mengenal-lebih-jauh-perpustakaan-itb-2/1044',
    'source_date': '2006-05-03', 'book_copies': 227000,
    'scope': 'central library book copies, explicitly separate from 790 serial titles',
    'evidence': 'continuation-evidence/itb-2006-size.html'}]
by_id['brawijaya']['supplementary_collection_size_evidence'] = [{
    'source_url': gov, 'source_date': '2009', 'titles': 133834, 'copies': 287888,
    'scope': 'mixed printed books, e-journals, research reports and electronic academic works; not comparable to the 2018 book-title count',
    'evidence': 'continuation-evidence/government-directory-2009-selected-pages.txt'}]
by_id['diponegoro']['rejected_collection_size_evidence'] = [{
    'source_url': gov, 'source_date': '2009',
    'reason': 'Directory p30 reports 57,986 titles but 25,761 copies; inconsistent units/count relationship. Not corrected by assumption or used for ranking.',
    'evidence': 'continuation-evidence/government-directory-2009-selected-pages.txt'}]

by_id['uinsuka']['record_mapping_followup'] = {
    'status': 'unresolved_after_bounded_protocol_checks',
    'assessment': 'Original SRU title query remains a genuine book search success. No stable identifier for that book was established. Neither the OAI links nor RSS links resolved individual records. No mapping from response position or title similarity was invented.',
    'checks': [
        {'request': 'GET https://opac.uin-suka.ac.id/?verb=Identify', 'result': 'OAI-PMH2.0 repository identified; no book-specific identifier', 'evidence': 'continuation-evidence/uinsuka-identify.html'},
        {'request': 'GET https://opac.uin-suka.ac.id/?version=1.1&operation=explain', 'result': 'Minimal Explain document without useful index/record identifier contract', 'evidence': 'continuation-evidence/uinsuka-explain.html'},
        {'request': 'GET https://opac.uin-suka.ac.id/?verb=ListMetadataFormats', 'result': 'Only oai_dc advertised', 'evidence': 'continuation-evidence/uinsuka-metadataformats.html'},
        {'request': 'GET https://opac.uin-suka.ac.id/?verb=ListRecords&metadataPrefix=oai_dc&from=2019-01-10T00%3A00%3A00Z&until=2019-01-10T23%3A59%3A59Z', 'result': 'Returned first five records from 2004; date restriction appears ignored. No pagination/harvest attempted.', 'evidence': 'continuation-evidence/uinsuka-entryday.html'},
        {'request': 'GET https://opac.uin-suka.ac.id/?i=60', 'result': 'Advertised OAI identifier link returned only search-home frame', 'evidence': 'continuation-evidence/uinsuka-oai-record60.html'},
        {'request': 'GET https://opac.uin-suka.ac.id/?rss=Pemasaran%20umkm%20melalui%20media%20sosial', 'result': 'RSS item permalink also returned only search-home frame', 'evidence': 'continuation-evidence/uinsuka-rss-permalink.html'},
        {'request': 'GET https://libpps.uin-suka.ac.id/robots.txt', 'result': 'Official postgraduate SLiMS alternate host returned tunnel403; stopped without a title query', 'evidence': 'continuation-evidence/uinsuka-pasca-robots.json'}],
    'production_effect': 'Keep UIN as search feasibility evidence, not a ready stable-record adapter. Request documented record mapping/partner support before implementing persistent identities.'}

q = json.loads((P/'continuation-evidence/ui-computing-specific.json').read_text())
rp = json.loads((P/'continuation-evidence/ui-computing-robots.json').read_text())
reserve = {
    'id': 'ui_fasilkom', 'recommendation': 'reserve',
    'name': 'Universitas Indonesia — Faculty of Computer Science Library (Fasilkom only)',
    'city': 'Depok', 'type': 'public university faculty library',
    'selection_basis': {
        'summary': 'Official faculty-catalog homepage displays 12,034 book-category records on 15 Nov 2026. Faculty-only scope, not the central UI catalog or a national largest-ten claim.',
        'source_url': 'https://lontar.cs.ui.ac.id/Lontar/opac/themes/newui/index.jsp',
        'source_date': '2026-11-15', 'measurement_kind': 'live faculty book-category catalog-record count, not physical copies',
        'evidence': 'continuation-evidence/ui-computing-home.html'},
    'platform': 'LONTAR (Library Automation and Digital Archive)',
    'platform_proof': 'Official catalog header names LONTAR and Fasilkom UI; public JSP search and detail forms.',
    'verification_status': 'live_specific_book_query_succeeded',
    'query': {'method': 'GET', 'text': 'Introduction to Natural Language Processing', 'url': q['url'], 'payload': None,
              'checked_at_utc': q['checked_at_utc'], 'http_status': q['status'], 'final_url': q['final_url'],
              'raw_evidence': q['evidence'], 'metadata_evidence': 'continuation-evidence/ui-computing-specific.json',
              'displayed_result_count': 3559,
              'result_count_note': 'Broad token search returns 3,559 mixed documents; exact requested book appears as the second search row. This is not an exact-title count.'},
    'results': [
        {'title': 'Introduction to Natural Language Processing', 'author': 'Jacob Eisenstein', 'record_id': '57139|lokasi=lokal',
         'record_url': 'https://lontar.cs.ui.ac.id/Lontar/opac/themes/newui/detail.jsp?id=57139&lokasi=lokal',
         'detail_evidence': 'continuation-evidence/ui-computing-detail.html',
         'holdings': 'Faculty library call006.35 Eis i; item26/13254 marked fotocopy with return date2027-05-02, so no currently available copy established. Catalog reports MIT Press2018; do not correct edition metadata by title matching.'},
        {'title': 'Natural language processing in LISP: an introduction to computational linguistics', 'author': 'Gerald Gazdar', 'record_id': '29764|lokasi=lokal',
         'record_url': 'https://lontar.cs.ui.ac.id/Lontar/opac/themes/newui/detail.jsp?id=29764&lokasi=lokal',
         'detail_evidence': 'continuation-evidence/ui-computing-gazdar-detail.html',
         'holdings': 'Addison-Wesley1989; faculty item91/1023 call410.28 Gaz n marked TERSEDIA (available). Same item row appears twice; count as one unique item, not two copies.'}],
    'policy': {'robots_url': rp['url'], 'robots_checked_at_utc': rp['checked_at_utc'], 'robots_http_status': 404,
               'robots_evidence': 'continuation-evidence/ui-computing-robots.json',
               'assessment': 'robots.txt returned HTTP404; no explicit exclusion obtained. Current app treats ordinary404 as no disallow rules. This does not establish reuse permission. No credentials, login or access bypass used.',
               'terms_or_license': 'No specific catalog reuse license or bulk permission verified.'},
    'public_eligibility': 'Anonymous catalog search works. Official faculty profile says service extends to UI and other public/private-university students; general-public borrowing rights not established.',
    'integration_path': 'New LONTAR JSP adapter. Parse actual search rows, preserve id plus lokasi, fetch stock tab data included in detail HTML, normalize availability and deduplicate repeated item IDs. Faculty coverage only; central UI remains unresolved.',
    'product_integration_tested': False, 'permission_cleared': False,
    'supplementary_evidence': ['continuation-evidence/ui-computing-profile.html']}
d['libraries'] = [x for x in d['libraries'] if x['id'] != reserve['id']] + [reserve]
d['live_query_success_count'] = 11
d['selected_target_count'] = 10
d['reserve_query_success_count'] = 1
d['continuation_checked_utc'] = '2026-11-15'
d['selection_statement'] += ' Continuation preserves the original ten selected institutions and adds UI Fasilkom as a separately scoped reserve; eleven observed successes in total.' if 'Continuation preserves' not in d['selection_statement'] else ''
for x in d['blocked_candidates']:
    if 'Gadjah' in x['name'] or 'UGM' in x['name']:
        x['continuation'] = {'new_official_route_source': 'https://lib.ugm.ac.id/en/home/',
            'query_url': 'https://opac.lib.ugm.ac.id/?q=Laskar%20Pelangi',
            'result': 'Official homepage advertises this GET form. Request returned unchanged latest-books homepage, without query results. Not counted; no further retry.',
            'evidence': 'continuation-evidence/ugm-official-get-search.html'}
    if 'Universitas Indonesia' in x['name']:
        x['continuation'] = {'result': 'Central catalog still unresolved. Separate Fasilkom faculty catalog verified and retained as reserve ui_fasilkom; its success does not clear central-catalog failure.'}
d['continuation_summary'] = {
    'original_ten_preserved': True, 'new_reserve_id': 'ui_fasilkom',
    'improved_collection_evidence_ids': ['brawijaya','diponegoro','itb','uinsuka','padjadjaran'],
    'largest_ten_proven': False,
    'limits': ['UIN stable-record mapping remains unresolved.', 'New UGM official GET route is a homepage, not search results.',
               'National Library had no new confirmed physical-catalog route; its restricted OPAC was not retried.',
               'Historical, faculty-only, ambiguous-unit and live catalog-record counts cannot be ranked together.'],
    'policy_method': 'Applied current app semantics: longest matching robots path, wildcard support, exact MyBookshelf product group then generic group; no first-match urllib.robotparser decisions used.',
    'evidence_directory': 'continuation-evidence/'}
(P/'findings.json').write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
print('Saved 10 verified_target rows and 1 reserve; no rank claim.')
