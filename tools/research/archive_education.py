"""Research-only public metadata for the attributed MIT OCW Archive collection."""
import fcntl
import json
import re
import time

from civic_catalogs import LOCK
from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate, request_url

ENDPOINT = 'https://archive.org/advancedsearch.php'
FIELDS = ['identifier', 'title', 'mediatype', 'licenseurl', 'language', 'date']
SCOPE = 'collection:mit_ocw AND mediatype:movies AND NOT access-restricted-item:true'


def make_request(expression, page=1):
    return {'method': 'GET', 'url': ENDPOINT, 'params': [
        ['q', SCOPE + ' AND ' + expression], *[['fl[]', f] for f in FIELDS],
        ['rows', 2], ['page', page], ['output', 'json']]}


def allowed_request(req):
    if req.get('method') != 'GET' or req.get('url') != ENDPOINT or req.get('json') is not None:
        raise ValueError('Only public read-only Advanced Search metadata')
    pairs = req.get('params')
    if not isinstance(pairs, list) or any(not isinstance(p, (list, tuple)) or len(p) != 2 for p in pairs):
        raise ValueError('Explicit ordered query/field pairs required')
    fields = [v for k, v in pairs if k == 'fl[]']
    other = [(k, v) for k, v in pairs if k != 'fl[]']
    p = dict(other)
    if (fields != FIELDS or len(p) != len(other) or set(p) != {'q', 'rows', 'page', 'output'}
            or p.get('rows') != 2 or type(p.get('page')) is not int or not 1 <= p['page'] <= 5
            or p.get('output') != 'json' or not isinstance(p.get('q'), str)
            or not p['q'].startswith(SCOPE + ' AND ')):
        raise ValueError('Bounded collection metadata; no user, favorite-list or uploader fields')
    suffix = p['q'][len(SCOPE + ' AND '):]
    if not re.fullmatch(r'(title:[A-Za-z0-9]{1,100}|identifier:[A-Za-z0-9_.-]{1,150})', suffix):
        raise ValueError('One bounded title or native identifier expression required')


def parse(data):
    if not isinstance(data, dict) or data.get('error') or data.get('errors'):
        raise ValueError('Provider error or malformed response')
    response = data.get('response')
    if not isinstance(response, dict) or type(response.get('numFound')) is not int or response['numFound'] < 0:
        raise ValueError('Missing explicit search result total')
    rows = response.get('docs')
    if not isinstance(rows, list) or len(rows) > 2:
        raise ValueError('Missing or oversized metadata list')
    out, seen = [], set()
    for r in rows:
        sid = r.get('identifier') if isinstance(r, dict) else None
        if (not isinstance(sid, str) or not re.fullmatch(r'[A-Za-z0-9_.-]+', sid)
                or sid in seen or r.get('mediatype') != 'movies'
                or not isinstance(r.get('title'), str) or not r['title'].strip()):
            raise ValueError('Invalid/duplicate native educational-media identity/type')
        out.append({'id': sid, 'title': r['title'], 'type': 'movies',
                    'landing_page': 'https://archive.org/details/' + sid,
                    'date': r.get('date'), 'language': r.get('language'),
                    'license_url_claim': r.get('licenseurl'),
                    'record_scope': 'Archive item may contain a course playlist, not one lecture',
                    'reading_access_verified': False, 'producer_attribution_verified': False,
                    'reuse_permission_verified': False})
        seen.add(sid)
    return out


def capture(req, rule, proof):
    allowed_request(req)
    url = request_url(req)
    row = {'source_id': 'mit-ocw', 'observed_at': now(), 'request': req,
           'robots_evidence': proof, 'query_verified': False,
           'http': {'status': None, 'truncated': False}}
    if rule is False or rule is not None and not rule.can_fetch(USER_AGENT, url):
        return {**row, 'outcome': 'skipped', 'error': 'Policy gate; no target requested'}
    time.sleep(max(4, pacing_seconds(rule)))
    h, body = request(url, 128 * 1024, {'Accept': 'application/json'})
    row.update(http=h, response_sha256=h['sampled_bytes_sha256'])
    try:
        data = json.loads(body)
        # Enforce minimal fields even if a provider ignores fl[]. Never persist
        # unsolicited uploader/account/favorite metadata from this route.
        if isinstance(data, dict) and isinstance(data.get('response'), dict) and isinstance(data['response'].get('docs'), list):
            data['response']['docs'] = [{k: v for k, v in r.items() if k in FIELDS} if isinstance(r, dict) else r
                                        for r in data['response']['docs']]
        row['observed_output'] = data
        row['privacy_minimization'] = 'Only requested bibliographic fields retained in response.docs; raw HTTP hash retained separately.'
    except (ValueError, UnicodeError):
        row['response_excerpt'] = body[:300].decode(errors='replace')
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
                except ValueError as exc:
                    row.update(outcome='invalid-response', error=str(exc))
            value = evaluate(source, case, row, {'results': records})
            with (REGISTRY / 'examples/mit-ocw.jsonl').open('a') as out:
                out.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], value['verdict'], row['http']['status'], flush=True)
            if row['outcome'] != 'captured':
                break
