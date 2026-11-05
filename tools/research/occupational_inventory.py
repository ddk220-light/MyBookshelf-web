"""Research-only search over the official O*NET 31.0 occupation JSON export.

This is US occupational metadata, not a job board or a training/manual library.
Keep the release and O*NET-SOC identity together. Nothing imports this into runtime.
"""
import hashlib
import json
import re
import time

from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate

VERSION = '31.0'
ENDPOINT = 'https://www.onetcenter.org/dl_files/database/db_31_0_json/occupation_data.json'
MAX_BYTES = 1024 * 1024


def parse_onet(body):
    data = json.loads(body)
    if (not isinstance(data, dict) or data.get('table_id') != 'occupation_data'
            or data.get('data_dictionary') != 'https://www.onetcenter.org/dictionary/31.0/json/occupation_data.html'
            or not isinstance(data.get('row'), list) or not 1 <= len(data['row']) <= 2000):
        raise ValueError('Unexpected occupation export table, version or row count')
    rows, seen = [], set()
    for item in data['row']:
        if not isinstance(item, dict):
            raise ValueError('Invalid occupation row')
        code, title, description = (item.get(k) for k in ('onetsoc_code', 'title', 'description'))
        if (not isinstance(code, str) or not re.fullmatch(r'[0-9]{2}-[0-9]{4}\.[0-9]{2}', code)
                or code in seen or not isinstance(title, str) or not title.strip()
                or not isinstance(description, str) or not description.strip()):
            raise ValueError('Missing, duplicate or malformed occupation identity/content')
        seen.add(code)
        rows.append({'id': code, 'title': title, 'description': description,
                     'catalog_version': VERSION, 'jurisdiction': 'USA',
                     'license': 'CC BY 4.0', 'record_kind': 'occupation-description'})
    return rows


def local_search(rows, query):
    mode = query.get('mode')
    if mode not in ('exact_code', 'title_contains', 'title_or_description'):
        raise ValueError('Unsupported occupational search mode')
    text = query.get('text')
    if not isinstance(text, str):
        raise ValueError('Search text must be a string')
    text = text.strip().casefold()
    if not text:
        return []
    def matches(row):
        if mode == 'exact_code':
            return row['id'].casefold() == text
        return text in row['title'].casefold() or (mode == 'title_or_description' and text in row['description'].casefold())
    return sorted((row for row in rows if matches(row)), key=lambda row: row['id'])


def record_examples(source, capture, body, case_ids=None):
    """Run local queries using a hash-verified capture; preserve its original date."""
    digest = hashlib.sha256(body).hexdigest()
    http = capture['http']
    rows, error = [], None
    if (http.get('status') != 200 or http.get('truncated')
            or http.get('sampled_bytes_sha256') != digest
            or capture['request']['url'] != ENDPOINT):
        error = 'Capture failed, was truncated, or hash/endpoint did not match'
    else:
        try:
            rows = parse_onet(body)
        except (ValueError, TypeError, KeyError, UnicodeError) as exc:
            error = str(exc)
    for case in source['query']['cases']:
        if case_ids and case['id'] not in case_ids:
            continue
        results = local_search(rows, case['request']['local_query']) if not error else []
        obs = {'observed_at': now(), 'http': http, 'response_sha256': digest,
               'error': error, 'robots_evidence': capture['robots_evidence'],
               'execution_mode': 'metadata-import-local-search',
               'import': {'url': ENDPOINT, 'retrieved_at': http.get('requested_at'),
                          'sha256': digest, 'entry_count': len(rows), 'version': VERSION},
               'attribution': 'O*NET 31.0 Database, USDOL/ETA, CC BY 4.0; O*NET is a trademark of USDOL/ETA.'}
        row = evaluate(source, case, obs, {'results': results})
        with (REGISTRY / 'examples/onet.jsonl').open('a') as output:
            output.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n')
        print('onet', case['id'], row['verdict'], flush=True)


def probe(source, case_ids=None):
    policy, proof = robots(ENDPOINT)
    body = b''
    http = {'status': None, 'truncated': False, 'sampled_bytes_sha256': hashlib.sha256(body).hexdigest()}
    if policy is not False and (policy is None or policy.can_fetch(USER_AGENT, ENDPOINT)):
        time.sleep(pacing_seconds(policy))
        http, body = request(ENDPOINT, MAX_BYTES)
    capture = {'source_id': 'onet', 'observed_at': now(), 'http': http,
               'request': {'method': 'GET', 'url': ENDPOINT}, 'robots_evidence': proof,
               'query_verified': False, 'outcome': 'captured' if http['status'] == 200 and not http['truncated'] else 'blocked-or-failed'}
    with (REGISTRY / 'examples/onet.access.jsonl').open('a') as output:
        output.write(json.dumps(capture, ensure_ascii=False, sort_keys=True) + '\n')
    record_examples(source, capture, body, case_ids)
