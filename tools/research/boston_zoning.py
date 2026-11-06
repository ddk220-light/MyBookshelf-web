"""Research-only, read-only district metadata; no parcels, owners or editing routes."""
import fcntl
import json
import re
import time
from urllib.parse import urlencode

from civic_catalogs import LOCK
from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate

BASE = 'https://gis.bostonplans.org/hosting/rest/services/Zoning_Districts/FeatureServer/0'
FIELDS = ['OBJECTID', 'DISTRICT', 'STAGE', 'MAPNO', 'ARTICLE', 'VOLUME']


def allowed_request(req):
    if req.get('method') != 'GET':
        raise ValueError('Only read-only GET requests')
    p = req.get('params', {})
    if req.get('url') == BASE and p == {'f': 'json'}:
        return
    if req.get('url') != BASE + '/query':
        raise ValueError('Only the published Boston zoning layer query; no edits or alternate layers')
    allowed = {'f', 'where', 'objectIds', 'outFields', 'returnGeometry', 'orderByFields', 'resultOffset', 'resultRecordCount'}
    if (set(p) - allowed or p.get('f') != 'json' or p.get('outFields') != ','.join(FIELDS)
            or p.get('returnGeometry') != 'false' or p.get('orderByFields') != 'OBJECTID ASC'
            or type(p.get('resultRecordCount')) is not int or not 1 <= p['resultRecordCount'] <= 5
            or type(p.get('resultOffset')) is not int or not 0 <= p['resultOffset'] <= 10):
        raise ValueError('Fixed nonpersonal fields, no geometry, stable order and at most five rows')
    if 'objectIds' in p:
        if 'where' in p or not re.fullmatch(r'[1-9][0-9]{0,8}', str(p['objectIds'])):
            raise ValueError('One positive native OBJECTID only')
    elif p.get('where') not in ('1=1', '1=0') and not re.fullmatch(r"DISTRICT = '[A-Za-z0-9 ,.:&()-]{1,70}'", p.get('where', '')):
        raise ValueError('Only exact district name or bounded discovery/empty predicates')


def parse(data, req):
    if not isinstance(data, dict) or 'error' in data or not isinstance(data.get('features'), list):
        raise ValueError('Expected feature page, not an ArcGIS error or metadata object')
    if len(data['features']) > req['params']['resultRecordCount']:
        raise ValueError('Provider exceeded the requested page bound')
    result, seen = [], set()
    for feature in data['features']:
        if not isinstance(feature, dict) or 'geometry' in feature or set(feature) != {'attributes'}:
            raise ValueError('Only non-geometric attribute records are retained')
        a = feature['attributes']
        if not isinstance(a, dict) or set(a) != set(FIELDS):
            raise ValueError('Missing or unexpected fields; do not retain personal/free-text data')
        native = a['OBJECTID']
        if type(native) is not int or native <= 0 or native in seen:
            raise ValueError('Invalid or duplicate native feature ID')
        if not isinstance(a['DISTRICT'], str) or not a['DISTRICT'].strip():
            raise ValueError('District name is required')
        if any(a[k] is not None and not isinstance(a[k], str) for k in FIELDS[2:]):
            raise ValueError('Stage/map/article/volume must be text or explicit null')
        p = req['params']
        if 'objectIds' in p and native != int(p['objectIds']):
            raise ValueError('Wrong native feature returned')
        if p.get('where', '').startswith('DISTRICT = ') and a['DISTRICT'] != p['where'][12:-1]:
            raise ValueError('Provider ignored exact district-name filter')
        seen.add(native)
        result.append({'id': str(native), 'title': a['DISTRICT'], 'attributes': a,
                       'native_layer': BASE, 'record_kind': 'municipal-zoning-district',
                       'landing_page': BASE,
                       'version': 'Mutable unversioned layer; identity includes layer, OBJECTID and observation hash',
                       'legal_status_verified': False, 'reading_access_verified': False})
    return result


def capture(req, policy, proof):
    allowed_request(req)
    url = req['url'] + '?' + urlencode(req['params'])
    row = {'source_id': 'boston-planning-zoning', 'observed_at': now(), 'request': req,
           'robots_evidence': proof, 'http': {'status': None, 'truncated': False}, 'query_verified': False}
    if policy is False or policy is not None and not policy.can_fetch(USER_AGENT, url):
        return {**row, 'outcome': 'skipped', 'error': 'Unavailable/disallowing policy; no target request'}
    time.sleep(pacing_seconds(policy))
    http, body = request(url, 128 * 1024, {'Accept': 'application/json'})
    row.update(http=http, response_sha256=http['sampled_bytes_sha256'])
    if http['status'] != 200 or http['truncated']:
        return {**row, 'outcome': 'blocked-or-failed', 'error': http.get('error') or f'HTTP {http["status"]}; truncated={http["truncated"]}', 'response_excerpt': body[:500].decode(errors='replace')}
    try:
        data = json.loads(body)
        if isinstance(data, dict) and isinstance(data.get('features'), list) and any(
                not isinstance(f, dict) or 'geometry' in f or not isinstance(f.get('attributes'), dict)
                or set(f['attributes']) - set(FIELDS) for f in data['features']):
            return {**row, 'outcome': 'invalid-response', 'error': 'Unexpected feature fields/geometry; response values omitted for privacy'}
        row.update(observed_output=data, outcome='captured')
    except (ValueError, UnicodeError):
        row.update(outcome='invalid-response', error='Expected bounded public JSON')
    return row


def probe(source, case_ids=None):
    with LOCK.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(BASE)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            row = capture(case['request'], policy, proof)
            results = []
            if row['outcome'] == 'captured':
                try:
                    results = parse(row['observed_output'], case['request'])
                except ValueError as exc:
                    row.update(outcome='invalid-response', error=str(exc))
            value = evaluate(source, case, row, {'results': results})
            with (REGISTRY / 'examples/boston-planning-zoning.jsonl').open('a') as out:
                out.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], value['verdict'], row['http']['status'], flush=True)
            if row['outcome'] != 'captured':
                break
