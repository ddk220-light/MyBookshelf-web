"""Bookshelf metadata indexed by Europe PMC; never request NCBI or full text."""
import fcntl
import hashlib
import json
import re
import time
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search'
PREFIX = 'HAS_BOOK:Y AND OPEN_ACCESS:Y AND TITLE:'


def title_query(url):
    parsed = urlsplit(url)
    params = parse_qs(parsed.query, keep_blank_values=True)
    if (parsed.scheme + '://' + parsed.netloc + parsed.path != ENDPOINT or parsed.fragment or
            set(params) != {'query', 'format', 'pageSize', 'resultType'} or
            params['format'] != ['json'] or params['pageSize'] != ['3'] or params['resultType'] != ['core'] or
            len(params['query']) != 1):
        raise ValueError('Unreviewed Bookshelf metadata request')
    query = params['query'][0]
    if not query.startswith(PREFIX) or not re.fullmatch(r'"[^"\r\n]+"', query[len(PREFIX):]):
        raise ValueError('Expected bounded quoted title with book/open-access filters')
    title = query[len(PREFIX) + 1:-1]
    if not re.findall(r'\w+', title):
        raise ValueError('Empty title tokens')
    return title


def parse(body, title):
    if not isinstance(body, bytes) or len(body) > 256 * 1024:
        raise ValueError('Unbounded metadata response')
    data = json.loads(body)
    rows = data['resultList']['result']
    if not isinstance(data['hitCount'], int) or data['hitCount'] < 0 or not isinstance(rows, list) or len(rows) > 3:
        raise ValueError('Invalid bounded search result shape')
    results = []
    seen = set()
    wanted = set(re.findall(r'\w+', title.casefold()))
    for row in rows:
        native = row.get('bookid', '')
        source = row.get('source')
        record = row.get('id', '')
        if (row.get('hasBook') != 'Y' or row.get('isOpenAccess') != 'Y' or
                not re.fullmatch(r'NBK[0-9]+', native) or
                not (source == 'NBK' and record == native or source == 'MED' and re.fullmatch(r'[0-9]+', record)) or
                not isinstance(row.get('title'), str) or not row['title'].strip()):
            raise ValueError('Missing/conflicting Bookshelf identity or unsatisfied filters')
        if native in seen:
            raise ValueError('Duplicate Bookshelf record on page')
        seen.add(native)
        if not wanted <= set(re.findall(r'\w+', row['title'].casefold())):
            continue  # Keep provider totals separate; reject stemming/broadening.
        parent = row.get('bookOrReportDetails', {}).get('comprisingTitle')
        results.append({'id': native, 'title': row['title'], 'bookshelf_id': native,
                        'index_record_id': source + ':' + record,
                        'record_kind': 'chapter-or-entry' if parent else 'book-or-report',
                        'parent_title': parent, 'parent_id': None,
                        'publication_details': row.get('bookOrReportDetails', {}),
                        'publication_types': row.get('pubTypeList', {}).get('pubType', []),
                        'index_publication_date': row.get('firstPublicationDate'),
                        'language': row.get('language'), 'license_label': row.get('license'),
                        'provider_open_access_flag': row['isOpenAccess'],
                        'landing_page': 'https://www.ncbi.nlm.nih.gov/books/' + native + '/',
                        'metadata_page': 'https://europepmc.org/article/' + source + '/' + record,
                        'reading_access_verified': False})
    return results, {'provider_hit_count': data['hitCount'], 'provider_page_count': len(rows),
                     'next_cursor_mark': data.get('nextCursorMark'), 'filtered_count': len(results)}


def assess(source, case, capture, body):
    rows = []
    summary = {}
    error = capture.get('error')
    try:
        title = title_query(case['request']['url'])
        http = capture['http']
        if error or http['status'] != 200 or http['truncated']:
            raise ValueError(error or 'Failed/incomplete metadata response')
        if http['sampled_bytes_sha256'] != hashlib.sha256(body).hexdigest():
            raise ValueError('Mismatched metadata hash')
        rows, summary = parse(body, title)
    except (KeyError, TypeError, ValueError) as exc:
        error = str(exc)
    return evaluate(source, case, {**capture, 'error': error, 'query_summary': summary,
        'response_sha256': hashlib.sha256(body).hexdigest(), 'full_content_downloaded': False,
        'query_execution': 'Europe PMC supported API, book/open-access flags and quoted title; literal title-token postfilter'}, {'results': rows})


def probe(source, case_ids=None):
    if source['id'] != 'ncbi-bookshelf' or source['query']['endpoint'] != ENDPOINT:
        raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(ENDPOINT)
        stop = None
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            if case['request']['method'] != 'GET':
                raise ValueError('Unreviewed method')
            title_query(case['request']['url'])
            body = b''
            cap = {'observed_at': now(), 'robots_evidence': proof, 'http': {'status': None, 'truncated': False}}
            if stop or policy is False or policy is not None and not all(policy.can_fetch(a, case['request']['url']) for a in [USER_AGENT, 'ChatGPT-User', 'OAI-SearchBot']):
                cap['error'] = stop or 'Policy unavailable/disallowing'
            else:
                time.sleep(pacing_seconds(policy))
                cap['http'], body = request(case['request']['url'], limit=256 * 1024)
                if cap['http']['status'] != 200:
                    stop = 'Earlier provider failure; await recovery/backoff'
            observation = assess(source, case, cap, body)
            with (REGISTRY / 'examples/ncbi-bookshelf.jsonl').open('a') as f:
                f.write(json.dumps(observation, ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], observation['verdict'], observation['error'], flush=True)
