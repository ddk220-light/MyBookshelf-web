"""Search public Bhuvan Store product metadata; no imagery or parcel data."""
import fcntl
import hashlib
import json
from pathlib import Path
import time
from urllib.parse import parse_qsl, urlencode, urlsplit
from learning_catalogs import CatalogTree
from publication_catalogs import Node
from metadata_links import local_search
from run_source_reviews import request, robots, now, pacing_seconds
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT = 'https://bhuvan-app1.nrsc.gov.in/2dresources/bhuvanstore.php'
PRODUCT = 'https://bhuvan-app3.nrsc.gov.in/data/download/index.php'


def parse(body):
    if b'</html>' not in body.lower():
        raise ValueError('Incomplete catalog')
    root = CatalogTree(body).root
    if 'Bhuvan NOEDA Data Products' not in root.text():
        raise ValueError('Wrong catalog')
    records = {}
    for tr in root.nodes(lambda n: n.tag == 'tr'):
        links = tr.nodes(lambda n: n.tag == 'a' and n.attrs.get('href', '').startswith(PRODUCT + '?'))
        if not links:
            continue
        cells = [c for c in tr.children if isinstance(c, Node) and c.tag == 'td']
        if len(cells) != 8 or len(links) != 1:
            raise ValueError('Changed product table schema')
        link = links[0]; url = link.attrs['href']; parsed = urlsplit(url)
        params = parse_qsl(parsed.query)
        if (parsed.fragment or not params or len(dict(params)) != len(params)
                or set(dict(params)) - {'c', 's', 'p', 'g'} or not {'c', 's'} <= set(dict(params))
                or any(not v for _, v in params) or not link.text()):
            raise ValueError('Missing/ambiguous native product identity')
        sid = PRODUCT + '?' + urlencode(sorted(params))
        row = {'id': sid, 'title': link.text(), 'landing_page': url,
               'native_parameters': dict(params), 'resolution': cells[2].text(),
               'availability_start': cells[3].text(), 'availability_latest': cells[4].text(),
               'frequency': cells[5].text(), 'coverage': cells[6].text(),
               'listed_file_size': cells[7].text(), 'reading_access_verified': False,
               'identity_scope': 'Native published product selector, retaining product versions; not an individual tile'}
        if sid in records and records[sid] != row:
            raise ValueError('Conflicting product metadata for native ID')
        records[sid] = row
    if not records:
        raise ValueError('No product records')
    return list(records.values())


def assess(source, case, capture, body):
    rows = []; error = None
    try:
        h = capture['http']
        if h['status'] != 200 or h['truncated'] or h['sampled_bytes_sha256'] != hashlib.sha256(body).hexdigest():
            raise ValueError('Incomplete or mismatched catalog capture')
        rows = local_search(parse(body), case['request']['local_query'])
    except (KeyError, TypeError, ValueError) as exc:
        error = str(exc)
    return evaluate(source, case, {**capture, 'error': error,
        'response_sha256': hashlib.sha256(body).hexdigest(), 'full_content_downloaded': False,
        'query_execution': 'local metadata query over one captured public product table'}, {'results': rows})


def probe(source, case_ids=None):
    if source['query']['endpoint'] != ENDPOINT or source.get('research_selection', {}).get('included') is False:
        raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(ENDPOINT); body = b''
        capture = {'observed_at': now(), 'robots_evidence': proof, 'http': {'status': None, 'truncated': False}}
        if policy is not False and (policy is None or policy.can_fetch(USER_AGENT, ENDPOINT)):
            time.sleep(pacing_seconds(policy)); capture['http'], body = request(ENDPOINT, limit=1024*1024)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            if case['request']['method'] != 'GET' or case['request']['url'] != ENDPOINT:
                raise ValueError('Unreviewed request')
            row = assess(source, case, capture, body)
            with (REGISTRY/'examples/bhuvan.jsonl').open('a') as f:
                f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], row['verdict'], row['error'], flush=True)
