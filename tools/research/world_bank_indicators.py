"""Research-only bounded national indicator queries; no microdata or runtime import."""
from datetime import date
import fcntl
import hashlib
import json
import math
from pathlib import Path
import re
import time
from urllib.parse import urlencode, urlsplit

from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate

BASE = 'https://api.worldbank.org/v2'
LOCK_PATH = Path('/tmp/mybookshelf-source-review.lock')
MAX_BYTES = 256 * 1024


def parse_data(data, expected_source='2'):
    if not isinstance(data, list) or len(data) != 2 or not isinstance(data[0], dict):
        raise ValueError('Expected World Bank page header and data array; error messages are not data')
    header, items = data
    if items in (None, []) and header.get('total') == 0 and header.get('sourceid') in (None, expected_source):
        # Current API returns null source/update and zero pages for out-of-range
        # periods. This is an empty response, never a verified observation.
        return []
    if str(header.get('sourceid')) != expected_source:
        raise ValueError('Missing or unexpected dataset source ID')
    if not isinstance(items, list) or len(items) > 20:
        raise ValueError('Missing or oversized indicator sample')
    updated = header.get('lastupdated')
    try:
        date.fromisoformat(updated)
    except (ValueError, TypeError):
        raise ValueError('Missing or invalid dataset update date') from None
    rows, seen = [], set()
    for item in items:
        if not isinstance(item, dict):
            raise ValueError('Invalid observation row')
        indicator, country = item.get('indicator'), item.get('country')
        code, year = item.get('countryiso3code'), item.get('date')
        if (not isinstance(indicator, dict) or not isinstance(indicator.get('id'), str)
                or not re.fullmatch(r'[A-Z0-9_.]+', indicator['id'])
                or not isinstance(indicator.get('value'), str) or not indicator['value'].strip()
                or not isinstance(country, dict) or not isinstance(country.get('id'), str)
                or not isinstance(country.get('value'), str) or not country['value'].strip()
                or code not in ('IND', 'USA') or not isinstance(year, str)
                or not re.fullmatch(r'[0-9]{4}', year)):
            raise ValueError('Missing or out-of-scope country/indicator/annual-period identity')
        if 'value' not in item:
            raise ValueError('Missing value field is not an explicit null observation')
        value = item['value']
        if value is not None and (type(value) not in (int, float) or type(value) is float and not math.isfinite(value)):
            raise ValueError('Observation must be a finite number or explicit null')
        identity = ':'.join([expected_source, indicator['id'], code, year])
        if identity in seen:
            raise ValueError('Duplicate country/indicator/period identity')
        seen.add(identity)
        rows.append({'id': identity, 'title': f'{indicator["value"]} — {country["value"]} ({year})',
                     'source_id': expected_source, 'indicator_id': indicator['id'],
                     'indicator_name': indicator['value'], 'country_code': code,
                     'provider_country_code': country['id'], 'country_name': country['value'],
                     'period': year, 'value': value, 'value_available': value is not None,
                     'unit': item.get('unit'), 'decimal': item.get('decimal'),
                     'observation_status': item.get('obs_status'), 'footnote': item.get('footnote'),
                     'dataset_last_updated': updated,
                     'landing_page': f'https://data.worldbank.org/indicator/{indicator["id"]}?locations={country["id"]}',
                     'record_kind': 'national-aggregate-indicator-observation',
                     'reading_access_verified': False})
    return rows


def capture(url, params, policy, proof):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.netloc != 'api.worldbank.org' or not parsed.path.startswith('/v2/'):
        raise ValueError('Only documented World Bank v2 HTTPS endpoints may be sampled')
    if params.get('format') != 'json' or params.get('downloadformat') or not 1 <= int(params.get('per_page', 10)) <= 10:
        raise ValueError('Research requires JSON and at most ten rows; no bulk download')
    address = url + '?' + urlencode(params)
    row = {'source_id': 'world-bank-indicators', 'observed_at': now(),
           'request': {'method': 'GET', 'url': url, 'params': params},
           'robots_evidence': proof, 'query_verified': False,
           'http': {'status': None, 'truncated': False},
           'response_sha256': hashlib.sha256(b'').hexdigest()}
    if policy is False or policy is not None and not policy.can_fetch(USER_AGENT, address):
        row.update(outcome='skipped', error='Unavailable or disallowing robots; request not sent')
        return row
    time.sleep(pacing_seconds(policy))
    http, body = request(address, MAX_BYTES)
    row.update(http=http, response_sha256=http['sampled_bytes_sha256'])
    if http['status'] == 200 and not http['truncated']:
        try:
            row['observed_output'] = json.loads(body)
            row['outcome'] = 'captured'
        except (ValueError, UnicodeError):
            row.update(outcome='invalid-response', error='Expected JSON response')
    else:
        row.update(outcome='blocked-or-failed', error=http.get('error') or f'HTTP {http["status"]}; truncated={http["truncated"]}')
        row['response_excerpt'] = body[:1000].decode(errors='replace')
    return row


def probe(source, case_ids=None):
    with LOCK_PATH.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(BASE)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            req = case['request']
            if req['method'] != 'GET' or not re.fullmatch(re.escape(BASE) + r'/country/(IND|USA)/indicator/[A-Z0-9_.]+', req['url']):
                raise ValueError('Replay only saved USA/India indicator GETs')
            params = req['params']
            if (str(params.get('source')) != '2' or not re.fullmatch(r'[0-9]{4}', str(params.get('date')))
                    or set(params) - {'format', 'source', 'date', 'footnote', 'per_page', 'page'}):
                raise ValueError('Replay requires explicit WDI source and annual period')
            row = capture(req['url'], params, policy, proof)
            records = []
            if row['outcome'] == 'captured':
                try:
                    all_records = parse_data(row['observed_output'])
                    row['missing_observations'] = [x for x in all_records if not x['value_available']]
                    records = [x for x in all_records if x['value_available']]
                except ValueError as exc:
                    row.update(outcome='invalid-response', error=str(exc))
            result = evaluate(source, case, row, {'results': records})
            with (REGISTRY / 'examples/world-bank-indicators.jsonl').open('a') as output:
                output.write(json.dumps(result, ensure_ascii=False, sort_keys=True) + '\n')
            print('world-bank-indicators', case['id'], result['verdict'], row['http']['status'], flush=True)
            if row['outcome'] in ('skipped', 'blocked-or-failed', 'invalid-response'):
                break
