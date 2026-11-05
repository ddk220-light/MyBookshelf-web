"""Bounded, policy-aware research replay of published Met native-object cases."""
import fcntl
import hashlib
import json
from pathlib import Path
import time
from urllib.parse import urlsplit

from source_registry import REGISTRY, USER_AGENT, evaluate, request_url
from run_source_reviews import now, pacing_seconds, request, robots

LOCK_PATH = Path('/tmp/mybookshelf-source-review.lock')
MAX_BYTES = 256 * 1024


def probe(source, case_ids=None):
    """Replay only saved metadata requests; never fetch image bodies or activate."""
    with LOCK_PATH.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policies = {}
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            url = request_url(case['request'])
            parsed = urlsplit(url)
            native_id = parsed.path.removeprefix('/public/collection/v1/objects/')
            if (case['request']['method'] != 'GET' or parsed.scheme != 'https'
                    or parsed.netloc != 'collectionapi.metmuseum.org'
                    or not parsed.path.startswith('/public/collection/v1/objects/')
                    or not native_id.isascii() or not native_id.isdigit()
                    or parsed.query or parsed.fragment):
                raise ValueError('Met replay is restricted to published HTTPS native-object GETs')
            if parsed.netloc not in policies:
                policies[parsed.netloc] = robots(url)
            policy, proof = policies[parsed.netloc]
            http = {'status': None, 'truncated': False}
            data, body, error = None, b'', None
            denied = policy is False or policy is not None and not policy.can_fetch(USER_AGENT, url)
            if denied:
                error = 'Robots policy unavailable or disallowing; object request not sent'
            else:
                time.sleep(max(3, source['query'].get('research_pause_seconds', 3), pacing_seconds(policy)))
                # This helper records redirects and never follows them.
                http, body = request(url, MAX_BYTES)
                if not http.get('truncated'):
                    try:
                        data = json.loads(body)
                    except (ValueError, UnicodeError):
                        error = 'Object response was not JSON'
                else:
                    error = 'Object metadata exceeded research cap'
                error = http.get('error') or error
            row = evaluate(source, case, {'observed_at': now(), 'http': http,
                           'response_sha256': hashlib.sha256(body).hexdigest(),
                           'robots_evidence': proof, 'error': error}, data)
            if isinstance(data, dict):
                row['observed_access_metadata'] = {key: data.get(key) for key in
                    ['objectID', 'title', 'isPublicDomain', 'primaryImage', 'primaryImageSmall',
                     'rightsAndReproduction', 'objectURL', 'metadataDate', 'culture', 'country', 'objectDate']}
            with (REGISTRY / 'examples' / f'{source["id"]}.jsonl').open('a') as stream:
                stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n')
            print(f'{source["id"]}/{case["id"]}: {row["verdict"]} HTTP {http["status"]}', flush=True)
            provider_error = isinstance(data, dict) and (data.get('error') or data.get('errors'))
            if denied or http['status'] != 200 or error or provider_error:
                # No blind retries, redirects or continuation after access/rate/error
                # responses. A subset mismatch alone is a metadata observation.
                break
