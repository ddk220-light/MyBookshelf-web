"""Search GSA's published annual FRPP summary-dataset labels, not asset rows."""
import fcntl
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.parse import urlsplit
from learning_catalogs import CatalogTree
from metadata_links import local_search
from run_source_reviews import request, robots, now, pacing_seconds
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT = 'https://www.gsa.gov/policy-regulations/policy/real-property-policy-division-overview/data-collection-and-reports/frpp-summary-report-library'


def parse(body):
    if b'</html>' not in body.lower():
        raise ValueError('Incomplete catalog')
    root = CatalogTree(body).root
    if not root.nodes(lambda n: n.tag == 'h1' and n.text() == 'FRPP Summary Report Library'):
        raise ValueError('Wrong report catalog')
    records = {}
    for a in root.nodes(lambda n: n.tag == 'a' and n.attrs.get('href')):
        url = a.attrs['href']; u = urlsplit(url); title = a.text()
        year = re.match(r'^FY (20[0-9]{2}) .*Data Set', title)
        if not year or u.scheme != 'https' or u.netloc != 'www.gsa.gov' or not u.path.startswith('/system/files/') or not u.path.lower().endswith('.xlsx') or u.query or u.fragment:
            continue
        row = {'id': url, 'title': re.sub(r'\s*\[XLSX.*$', '', title), 'fiscal_year': int(year[1]),
            'native_resource_url': url, 'landing_page': ENDPOINT, 'reading_access_verified': False,
            'identity_scope': 'Published versioned annual summary dataset URL; not a building/parcel record',
            'personal_owner_data_requested': False}
        if url in records and records[url] != row:
            raise ValueError('Conflicting annual dataset metadata')
        records[url] = row
    if not records:
        raise ValueError('No annual summary datasets')
    return list(records.values())


def assess(source, case, capture, body):
    rows = []; error = None
    try:
        h = capture['http']
        if h['status'] != 200 or h['truncated'] or h['sampled_bytes_sha256'] != hashlib.sha256(body).hexdigest():
            raise ValueError('Incomplete or mismatched catalog')
        rows = local_search(parse(body), case['request']['local_query'])
    except (KeyError, TypeError, ValueError) as exc:
        error = str(exc)
    return evaluate(source, case, {**capture, 'error': error,
        'response_sha256': hashlib.sha256(body).hexdigest(), 'full_content_downloaded': False,
        'query_execution': 'local title/native URL search over published annual summary-dataset metadata'}, {'results': rows})


def probe(source, case_ids=None):
    if source['id'] != 'gsa-frpp' or source['query']['endpoint'] != ENDPOINT:
        raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(ENDPOINT); body = b''
        cap = {'observed_at': now(), 'robots_evidence': proof, 'http': {'status': None, 'truncated': False}}
        if policy is not False and (policy is None or policy.can_fetch(USER_AGENT, ENDPOINT)):
            time.sleep(pacing_seconds(policy)); cap['http'], body = request(ENDPOINT, limit=1024*1024)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            if case['request']['method'] != 'GET' or case['request']['url'] != ENDPOINT:
                raise ValueError('Unreviewed request')
            row = assess(source, case, cap, body)
            with (REGISTRY/'examples/gsa-frpp.jsonl').open('a') as f:
                f.write(json.dumps(row, ensure_ascii=False, sort_keys=True)+'\n')
            print(case['id'], row['verdict'], row['error'], flush=True)
