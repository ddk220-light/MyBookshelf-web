"""Merge preserved continuation research; performs no network requests.

Run after build_report.py when regenerating the original six-candidate report.
The four additional catalogs are reserves, not replacements for large priorities.
"""
import copy
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MAIN = ROOT / 'evidence/continuation/main'
CHILD = ROOT / 'evidence/continuation/ibadan'
ADD = ROOT / 'continuation-additional'


def read(path):
    return json.loads(path.read_text())


def normalized_request(value, prefix):
    out = copy.deepcopy(value)
    for old, new in [('checked_at_utc', 'checked_at'), ('elapsed_seconds', 'elapsed'), ('response_bytes', 'bytes')]:
        if old in out:
            out[new] = out.pop(old)
    if out.get('evidence'):
        out['evidence'] = prefix + out['evidence']
    return out


def clean_prose(text):
    replacements = {
        'Shelf Number13': 'Shelf Number 13', 'classification966.9OYI': 'classification 966.9OYI',
        'historical18000': 'historical 18,000', 'a1972': 'a 1972', 'inaugurated2024': 'inaugurated 2024',
        'call number808.066': 'call number 808.066', 'barcode2026-0050': 'barcode 2026-0050',
        'displays11722': 'displays 11,722', 'Treat11722': 'Treat 11,722',
        'barcode/accession09907': 'barcode/accession 09907', 'date2026-09-18': 'date 2026-09-18',
        'Koha404': 'Koha 404', 'returned404': 'returned 404', 'Historic2019': 'Historic 2019',
        '9000titles': '9,000 titles', 'a2019historical': 'a 2019 historical',
        'returned0': 'returned 0', 'only2': 'only 2',
        'and the returned': 'and the query “the” returned',
        'User-agent:* Allow:/search; Allow:/record/': 'User-agent: *; Allow: /search; Allow: /record/',
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


def source_paths(value, prefix):
    """Convert package-local source replay paths to country-relative paths."""
    if isinstance(value, list):
        return [source_paths(v, prefix) for v in value]
    if isinstance(value, dict):
        out = {}
        for key, child in value.items():
            if key in {'local_pdf', 'local_text', 'evidence'} and isinstance(child, str) and not child.startswith(('http:', 'https:', prefix)):
                out[key] = prefix + child
            else:
                out[key] = source_paths(child, prefix)
        return out
    return value


data = read(ROOT / 'findings.json')
original_ids = {'noun', 'lagos', 'oau', 'benin', 'kasu', 'nials'}
original = [r for r in data['verified'] if r['id'] in original_ids]
assert len(original) == 6
for record in original:
    record['recommendation'] = 'verified_target'
    record['national_top_ten_rank_established'] = False

additional = read(ADD / 'evidence.json')
records = []
locations = {
    'NG-NISER': ('Ibadan, Oyo State', 'Federal social and economic policy research institute'),
    'NG-EKITI-PUBLIC': ('Ado-Ekiti, Ekiti State', 'State public library'),
    'NG-MTU': ('Ibafo, Ogun State', 'Private university'),
}
for raw in additional['verified_candidates']:
    s = raw['searches'][0]
    request = s.get('replay_get', s['proof'])
    city, kind = locations[raw['id']]
    size = source_paths(raw['size'], 'continuation-additional/')
    size_source = {
        'url': size.get('official_sources', [raw['catalog']])[0],
        'date': None,
        'claim': size['scope'] + ' ' + size.get('warning', ''),
    }
    if raw['id'] == 'NG-NISER':
        size_source = {
            'url': 'https://files.eric.ed.gov/fulltext/ED089698.pdf#page=10',
            'date': 'January 1972 observation; Library of Congress report published 1973',
            'claim': 'About 18,000 bound volumes personally observed in January 1972 (Library of Congress, 1973, printed page 5). Historical specialist scale only; current physical collection total unknown. The current 13K+ e-resource counter is not a print-holdings count.',
        }
    access = 'Anonymous book query and detail verified. External membership and borrowing eligibility were not established.'
    if raw['id'] == 'NG-EKITI-PUBLIC':
        access = 'State public-library service and anonymous catalog access verified; borrowing registration, fees and eligibility remain unverified. Only one OPAC branch verified.'
    record = {
        'id': raw['id'], 'name': raw['name'], 'city': city, 'type': kind,
        'recommendation': 'reserve',
        'selection_basis': 'Working title-query reserve; collection scale or present catalog coverage insufficient to claim a large national target.',
        'national_top_ten_rank_established': False,
        'size_source': size_source, 'size_evidence': size,
        'platform': raw['platform'],
        'platform_evidence': 'Institution-branded public catalog HTML and routes in preserved search/detail responses.',
        'validation': 'live_specific_title_query_returned_books',
        'query': s['query'],
        'search': normalized_request(request, 'continuation-additional/'),
        'displayed_result_count': s.get('result_count'),
        'returned_records': [{
            'title': s['title'], 'author': s['author'], 'record_id': s['record_id'],
            'url': s['record_url'], 'holdings': s['holdings'],
            'isbn': [s['isbn']] if s.get('isbn') else [], 'year': s.get('year'),
        }],
        'record_request': normalized_request(s['detail_proof'], 'continuation-additional/'),
        'robots_policy': ('Robots returned ' + str(raw['robots']['status']) + '. ' + raw.get('robots_evaluation', {}).get('rules', 'No retrieved path prohibition; this is not permission clearance.')),
        'robots_request': normalized_request(raw['robots'], 'continuation-additional/'),
        'public_access': access, 'integration_assessment': raw['integration'],
        'limitations': raw['caveats'], 'app_adapter_tested': False, 'permission_cleared': False,
        'continuation_source': 'continuation-additional/evidence.json',
    }
    if raw['id'] == 'NG-EKITI-PUBLIC':
        record['search_count_note'] = 'Exact title search redirects to record 50; no displayed result count inferred.'
    if raw['id'] == 'NG-NISER':
        record['search_count_note'] = 'One matching book card observed; no explicit total-results count captured.'
    if raw['id'] == 'NG-MTU':
        record['robots_policy'] = 'Robots returned 200 and allows the tested /search and /record/ routes. Raw rules mention branch/sort query restrictions; those facets were not used. The current app parser denies branch variants but permits sort variants because an equally specific Allow rule wins. No permission clearance inferred.'
        record['integration_assessment'] = 'Custom Lopac HTML parser required. Tested routes: /search?idx=ti&q=... and /record/{id}. Preserve record identities and local holdings. Branch/sort facets were not used in this research.'
    if len(raw['searches']) > 1:
        record['additional_title_queries'] = copy.deepcopy(raw['searches'][1:])
        for query in record['additional_title_queries']:
            query['proof'] = normalized_request(query['proof'], 'continuation-additional/')
    records.append(record)

raw = read(CHILD / 'lokoja-success.json')
s = raw['search']
book = raw['returned_books'][0]
records.append({
    'id': 'NG-LOKOJA', 'name': raw['institution'], 'city': raw['city'], 'type': raw['type'],
    'recommendation': 'reserve',
    'selection_basis': 'Historical 9,000-title collection; genuine book/holding proof, but sparse current OPAC and no national-largest rank.',
    'national_top_ten_rank_established': False,
    'size_source': {'url': raw['size']['source_url'], 'date': '2019-12-09', 'claim': '9,000 book titles, historical institution-level count; current searchable coverage unknown.'},
    'size_evidence': source_paths(raw['size'], 'evidence/continuation/ibadan/'), 'platform': 'Koha', 'platform_evidence': raw['platform'],
    'validation': 'live_specific_title_query_returned_books', 'query': s['query'],
    'search': normalized_request(s, 'evidence/continuation/ibadan/'),
    'displayed_result_count': None, 'search_count_note': s['count_note'],
    'returned_records': [{
        'title': book['title'], 'author': book['author_as_catalogued'], 'record_id': book['record_id'],
        'url': book['record_url'], 'isbn': [book['isbn']], 'year': book['year'],
        'holdings': 'One Available copy at Federal University Lokoja Library, General stacks, Non-fiction; call number HM561THE; barcode 2026-0014.',
    }],
    'record_request': normalized_request(raw['record_fetch'], 'evidence/continuation/ibadan/'),
    'robots_policy': raw['policy']['opac_robots'] + ' ' + raw['policy']['terms'],
    'public_access': raw['public_access'], 'integration_assessment': raw['adapter'],
    'limitations': raw['limitations'], 'app_adapter_tested': False, 'permission_cleared': False,
    'continuation_source': 'evidence/continuation/ibadan/lokoja-success.json',
})
for record in records:
    record['size_source']['claim'] = clean_prose(record['size_source']['claim'])
    for key in ['robots_policy', 'public_access', 'integration_assessment']:
        record[key] = clean_prose(record[key])
    record['limitations'] = [clean_prose(s) for s in record['limitations']]
    for book in record['returned_records']:
        book['holdings'] = clean_prose(book['holdings'])

data['verified'] = original + records
data['live_specific_title_verified_institutions'] = 10
data['selected_verified_institutions'] = 6
data['verified_reserve_institutions'] = 4
data['live_query_count_shortfall'] = 0
data['shortfall'] = 4
data['shortfall_definition'] = 'Four additional sufficiently large selected targets; reserves do not fill this scale-qualified gap.'
data['ten_major_priority_live_verified'] = 4
data['ten_major_priority_unverified'] = 6
data['completion'] = 'Ten observed institutions returned books for specific-title queries: six selected candidates and four smaller/unquantified reserves. Ten large selected targets remain unmet. Only four of the ten major-priority institutions passed live verification. No national top-ten ranking is asserted.'
data['continuation_methodology'] = 'New official routes and public read-only interfaces; current server/services/providers/robots.js used for robots decisions. Stopped at robots restrictions, authentication and anti-bot responses. Cached records, seeded/demo catalogs and wrong-tenant aliases excluded from success counts.'
for priority in data['ten_major_priorities']:
    if priority['id'] == 'ibadan':
        priority['platform'] = 'UIILS (official current guide)'
        priority['scale'] = {'url': 'https://library.ui.edu.ng/library-guide', 'date': 'current guide; observed 2026-11-15', 'claim': 'Over two million mixed physical volumes across the university library system, including books, journals, dissertations, reports and monographs. The guide names the medical library and 26 faculty/department/institute libraries. Not solely the Kenneth Dike building.'}
        priority['result'] = 'Old official IP route timed out. Newly published external hostname ils.library.ui.edu.ng returned explicit environment diagnostic: No approved upstream IPv4 address. Current website search input has no functional handler. No live book-query success.'
        priority['continuation_evidence'] = 'evidence/continuation/ibadan/recovery.json'
    if priority['id'] == 'abu':
        priority['continuation'] = 'Current official library page links public IP http://196.220.66.8/; robots and homepage timed out. Saved under evidence/continuation/main/abu-published-ip-*.'
    if priority['id'] == 'unn':
        priority['continuation'] = 'Official legacy nal.edu.ng alias returned environment diagnostic No approved upstream IPv4 address; no catalog recovered.'
    if priority['id'] == 'funaab':
        priority['continuation'] = 'Official legacy library.unaab.edu.ng portal robots returned 503; policy stopped before content request. Current OPAC secondary retrieval timed out.'

exclusions = [x for x in data['exclusions_and_other_investigations'] if not x.get('continuation')]
for raw in additional['failed_or_unqualified']:
    item = copy.deepcopy(raw)
    item['continuation'] = True
    item['evidence_package'] = 'continuation-additional/evidence.json'
    if item.get('proof', {}).get('evidence'):
        item['proof']['evidence'] = 'continuation-additional/' + item['proof']['evidence']
    exclusions.append(item)
main_failures = [
    ('ABU published public IP', 'abu-published-ip', 'Current official link timed out; no new query success.'),
    ('UNN published legacy alias', 'unn-published-alias', 'Explicit environment No approved upstream IPv4 address; not proof of an origin outage.'),
    ('FUNAAB legacy library portal', 'funaab-library-portal', 'Robots 503; stopped before catalog request.'),
    ('Federal University Lafia', 'fulafia-official', 'Official Koha form and OPAC link target private address 10.1.5.30:81; not publicly reachable and not queried.'),
    ('Federal University Oye-Ekiti', 'fuoye-local-search', 'Official unified-discovery economics query returned a page with no bibliographic results. Many external resources, no public local OPAC recovered.'),
    ('Abubakar Tafawa Balewa University', 'atbu-official', 'Official library page has no public OPAC route; conflicting 161,672-volume and 65,000-volume passages on same page are not reconciled into a current inventory.'),
    ('Federal University Dutse', 'fud-library', 'Current official React site has no catalog endpoint; published legacy library page 404.'),
    ('University of Maiduguri Ramat Library website', 'unimaid-resources-api', 'Public eLibrary API returned seven sparse/demo-like resources, including John Smith/Jane Doe examples; no local physical holdings. Official main-university linkage was not established. Excluded.'),
    ('Federal University Health Sciences Ila-Orangun', 'fuhsi-catalog', 'Catalog and robots timed out; no verified book query.'),
    ('Enugu State University of Science and Technology', 'esut-specific', 'Official search and detail links redirect to login; no unauthenticated book search verified.'),
    ('Central Bank published HTTP portal', 'cbn-published-http', 'Officially published HTTP eLibrary and robots timed out; no recovery from prior HTTPS failures.'),
]
for name, key, reason in main_failures:
    path = MAIN / (key + '-result.json')
    exclusions.append({'institution': name, 'reason': reason, 'continuation': True, 'evidence_package': str(path.relative_to(ROOT)), 'proof': read(path).get('request', read(path).get('robots'))})
exclusions.append({'institution': 'Kwara State University secondary retrieval', 'reason': 'Exact-title search unavailable; secondary tool returned a cached two-month-old record only. Cached details are not a current executed-search success.', 'continuation': True, 'evidence_package': 'evidence/continuation/main/kwasu-secondary-web.json'})
for raw in read(CHILD / 'new-universities.json')['institutions']:
    if raw.get('status') == 'verified_title_search_and_holdings':
        continue
    item = source_paths(raw, 'evidence/continuation/ibadan/')
    item['continuation'] = True
    item['evidence_package'] = 'evidence/continuation/ibadan/new-universities.json'
    exclusions.append(item)
data['exclusions_and_other_investigations'] = exclusions
data['continuation_packages'] = ['continuation-additional/evidence.json', 'continuation-additional/report.md', 'continuation-additional/size-evidence.json', 'evidence/continuation/ibadan/recovery.json', 'evidence/continuation/ibadan/lokoja-success.json', 'evidence/continuation/ibadan/new-universities.json']
data['market']['reserve_platforms'] = 'Ekiti public and Lokoja: Koha; NISER: custom ERAILS; Mountain Top: current Lopac. Current catalog evidence takes precedence over older Koha references.'
data['market']['public_reserve'] = 'Ekiti State public library has a genuine query and local holding. Collection size and additional board-library catalog coverage are unknown; one verified institution, not a statewide deployed network.'
data['market']['union_catalog_caution'] = 'Naijacat marketing claims of millions/60+ libraries conflict with displayed four libraries/three entries including a demo institution. Not treated as a production national union catalog.'
(ROOT / 'findings.json').write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')

report_path = ROOT / 'report.md'
report = report_path.read_text()
intro_end = report.index('\n\nChecks ran')
report = report[:report.index('\n\n') + 2] + '**Result: ten institutions returned books for specific-title queries: six selected candidates and four reserves. The goal of ten large selected targets remains unmet.** Four of the ten major-priority institutions passed live query verification. KASU and NIALS are useful selected candidates whose national size rank remains unproven; the four reserves below do not fill the large-collection gap.' + report[intro_end:]
report = report.replace('Six book-query successes show concrete technical opportunity.', 'Ten book-query successes show concrete technical opportunity, with six selected candidates and four smaller or unquantified reserves.')
report = report.replace('No app adapter was run and no integration permission was obtained.', 'No live app integration test was run and no integration permission was obtained; the separate offline parser audit does not establish live connector readiness.')
report = report.replace('## Six specific-title successes', '## Six selected specific-title successes')
report = report.replace('Over 2 million printed volumes; undated live page observed 2026-11-15. Digital subscription resources excluded.', 'Over two million mixed physical volumes across the university library system; books, journals, dissertations, reports and monographs. Current guide names medical plus 26 faculty/department/institute libraries; not solely the Kenneth Dike building.')
report = report.replace('Custom UI-ILS|Official linked HTTP endpoint on port 8080 at /record/opac timed out; search not verified.', 'UIILS (official current guide)|Old IP route timed out; published ils.library.ui.edu.ng returns an explicit environment routing error. No live book query recovered.')
report = report.replace('not solely the Kenneth Dike building.](https://library.ui.edu.ng/)', 'not solely the Kenneth Dike building.](https://library.ui.edu.ng/library-guide)')

start_marker = '<!-- continuation-reserves:start -->'
end_marker = '<!-- continuation-reserves:end -->'
if start_marker in report:
    report = report[:report.index(start_marker)] + report[report.index(end_marker) + len(end_marker):]
lines = [start_marker, '## Four additional query-verified reserves', '', 'These are genuine searches with saved book records. They are **not substitutes for the largest-library targets**: current collection scale is smaller, unquantified, or online coverage appears sparse. All four remain untested in the app and lack integration permission clearance.', '']
for record in records:
    req = record['search']; book = record['returned_records'][0]
    lines += ['### ' + record['name'], '', record['city'] + ' · ' + record['type'] + ' · **' + record['platform'] + '** · **Reserve**.', '',
              '**Scale:** ' + record['size_source']['claim'] + ' [Source](' + record['size_source']['url'] + ').', '',
              '**Query:** `' + record['query'] + '`. [Exact executed search](' + req['url'] + '). HTTP ' + str(req['status']) + ' at `' + req['checked_at'] + '`. ' + (record.get('search_count_note') or 'Displayed result count: ' + str(record['displayed_result_count']) + '.') + ' Snapshot: `' + req['evidence'] + '`.', '',
              '- [' + book['title'] + '](' + book['url'] + ') — ' + book['author'] + '; record `' + book['record_id'] + '`. ' + book['holdings'], '',
              '**Policy and access:** ' + record['robots_policy'] + ' ' + record['public_access'], '',
              '**App work:** ' + record['integration_assessment'], '',
              '**Limitations:** ' + ' '.join(record.get('limitations', [])), '']
lines += ['The full request metadata and additional title probes are in `continuation-additional/evidence.json` and `evidence/continuation/ibadan/lokoja-success.json`. The focused NISER/Ekiti size assessment is in `continuation-additional/size-evidence.md`. Collection evidence is kept separate from live catalog counts.', '', end_marker, '']
report = report.replace('## Failures, exclusions and follow-up', '\n'.join(lines) + '\n## Failures, exclusions and follow-up')
report = report.replace('- **Auth boundary:** Ilorin’s OPAC returned 401; no credentials or alternate access bypass attempted.', '- **Auth boundary:** Ilorin’s OPAC returned 401. ESUT’s live official search and detail links redirected to login. Lagos Business School returned an Anubis anti-bot page. No credentials or access bypass attempted.')
continuation_note = '\n- **Continuation recovery:** newly published ABU public IP and CBN HTTP portal timed out; FUNAAB’s legacy portal stopped at robots 503. Ibadan and a UNN legacy alias returned the explicit environment diagnostic “No approved upstream IPv4 address”; this is not an origin-outage finding. FULafia’s official Koha form points to a private 10.x campus address. FUOYE discovery returned no records. Maiduguri’s retrieved eLibrary resource list contained sparse/demo-like data and no physical holdings, so it was excluded. Naijacat’s live demo-scale entries do not substantiate its nationwide marketing counts.\n'
if '**Continuation recovery:**' not in report:
    report = report.replace('\n## Engineering recommendation', continuation_note + '\n## Engineering recommendation')
report = re.sub(r'The shortfall is \*\*four more verified institutions\*\*.*?\n\n## Evidence and reproducibility', 'There are **ten observed query-verified institutions, six selected candidates and four reserves**. The remaining gap is four additional sufficiently large selected targets, plus collection-rank evidence; six of the ten major-priority institutions still lack verified live searches. Institution-assisted validation or explicit agreements for restricted major catalogs would have more impact than padding the shortlist with smaller sites. This report does not claim permission, production readiness or a national top-ten ranking.\n\n## Evidence and reproducibility', report, flags=re.S)
report = report.replace('`build_report.py` generates this report and `findings.json` from those preserved responses and source notes.', '`build_report.py` generates the initial report; `merge_continuation.py` then merges preserved continuation evidence without network requests. Both stages are required to regenerate the complete report and `findings.json`. The continuation uses the app’s current robots parser; saved responses support offline parser replay.')
report = report.replace('Saved evidence is capped at 1.5 MB per response.', 'Catalog and web-page snapshots are capped at 1.5 MB per response. The three historical NISER primary-source PDFs are retained as complete documents; the largest is about 7.1 MB. `evidence-manifest.json` records exact sizes and SHA-256 hashes.')
report_path.write_text(report)

manifest = []
for folder in [ROOT / 'evidence', ADD / 'evidence']:
    for path in sorted(folder.rglob('*')):
        if path.is_file() and path.suffix.lower() in {'.html', '.txt', '.pdf', '.js'}:
            payload = path.read_bytes()
            manifest.append({'path': str(path.relative_to(ROOT)), 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()})
(ROOT / 'evidence-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'observed_verified': len(data['verified']), 'selected': 6, 'reserves': 4, 'raw_evidence_files': len(manifest), 'raw_evidence_bytes': sum(x['bytes'] for x in manifest)}))
