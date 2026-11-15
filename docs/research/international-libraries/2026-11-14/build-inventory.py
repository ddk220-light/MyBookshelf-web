"""Normalize reviewed country findings; no network calls or product changes."""
import csv
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).parent
rows = []

def read(country):
    return json.loads((ROOT / country / 'findings.json').read_text())

def is_reserve(item):
    recommendation = item.get('recommendation', 'verified_target')
    assert recommendation in {'verified_target', 'reserve'}, (item['id'], recommendation)
    return recommendation == 'reserve'

def add(country, item, platform, query, request, books, count, scale, policy, integration, access, evidence, payload=None, reserve=False, count_note=None):
    assert request.get('status', request.get('http_status')) == 200, (country, item['id'])
    assert books and all(b.get('title') for b in books), (country, item['id'])
    url = request.get('url') or request.get('search_url')
    checked = request.get('checked_at_utc') or request.get('checked_at')
    assert url and checked and query, (country, item['id'])
    for path in evidence:
        assert (ROOT / country / path).exists(), (country, path)
    rows.append({
        'country': country.title(), 'id': item['id'], 'library': item['name'],
        'platform': platform, 'query': query, 'query_note': item.get('query_note'),
        'method': request.get('method') or ('POST' if payload else 'GET'),
        'query_url': url, 'payload': payload, 'checked_at_utc': checked,
        'http_status': 200, 'reported_result_count': count, 'returned_books': books,
        'result_count_note': count_note or request.get('result_count_note'),
        'scale_evidence': scale, 'policy_observation': policy,
        'integration_issues': integration, 'reader_access': access,
        'evidence_files': [f'{country}/{p}' for p in evidence],
        'country_findings': f'{country}/findings.json',
        'source_path_base': f'{country}/',
        'reserve': reserve, 'product_integration_completed': False,
    })

for r in read('bangladesh')['libraries']:
    q = r['query_verification']
    add('bangladesh', r, r['platform'], q['query_text'], q, q['returned_books'], q.get('results_count'), r['collection'], r['robots']['assessment'], r['adapter_readiness'], r['access_limits'], [q['evidence_html'], q['evidence_metadata']], reserve=is_reserve(r))

for r in read('pakistan')['query_verified_libraries']:
    add('pakistan', r, r['lms']['product'], r['query'], r['response'], r['returned_books'], r.get('result_count'), r['scale'], r['robots'], r['adapter'], r['membership_access'], r['evidence'], payload=r['response'].get('payload') or r.get('payload'), reserve=is_reserve(r), count_note=r.get('result_count_note'))

for r in read('nigeria')['verified']:
    add('nigeria', r, r['platform'], r['query'], r['search'], r['returned_records'], r.get('displayed_result_count'), r['size_source'], r['robots_policy'], r['integration_assessment'], r['public_access'], [r['search']['evidence']], payload=r['search'].get('payload'), reserve=is_reserve(r), count_note=r.get('search_count_note'))

for r in read('philippines')['verified_targets']:
    q = r['query_evidence']
    add('philippines', r, r['platform'], r['query'], q, r['returned_records'], r.get('search_result_count'), r['scale_evidence'], r['policy_status'], r['adapter_readiness'], r['public_access'], [q['raw_response'], q['evidence_metadata']], payload=q.get('post_payload') or q.get('post_json'), reserve=is_reserve(r))

for r in read('indonesia')['libraries']:
    q = r['query']
    books = r['results']
    if r['id'] == 'its':
        books = [dict(b, record_method='POST', record_payload={'id': b['record_id']}, record_request_evidence='indonesia/evidence/its-detail.json') for b in books]
        assert (ROOT / 'indonesia/evidence/its-detail.json').exists()
    add('indonesia', r, r['platform'], q['text'], q, books, q.get('displayed_result_count'), r['selection_basis'], r['policy'], r['integration_path'], r['public_eligibility'], [q['raw_evidence'], q['metadata_evidence']], payload=q.get('payload'), reserve=is_reserve(r))

keys = [(r['country'], r['id']) for r in rows]
assert len(keys) == len(set(keys)), 'Duplicate institution IDs'
selected = [r for r in rows if not r['reserve']]
counts = dict(Counter(r['country'] for r in selected))
countries = ['Bangladesh', 'Pakistan', 'Nigeria', 'Philippines', 'Indonesia']
assert set(counts) == set(countries), counts
assert all(0 < count <= 10 for count in counts.values()), counts
reserves = [r for r in rows if r['reserve']]
observed_counts = dict(Counter(r['country'] for r in rows))
reserve_counts = {country: observed_counts[country] - counts[country] for country in countries}
shortfall = {country: 10 - counts[country] for country in countries if counts[country] < 10}
qualifications = [
    'A network counts once; branch selectors are not additional verified institutions.',
    'Size evidence has different units, dates and completeness; no national top-ten ranking is established.',
    'Successful queries do not establish permission, current circulation data, public borrowing eligibility or app integration.',
]
if any(r['country'] == 'Pakistan' and r['id'] == 'umt' for r in rows):
    umt = next(r for r in rows if r['country'] == 'Pakistan' and r['id'] == 'umt')
    qualifications.append('UMT has an observed success but explicitly prohibits automated search; retained as a restricted ' + ('reserve.' if umt['reserve'] else 'selected observation.'))
small_ph = [r for r in selected if r['country'] == 'Philippines' and r['id'] in ['imus', 'butuan']]
if small_ph:
    qualifications.append(f'Philippines includes {len(small_ph)} smaller public-library pilots; shared endpoints are identified in the country report.')
