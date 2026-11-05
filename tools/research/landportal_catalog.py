"""Bounded public Land Portal dataset-label queries, excluding all person/microdata graphs."""
import fcntl
import json
import re
import time

from civic_catalogs import LOCK
from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate, request_url

ENDPOINT = 'https://landportal.org/sparql'
PREFIX = 'http://data.landportal.info/dataset/'
BASE = ('SELECT DISTINCT ?dataset ?label FROM <http://datasets.landportal.info> WHERE { '
        '?dataset <http://www.w3.org/2000/01/rdf-schema#label> ?label . '
        'FILTER (lang(?label) = "" || langMatches(lang(?label), "en")) ')


def make_request(native_id=None, offset=0):
    if native_id is not None and not re.fullmatch(r'[A-Za-z0-9_.-]{1,100}', native_id):
        raise ValueError('One native dataset identifier required')
    if type(offset) is not int or not 0 <= offset <= 20:
        raise ValueError('Small metadata page only')
    clause = ('VALUES ?dataset { <' + PREFIX + native_id + '> }' if native_id is not None
              else 'FILTER (STRSTARTS(STR(?dataset), "' + PREFIX + '") && '
                   '!CONTAINS(STRAFTER(STR(?dataset), "' + PREFIX + '"), "/"))')
    return {'method': 'GET', 'url': ENDPOINT, 'params': {
        'query': BASE + clause + ' } ORDER BY STR(?dataset) LIMIT 2 OFFSET ' + str(offset),
        'format': 'application/sparql-results+json', 'timeout': 5000}}


def allowed_request(req):
    p = req.get('params', {})
    if req.get('method') != 'GET' or req.get('url') != ENDPOINT or req.get('json') is not None:
        raise ValueError('Read-only public metadata endpoint required')
    query = p.get('query', '')
    match = re.search(r'VALUES \?dataset \{ <http://data\.landportal\.info/dataset/([A-Za-z0-9_.-]+)> \}', query)
    offset = re.search(r' OFFSET ([0-9]+)$', query)
    if not offset or p != make_request(match[1] if match else None, int(offset[1]))['params']:
        raise ValueError('Only exact dataset-label SELECT; no people, observations, SERVICE or writes')


def parse(data):
    if (not isinstance(data, dict) or data.get('error') or not isinstance(data.get('head'), dict)
            or set(data['head'].get('vars', [])) != {'dataset', 'label'}
            or not isinstance(data.get('results'), dict)):
        raise ValueError('Missing explicit SPARQL metadata columns')
    rows = data.get('results', {}).get('bindings')
    if not isinstance(rows, list) or len(rows) > 2:
        raise ValueError('Missing/oversized SPARQL bindings')
    out, seen = [], set()
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get('dataset'), dict) or not isinstance(row.get('label'), dict):
            raise ValueError('Missing native bindings')
        sid, label = row.get('dataset', {}), row.get('label', {})
        value = sid.get('value', '')
        if (sid.get('type') != 'uri' or not value.startswith(PREFIX)
                or not re.fullmatch(r'[A-Za-z0-9_.-]+', value[len(PREFIX):]) or value in seen
                or label.get('type') != 'literal' or not isinstance(label.get('value'), str)
                or not label['value'].strip() or label.get('xml:lang', 'en').lower().split('-')[0] != 'en'):
            raise ValueError('Invalid/duplicate native dataset identity or English label')
        out.append({'id': value, 'title': label['value'], 'type': 'dataset-metadata',
                    'native_dataset_id': value[len(PREFIX):], 'label_language': label.get('xml:lang'),
                    'data_values_verified': False, 'owner_records_collected': False,
                    'reading_access_verified': False,
                    'scope': 'Dataset metadata, not an ownership register, individual respondent or legal title proof'})
        seen.add(value)
    return out


def capture(req, rule, proof):
    allowed_request(req)
    url = request_url(req)
    row = {'source_id': 'land-portal', 'observed_at': now(), 'request': req, 'robots_evidence': proof,
           'query_verified': False, 'http': {'status': None, 'truncated': False}}
    if rule is False or rule is not None and not rule.can_fetch(USER_AGENT, url):
        return {**row, 'outcome': 'skipped', 'error': 'Policy gate; no target requested'}
    time.sleep(max(4, pacing_seconds(rule)))
    h, body = request(url, 128 * 1024, {'Accept': 'application/sparql-results+json'})
    row.update(http=h, response_sha256=h['sampled_bytes_sha256'])
    try:
        row['observed_output'] = json.loads(body)
    except (ValueError, UnicodeError):
        row['response_excerpt'] = body[:600].decode(errors='replace')
    if h['status'] != 200 or h['truncated'] or 'observed_output' not in row:
        return {**row, 'outcome': 'blocked-or-failed', 'error': h.get('error') or 'Non200/truncated/nonJSON'}
    return {**row, 'outcome': 'captured'}


def probe(source, case_ids=None):
    with LOCK.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        rule, proof = robots(ENDPOINT)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            row = capture(case['request'], rule, proof)
            records = []
            if row['outcome'] == 'captured':
                try:
                    records = parse(row['observed_output'])
                except (ValueError, TypeError, AttributeError) as exc:
                    row.update(outcome='invalid-response', error=str(exc))
            value = evaluate(source, case, row, {'results': records})
            with (REGISTRY / 'examples/land-portal.jsonl').open('a') as out:
                out.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], value['verdict'], row['http']['status'], flush=True)
            if row['outcome'] != 'captured':
                break
