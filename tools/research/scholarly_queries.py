"""Bounded, public scholarly metadata searches. No full text or credentials.

Crossref's free public pool is single-connection; arXiv requires >=3 seconds
between requests. Access denials stop the batch. Saved captures can be assessed
without fetching them again.
"""
import fcntl
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate, request_url

ENDPOINTS = {'crossref-public': 'https://api.crossref.org/works',
             'arxiv-atom': 'https://export.arxiv.org/api/query'}


def parse_crossref(body):
    data = json.loads(body)
    if data.get('status') != 'ok' or data.get('message-type') != 'work-list':
        raise ValueError('Not a successful Crossref work list')
    message = data['message']
    rows, seen = [], set()
    for item in message['items']:
        doi, titles = item.get('DOI'), item.get('title')
        if (not isinstance(doi, str) or not re.fullmatch(r'10\.\d{4,9}/\S+', doi)
                or doi.casefold() in seen or not isinstance(titles, list) or not titles
                or not isinstance(titles[0], str) or not titles[0].strip()):
            raise ValueError('Missing/duplicate DOI or title')
        seen.add(doi.casefold())
        rows.append({'id': doi.casefold(), 'title': titles[0], 'titles': titles,
                     'type': item.get('type'), 'landing_page': item.get('URL'),
                     'reading_access_verified': False})
    return {'results': rows, 'total_results': message['total-results'],
            'query': message.get('query'), 'next_cursor': message.get('next-cursor')}


def parse_arxiv(body):
    if b'<!DOCTYPE' in body.upper() or b'<!ENTITY' in body.upper():
        raise ValueError('Unexpected XML entities')
    root = ET.fromstring(body)
    a, o = '{http://www.w3.org/2005/Atom}', '{http://a9.com/-/spec/opensearch/1.1/}'
    if root.tag != a + 'feed':
        raise ValueError('Not an Atom feed')
    rows, seen = [], set()
    for entry in root.findall(a + 'entry'):
        native_url = entry.findtext(a + 'id', '')
        path = urlsplit(native_url)
        if path.hostname != 'arxiv.org' or not path.path.startswith('/abs/'):
            raise ValueError('Error or foreign arXiv identity')
        native = path.path[5:]
        if not re.fullmatch(r'(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?/\d{7})v[1-9]\d*', native):
            raise ValueError('Missing arXiv version identity')
        title = ' '.join(entry.findtext(a + 'title', '').split())
        if not title or native in seen:
            raise ValueError('Missing title or duplicate identity')
        seen.add(native)
        rows.append({'id': native, 'title': title, 'landing_page': native_url,
                     'published': entry.findtext(a + 'published'),
                     'updated': entry.findtext(a + 'updated'),
                     'categories': [n.get('term') for n in entry.findall(a + 'category')],
                     'reading_access_verified': False})
    return {'results': rows, 'total_results': int(root.findtext(o + 'totalResults')),
            'start': int(root.findtext(o + 'startIndex'))}


def assess(source, case, capture):
    observation = {k: capture[k] for k in ('observed_at', 'http', 'response_sha256', 'robots_evidence')}
    observation.update(error=capture.get('error'), execution_mode='public-metadata-api',
                       full_content_downloaded=False, assessment_at=now())
    if capture['request'] != case['request']:
        observation['error'] = 'Capture request mismatch'
    observation['search_response'] = {k: v for k, v in capture.get('parsed', {}).items() if k != 'results'}
    return evaluate(source, case, observation, {'results': capture.get('parsed', {}).get('results', [])})


def collect(source, cases, suffix='scouting'):
    adapter = source['query']['adapter']
    endpoint = ENDPOINTS[adapter]
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(endpoint)
        for case in cases:
            req = case['request']
            if req['method'] != 'GET' or req['url'] != endpoint:
                raise ValueError('Unreviewed request')
            url = request_url(req)
            body, error, parsed = b'', None, {}
            http = {'status': None, 'truncated': False, 'url': url}
            if policy is False or policy is not None and not policy.can_fetch(USER_AGENT, url):
                error = 'Unavailable/disallowing robots policy; no query sent'
            else:
                time.sleep(pacing_seconds(policy))
                http, body = request(url, 512 * 1024, {'Accept': 'application/json' if adapter == 'crossref-public' else 'application/atom+xml'})
                if http['status'] != 200 or http['truncated']:
                    error = http.get('error') or 'Non-200 or oversized metadata response'
                else:
                    try:
                        parsed = (parse_crossref if adapter == 'crossref-public' else parse_arxiv)(body)
                    except (ValueError, TypeError, KeyError, ET.ParseError) as exc:
                        error = str(exc)
            capture = {'source_id': source['id'], 'case_id': case['id'], 'observed_at': now(),
                       'request': req, 'http': http, 'robots_evidence': proof,
                       'response_sha256': hashlib.sha256(body).hexdigest(), 'parsed': parsed,
                       'error': error, 'query_verified': False}
            path = REGISTRY / 'examples' / (source['id'] + '.' + suffix + '.jsonl')
            with path.open('a') as out:
                out.write(json.dumps(capture, ensure_ascii=False, sort_keys=True) + '\n')
            print(source['id'], case['id'], http['status'], len(parsed.get('results', [])), error, flush=True)
            if suffix == 'access':
                with (REGISTRY / 'examples' / (source['id'] + '.jsonl')).open('a') as out:
                    out.write(json.dumps(assess(source, case, capture), ensure_ascii=False, sort_keys=True) + '\n')
            if policy is False or http['status'] in (401, 403, 429, 503) or http.get('error'):
                break


def probe(source, case_ids=None):
    collect(source, [c for c in source['query']['cases'] if not case_ids or c['id'] in case_ids], 'access')
