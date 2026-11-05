"""Research validation for LibreTexts Commons' published anonymous Books UI."""
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import urlsplit, parse_qs

from browser_publications import output_hash
from jsonl_io import read_jsonl
from run_source_reviews import robots, pacing_seconds, now
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT = 'https://commons.libretexts.org/'


def normalize(rows):
    results = []
    for row in rows:
        url = urlsplit(row['url'])
        match = re.fullmatch(r'/book/([a-z][a-z0-9]*-[0-9]+)', url.path)
        if url.scheme != 'https' or url.netloc != 'commons.libretexts.org' or not match or url.query or url.fragment or not row['title'].strip():
            raise ValueError('Unexpected native Commons book identity/title')
        results.append({'id':match[1], 'title':row['title'].strip(), 'landing_page':row['url'],
                        'native_library_and_page_id':match[1], 'edition_or_version':None,
                        'reading_access_verified':False})
    if len({r['id'] for r in results}) != len(results):
        raise ValueError('Duplicate Commons book identities')
    return results


def assess(source, case, row):
    results, error = [], None
    try:
        query = case['request']['ui_query']['text']
        if row.get('outcome') != 'observed' or row.get('initial_http', {}).get('status') != 200:
            raise ValueError('Browser search did not complete successfully')
        if (row.get('source_id') != 'libretexts' or row.get('endpoint') != ENDPOINT
                or case['request']['url'] != ENDPOINT or row.get('visible_query') != query
                or not (row.get('selected_tab', '').startswith('Books') if 'selected_tab' in row
                        else re.search(r'^\d+ results found in Books$', row.get('body_text', ''), re.M))
                or urlsplit(row.get('final_url', '')).scheme != 'https'
                or urlsplit(row.get('final_url', '')).netloc != 'commons.libretexts.org'
                or parse_qs(urlsplit(row.get('final_url', '')).query).get('search') != [query]):
            raise ValueError('Browser result/source/query mismatch')
        if output_hash(row['records']) != row.get('observed_output_sha256'):
            raise ValueError('Rendered result capture hash mismatch')
        results = normalize(row['records'])
        # A URL/input echo alone must not qualify old DOM results left on screen.
        terms = set(re.findall(r'\w+', query.casefold()))
        matches = [r for r in results if r['id'] in case['expected_ids']]
        if not terms or any(not terms <= set(re.findall(r'\w+', r['title'].casefold())) for r in matches):
            raise ValueError('Expected record lacks query-title relevance')
    except (ValueError, KeyError, TypeError) as exc:
        error = str(exc)
    obs = {**row, 'http':{'status':row.get('initial_http', {}).get('status'), 'truncated':False,
                         'url':row.get('final_url'), 'evidence_kind':'rendered public Books search UI'},
           'error':error, 'response_sha256':row.get('observed_output_sha256')}
    return evaluate(source, case, obs, {'results':results})


def probe(source, case_ids=None):
    if source['query']['endpoint'] != ENDPOINT:
        raise ValueError('Unreviewed Commons endpoint')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(ENDPOINT)
        allowed = policy is not False and (policy is None or policy.can_fetch(USER_AGENT, ENDPOINT))
        with (REGISTRY/'examples/libretexts.access.jsonl').open('a') as out:
            out.write(json.dumps({'source_id':'libretexts','observed_at':now(),'robots_evidence':proof,
                                  'outcome':'allowed-preflight' if allowed else 'skipped','query_verified':False})+'\n')
        if not allowed:
            raise ValueError('Unavailable/disallowing robots policy; browser not launched')
        time.sleep(pacing_seconds(policy))
        cases=[c for c in source['query']['cases'] if not case_ids or c['id'] in case_ids]
        start=now()
        subprocess.run(['node',str(Path(__file__).with_suffix('.cjs')),
                        *[c['request']['ui_query']['text'] for c in cases]],check=True,env=os.environ)
        rows=read_jsonl(REGISTRY/'examples/libretexts.browser.jsonl')
        for case in cases:
            found=[r for r in rows if r.get('observed_at','') >= start and r.get('query') == case['request']['ui_query']['text']]
            if found:
                row=assess(source,case,found[-1]);row['robots_evidence']=proof
                with (REGISTRY/'examples/libretexts.jsonl').open('a') as out:
                    out.write(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n')
