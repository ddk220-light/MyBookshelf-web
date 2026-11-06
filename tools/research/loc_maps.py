"""Small, policy-gated LOC map metadata probes; never fetch map image files."""
import fcntl
import json
import re
import time
from urllib.parse import urlsplit

from civic_catalogs import LOCK
from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate, request_url


def allowed_request(req):
    u = urlsplit(req.get('url', ''))
    p = req.get('params', {})
    if (req.get('method') != 'GET' or u.scheme != 'https' or u.netloc != 'www.loc.gov'
            or u.query or u.fragment or req.get('json') is not None or p.get('fo') != 'json'):
        raise ValueError('Only public LOC metadata GET requests')
    if u.path == '/maps/':
        if (set(p) - {'fo', 'q', 'c', 'sp', 'at', 'fa'} or p.get('at') != 'results,pagination'
                or 'fa' in p and p['fa'] != 'online-format:image'
                or not isinstance(p.get('q'), str) or not 1 <= len(p['q']) <= 150
                or type(p.get('c')) is not int or not 1 <= p['c'] <= 3
                or type(p.get('sp', 1)) is not int or not 1 <= p.get('sp', 1) <= 5):
            raise ValueError('Bounded map search required')
    elif (not re.fullmatch(r'/item/[0-9]+/', u.path) or set(p) != {'fo', 'at'}
          or p.get('at') not in ('item', 'item,resources')):
        raise ValueError('One native bibliographic item only')


def parse(data, endpoint):
    if not isinstance(data, dict) or data.get('error') or data.get('errors'):
        raise ValueError('Invalid/error map response')
    native = urlsplit(endpoint).path.startswith('/item/')
    rows = [data['item']] if native and isinstance(data.get('item'), dict) else data.get('results')
    if not isinstance(rows, list) or len(rows) > 3 or native and len(rows) != 1:
        raise ValueError('Missing or oversized map result list')
    result, seen = [], set()
    for row in rows:
        sid = row.get('id') if isinstance(row, dict) else None
        u = urlsplit(sid or '')
        if (u.scheme not in ('http', 'https') or u.netloc != 'www.loc.gov'
                or not re.fullmatch(r'/item/[0-9]+/', u.path) or u.query or u.fragment
                or sid in seen or native and u.path != urlsplit(endpoint).path
                or row.get('original_format') != ['map'] or row.get('access_restricted') is not False
                or not isinstance(row.get('title'), str) or not row['title'].strip()):
            raise ValueError('Wrong, restricted or duplicate native map identity/type')
        resources = row.get('resources')
        if not isinstance(resources, list) or not resources:
            raise ValueError('Map needs an explicit digital resource listing')
        links = []
        for resource in resources:
            link = resource.get('url', '') if isinstance(resource, dict) else ''
            r = urlsplit(link)
            if r.scheme != 'https' or r.netloc != 'www.loc.gov' or not r.path.startswith('/resource/'):
                raise ValueError('Unexpected map resource destination')
            links.append(link)
        nested = row.get('item') or {}
        result.append({'id': sid, 'title': row['title'], 'type': 'map',
                       'record_kind': 'historical-map-bibliographic-record',
                       'date': row.get('date'), 'languages': row.get('language', []),
                       'locations': row.get('location', []), 'medium': row.get('medium', []),
                       'created_published': row.get('created_published', []),
                       'scale': nested.get('scale'), 'notes': nested.get('notes', []),
                       'rights_html': row.get('rights', []), 'reading_urls': links,
                       'native_resource_count': len(links), 'formats': row.get('online_format', []),
                       'access_restricted': False, 'reading_access_verified': False,
                       'georeferencing_verified': False, 'reuse_permission_verified': False})
        seen.add(sid)
    return result


def capture(req, rule, proof):
    allowed_request(req)
    url = request_url(req)
    row = {'source_id': 'loc', 'observed_at': now(), 'request': req,
           'robots_evidence': proof, 'query_verified': False,
           'http': {'status': None, 'truncated': False}}
    if rule is False or rule is not None and not rule.can_fetch(USER_AGENT, url):
        return {**row, 'outcome': 'skipped', 'error': 'Policy gate; target not requested'}
    time.sleep(max(4, pacing_seconds(rule)))
    h, body = request(url, 512 * 1024, {'Accept': 'application/json'})
    row.update(http=h, response_sha256=h['sampled_bytes_sha256'])
    try:
        row['observed_output'] = json.loads(body)
    except (ValueError, UnicodeError):
        row['response_excerpt'] = body[:800].decode(errors='replace')
    if h['status'] != 200 or h['truncated'] or 'observed_output' not in row:
        return {**row, 'outcome': 'blocked-or-failed', 'error': h.get('error') or 'Non200/truncated/nonJSON'}
    return {**row, 'outcome': 'captured'}


def probe(source, case_ids):
    with LOCK.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        rule, proof = robots('https://www.loc.gov/maps/')
        for case in source['query']['cases']:
            if case['id'] not in case_ids:
                continue
            row = capture(case['request'], rule, proof)
            value = evaluate(source, case, row, row.get('observed_output', {}))
            with (REGISTRY / 'examples/loc.jsonl').open('a') as out:
                out.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], value['verdict'], row['http']['status'], flush=True)
            if row['outcome'] != 'captured':
                break


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', action='append', required=True,
                        help='Explicit pending map case ID; retry only after a useful recovery trigger')
    args = parser.parse_args()
    source = json.loads((REGISTRY / 'sources/loc.json').read_text())
    selected = set(args.case)
    known = {c['id'] for c in source['query']['cases'] if c['id'].startswith('map-native-')}
    if not selected <= known:
        parser.error('Unknown or non-map case')
    probe(source, selected)
