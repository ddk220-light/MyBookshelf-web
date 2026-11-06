"""Public OpenStax math catalog browser capture and local metadata queries."""
import fcntl
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import time
from urllib.parse import urlsplit

from metadata_links import local_search
from run_source_reviews import robots, now, pacing_seconds
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT = 'https://openstax.org/subjects'
CATALOG = ENDPOINT + '/math'


def parse(capture):
    if (capture.get('outcome') != 'observed' or capture.get('http_status') != 200
            or capture.get('catalog_url') != CATALOG):
        raise ValueError('Missing successful catalog capture')
    raw = json.dumps(capture['links'], ensure_ascii=False, separators=(',', ':')).encode()
    if hashlib.sha256(raw).hexdigest() != capture['observed_output_sha256']:
        raise ValueError('Mismatched browser metadata hash')
    records = {}
    for link in capture['links']:
        p = urlsplit(link['url'])
        if p.query or p.fragment or not re.fullmatch(r'/details/books/[a-z0-9-]+', p.path):
            continue
        if p.scheme != 'https' or p.netloc != 'openstax.org' or not link['title'].strip():
            raise ValueError('Invalid native textbook link')
        sid = p.path.rsplit('/', 1)[1]
        row = {'id': sid, 'title': link['title'], 'landing_page': link['url'],
               'identity_scope': 'Native book slug preserves edition, volume and corequisite variant',
               'reading_access_verified': False}
        if sid in records and records[sid] != row:
            raise ValueError('Conflicting native book title')
        records[sid] = row
    if not records:
        raise ValueError('No textbook title metadata')
    return list(records.values())


def probe(source, case_ids=None):
    if source['query']['endpoint'] != ENDPOINT or source.get('research_selection', {}).get('included') is False:
        raise ValueError('Unreviewed or excluded source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        p, proof = robots(ENDPOINT); capture = {'observed_at': now(), 'outcome': 'skipped', 'error': 'Policy unavailable/disallowing'}
        if p is not False and (p is None or all(p.can_fetch(USER_AGENT, u) for u in (ENDPOINT, CATALOG))):
            time.sleep(pacing_seconds(p))
            with tempfile.TemporaryDirectory(prefix='openstax-metadata-') as tmp:
                output = Path(tmp) / 'capture.json'
                subprocess.run(['node', str(Path(__file__).with_name('openstax_browser.cjs')), str(output)], check=True, timeout=130)
                capture = json.loads(output.read_text())
        capture['robots_evidence'] = proof
        with (REGISTRY / 'examples/openstax.browser.jsonl').open('a') as f:
            f.write(json.dumps(capture, ensure_ascii=False, sort_keys=True) + '\n')
        error = None; records = []
        try:
            records = parse(capture)
        except (ValueError, KeyError, TypeError) as e:
            error = str(e)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            if case['request']['url'] != ENDPOINT or case['request']['method'] != 'GET':
                raise ValueError('Unexpected catalog request')
            rows = local_search(records, case['request']['local_query']) if not error else []
            obs = evaluate(source, case, {'observed_at': capture['observed_at'],
                'http': {'status': capture.get('http_status'), 'truncated': False},
                'response_sha256': capture.get('observed_output_sha256', hashlib.sha256(b'').hexdigest()),
                'error': error, 'robots_evidence': proof, 'browser_evidence': 'examples/openstax.browser.jsonl',
                'full_content_downloaded': False, 'catalog_record_count': len(records)}, {'results': rows})
            with (REGISTRY / 'examples/openstax.jsonl').open('a') as f:
                f.write(json.dumps(obs, ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], obs['verdict'], obs['error'], flush=True)
