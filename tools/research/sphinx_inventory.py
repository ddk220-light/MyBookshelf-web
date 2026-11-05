"""Reproducible local symbol search over an official, versioned Sphinx inventory."""
from datetime import datetime, timezone
import fcntl
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.parse import urljoin, urlsplit
import zlib

from source_registry import REGISTRY, USER_AGENT, MAX_BYTES, evaluate
from run_source_reviews import pacing_seconds, request, robots

LOCK_PATH = Path('/tmp/mybookshelf-source-review.lock')


def parse_inventory(body, base_url, expected_version, expected_project=None):
    header = body.split(b'\n', 4)
    if len(header) != 5 or header[0] != b'# Sphinx inventory version 2':
        raise ValueError('Not a Sphinx v2 inventory')
    project = header[1].decode().removeprefix('# Project: ')
    version = header[2].decode().removeprefix('# Version: ')
    if not header[1].startswith(b'# Project: ') or not header[2].startswith(b'# Version: '):
        raise ValueError('Missing inventory project/version headers')
    if expected_project is not None and project != expected_project:
        raise ValueError('Inventory project changed')
    if version != expected_version:
        raise ValueError(f'Version changed: expected {expected_version}, received {version}')
    inflater = zlib.decompressobj()
    raw = inflater.decompress(header[4], MAX_BYTES + 1)
    if len(raw) > MAX_BYTES or not inflater.eof or inflater.unused_data:
        raise ValueError('Invalid or oversized compressed inventory')
    rows, seen = [], set()
    for line in raw.decode().splitlines():
        match = re.match(r'(.+?)\s+(\S+:\S+)\s+(-?\d+)\s+(\S+)\s+(.*)', line)
        if not match:
            raise ValueError('Malformed inventory entry')
        name, kind, priority, location, display = match.groups()
        identity = kind + ':' + name
        if identity in seen:
            raise ValueError('Duplicate inventory identity: ' + identity)
        seen.add(identity)
        if location.endswith('$'):
            location = location[:-1] + name
        url = urljoin(base_url, location)
        if urlsplit(url).netloc != urlsplit(base_url).netloc or not url.startswith(base_url):
            raise ValueError('Inventory location escaped the declared documentation version')
        rows.append({'id': identity, 'title': name, 'display_name': name if display == '-' else display,
                     'kind': kind, 'project': project, 'version': version, 'landing_page': url})
    return rows


def local_search(rows, query):
    if query.get('mode') != 'exact_symbol':
        raise ValueError('This research adapter supports exact symbols only')
    if not isinstance(query.get('text'), str):
        raise ValueError('Symbol must be a string')
    return [row for row in rows if row['title'] == query['text']]


def probe(source, case_ids=None):
    with LOCK_PATH.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return _probe(source, case_ids)


def _probe(source, case_ids=None):
    # One public metadata export, then ten actual local queries; never ten invented API searches.
    contract = source['query']
    start = time.monotonic()
    body, rows, error = b'', [], None
    http = {'status': None, 'truncated': False, 'sampled_bytes_sha256': hashlib.sha256(body).hexdigest()}
    policy, proof = robots(contract['endpoint'])
    try:
        if policy is False or (policy is not None and not policy.can_fetch(USER_AGENT, contract['endpoint'])):
            raise ValueError('Unavailable or disallowing robots policy; export was not requested')
        time.sleep(max(pacing_seconds(policy), contract.get('research_pause_seconds', 3)))
        http, body = request(contract['endpoint'], MAX_BYTES)
        if http['status'] != 200 or http['truncated']:
            raise ValueError(http.get('error') or 'Metadata export failed or exceeded the size cap')
        rows = parse_inventory(body, contract['base_url'], contract['version'], contract.get('project'))
    except (OSError, ValueError, zlib.error) as exc:
        error = str(exc)
    retrieved_at = datetime.now(timezone.utc).isoformat()
    digest = hashlib.sha256(body).hexdigest()
    capture = {'source_id': source['id'], 'observed_at': retrieved_at, 'http': http,
               'request': {'method': 'GET', 'url': contract['endpoint']}, 'robots_evidence': proof,
               'error': error, 'query_verified': False,
               'outcome': 'captured' if not error else 'blocked-or-failed',
               'total_seconds': round(time.monotonic() - start, 3)}
    if http['status'] == 200 and not http['truncated']:
        inventory = REGISTRY / 'analysis/inventories' / (source['id'] + '-' + digest[:16] + '.inv')
        inventory.parent.mkdir(parents=True, exist_ok=True)
        inventory.write_bytes(body)
        capture['inventory_path'] = str(inventory.relative_to(REGISTRY))
    with (REGISTRY / 'examples' / (source['id'] + '.access.jsonl')).open('a') as stream:
        stream.write(json.dumps(capture, ensure_ascii=False, sort_keys=True) + '\n')
    for case in contract['cases']:
        if case_ids and case['id'] not in case_ids:
            continue
        result = local_search(rows, case['request']['local_query']) if not error else []
        obs = {'observed_at': datetime.now(timezone.utc).isoformat(), 'http': http,
               'response_sha256': digest, 'error': error, 'robots_evidence': proof,
               'execution_mode': 'metadata-import-failed' if error else 'metadata-import-local-search',
               'import': {'url': contract['endpoint'], 'retrieved_at': retrieved_at, 'sha256': digest,
                          'entry_count': len(rows), 'version': contract['version'],
                          'inventory_path': capture.get('inventory_path')}}
        evaluated = evaluate(source, case, obs, {'results': result})
        with (REGISTRY / 'examples' / f'{source["id"]}.jsonl').open('a') as stream:
            stream.write(json.dumps(evaluated, ensure_ascii=False, sort_keys=True) + '\n')
        print(source['id'], case['id'], evaluated['verdict'], flush=True)
