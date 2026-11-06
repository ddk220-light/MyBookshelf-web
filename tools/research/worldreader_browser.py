"""Research-only anonymous BookSmart UI searches; retain bounded metadata."""
import fcntl
import hashlib
import json
import os
import re
import subprocess
import tempfile
import unicodedata
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from run_source_reviews import now, robots, pacing_seconds
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT = 'https://booksmart.worldreader.org/explore'
API = 'https://books-api.worldreader.org/v1/books'
APP_SHELL_HASH = 'cce49cf04d1f68cd8b935bbb0a7649e65ffe4dbd689f980f2f7c2f337a2f1ec5'
# Exact small shell reviewed against the current operator link and no-sign-in policy.


def tokens(value):
    return set(re.findall(r'\w+', unicodedata.normalize('NFKC', value).casefold()))


def checked_case(case):
    req = case['request']
    query = case['query_text']
    if (not isinstance(query, str) or not 1 <= len(query) <= 200 or not tokens(query) or
            req != {'method': 'GET', 'url': ENDPOINT, 'execution': 'public-browser', 'form_query': query}):
        raise ValueError('Unreviewed visible search request')
    return query


def reviewed_policy(policy, proof, url):
    if (policy is False and url == ENDPOINT and proof.get('status') == 200 and
            proof.get('sampled_bytes_sha256') == APP_SHELL_HASH and not proof.get('truncated')):
        return True  # Exact reviewed generic Angular fallback; no REP rule or access challenge.
    return policy is not False and (policy is None or all(
        policy.can_fetch(agent, url) for agent in [USER_AGENT, 'ChatGPT-User', 'OAI-SearchBot']))


def parse(capture, query):
    u = urlsplit(capture['api_url'])
    expected = {'project_id': ['760'], 'book_schema': ['bookShelf'], 'limit': ['20'],
                'search': [query], 'country': ['US'], 'language': ['eng']}
    if (u.scheme + '://' + u.netloc + u.path != API or u.fragment or
            parse_qs(u.query, keep_blank_values=True) != expected):
        raise ValueError('Search scope/query was not the observed anonymous US/English request')
    data = capture['metadata']
    if set(data) != {'totalCount','count','offset','limit','books'} or not isinstance(data['books'],list):
        raise ValueError('Unexpected retained metadata fields')
    if any(not isinstance(b,dict) or set(b) != {'uuid','version','title'} for b in data['books']):
        raise ValueError('Unexpected retained book fields')
    # Stable across sort_keys JSONL serialization; matches the browser whitelist order.
    ordered = {k:data[k] for k in ['totalCount','count','offset','limit']}
    ordered['books'] = [{k:b[k] for k in ['uuid','version','title']} for b in data['books']]
    raw = json.dumps(ordered, ensure_ascii=False, separators=(',', ':')).encode()
    if hashlib.sha256(raw).hexdigest() != capture['metadata_sha256']:
        raise ValueError('Mismatched retained metadata hash')
    books = data['books']
    if (not isinstance(books, list) or len(books) > 20 or
            any(type(data.get(k)) is not int for k in ['totalCount', 'count', 'offset', 'limit']) or
            data['count'] != len(books) or data['totalCount'] < len(books) or
            data['offset'] != 0 or data['limit'] != 20):
        raise ValueError('Invalid bounded metadata page/counts')
    rows, seen = [], set()
    for b in books:
        native, title, version = b.get('uuid'), b.get('title'), b.get('version')
        if (not isinstance(native, str) or str(uuid.UUID(native)) != native or native in seen or
                not isinstance(title, str) or not title.strip() or type(version) is not int or version < 0):
            raise ValueError('Missing/ambiguous native book UUID, version or title')
        seen.add(native)
        if tokens(query) <= tokens(title):
            rows.append({'id': native, 'native_uuid': native, 'version': version, 'title': title,
                         'search_page': ENDPOINT, 'country_scope': 'US', 'query_language': 'eng',
                         'reading_access_verified': False})
    return rows


def assess(source, case, capture):
    rows, error = [], capture.get('error')
    try:
        query = checked_case(case)
        if error or capture['http']['status'] != 200 or capture['http']['truncated']:
            raise ValueError(error or 'Failed/incomplete search response')
        rows = parse(capture, query)
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        error = str(exc)
    return evaluate(source, case, {**capture, 'error': error,
        'response_sha256': capture.get('response_sha256', hashlib.sha256(b'').hexdigest()),
        'full_content_downloaded': False,
        'search_scope': 'Anonymous US/English BookSmart visible search; first20 filtered to all literal title tokens; not full-catalog absence or reader rights'}, {'results': rows})


def probe(source, case_ids=None):
    if source['id'] != 'worldreader' or source['query']['endpoint'] != ENDPOINT:
        raise ValueError('Unreviewed source')
    cases = [c for c in source['query']['cases'] if not case_ids or c['id'] in case_ids]
    for case in cases:
        checked_case(case)
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        proofs, allowed, delay = [], True, 3
        for url in [ENDPOINT, API, 'https://user-api.worldreader.org/v1/auth/startup']:
            policy, proof = robots(url)
            proofs.append(proof)
            allowed = allowed and reviewed_policy(policy, proof, url)
            if policy is not False:
                delay = max(delay, pacing_seconds(policy))
        captures = []
        if allowed:
            with tempfile.TemporaryDirectory(prefix='booksmart-search-') as temp:
                dest, inp = Path(temp) / 'captures.jsonl', Path(temp) / 'input.json'
                inp.write_text(json.dumps({'cases': cases, 'output': str(dest),
                    'pace_ms': delay * 1000, 'user_agent': USER_AGENT}))
                proc = subprocess.run([os.environ.get('MYBOOKSHELF_NODE_BINARY', 'node'),
                    str(Path(__file__).with_suffix('.cjs')), str(inp)],
                    timeout=150 + len(cases) * 65, check=False)
                if dest.exists():
                    captures = [json.loads(line) for line in dest.read_text().splitlines()]
                failure = 'Browser produced no capture; exit ' + str(proc.returncode)
        else:
            failure = 'Policy unavailable/disallowing; no browser query sent'
        if not captures and cases:
            captures = [{'case_id': cases[0]['id'], 'observed_at': now(),
                         'http': {'status': None, 'truncated': False}, 'error': failure}]
        byid = {c['id']: c for c in cases}
        for cap in captures:
            cap['robots_evidence'] = proofs
            with (REGISTRY / 'examples/worldreader.browser.jsonl').open('a') as f:
                f.write(json.dumps(cap, ensure_ascii=False, sort_keys=True) + '\n')
            observation = assess(source, byid[cap['case_id']], cap)
            with (REGISTRY / 'examples/worldreader.jsonl').open('a') as f:
                f.write(json.dumps(observation, ensure_ascii=False, sort_keys=True) + '\n')
            print(cap['case_id'], observation['verdict'], observation['error'], flush=True)
