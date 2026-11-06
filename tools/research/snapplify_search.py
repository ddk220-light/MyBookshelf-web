"""Anonymous public shop title queries, restricted to available zero-price metadata."""
import fcntl
import hashlib
import json
import re
import time
import unicodedata
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT = 'https://shop.snapplify.com/search'
MARKER = re.compile(r'realmCommerceApp\.value\(\s*"searchData"\s*,\s*')


def tokens(text):
    return set(re.findall(r'\w+', unicodedata.normalize('NFKC', text).casefold()))


def query_title(url):
    u = urlsplit(url)
    params = parse_qs(u.query, keep_blank_values=True)
    if (u.scheme + '://' + u.netloc + u.path != ENDPOINT or u.fragment or
            set(params) not in ({'term'}, {'term', 'modifiers'}) or len(params['term']) != 1 or
            not 1 <= len(params['term'][0]) <= 200 or not tokens(params['term'][0])):
        raise ValueError('Unreviewed public search form request')
    if 'modifiers' in params and (len(params['modifiers']) != 1 or json.loads(params['modifiers'][0]) != {'publisher': 'Book Dash'}):
        raise ValueError('Unreviewed publisher facet')
    return params['term'][0]


def search_data(body):
    if not isinstance(body, bytes) or len(body) > 512 * 1024:
        raise ValueError('Unbounded search page')
    text = body.decode('utf-8')
    matches = list(MARKER.finditer(text))
    if len(matches) != 1 or '</html>' not in text.lower():
        raise ValueError('Missing/ambiguous/incomplete public search data')
    tail = text[matches[0].end():]
    data, end = json.JSONDecoder().raw_decode(tail)
    if not tail[end:].lstrip().startswith(');'):
        raise ValueError('Search data is not a literal JSON value')
    if (not isinstance(data.get('items'), list) or len(data['items']) > 10 or
            not isinstance(data.get('total'), int) or data['total'] < 0 or data.get('page') != 0 or
            data.get('size') != 10):
        raise ValueError('Unreviewed page size/shape')
    return data


def zero_price(value):
    if isinstance(value, bool) or value is None:
        return False
    try:
        number = Decimal(str(value))
        return number.is_finite() and number == 0
    except InvalidOperation:
        return False


def parse(body, title, publisher=None):
    data = search_data(body)
    if data.get('term') != title:
        raise ValueError('Search response did not echo the requested term')
    if publisher is not None and data.get('modifiers') != {'publisher': publisher}:
        raise ValueError('Publisher facet was not echoed')
    rows = []
    seen = set()
    excluded = {'nonmatching_title': 0, 'not_zero_price': 0, 'not_available': 0}
    for item in data['items']:
        native = item.get('entity_id')
        name = item.get('title')
        path = item.get('url', '')
        if (not isinstance(native, str) or not re.fullmatch(r'[0-9]+', native) or
                not isinstance(name, str) or not name.strip() or
                not isinstance(path, str) or not re.fullmatch(r'/product/[A-Za-z0-9_-]+', path)):
            raise ValueError('Missing/invalid product identity or title')
        if native in seen:
            raise ValueError('Duplicate product identity on page')
        seen.add(native)
        if publisher is not None and item.get('publisher') != publisher:
            raise ValueError('Publisher filter was not satisfied')
        if not tokens(title) <= tokens(name):
            excluded['nonmatching_title'] += 1
            continue
        if not zero_price(item.get('price')) or not zero_price(item.get('gross')):
            excluded['not_zero_price'] += 1
            continue
        if item.get('availableInCountry') is not True or item.get('canAddToCart') is not True:
            excluded['not_available'] += 1
            continue
        rows.append({'id': 'snapplify:' + native, 'title': name, 'native_product_id': native,
                     'reference_code': item.get('reference_code'), 'reference_code_is_validated_isbn': False,
                     'publisher': item.get('publisher'), 'language_label': item.get('product_language'),
                     'format': item.get('format'), 'edition': item.get('edition'),
                     'publication_date': item.get('publication_date'),
                     'display_price': item.get('displayGrossPrice'), 'observed_price': 0,
                     'availability_scope': 'Provider response in this anonymous session; territorial scope not inferred',
                     'landing_page': 'https://shop.snapplify.com' + path,
                     'reading_access_verified': False, 'checkout_performed': False})
    return rows, {'provider_total': data['total'], 'provider_page': data['page'],
                  'provider_page_size': data['size'], 'provider_returned': len(data['items']),
                  'filtered_count': len(rows), 'excluded': excluded,
                  'absence_scope': 'Filtered first page only; not proof of catalog-wide absence'}


def assess(source, case, capture, body):
    error = capture.get('error')
    rows, summary = [], {}
    try:
        title = query_title(case['request']['url'])
        h = capture['http']
        if error or h['status'] != 200 or h['truncated']:
            raise ValueError(error or 'Failed/incomplete search response')
        if hashlib.sha256(body).hexdigest() != h['sampled_bytes_sha256']:
            raise ValueError('Mismatched response hash')
        publisher = 'Book Dash' if 'modifiers' in parse_qs(urlsplit(case['request']['url']).query) else None
        rows, summary = parse(body, title, publisher)
    except (KeyError, TypeError, ValueError) as exc:
        error = str(exc)
    return evaluate(source, case, {**capture, 'error': error, 'query_summary': summary,
        'response_sha256': hashlib.sha256(body).hexdigest(), 'full_content_downloaded': False,
        'query_execution': 'Public GET search form, literal title-token relevance and available zero-price postfilters'}, {'results': rows})


def probe(source, case_ids=None):
    if source['id'] != 'snapplify' or source['query']['endpoint'] != ENDPOINT:
        raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(ENDPOINT)
        stop = None
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            if case['request']['method'] != 'GET':
                raise ValueError('Unreviewed method')
            query_title(case['request']['url'])
            body = b''
            cap = {'observed_at': now(), 'robots_evidence': proof, 'http': {'status': None, 'truncated': False}}
            if stop or policy is False or policy is not None and not all(policy.can_fetch(a, case['request']['url']) for a in [USER_AGENT, 'ChatGPT-User', 'OAI-SearchBot']):
                cap['error'] = stop or 'Policy unavailable/disallowing'
            else:
                time.sleep(pacing_seconds(policy))
                cap['http'], body = request(case['request']['url'], limit=512 * 1024)
                if cap['http']['status'] != 200 or any(x in body.lower() for x in [b'<title>just a moment', b'verify you are human']):
                    stop = 'Provider access failure/challenge; wait for recovery'
                    cap['error'] = stop
            obs = assess(source, case, cap, body)
            with (REGISTRY / 'examples/snapplify.jsonl').open('a') as f:
                f.write(json.dumps(obs, ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], obs['verdict'], obs['error'], flush=True)
