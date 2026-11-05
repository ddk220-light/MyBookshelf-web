"""Research-only title lookup in published NPTEL and Book Sprints HTML catalogs.

Only rendered catalog metadata is imported. No private API, course video, book
PDF, registration, certification or media request is made.
"""
import fcntl
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
from urllib.parse import urljoin, urlsplit

from publication_catalogs import Tree, Node
from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINTS = {'nptel-catalog': 'https://nptel.ac.in/courses',
             'booksprints-catalog': 'https://www.booksprints.net/book/'}
LIMIT = 8 * 1024 * 1024


class CatalogTree(Tree):
    def __init__(self, body):
        HTMLParser.__init__(self)
        if len(body) > LIMIT:
            raise ValueError('Published catalog exceeds metadata size cap')
        self.root = Node('root');self.stack = [self.root]
        self.feed(body.decode('utf-8'));self.close()


def one(nodes, what):
    if len(nodes) != 1:
        raise ValueError('Missing/ambiguous ' + what)
    return nodes[0]


def parse(body, adapter):
    root = CatalogTree(body).root
    rows = []
    if adapter == 'nptel-catalog':
        catalog = one(root.nodes(lambda n: n.has_class('course-list')), 'course list')
        entries = catalog.nodes(lambda n: n.has_class('course-card'))
        for card in entries:
            a = one(card.nodes(lambda n: n.tag == 'a'), 'course link')
            url = urljoin(ENDPOINTS[adapter], a.attrs.get('href', ''))
            if not re.fullmatch(r'https://nptel\.ac\.in/courses/[0-9]+', url):
                raise ValueError('Invalid native course URL')
            title = one(card.nodes(lambda n: n.has_class('name')), 'course title').text()
            department = one(card.nodes(lambda n: n.has_class('discipline')), 'discipline').text()
            meta = one(card.nodes(lambda n: n.has_class('meta-data')), 'instructor/institution')
            labels = [n.text() for n in meta.nodes(lambda n: n.tag == 'span')]
            if len(labels) != 2:
                raise ValueError('Changed instructor/institution fields')
            rows.append({'id': url.rsplit('/', 1)[1], 'title': title, 'landing_page': url,
                         'discipline': department, 'instructor': labels[0], 'institution': labels[1],
                         'semester_or_version': None, 'reading_access_verified': False})
    elif adapter == 'booksprints-catalog':
        catalog = one(root.nodes(lambda n: n.has_class('all-books__list')), 'public book sample list')
        for item in catalog.nodes(lambda n: n.tag == 'li' and n.has_class('all-books__list-item')):
            heading = one(item.nodes(lambda n: n.tag == 'h3'), 'catalog title')
            a = one(heading.nodes(lambda n: n.tag == 'a'), 'native catalog link')
            url = urljoin(ENDPOINTS[adapter], a.attrs.get('href', ''))
            p = urlsplit(url)
            if p.scheme != 'https' or p.netloc != 'www.booksprints.net' or not re.fullmatch(r'/book/[^/]+/', p.path) or p.query or p.fragment:
                raise ValueError('Invalid native book-project URL')
            organizations = item.nodes(lambda n: n.has_class('book__organization'))
            rows.append({'id': url, 'title': a.text(), 'landing_page': url,
                         'organization': one(organizations, 'organization').text(),
                         'book_types': item.attrs.get('data-book-type', '').split(),
                         'look_inside_badge': bool(item.nodes(lambda n: n.has_class('book__look-inside'))),
                         'identity_scope': 'Publisher catalog entry; may describe a series/project, not a guaranteed single edition',
                         'reading_access_verified': False})
    else:
        raise ValueError('Unsupported catalog')
    if not rows or len(rows) > 10000:
        raise ValueError('Empty or unexpectedly large catalog')
    by_id = {}
    for row in rows:
        if not row['title']:
            raise ValueError('Missing catalog title')
        by_id.setdefault(row['id'], [])
        if row not in by_id[row['id']]:
            by_id[row['id']].append(row)
    conflicts = {sid: variants for sid, variants in by_id.items() if len(variants) > 1}
    return {'results': [variants[0] for sid, variants in by_id.items() if sid not in conflicts],
            'conflicting_native_ids': conflicts, 'visible_catalog_rows': len(rows)}


def search(rows, query):
    if not isinstance(query.get('text'), str):
        raise ValueError('String search text required')
    if query.get('mode') == 'native_id':
        return [r for r in rows if r['id'] == query['text']]
    if query.get('mode') != 'title_tokens':
        raise ValueError('Only title tokens or exact native identity supported')
    terms = set(re.findall(r'\w+', query['text'].casefold()))
    return [r for r in rows if terms <= set(re.findall(r'\w+', r['title'].casefold()))] if terms else []


def assess(source, case, cap, body):
    digest = hashlib.sha256(body).hexdigest()
    obs = {'observed_at': cap['observed_at'], 'http': cap['http'], 'robots_evidence': cap['robots_evidence'],
           'response_sha256': digest, 'error': None, 'assessment_at': now(),
           'execution_mode': 'local-published-catalog-title-search', 'full_content_downloaded': False}
    results = []
    try:
        if (cap['http'].get('status') != 200 or cap['http'].get('truncated')
                or cap['http'].get('sampled_bytes_sha256') != digest
                or case['request']['url'] != cap['http']['url']
                or case['request']['url'] != ENDPOINTS[source['query']['adapter']]):
            raise ValueError('Missing/mismatched complete catalog capture')
        parsed = parse(body, source['query']['adapter'])
        rows = parsed['results']
        obs['catalog_entry_count'] = len(rows)
        obs['excluded_conflicting_native_ids'] = list(parsed['conflicting_native_ids'])
        if (case['request']['local_query'].get('mode') == 'native_id'
                and case['request']['local_query']['text'] in parsed['conflicting_native_ids']):
            raise ValueError('Requested native identity has conflicting catalog records; not an absence claim')
        results = search(rows, case['request']['local_query'])
    except (ValueError, UnicodeError, KeyError) as exc:
        obs['error'] = str(exc)
    return evaluate(source, case, obs, {'results': results})


def probe(source, case_ids=None):
    endpoint = ENDPOINTS[source['query']['adapter']]
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(endpoint);body=b''
        http = {'url': endpoint, 'status': None, 'truncated': False}
        if policy is not False and (policy is None or policy.can_fetch(USER_AGENT, endpoint)):
            time.sleep(pacing_seconds(policy));http,body=request(endpoint,LIMIT)
        cap = {'source_id': source['id'], 'observed_at': now(), 'http': http,
               'robots_evidence': proof, 'query_verified': False}
        with (REGISTRY/'examples'/(source['id']+'.catalog.jsonl')).open('a') as out:
            out.write(json.dumps(cap,sort_keys=True)+'\n')
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:continue
            row = assess(source,case,cap,body)
            with (REGISTRY/'examples'/(source['id']+'.jsonl')).open('a') as out:
                out.write(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n')
            print(source['id'],case['id'],row['verdict'],row['returned_count'],row['error'],flush=True)
