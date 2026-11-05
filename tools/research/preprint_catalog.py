"""bioRxiv/medRxiv documented metadata API, preserving DOI and version.

DOI/date/category are upstream filters. Keyword searches are local to a saved
metadata page and must never be described as whole-corpus keyword search.
"""
import fcntl
import hashlib
import json
from pathlib import Path
import re
import time

from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate


def parse(data, server):
    messages = data.get('messages')
    if (isinstance(messages, list) and len(messages) == 1
            and messages[0].get('status') == 'no posts found' and data.get('collection') == []):
        return {'results': [], 'messages': messages, 'explicit_empty': True}
    if not isinstance(messages, list) or not messages or messages[0].get('status') != 'ok':
        raise ValueError('Provider did not return an ok metadata collection')
    collection = data.get('collection')
    if not isinstance(collection, list):
        raise ValueError('Missing metadata collection')
    rows, seen = [], set()
    for item in collection:
        doi, version, title = item.get('doi'), str(item.get('version', '')), item.get('title')
        if (not isinstance(doi, str) or not re.fullmatch(r'10\.\d{4,9}/\S+', doi)
                or not re.fullmatch(r'[1-9]\d*', version) or not isinstance(title, str) or not title.strip()
                or str(item.get('server', '')).lower() != server):
            raise ValueError('Invalid DOI/title/server or unsupported version: ' + version)
        sid = doi + ':v' + version
        if sid in seen:
            raise ValueError('Duplicate DOI-version identity')
        seen.add(sid)
        rows.append({'id': sid, 'doi': doi, 'version': version, 'title': title,
                     'date': item.get('date'), 'license': item.get('license'),
                     'category': item.get('category'), 'server': item['server'],
                     'published_relation': item.get('published'), 'type': item.get('type'),
                     'identity_note': 'Composite DOI plus version; journal DOI is only a relation',
                     'reading_access_verified': False})
    return {'results': rows, 'messages': messages}


def search(rows, text):
    terms = set(re.findall(r'\w+', text.casefold()))
    return [r for r in rows if terms <= set(re.findall(r'\w+', r['title'].casefold()))] if terms else []


def assess(source, case, capture):
    obs = {k: capture[k] for k in ('observed_at', 'http', 'robots_evidence', 'response_sha256')}
    obs.update(error=capture.get('error'), assessment_at=now(), execution_mode='public-preprint-metadata-api',
               full_content_downloaded=False)
    if capture['request'] != case['request']:
        obs['error'] = 'Capture/request mismatch'
    return evaluate(source, case, obs, {'results': capture.get('parsed', {}).get('results', [])})


def collect(source, cases, suffix='access'):
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots('https://api.biorxiv.org/')
        for case in cases:
            req, error, parsed, body = case['request'], None, {}, b''
            url = req['url']
            pattern = r'https://api\.biorxiv\.org/details/(biorxiv|medrxiv)/(?:10\.\d{4,9}/[0-9.]+/na|\d{4}-\d{2}-\d{2}/\d{4}-\d{2}-\d{2}/\d+)/json'
            match = re.fullmatch(pattern, url)
            if req['method'] != 'GET' or not match or req.get('params'):
                raise ValueError('Unreviewed preprint request')
            http = {'url': url, 'status': None, 'truncated': False}
            if policy is False or policy is not None and not policy.can_fetch(USER_AGENT, url):
                error = 'Unavailable/disallowing robots policy; no query sent'
            else:
                time.sleep(pacing_seconds(policy))
                http, body = request(url, 512 * 1024, {'Accept': 'application/json'})
                if http['status'] != 200 or http['truncated']:
                    error = http.get('error') or 'Non-200 or oversized metadata response'
                else:
                    try:
                        parsed = parse(json.loads(body), match.group(1))
                    except (ValueError, TypeError, KeyError) as exc:
                        error = str(exc)
            cap = {'source_id': source['id'], 'observed_at': now(), 'request': req, 'case_id': case['id'],
                   'http': http, 'robots_evidence': proof, 'response_sha256': hashlib.sha256(body).hexdigest(),
                   'error': error, 'parsed': parsed, 'query_verified': False}
            # Retain a small error payload, including HTTP200 provider errors.
            if error and body:
                try:
                    payload = json.loads(body)
                    cap['provider_error'] = {'messages': payload.get('messages'),
                        'record_identities': [{k: r.get(k) for k in ('doi', 'version', 'server')}
                                              for r in payload.get('collection', [])[:30]]}
                except (ValueError, AttributeError, TypeError):
                    cap['error_excerpt'] = body.decode(errors='replace')[:300]
            with (REGISTRY / 'examples' / (source['id'] + '.' + suffix + '.jsonl')).open('a') as out:
                out.write(json.dumps(cap, ensure_ascii=False, sort_keys=True) + '\n')
            if suffix == 'access':
                with (REGISTRY / 'examples' / (source['id'] + '.jsonl')).open('a') as out:
                    out.write(json.dumps(assess(source, case, cap), ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], http['status'], len(parsed.get('results', [])), error, flush=True)
            if policy is False or http['status'] in (401, 403, 429, 503) or http.get('error'):
                break


def probe(source, case_ids=None):
    collect(source, [c for c in source['query']['cases'] if not case_ids or c['id'] in case_ids])
