"""Research queries of FAO's publicly linked OpenSearch Atom endpoint.

The published service descriptor points at a broken404 URL. The actual public
Atom link works. Its broad metadata search can be noisy; native IDs and titles
must be reviewed, not equated with relevant results just because HTTP succeeds.
"""
import fcntl
import hashlib
import json
from pathlib import Path
import time
from urllib.parse import urlsplit, unquote_plus
import xml.etree.ElementTree as ET

from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate, request_url

ENDPOINT = 'https://openknowledge.fao.org/server/opensearch/search'
A = '{http://www.w3.org/2005/Atom}'
O = '{http://a9.com/-/spec/opensearch/1.1/}'


def parse(body, query):
    if len(body) > 512 * 1024 or b'<!DOCTYPE' in body.upper() or b'<!ENTITY' in body.upper():
        raise ValueError('Unexpected XML size/entities')
    root = ET.fromstring(body)
    echoed = root.find(O + 'Query')
    # This provider percent/form-encodes searchTerms inside the XML attribute.
    # Decode exactly once; preserve rejection of a different or doubly encoded query.
    if (root.tag != A + 'feed' or echoed is None
            or unquote_plus(echoed.get('searchTerms', '')) != query):
        raise ValueError('Missing Atom query echo')
    rows, seen = [], set()
    for entry in root.findall(A + 'entry'):
        sid, title = entry.findtext(A + 'id'), entry.findtext(A + 'title')
        p = urlsplit(sid or '')
        if (p.scheme != 'https' or p.netloc != 'openknowledge.fao.org' or not p.path.startswith('/handle/')
                or p.query or p.fragment or not title or sid in seen):
            raise ValueError('Invalid/duplicate native handle or missing title')
        seen.add(sid)
        rows.append({'id': sid, 'title': title, 'landing_page': sid,
                     'published': entry.findtext(A + 'published'), 'metadata_updated': entry.findtext(A + 'updated'),
                     'reading_access_verified': False})
    return {'results': rows, 'total_results': int(root.findtext(O + 'totalResults')),
            'start_index': int(root.findtext(O + 'startIndex')),
            'query_echo': echoed.attrib}


def assess(source, case, capture):
    obs = {k: capture[k] for k in ('observed_at', 'http', 'robots_evidence', 'response_sha256', 'error')}
    obs.update(execution_mode='published-Atom-metadata-query', full_content_downloaded=False,
               search_response={k: v for k, v in capture.get('parsed', {}).items() if k != 'results'})
    if case['request'] != capture['request']:
        obs['error'] = 'Capture request mismatch'
    return evaluate(source, case, obs, {'results': capture.get('parsed', {}).get('results', [])})


def collect(source, cases, suffix='scouting'):
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(ENDPOINT)
        for case in cases:
            req = case['request'];params = req.get('params', {})
            if (req['method'] != 'GET' or req['url'] != ENDPOINT or params.get('format') != 'atom'
                    or not isinstance(params.get('query'), str)
                    or set(params) - {'format', 'query', 'start', 'rpp'}
                    or not 1 <= int(params.get('rpp', 10)) <= 10):
                raise ValueError('Unreviewed Atom query')
            url = request_url(req);body=b'';parsed={};error=None
            http = {'url': url, 'status': None, 'truncated': False}
            if policy is False or policy is not None and not policy.can_fetch(USER_AGENT, url):
                error = 'Unavailable/disallowing policy; no query sent'
            else:
                time.sleep(pacing_seconds(policy))
                http, body = request(url, 512 * 1024, {'Accept': 'application/atom+xml'})
                if http['status'] != 200 or http['truncated']:
                    error = http.get('error') or 'Non-200 or oversized feed'
                else:
                    try:
                        parsed = parse(body, params['query'])
                        if len(parsed['results']) > int(params.get('rpp', 10)):
                            raise ValueError('Provider ignored page-size bound')
                    except (ValueError, TypeError, KeyError, ET.ParseError) as exc:
                        error = str(exc)
            cap = {'source_id': source['id'], 'case_id': case['id'], 'observed_at': now(), 'request': req,
                   'http': http, 'robots_evidence': proof, 'response_sha256': hashlib.sha256(body).hexdigest(),
                   'error': error, 'parsed': parsed, 'query_verified': False}
            with (REGISTRY / 'examples' / (source['id'] + '.' + suffix + '.jsonl')).open('a') as out:
                out.write(json.dumps(cap, ensure_ascii=False, sort_keys=True) + '\n')
            if suffix == 'access':
                with (REGISTRY / 'examples' / (source['id'] + '.jsonl')).open('a') as out:
                    out.write(json.dumps(assess(source, case, cap), ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], http['status'], len(parsed.get('results', [])), error, flush=True)
            if policy is False or http['status'] in (401, 403, 429, 503) or http.get('error'):
                break


def probe(source, case_ids=None):
    collect(source, [c for c in source['query']['cases'] if not case_ids or c['id'] in case_ids], 'access')
