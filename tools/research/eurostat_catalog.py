"""Research-only, single-cell Eurostat population-density queries; no runtime import."""
import fcntl
import json
import math
from pathlib import Path
import re
import time
from urllib.parse import urlencode

from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/DEMO_R_D3DENS'
DATASET = 'DEMO_R_D3DENS'
DIMENSIONS = ['freq', 'unit', 'geo', 'time']
GEOS = {'EU27_2020', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'PL', 'SE', 'FI', 'AT'}
MAX_BYTES = 128 * 1024
LOCK_PATH = Path('/tmp/mybookshelf-source-review.lock')


def native_id(geo, year):
    return f'ESTAT:{DATASET}:freq=A:unit=PER_KM2:geo={geo}:time={year}'


def parse_cell(data, geo, year):
    if (not isinstance(data, dict) or data.get('class') != 'dataset'
            or data.get('version') != '2.0' or data.get('source') != 'ESTAT'
            or data.get('extension', {}).get('id') != DATASET
            or data.get('id') != DIMENSIONS or data.get('size') != [1, 1, 1, 1]):
        raise ValueError('Expected one exact Eurostat population-density cell, not an error/empty/broad cube')
    expected = dict(zip(DIMENSIONS, ['A', 'PER_KM2', geo, str(year)]))
    labels = {}
    for dimension, code in expected.items():
        cat = data.get('dimension', {}).get(dimension, {}).get('category', {})
        if cat.get('index') != {code: 0} or not isinstance(cat.get('label', {}).get(code), str):
            raise ValueError('Dimension code, native position or label does not match requested cell')
        labels[dimension] = cat['label'][code]
    values, flags = data.get('value'), data.get('status', {})
    if not isinstance(values, dict) or set(values) - {'0'} or not isinstance(flags, dict) or set(flags) - {'0'}:
        raise ValueError('Unexpected JSON-stat value/status positions')
    value = values.get('0')
    if value is not None and (type(value) not in (int, float) or not math.isfinite(value)):
        raise ValueError('Value must be finite numeric or missing, not fabricated zero')
    flag = flags.get('0')
    if flag is not None and not isinstance(flag, str):
        raise ValueError('Invalid observation-status flag')
    updated = data.get('updated')
    if not isinstance(updated, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T.+', updated):
        raise ValueError('Missing dataset update identity')
    extension = data['extension']
    return {'id': native_id(geo, year), 'title': f'Population density — {labels["geo"]} ({year})',
            'title_is_derived': True, 'dataset_id': DATASET, 'source': 'ESTAT',
            'dimensions': expected, 'dimension_labels': labels, 'value': value,
            'value_available': value is not None, 'status_flag': flag,
            'status_label': extension.get('status', {}).get('label', {}).get(flag),
            'updated': updated, 'datastructure': extension.get('datastructure'),
            'dataset_version': extension.get('version'), 'language': extension.get('lang'),
            'landing_page': 'https://ec.europa.eu/eurostat/databrowser/view/demo_r_d3dens/default/table?lang=en',
            'reading_access_verified': False,
            'record_kind': 'aggregate-statistical-observation',
            'version_note': 'Mutable dataset; updated/hash and structure version are not an immutable historical edition.'}


def capture(params, policy, proof):
    if (not {'lang', 'geo', 'time'} <= set(params)
            or set(params) - {'lang', 'geo', 'time', 'freq', 'unit'} or params['lang'] != 'EN'
            or params.get('freq', 'A') != 'A' or params.get('unit', 'PER_KM2') != 'PER_KM2'
            or params['geo'] not in GEOS or not re.fullmatch(r'\d{4}', str(params['time']))):
        raise ValueError('Only the reviewed English, EU, annual single-cell contract may be requested')
    address = ENDPOINT + '?' + urlencode(params)
    row = {'source_id': 'eurostat', 'observed_at': now(), 'query_verified': False,
           'request': {'method': 'GET', 'url': ENDPOINT, 'params': params}, 'robots_evidence': proof,
           'http': {'status': None, 'truncated': False}}
    if policy is False or policy is not None and not policy.can_fetch(USER_AGENT, address):
        return {**row, 'outcome': 'skipped', 'error': 'Unavailable/disallowing policy; request not sent'}
    time.sleep(pacing_seconds(policy))
    http, body = request(address, MAX_BYTES)
    row.update(http=http, response_sha256=http['sampled_bytes_sha256'])
    if http['status'] != 200 or http['truncated']:
        return {**row, 'outcome': 'blocked-or-failed', 'error': http.get('error') or f'HTTP {http["status"]}',
                'response_excerpt': body[:1000].decode(errors='replace')}
    try:
        row['observed_output'] = json.loads(body)
        row['outcome'] = 'captured'
    except (ValueError, UnicodeError):
        row.update(outcome='invalid-response', error='Expected bounded JSON-stat response')
    return row


def probe(source, case_ids=None):
    with LOCK_PATH.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(ENDPOINT)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            req = case['request']
            if req['method'] != 'GET' or req['url'] != ENDPOINT:
                raise ValueError('Replay only the saved public dataset contract')
            row = capture(req['params'], policy, proof)
            records = []
            if row['outcome'] == 'captured':
                try:
                    record = parse_cell(row['observed_output'], req['params']['geo'], req['params']['time'])
                    row['missing_observations'] = [] if record['value_available'] else [record]
                    records = [record] if record['value_available'] else []
                except ValueError as exc:
                    row.update(outcome='invalid-response', error=str(exc))
            result = evaluate(source, case, row, {'results': records})
            with (REGISTRY / 'examples/eurostat.jsonl').open('a') as out:
                out.write(json.dumps(result, ensure_ascii=False, sort_keys=True) + '\n')
            print('eurostat', case['id'], result['verdict'], row['http']['status'], flush=True)
            if row['outcome'] != 'captured':
                break
