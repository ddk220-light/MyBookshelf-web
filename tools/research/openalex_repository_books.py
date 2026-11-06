"""Scoped DOAB/OAPEN title queries through the documented OpenAlex location index.

Native repository records remain distinct from OpenAlex works and from each other.
No repository, PDF, reader or export-challenge requests are made.
"""
import fcntl
import hashlib
import html
import json
import os
import re
import time
import unicodedata
from urllib.parse import urlsplit

from run_source_reviews import robots, request, pacing_seconds, now
from source_registry import REGISTRY, USER_AGENT, evaluate, request_url

ENDPOINT = 'https://api.openalex.org/locations'
SELECT = 'id,title,source_id,source_name,work_id,native_id,native_id_namespace,provenance,landing_page_url,pdf_url,is_oa,version,license,language,type'
SOURCES = {'doab': 'S4306400539', 'oapen': 'S4306402535'}
NATIVE = {'doab': r'oai:doab-books:\d+',
          'oapen': r'oai:(?:oapen:\d+|library\.oapen\.org:20\.500\.12657/\d+)'}


def tokens(value):
    return re.findall(r'[^\W_]+', unicodedata.normalize('NFKC', value).casefold())


def validate_request(source_id, req):
    if source_id not in SOURCES or req.get('method') != 'GET' or req.get('url') != ENDPOINT or set(req) - {'method', 'url', 'params'}:
        raise ValueError('Unreviewed repository request')
    p = req.get('params', {})
    if (set(p) != {'filter', 'search', 'select', 'per_page', 'page'}
            or p['filter'] != 'source_id:'+SOURCES[source_id]+',type:book,is_oa:true'
            or p['select'] != SELECT or p['per_page'] != 5 or p['page'] not in (1, 2)
            or not isinstance(p['search'], str) or not 0 < len(p['search']) <= 180
            or not tokens(p['search']) or any(c in p['search'] for c in ['"', '\n', '\r'])):
        raise ValueError('Unreviewed title/filter/page parameters')


def normalize(source_id, data, query):
    if not isinstance(data, dict) or not isinstance(data.get('results'), list) or len(data['results']) > 5:
        raise ValueError('Missing/oversized location results')
    records, rejected, identities = [], [], set()
    for item in data['results']:
        native, title = item.get('native_id'), item.get('title')
        if not (isinstance(native, str) and re.fullmatch(NATIVE[source_id], native)
                and item.get('id') == 'pmh:'+native and item.get('native_id_namespace') == 'pmh'
                and item.get('source_id') == 'https://openalex.org/'+SOURCES[source_id]
                and item.get('provenance') in ('repo', 'repo_backfill')
                and item.get('type') == 'book' and item.get('is_oa') is True
                and isinstance(title, str) and title.strip()
                and re.fullmatch(r'https://openalex.org/W\d+', item.get('work_id') or '')):
            rejected.append({'location_id': item.get('id'), 'reason': 'Missing/mismatched repository identity, book type or OA flag'})
            continue
        if native in identities:
            raise ValueError('Duplicate native repository identity in one response')
        identities.add(native)
        if not all(word in tokens(title) for word in tokens(query)):
            rejected.append({'native_id': native, 'reason': 'Returned title does not contain all literal query tokens'})
            continue
        original_link = item.get('landing_page_url')
        link = html.unescape(original_link) if isinstance(original_link, str) else ''
        u = urlsplit(link)
        if u.scheme not in ('http', 'https') or not u.netloc or u.username or u.password or any(c in link for c in ['\n', '\r']):
            rejected.append({'native_id': native, 'reason': 'Missing or unsafe published landing link'})
            continue
        records.append({'id': native, 'title': title, 'type': 'book', 'landing_page': link,
            'published_landing_page': original_link, 'location_id': item['id'], 'openalex_work_id': item['work_id'],
            'openalex_source_id': item['source_id'], 'native_id_namespace': 'pmh',
            'provenance': item['provenance'], 'reported_open_access': item['is_oa'],
            'reported_version': item.get('version'), 'reported_license': item.get('license'),
            'language': item.get('language'), 'reading_access_verified': False})
    return records, rejected


