"""Read-only, bounded Washington government-owned parcel metadata research.

No private owner, agent, timber-owner, editor, legal-description or geometry fields.
Only published ownership type 1 is accepted, both in requests and responses.
"""
import fcntl
import json
import re
import time
from urllib.parse import urlencode
from civic_catalogs import LOCK
from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate

BASE = 'https://gis.dnr.wa.gov/site3/rest/services/Public_Boundaries/WADNR_PUBLIC_Cadastre_OpenData/FeatureServer/6'
FIELDS = ['OBJECTID', 'PARCEL_SYST_ID', 'PARCEL_TYPE_CD', 'GLOBALID',
          'COUNTY_JURISDICT_DESG_CD', 'SURFACE_RIGHTS_FLG', 'MINERAL_RIGHTS_FLG',
          'TIMBER_RIGHTS_FLG', 'SURFACE_TRUST_CD', 'EDIT_DATE', 'EDIT_STATUS']
PREDICATE = re.compile(r'PARCEL_TYPE_CD = 1 AND (COUNTY_JURISDICT_DESG_CD|PARCEL_SYST_ID) = ([1-9][0-9]{0,9})')


def allowed_request(req):
    p = req.get('params', {})
    if req.get('method') != 'GET' or req.get('url') != BASE + '/query':
        raise ValueError('Only the published read-only ownership-layer GET query')
    if (set(p) != {'f', 'where', 'outFields', 'returnGeometry', 'orderByFields', 'resultOffset', 'resultRecordCount'}
            or p.get('f') != 'json' or p.get('outFields') != ','.join(FIELDS)
            or p.get('returnGeometry') != 'false' or p.get('orderByFields') != 'PARCEL_SYST_ID ASC'
            or type(p.get('resultRecordCount')) is not int or not 1 <= p['resultRecordCount'] <= 5
            or type(p.get('resultOffset')) is not int or not 0 <= p['resultOffset'] <= 10):
        raise ValueError('Fixed safe projection, no geometry, stable native order and bounded page required')
    m = PREDICATE.fullmatch(p.get('where', ''))
    if p.get('where') != 'PARCEL_TYPE_CD = 1 AND 1 = 0' and not m:
        raise ValueError('Exact government ownership predicate with county or native ID required')
    if m and (int(m[2]) > 2147483647 or m[1] == 'COUNTY_JURISDICT_DESG_CD' and int(m[2]) > 39):
        raise ValueError('Invalid county or native ID bound')


def parse(data, req):
    allowed_request(req)
    if not isinstance(data, dict) or 'error' in data or not isinstance(data.get('features'), list):
        raise ValueError('Expected bounded features, not ArcGIS error')
    if len(data['features']) > req['params']['resultRecordCount']:
        raise ValueError('Response exceeds requested page size')
    result, seen = [], set()
    m = PREDICATE.fullmatch(req['params']['where'])
    for feature in data['features']:
        if not isinstance(feature, dict) or set(feature) != {'attributes'}:
            raise ValueError('Geometry or other unsolicited feature data rejected')
        a = feature['attributes']
        if not isinstance(a, dict) or set(a) != set(FIELDS):
            raise ValueError('Missing or unexpected fields; do not retain personal/free-text values')
        for key in ('OBJECTID', 'PARCEL_SYST_ID'):
            if type(a[key]) is not int or a[key] <= 0:
                raise ValueError('Positive native integer identity required')
        if type(a['PARCEL_TYPE_CD']) is not int or a['PARCEL_TYPE_CD'] != 1:
            raise ValueError('Only government-owned type1 records accepted')
        if not isinstance(a['GLOBALID'], str) or not re.fullmatch(r'\{?[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}\}?', a['GLOBALID']):
            raise ValueError('Native GLOBALID required')
        if a['PARCEL_SYST_ID'] in seen or not m or a[m[1]] != int(m[2]):
            raise ValueError('Duplicate identity, ignored scope or nonempty empty-query response')
        for key in ('SURFACE_RIGHTS_FLG', 'MINERAL_RIGHTS_FLG', 'TIMBER_RIGHTS_FLG'):
            if a[key] not in ('Y', 'N', None):
                raise ValueError('Unknown rights flag; do not infer boolean')
        for key in ('COUNTY_JURISDICT_DESG_CD', 'SURFACE_TRUST_CD', 'EDIT_DATE', 'EDIT_STATUS'):
            if a[key] is not None and type(a[key]) is not int:
                raise ValueError('Expected integer or explicit null')
        seen.add(a['PARCEL_SYST_ID'])
        result.append({'id': str(a['PARCEL_SYST_ID']), 'title': f"Washington state-owned parcel {a['PARCEL_SYST_ID']}",
                       'title_kind': 'generated-from-native-id-not-provider-title', 'attributes': a,
                       'native_layer': BASE, 'record_kind': 'state-owned-parcel-metadata',
                       'version': 'Layer/native ID/GlobalID and observation hash; edit date is not title-effective date',
                       'current_title_certified': False, 'reading_access_verified': False})
    ids = [int(r['id']) for r in result]
    if ids != sorted(ids):
        raise ValueError('Provider did not honor stable native ordering')
    return result


def capture(req, policy, proof):
    allowed_request(req)
    url = req['url'] + '?' + urlencode(req['params'])
    row = {'source_id': 'wa-dnr-owned-land', 'observed_at': now(), 'request': req,
           'robots_evidence': proof, 'http': {'status': None, 'truncated': False}, 'query_verified': False}
    if policy is False or policy is not None and not policy.can_fetch(USER_AGENT, url):
        return {**row, 'outcome': 'skipped', 'error': 'Policy unavailable/disallowing; no target request'}
    time.sleep(pacing_seconds(policy))
    h, body = request(url, 128 * 1024, {'Accept': 'application/json'})
    row.update(http=h, response_sha256=h['sampled_bytes_sha256'])
    if h['status'] != 200 or h['truncated']:
        return {**row, 'outcome': 'blocked-or-failed', 'error': h.get('error') or f'HTTP {h["status"]}; truncated={h["truncated"]}'}
    try:
        data = json.loads(body)
        results = parse(data, req)
        row.update(observed_output=data, parsed_results=results, outcome='captured')
    except (ValueError, TypeError, UnicodeError) as exc:
        row.update(outcome='invalid-response', error=str(exc), response_values_omitted=True)
    return row


def probe(source, case_ids=None):
    with LOCK.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(BASE)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            row = capture(case['request'], policy, proof)
            value = evaluate(source, case, row, {'results': row.get('parsed_results', [])})
            with (REGISTRY / 'examples/wa-dnr-owned-land.jsonl').open('a') as out:
                out.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], value['verdict'], row['http']['status'], flush=True)
            if row['outcome'] != 'captured':
                break
