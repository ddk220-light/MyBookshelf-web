"""Anonymous documented SODA2.1 queries for the NYC zoning map index only."""
import fcntl
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.parse import urlencode
from run_source_reviews import robots, request, now, pacing_seconds
from source_registry import REGISTRY, USER_AGENT, evaluate, request_url

ENDPOINT = 'https://data.cityofnewyork.us/resource/wwcv-s7e7.json'
FIELDS = ':id,quartersec,zoning_map,section'


def make_request(label, offset=0):
    if not isinstance(label, str) or not re.fullmatch(r'[0-9A-Z]{1,24}', label) or offset not in (0, 1):
        raise ValueError('Only zoning-map labels and bounded offset supported')
    return {'method': 'GET', 'url': ENDPOINT, 'params': {
        '$select': FIELDS, '$where': "zoning_map='" + label + "'", '$order': ':id', '$limit': 3, '$offset': offset}}


def validate_request(req):
    p = req.get('params', {})
    match = re.fullmatch(r"zoning_map='([0-9A-Z]{1,24})'", p.get('$where', ''))
    if not match or req != make_request(match[1], p.get('$offset')):
        raise ValueError('Unreviewed endpoint, fields, filter or paging')
    return match[1]


def parse(data, label):
    if not isinstance(data, list) or len(data) > 3:
        raise ValueError('Wrong row envelope/limit')
    rows = []
    for r in data:
        if (not isinstance(r, dict) or set(r) != {':id', 'quartersec', 'zoning_map', 'section'}
                or not isinstance(r[':id'], str) or not re.fullmatch(r'row-[a-z0-9_.~-]+', r[':id'])
                or r['zoning_map'] != label or not all(isinstance(v, str) and v for v in r.values())):
            raise ValueError('Wrong identity, schema or query relevance')
        rows.append({'id': r[':id'], 'title': 'NYC zoning map ' + r['zoning_map'],
            'zoning_map': r['zoning_map'], 'section': r['section'], 'quarter_section': r['quartersec'],
            'dataset_id': 'wwcv-s7e7', 'landing_page': 'https://data.cityofnewyork.us/d/wwcv-s7e7',
            'identity_scope': 'Native Socrata row ID in zoning-map index; dataset refresh may replace IDs',
            'reading_access_verified': False})
    if len({r['id'] for r in rows}) != len(rows):
        raise ValueError('Duplicate native row ID')
    return rows


def fetch_case(source, case, policy, proof):
    label = validate_request(case['request']); url = request_url(case['request'])
    body = b''; rows = []; error = None; h = {'status': None, 'truncated': False}
    if policy is False or policy is not None and not policy.can_fetch(USER_AGENT, url):
        error = 'Unavailable/disallowing robots policy; no query sent'
    else:
        h, body = request(url)
        if h['status'] != 200 or h['truncated']:
            error = h.get('error') or 'Non-200/oversized response'
        else:
            try:
                rows = parse(json.loads(body), label)
            except (ValueError, TypeError, KeyError) as exc:
                error = str(exc)
    return evaluate(source, case, {'observed_at': now(), 'http': h, 'robots_evidence': proof,
        'response_sha256': hashlib.sha256(body).hexdigest(), 'error': error,
        'error_response_excerpt': body.decode(errors='replace')[:1200] if h['status'] != 200 else None,
        'full_content_downloaded': False, 'personal_owner_data_requested': False}, {'results': rows})


def probe(source, case_ids=None):
    if source['id'] != 'nyc-planning-data' or source['query']['endpoint'] != ENDPOINT:
        raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(ENDPOINT)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            time.sleep(pacing_seconds(policy)); row = fetch_case(source, case, policy, proof)
            with (REGISTRY/'examples/nyc-planning-data.jsonl').open('a') as f:
                f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], row['verdict'], row['error'], flush=True)
            if policy is False or row['http']['status'] in (401, 403, 429, 503) or row['http']['status'] is None:
                break