def assess(source, case, cap, data):
    error, rows, rejected = cap.get('error'), [], []
    try:
        validate_request(source['id'], case['request'])
        if error or cap['http']['status'] != 200 or cap['http']['truncated']:
            raise ValueError(error or 'Unsuccessful/incomplete index response')
        rows, rejected = normalize(source['id'], data, case['request']['params']['search'])
    except (KeyError, TypeError, ValueError) as exc:
        error = str(exc)
    return evaluate(source, case, {**cap, 'error': error, 'excluded_results': rejected,
        'upstream_count': data.get('meta', {}).get('count') if isinstance(data, dict) else None,
        'full_content_downloaded': False, 'query_execution': 'Live repository-filtered OpenAlex location title search, first5 rows filtered to literal title tokens'}, {'results': rows})


def permitted(policy, url):
    return policy is not False and (policy is None or all(policy.can_fetch(a, url) for a in [USER_AGENT, 'ChatGPT-User', 'OAI-SearchBot']))


def fetch(req, key, policy, proof):
    url = request_url(req)
    cap = {'observed_at': now(), 'http': {'status': None, 'truncated': False},
           'robots_evidence': proof, 'authentication': 'Existing configured bearer key; credential omitted'}
    if not key or not permitted(policy, url):
        cap['error'] = 'Missing existing key or unavailable/disallowing policy; no request sent'
        return cap, None
    time.sleep(pacing_seconds(policy))
    cap['http'], body = request(url, headers={'Authorization': 'Bearer '+key, 'Accept': 'application/json'}, limit=1024*1024)
    cap['response_sha256'] = hashlib.sha256(body).hexdigest()
    data = None
    if cap['http']['status'] == 200 and not cap['http']['truncated']:
        try:
            data = json.loads(body)
        except ValueError:
            cap['error'] = 'Invalid JSON'
    else:
        cap['error'] = cap['http'].get('error') or 'Non-200/oversized response'
    return cap, data


def budget_ok(data, requests):
    # Unknown price/allowance fails closed. No prepaid spend or plan changes.
    try:
        budget = data['rate_limit']
        price = budget['endpoint_costs_usd']['search']
        return (budget['prepaid_balance_usd'] == 0 and 0 <= price <= 0.001
                and budget['daily_remaining_usd'] >= requests * price + 0.01)
    except (KeyError, TypeError):
        return False


def probe(source, case_ids=None):
    sid = source['id']
    cases = [c for c in source['query']['cases'] if not case_ids or c['id'] in case_ids]
    for case in cases:
        validate_request(sid, case['request'])
    key = os.environ.get('OPENALEX_API_KEY')
    if not key:
        raise ValueError('Existing key unavailable; no account creation')
    with open('/tmp/mybookshelf-source-review.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(ENDPOINT)
        cap, budget = fetch({'method':'GET','url':'https://api.openalex.org/rate-limit'}, key, policy, proof)
        safe = {k:v for k,v in (budget or {}).get('rate_limit',{}).items() if k in ('daily_budget_usd','daily_remaining_usd','daily_used_usd','prepaid_balance_usd','endpoint_costs_usd')}
        allowed = not cap.get('error') and budget_ok(budget, len(cases))
        with (REGISTRY / 'examples' / (sid+'.budget.jsonl')).open('a') as f:
            f.write(json.dumps({**cap, 'source_id':sid,'budget':safe,'queries_permitted':allowed},sort_keys=True)+'\n')
        if not allowed:
            raise ValueError('Free allowance/policy not verified; no title query sent')
        for case in cases:
            cap, data = fetch(case['request'], key, policy, proof)
            result = assess(source, case, cap, data)
            with (REGISTRY / 'examples' / (sid+'.jsonl')).open('a') as f:
                f.write(json.dumps(result,ensure_ascii=False,sort_keys=True)+'\n')
            print(sid,case['id'],result['verdict'],result['error'],flush=True)
            if cap.get('error'):
                break
