"""Validate bounded observations from the published FDA/EPA browser search UI."""
import fcntl
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import time
from urllib.parse import urlsplit, parse_qs, urljoin

from run_source_reviews import robots, pacing_seconds, now
from source_registry import REGISTRY, USER_AGENT, evaluate
from jsonl_io import read_jsonl

FDA = 'https://www.fda.gov/regulatory-information/search-fda-guidance-documents'
EPA = 'https://nepis.epa.gov/Exe/ZyNET.EXE?ZyActionL=Register&User=anonymous&Password=anonymous&Client=EPA&Init=1'


def normalize_fda(rows):
    records = []
    for row in rows:
        cells, links = row['cells'], row['links']
        if len(cells) == 1 and not links and 'No matching records' in cells[0]:
            continue
        if len(cells) != 9 or not links:
            raise ValueError('Changed FDA guidance table shape')
        identity = next((a['url'] for a in links if a['url'].startswith(FDA + '/')), None)
        if not identity or cells[5] not in ('Draft', 'Final'):
            raise ValueError('Missing native guidance identity or draft/final status')
        records.append({'id': identity, 'title': cells[0], 'landing_page': identity,
                        'issue_date': cells[2], 'organization': cells[3], 'topic': cells[4],
                        'guidance_status': cells[5], 'open_for_comment': cells[6],
                        'comment_closing_date': cells[7] or None, 'docket_number': cells[8] or None,
                        'content_links': [a['url'] for a in links if a['url'].startswith('https://www.fda.gov/media/')],
                        'reading_access_verified': False})
    if len({r['id'] for r in records}) != len(records):
        raise ValueError('Duplicate native guidance identities')
    return records


def normalize_epa(rows):
    records = []
    for row in rows:
        if not row.get('links') and row.get('text', '').strip() == 'There are no results to display, please rephrase your query.':
            continue
        links = [a for a in row['links'] if a.get('title') and a.get('url')]
        if len(links) < 2:
            raise ValueError('EPA result lacks publication number/title links')
        identity = None
        for link in links:
            url = urlsplit(urljoin(EPA, link['url']))
            match = re.fullmatch(r'/Exe/ZyNET\.exe/([A-Za-z0-9]+)\.txt', url.path, re.I)
            if url.netloc != 'nepis.epa.gov' or not match:
                raise ValueError('Unexpected EPA native document link')
            if identity and identity != match[1]:
                raise ValueError('Result links refer to different native documents')
            identity = match[1]
        tail = re.search(r'\b([0-9]{4})\s+([0-9]+) Pages?\s*$', row['text'])
        records.append({'id':'EPA-NEPIS:' + identity, 'native_document_key':identity,
                        'publication_number':links[0]['title'], 'title':links[1]['title'],
                        'landing_page':urljoin(EPA, links[1]['url']),
                        'publication_year':tail[1] if tail else None,
                        'listed_pages':int(tail[2]) if tail else None,
                        'reading_access_verified':False})
    if len({r['id'] for r in records}) != len(records):
        raise ValueError('Duplicate EPA native keys in results')
    return records


def output_hash(records):
    return hashlib.sha256(json.dumps(records, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def assess(source, case, row):
    results, error = [], None
    try:
        if row.get('outcome') != 'observed' or row.get('initial_http', {}).get('status') != 200:
            raise ValueError('Browser search did not complete successfully')
        if (row.get('source_id') != source['id'] or row.get('endpoint') != case['request']['url']
                or row.get('visible_query') != case['request']['ui_query']['text']):
            raise ValueError('Browser result does not match the source/query')
        if output_hash(row['records']) != row.get('observed_output_sha256'):
            raise ValueError('Rendered result capture hash mismatch')
        if source['id'] == 'fda-guidance':
            results = normalize_fda(row['records'])
        elif source['id'] == 'epa-nepis':
            if (row.get('search_http', {}).get('status') != 200
                    or parse_qs(urlsplit(row.get('final_url', '')).query).get('Query') != [case['request']['ui_query']['text']]):
                raise ValueError('EPA search response failed or has different query')
            results = normalize_epa(row['records'])
        else:
            raise ValueError('Unreviewed browser publication source')
    except (ValueError, KeyError, TypeError) as exc:
        error = str(exc)
    observation = {**row, 'http': {'status': row.get('initial_http', {}).get('status'),
                                 'truncated': False, 'url': row.get('final_url'),
                                 'evidence_kind': 'rendered public UI results; not an API response'},
                   'error': error, 'response_sha256': row.get('observed_output_sha256'),
                   'query_verified': not error}
    return evaluate(source, case, observation, {'results': results})


def probe(source, case_ids=None):
    endpoint = source['query']['endpoint']
    if endpoint not in (FDA, EPA):
        raise ValueError('Unreviewed browser endpoint')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(endpoint)
        routes = [endpoint, *source['query'].get('published_browser_search_urls', [])]
        allowed = policy is not False and (policy is None or all(policy.can_fetch(USER_AGENT, url) for url in routes))
        capture = {'source_id':source['id'], 'observed_at':now(), 'robots_evidence':proof,
                   'request':{'method':'GET','url':endpoint}, 'outcome':'allowed-preflight' if allowed else 'skipped',
                   'query_verified':False}
        with (REGISTRY/'examples'/f'{source["id"]}.access.jsonl').open('a') as f:
            f.write(json.dumps(capture,ensure_ascii=False,sort_keys=True)+'\n')
        if not allowed:
            raise ValueError('Unavailable or disallowing policy; browser not launched')
        time.sleep(pacing_seconds(policy))
        cases=[c for c in source['query']['cases'] if not case_ids or c['id'] in case_ids]
        start=now()
        subprocess.run(['node',str(Path(__file__).with_suffix('.cjs')),source['id'],
                        *[c['request']['ui_query']['text'] for c in cases]],check=True,env=os.environ)
        rows=read_jsonl(REGISTRY/'examples'/f'{source["id"]}.browser.jsonl')
        for case in cases:
            matches=[r for r in rows if r.get('observed_at','') >= start and r.get('query')==case['request']['ui_query']['text']]
            if not matches:
                continue
            result=assess(source,case,matches[-1]);result['robots_evidence']=proof
            with (REGISTRY/'examples'/f'{source["id"]}.jsonl').open('a') as f:
                f.write(json.dumps(result,ensure_ascii=False,sort_keys=True)+'\n')
