"""Bounded research queries over the documented Open Textbook Library CSV export."""
import csv
import io
import json
from urllib.parse import urlsplit

from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import MAX_BYTES, REGISTRY, USER_AGENT, evaluate
import time


def parse_otl(body):
    reader = csv.DictReader(io.StringIO(body.decode('utf-8-sig')))
    required = {'Otl id', 'Title', 'Library URL', 'License', 'Publisher'}
    if not required <= set(reader.fieldnames or []):
        raise ValueError('Missing OTL catalog fields')
    rows, seen = [], set()
    for item in reader:
        sid, title, landing = item['Otl id'], item['Title'], item['Library URL']
        if not sid or not sid.isascii() or not sid.isdigit() or sid in seen or not title or not landing.startswith('https://open.umn.edu/opentextbooks/textbooks/'):
            raise ValueError('Missing, duplicate or noncanonical catalog identity')
        seen.add(sid)
        links = []
        for i in range(1, 7):
            url = item.get(f'URL {i}', '')
            kind, price = item.get(f'Type {i}', ''), item.get(f'Price {i}', '')
            if url and kind not in ('Hardcopy', 'Paperback', 'Print') and price == '$0.00' and urlsplit(url).scheme == 'https':
                links.append({'url': url, 'format': kind, 'price': price, 'access_verified': False})
        rows.append({'id': sid, 'title': title, 'landing_page': landing,
                     'publisher': item['Publisher'], 'copyright_year': item.get('Copyright year'),
                     'isbn13': item.get('ISBN13'), 'license_label': item['License'],
                     'subjects': [item[k] for k in ('Subject 1', 'Subject 2') if item.get(k)],
                     'metadata_reported_free_links': links})
    return rows


def local_search(rows, query):
    if query.get('mode') not in ('title_contains', 'title_or_subject'):
        raise ValueError('Only title/subject metadata search is supported')
    text = query.get('text', '').strip().casefold()
    if not text:
        return []
    found = []
    for row in rows:
        fields = [row['title']] + (row['subjects'] if query['mode'] == 'title_or_subject' else [])
        if any(text in field.casefold() for field in fields):
            found.append(row)
    return sorted(found, key=lambda row: int(row['id']))


def probe(source, case_ids=None):
    contract = source['query']
    policy, robots_obs = robots(contract['endpoint'])
    http, body, error, rows = {'status': None, 'truncated': False}, b'', None, []
    if policy is False or (policy and not policy.can_fetch(USER_AGENT, contract['endpoint'])):
        error = 'Robots unavailable or disallows export; no catalog request sent'
    else:
        time.sleep(pacing_seconds(policy))
        captured, body = request(contract['endpoint'], MAX_BYTES)
        http = {**captured, 'bytes': captured['bytes_read']}
        if http['status'] != 200 or http['truncated']:
            error = 'Catalog request failed or exceeded the size cap'
        else:
            try:
                rows = parse_otl(body)
            except (ValueError, UnicodeError) as exc:
                error = str(exc)
    import hashlib
    digest = hashlib.sha256(body).hexdigest()
    for case in contract['cases']:
        if case_ids and case['id'] not in case_ids:
            continue
        result = local_search(rows, case['request']['local_query']) if not error else []
        obs = {'observed_at': now(), 'http': http, 'response_sha256': digest,
               'error': error, 'execution_mode': 'metadata-import-failed' if error else 'metadata-import-local-search',
               'robots_evidence': robots_obs,
               'import': {'url': contract['endpoint'], 'retrieved_at': http.get('requested_at'),
                          'sha256': digest, 'entry_count': len(rows)}}
        row = evaluate(source, case, obs, {'results': result})
        with (REGISTRY / 'examples' / f'{source["id"]}.jsonl').open('a') as stream:
            stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n')
        print(source['id'], case['id'], row['verdict'], flush=True)