if any(r['country'] == 'Philippines' and r['id'] == 'lst' for r in selected):
    qualifications.append('LST returned related book titles, not the exact requested edition; repeated searches also failed. Matching and reliability remain unresolved.')
output = {
    'scope': 'Observed specific-book queries, not national size rankings or production integrations.',
    'selected_institution_or_network_count': len(selected),
    'additional_reserve_count': len(rows) - len(selected),
    'selected_counts_by_country': counts,
    'observed_counts_by_country': observed_counts,
    'reserve_counts_by_country': reserve_counts,
    'at_least_ten_observed_per_country': all(count >= 10 for count in observed_counts.values()),
    'requested_target': {'per_country': 10, 'total': 50, 'criteria': 'Large libraries with observed specific-book search results; national largest-ten rank is not established.'},
    'shortfall': shortfall,
    'shortfall_basis': 'Selected shortlist only. Reserves are real observed successes but have separate scale, policy or selection limitations.',
    'path_conventions': {
        'inventory_relative': 'evidence_files, country_findings and record_request_evidence resolve relative to this inventory directory.',
        'country_relative': 'Other nested source paths are preserved from country findings and resolve relative to each row source_path_base, including ../adapter-tools references.',
    },
    'qualifications': qualifications,
    'libraries': rows,
}
(ROOT / 'verified-searches.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')

columns = ['country', 'library', 'platform', 'query', 'query_note', 'method', 'query_url', 'payload', 'checked_at_utc', 'http_status', 'reported_result_count', 'result_count_note', 'returned_books', 'scale_evidence', 'policy_observation', 'integration_issues', 'reader_access', 'evidence_files', 'country_findings', 'source_path_base', 'reserve']
with (ROOT / 'verified-searches.csv').open('w', newline='', encoding='utf-8-sig') as f:
    writer = csv.DictWriter(f, fieldnames=columns)
    writer.writeheader()
    for r in rows:
        writer.writerow({k: json.dumps(r[k], ensure_ascii=False) if isinstance(r[k], (dict, list)) else r[k] for k in columns})

def cell(value):
    return str(value or '').replace('|', '\\|').replace('\n', ' ')

def book_link(book):
    title = cell(book['title']).replace('[', '\\[').replace(']', '\\]')
    if book.get('record_method') == 'POST':
        return title + f' (POST detail; [request]({book["record_request_evidence"]}))'
    url = book.get('record_url') or book.get('url')
    return f'[{title}](<{url}>)' if url else title + ' (record link unresolved)'

shortfall_text = ' The selected shortlist reaches ten per country.' if not shortfall else ' The selected shortlist remains short of ten in: ' + ', '.join(f'{country} ({count} missing)' for country, count in shortfall.items()) + '.'
text = [
    '# Verified international book searches', '',
    f'**{len(selected)} selected institutions or networks returned books; {len(reserves)} additional observations are retained as reserves.**' + shortfall_text + ' These are catalog observations, with institution-specific integration issues, rather than a national ranking or a completed rollout.', '',
    ' '.join(qualifications) + ' Country dossiers retain larger blocked candidates and collection-size evidence.', '',
    'All requests shown below returned HTTP 200 with actual book records. Exact UTC timestamps, POST payloads, source sizes, policies, returned records and raw-response paths are available in [JSON](verified-searches.json) and [CSV](verified-searches.csv). A result count may include editions, broad title matches or visible cards; consult the country dossier for its definition. A blank count is not zero.', '',
    '| Country | Selected | Reserves | Total observed |', '|---|---:|---:|---:|',
]
for country in countries:
    text.append(f'| {country} | {counts[country]} | {reserve_counts[country]} | {observed_counts[country]} |')
text.append('')
for country in countries:
    slug = country.lower()
    text += [f'## {country}', '', f'[Country analysis and integration qualifications]({slug}/report.md)', '', '| Library | Platform | Actual query | Returned book | Result count |', '|---|---|---|---|---:|']
    for r in selected:
        if r['country'] != country:
            continue
        query = cell(r['query'])
        if r['method'] == 'POST':
            link = f'POST: {query} ([payload]({slug}/findings.json))'
        else:
            link = f'[{query}](<{r["query_url"]}>)'
        name = cell(r['library'])
        if slug == 'pakistan' and r['id'] == 'umt': name += ' **— automated search restricted**'
        if slug == 'philippines' and r['id'] in ['imus', 'butuan']: name += ' **— smaller public pilot**'
        count = '' if r['reported_result_count'] is None else cell(r['reported_result_count'])
        text.append(f'| {name} | {cell(r["platform"])} | {link} | {book_link(r["returned_books"][0])} | {count} |')
    text.append('')
text += ['## Additional reserves', '', f'These {len(reserves)} observed successes are excluded from the {len(selected)} selected targets. Reserve status can reflect missing scale evidence, a stronger replacement or a policy restriction; it does not mean integration readiness.', '', '| Country | Library | Query | Returned book |', '|---|---|---|---|']
for r in reserves:
    name = cell(r['library'])
    if r['country'] == 'Pakistan' and r['id'] == 'umt': name += ' **— automated search restricted**'
    query = cell(r['query'])
    link = f'POST: {query} ([payload]({r["country_findings"]}))' if r['method'] == 'POST' else f'[{query}](<{r["query_url"]}>)'
    text.append(f'| {r["country"]} | {name} | {link} | {book_link(r["returned_books"][0])} |')
text += ['', '[Return to the cross-country report](README.md)', '']
(ROOT / 'verified-searches.md').write_text('\n'.join(text))
print(json.dumps({'selected': len(selected), 'reserves': len(rows)-len(selected), 'counts': counts}, indent=2))
