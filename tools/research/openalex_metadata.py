"""Replay the registry's free OpenAlex native-work lookups, research only.

Search/bulk/content requests are deliberately outside this runner. Current provider
documentation prices singleton lookups at zero. Credentials stay in memory.
"""
import fcntl
import hashlib
import json
import os
import re
import time

from run_source_reviews import USER_AGENT, now, pacing_seconds, request, robots
from source_registry import REGISTRY, evaluate, request_url


def fetch_singleton(req, key, policy, proof):
    if req.get('method') != 'GET' or not re.fullmatch(r'https://api\.openalex\.org/works/W[0-9]+', req.get('url', '')):
        raise ValueError('Only documented zero-cost native-work singleton GETs may be replayed')
    if set(req.get('params', {})) - {'select'}:
        raise ValueError('Search/content/paging parameters are outside singleton replay')
    if not key:
        raise ValueError('Configured OPENALEX_API_KEY required; no account/key creation is performed')
    url = request_url(req)
    body = b''
    http = {'status': None, 'truncated': False}
    error, data = None, None
    observed = now()
    if policy is False or policy is not None and not policy.can_fetch(USER_AGENT, url):
        error = 'Unavailable/disallowing robots policy; no request sent'
    else:
        http, body = request(url, headers={'Accept': 'application/json', 'Authorization': 'Bearer ' + key})
        if http['status'] != 200 or http['truncated']:
            error = http.get('error') or 'Non-200 or oversized singleton response'
        else:
            try:
                data = json.loads(body)
            except ValueError:
                error = 'Response was not JSON'
    return {'observed_at': observed, 'request': req, 'http': http,
            'response_sha256': hashlib.sha256(body).hexdigest(), 'robots_evidence': proof,
            'authentication': 'Existing configured bearer key; value omitted; documented zero-cost singleton',
            'error': error}, data


def probe(source, case_ids=None):
    key = os.environ.get('OPENALEX_API_KEY')
    if not key:
        raise ValueError('Configured OPENALEX_API_KEY unavailable; no requests sent')
    with open('/tmp/mybookshelf-source-review.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots('https://api.openalex.org/works')
        pause = pacing_seconds(policy)
        time.sleep(pause)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            obs, data = fetch_singleton(case['request'], key, policy, proof)
            row = evaluate(source, case, obs, data)
            with (REGISTRY / 'examples/openalex.jsonl').open('a') as stream:
                stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n')
            print(f'openalex/{case["id"]}: {row["verdict"]} HTTP {obs["http"]["status"]}', flush=True)
            if obs['http']['status'] in (401, 403, 429, 503) or policy is False:
                break
            time.sleep(pause)
