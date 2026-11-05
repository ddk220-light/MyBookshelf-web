"""Reproducible local symbol search over an official, versioned Sphinx inventory."""
from datetime import datetime, timezone
import hashlib
import json
import re
import time
import urllib.error
import urllib.request
from urllib.parse import urljoin, urlsplit
import zlib

from source_registry import REGISTRY, USER_AGENT, MAX_BYTES, evaluate


def parse_inventory(body, base_url, expected_version):
    header = body.split(b'\n', 4)
    if len(header) != 5 or header[0] != b'# Sphinx inventory version 2':
        raise ValueError('Not a Sphinx v2 inventory')
    project = header[1].decode().removeprefix('# Project: ')
    version = header[2].decode().removeprefix('# Version: ')
    if version != expected_version:
        raise ValueError(f'Version changed: expected {expected_version}, received {version}')
    inflater = zlib.decompressobj()
    raw = inflater.decompress(header[4], MAX_BYTES + 1)
    if len(raw) > MAX_BYTES or not inflater.eof or inflater.unused_data:
        raise ValueError('Invalid or oversized compressed inventory')
    rows = []
    for line in raw.decode().splitlines():
        match = re.match(r'(.+?)\s+(\S+:\S+)\s+(-?\d+)\s+(\S+)\s+(.*)', line)
        if not match:
            raise ValueError('Malformed inventory entry')
        name, kind, priority, location, display = match.groups()
        if location.endswith('$'):
            location = location[:-1] + name
        url = urljoin(base_url, location)
        if urlsplit(url).netloc != urlsplit(base_url).netloc or not url.startswith(base_url):
            raise ValueError('Inventory location escaped the declared documentation version')
        rows.append({'id': kind + ':' + name, 'title': name, 'display_name': name if display == '-' else display,
                     'kind': kind, 'project': project, 'version': version, 'landing_page': url})
    return rows


def local_search(rows, query):
    if query['mode'] != 'exact_symbol':
        raise ValueError('This research adapter supports exact symbols only')
    return [row for row in rows if row['title'] == query['text']]


def probe(source, case_ids=None):
    # One public metadata export, then ten actual local queries; never ten invented API searches.
    contract = source['query']
    req = urllib.request.Request(contract['endpoint'], headers={'User-Agent': USER_AGENT})
    start = time.monotonic()
    body, rows, error = b'', [], None
    http = {'status': None, 'content_type': None, 'final_url': contract['endpoint']}
    try:
        try:
            response = urllib.request.urlopen(req, timeout=35)
        except urllib.error.HTTPError as exc:
            response = exc
        with response:
            body = response.read(MAX_BYTES + 1)
            http.update(status=response.status, content_type=response.headers.get('Content-Type'), final_url=response.url)
        if http['status'] != 200 or len(body) > MAX_BYTES:
            raise ValueError('Metadata export failed or exceeded the size cap')
        rows = parse_inventory(body, contract['base_url'], contract['version'])
    except (OSError, ValueError, zlib.error) as exc:
        error = str(exc)
    http.update(bytes=len(body), seconds=round(time.monotonic() - start, 3), truncated=len(body) > MAX_BYTES)
    retrieved_at = datetime.now(timezone.utc).isoformat()
    digest = hashlib.sha256(body).hexdigest()
    for case in contract['cases']:
        if case_ids and case['id'] not in case_ids:
            continue
        result = local_search(rows, case['request']['local_query']) if not error else []
        obs = {'observed_at': datetime.now(timezone.utc).isoformat(), 'http': http,
               'response_sha256': digest, 'error': error,
               'execution_mode': 'metadata-import-failed' if error else 'metadata-import-local-search',
               'import': {'url': contract['endpoint'], 'retrieved_at': retrieved_at, 'sha256': digest,
                          'entry_count': len(rows), 'version': contract['version']}}
        evaluated = evaluate(source, case, obs, {'results': result})
        with (REGISTRY / 'examples' / f'{source["id"]}.jsonl').open('a') as stream:
            stream.write(json.dumps(evaluated, ensure_ascii=False, sort_keys=True) + '\n')
        print(source['id'], case['id'], evaluated['verdict'], flush=True)
