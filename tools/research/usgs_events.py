"""Research-only bounded queries of the documented USGS FDSN event service."""
import fcntl
import json
import math
from pathlib import Path
import time
from urllib.parse import urlencode, urlsplit

from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT = 'https://earthquake.usgs.gov/fdsnws/event/1/query'
LOCK_PATH = Path('/tmp/mybookshelf-source-review.lock')
MAX_BYTES = 256 * 1024


def parse_events(data):
    if not isinstance(data, dict):
        raise ValueError('Expected a GeoJSON object')
    if data.get('type') == 'FeatureCollection':
        features = data.get('features')
    elif data.get('type') == 'Feature':
        features = [data]
    else:
        raise ValueError('Unexpected GeoJSON type')
    if not isinstance(features, list) or len(features) > 10:
        raise ValueError('Missing or oversized research event sample')
    results, seen = [], set()
    for feature in features:
        if not isinstance(feature, dict):
            raise ValueError('Invalid event feature')
        identity, props, geometry = (feature.get(k) for k in ('id', 'properties', 'geometry'))
        if not isinstance(identity, str) or not identity or identity in seen or not isinstance(props, dict):
            raise ValueError('Missing/duplicate event identity or properties')
        seen.add(identity)
        coordinates = geometry.get('coordinates') if isinstance(geometry, dict) else None
        if (not isinstance(geometry, dict) or geometry.get('type') != 'Point'
                or not isinstance(coordinates, list) or len(coordinates) != 3
                or any(type(n) not in (int, float) or not math.isfinite(n) for n in coordinates)
                or not -180 <= coordinates[0] <= 180 or not -90 <= coordinates[1] <= 90):
            raise ValueError('Invalid longitude/latitude/depth coordinates')
        url, title = props.get('url'), props.get('title')
        if (not isinstance(title, str) or not title.strip() or not isinstance(url, str)
                or urlsplit(url).scheme != 'https' or urlsplit(url).netloc != 'earthquake.usgs.gov'):
            raise ValueError('Missing title or untrusted event destination')
        if any(type(props.get(key)) is not int for key in ('time', 'updated')):
            raise ValueError('Missing origin/update timestamps')
        results.append({'id': identity, 'title': title, 'landing_page': url,
                        'detail_url': props.get('detail'), 'origin_time_ms_utc': props['time'],
                        'updated_at_ms_utc': props['updated'], 'longitude': coordinates[0],
                        'latitude': coordinates[1], 'depth_km': coordinates[2],
                        'magnitude': props.get('mag'), 'magnitude_type': props.get('magType'),
                        'event_type': props.get('type'), 'review_status': props.get('status'),
                        'contributing_network': props.get('net'), 'network_code': props.get('code'),
                        'associated_event_ids': props.get('ids'), 'place': props.get('place'),
                        'content_kind': 'earthquake-event-record'})
    return results


def capture_query(params, policy, proof):
    if (params.get('format') != 'geojson'
            or (not params.get('eventid') and not 1 <= int(params.get('limit', 0)) <= 2)):
        raise ValueError('Research requests require GeoJSON and at most two records')
    url = ENDPOINT + '?' + urlencode(params)
    capture = {'source_id': 'usgs-earthquake', 'observed_at': now(),
               'request': {'method': 'GET', 'url': ENDPOINT, 'params': params},
               'robots_evidence': proof, 'query_verified': False}
    if policy is False or (policy is not None and not policy.can_fetch(USER_AGENT, url)):
        capture.update(outcome='skipped', error='Unavailable/disallowing robots policy',
                       http={'status': None, 'truncated': False}, sample_results=[])
        return capture
    time.sleep(pacing_seconds(policy))
    http, body = request(url, MAX_BYTES)
    capture['http'] = http
    capture['response_sha256'] = http['sampled_bytes_sha256']
    capture['sample_results'] = []
    if http['status'] == 204:
        capture['outcome'] = 'empty'
    elif http['status'] == 200 and not http['truncated']:
        try:
            data = json.loads(body)
            capture['sample_results'] = parse_events(data)
            capture['observed_output'] = data
            capture['outcome'] = 'captured' if capture['sample_results'] else 'empty'
        except (ValueError, TypeError) as exc:
            capture.update(outcome='invalid-response', error=str(exc), response_excerpt=body[:2000].decode(errors='replace'))
    else:
        capture.update(outcome='blocked-or-failed', error=http.get('error') or f'HTTP {http["status"]}',
                       response_excerpt=body[:2000].decode(errors='replace'))
    return capture


def probe(source, case_ids=None):
    with LOCK_PATH.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(ENDPOINT)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            row = capture_query(case['request']['params'], policy, proof)
            result = evaluate(source, case, row, {'results': row['sample_results']})
            with (REGISTRY / 'examples/usgs-earthquake.jsonl').open('a') as output:
                output.write(json.dumps(result, ensure_ascii=False, sort_keys=True) + '\n')
            print(source['id'], case['id'], result['verdict'], flush=True)
            if row['outcome'] in ('skipped', 'blocked-or-failed', 'invalid-response'):
                break
