"""Research-only, bounded stable Tatoeba sentence API observations."""
import fcntl
import json
import re
import time
from urllib.parse import urlencode, urlsplit

from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate
from civic_catalogs import LOCK


def allowed_request(req):
    u = urlsplit(req['url'])
    if (req.get('method') != 'GET' or u.scheme != 'https'
            or u.netloc != 'api.tatoeba.org' or u.query or u.fragment
            or not re.fullmatch(r'/v1/sentences(?:/[1-9][0-9]*)?', u.path)):
        raise ValueError('Only stable, public sentence GET endpoints are permitted')
    p = req.get('params', {})
    if u.path == '/v1/sentences':
        if (set(p) - {'lang', 'q', 'sort', 'limit', 'is_unapproved', 'is_orphan', 'showtrans', 'after'}
                or not re.fullmatch('[a-z]{3}', str(p.get('lang', '')))
                or not isinstance(p.get('q'), str) or not p['q'].strip()
                or p.get('sort') != 'relevance' or type(p.get('limit')) is not int
                or not 1 <= p['limit'] <= 3 or p.get('is_unapproved') != 'no'
                or p.get('is_orphan') != 'no' or p.get('showtrans') != 'none'
                or 'after' in p and not re.fullmatch(r'[0-9,]+', str(p['after']))):
            raise ValueError('Bounded language/topic filters and exclusions are required')
    elif p != {'showtrans': 'none'}:
        raise ValueError('Native retrieval excludes audio, translations and user profiles')


def parse(data, req):
    if not isinstance(data, dict) or 'data' not in data:
        raise ValueError('Expected explicit sentence data')
    search = urlsplit(req['url']).path == '/v1/sentences'
    rows = data['data'] if search else [data['data']]
    if not isinstance(rows, list) or len(rows) > 3:
        raise ValueError('Invalid or oversized sentence page')
    if search:
        paging = data.get('paging')
        # Observed cursor pages omit total even when the first page includes it.
        # Absence is unknown, never a zero count or a reason to invent a total.
        if (not isinstance(paging, dict) or type(paging.get('has_next')) is not bool
                or 'total' in paging and (type(paging['total']) is not int or paging['total'] < len(rows))):
            raise ValueError('Missing or inconsistent paging metadata')
        if paging['has_next']:
            next_url = urlsplit(paging.get('next', ''))
            if next_url.scheme != 'https' or next_url.netloc != 'api.tatoeba.org' or next_url.path != '/v1/sentences':
                raise ValueError('Unexpected next-page destination')
    result, seen = [], set()
    for row in rows:
        if not isinstance(row, dict) or type(row.get('id')) is not int or row['id'] <= 0 or row['id'] in seen:
            raise ValueError('Missing/duplicate sentence identity')
        if (not isinstance(row.get('text'), str) or not row['text'].strip()
                or not re.fullmatch('[a-z]{3}', str(row.get('lang', '')))
                or row.get('is_unapproved') is not False
                or not isinstance(row.get('owner'), str) or not row['owner'].strip()
                or row.get('license') not in ('CC BY 2.0 FR', 'CC0 1.0')):
            raise ValueError('Missing text/language/attribution or unapproved/problem rights')
        if search and row['lang'] != req['params']['lang']:
            raise ValueError('Provider did not honor requested language')
        if not search and str(row['id']) != req['url'].rsplit('/', 1)[-1]:
            raise ValueError('Returned native ID differs from requested ID')
        if row.get('translations') or row.get('audios'):
            raise ValueError('Unexpected translated/audio content outside this adapter scope')
        seen.add(row['id'])
        result.append({'id': str(row['id']), 'title': row['text'],
                       'language': row['lang'], 'script': row.get('script'),
                       'license': row['license'], 'attribution_owner': row['owner'],
                       'is_unapproved': row['is_unapproved'],
                       'record_kind': 'language-example-sentence',
                       'landing_page': f'https://tatoeba.org/en/sentences/show/{row["id"]}',
                       'reading_access_verified': False,
                       'pedagogical_accuracy_verified': False,
                       'revision': 'Mutable sentence ID; response hash is observation version, not edit timestamp'})
    return result


def capture(req, policy, proof):
    allowed_request(req)
    url = req['url'] + '?' + urlencode(req['params'])
    row = {'source_id': 'tatoeba', 'observed_at': now(), 'request': req,
           'robots_evidence': proof, 'http': {'status': None, 'truncated': False},
           'query_verified': False}
    if policy is False or policy is not None and not policy.can_fetch(USER_AGENT, url):
        return {**row, 'outcome': 'skipped', 'error': 'Policy unavailable/disallowing; no target request'}
    time.sleep(pacing_seconds(policy))
    h, body = request(url, 256 * 1024, {'Accept': 'application/json'})
    row.update(http=h, response_sha256=h['sampled_bytes_sha256'])
    try:
        row['observed_output'] = json.loads(body)
    except (ValueError, UnicodeError):
        row['response_excerpt'] = body[:800].decode(errors='replace')
    if h['status'] != 200 or h['truncated']:
        return {**row, 'outcome': 'blocked-or-failed', 'error': h.get('error') or f'HTTP {h["status"]}'}
    if 'observed_output' not in row:
        return {**row, 'outcome': 'invalid-response', 'error': 'Expected sentence API JSON'}
    return {**row, 'outcome': 'captured'}


def probe(source, case_ids=None):
    with LOCK.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(source['query']['endpoint'])
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            row = capture(case['request'], policy, proof)
            records = []
            if row['outcome'] == 'captured':
                try:
                    records = parse(row['observed_output'], case['request'])
                except (ValueError, KeyError) as exc:
                    row.update(outcome='invalid-response', error=str(exc))
            value = evaluate(source, case, row, {'results': records})
            with (REGISTRY / 'examples' / 'tatoeba.jsonl').open('a') as out:
                out.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], value['verdict'], row['http']['status'], flush=True)
            if row['outcome'] != 'captured':
                break
