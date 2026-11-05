"""Research-only OSHA public search and FAA handbook metadata queries.

Only published forms/catalog tables are used. No PDFs, print orders, private APIs,
account data or runtime imports. Result URLs preserve language/edition/addenda.
"""
import fcntl
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
from urllib.parse import urlencode, urljoin, urlsplit, parse_qs

from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate

OSHA = 'https://www.osha.gov/publications/publication-products'
FAA = 'https://www.faa.gov/regulations_policies/handbooks_manuals/aviation'
MAX_BYTES = 512 * 1024
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}


class Node:
    def __init__(self, tag, attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def nodes(self, predicate):
        result = []
        for child in self.children:
            if isinstance(child, Node):
                if predicate(child):
                    result.append(child)
                result.extend(child.nodes(predicate))
        return result

    def text(self):
        return ' '.join(' '.join(c.text() if isinstance(c, Node) else c for c in self.children).split())

    def has_class(self, name):
        return name in self.attrs.get('class', '').split()


class Tree(HTMLParser):
    def __init__(self, body):
        super().__init__()
        if len(body) > MAX_BYTES:
            raise ValueError('Metadata response exceeds research cap')
        self.root = Node('root')
        self.stack = [self.root]
        self.feed(body.decode('utf-8'))
        self.close()

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                self.stack = self.stack[:i]
                break

    def handle_data(self, data):
        if self.stack[-1].tag not in ('script', 'style'):
            self.stack[-1].children.append(data)


def native_url(href, base):
    url = urljoin(base, href)
    p = urlsplit(url)
    if (p.scheme != 'https' or p.netloc != urlsplit(base).netloc or p.query
            or (p.fragment and not (base == OSHA and re.fullmatch(r'page=[1-9][0-9]*', p.fragment)))):
        raise ValueError('Missing or foreign publication identity')
    if not href or p.path == '/':
        raise ValueError('Missing publication link')
    return url


def unique(rows):
    out = {}
    for row in rows:
        if row['id'] in out and row != out[row['id']]:
            raise ValueError('Conflicting publication metadata for one native URL')
        out[row['id']] = row
    if len(out) > 1000:
        raise ValueError('Publication catalog exceeds bounded scope')
    return list(out.values())


def parse_osha(body, query):
    root = Tree(body).root
    views = root.nodes(lambda n: n.has_class('view-publication-products'))
    if len(views) != 1:
        raise ValueError('Missing or ambiguous OSHA search view')
    view = views[0]
    forms = view.nodes(lambda n: n.tag == 'form' and n.attrs.get('method', '').lower() == 'get'
                       and urljoin(OSHA, n.attrs.get('action', '')) == OSHA)
    if not forms or not any(n.attrs.get('name') == 'publication_title' and n.attrs.get('value', '') == query
                            for f in forms for n in f.nodes(lambda n: n.tag == 'input')):
        raise ValueError('Response does not echo the requested publication query')
    content = view.nodes(lambda n: n.has_class('view-content'))
    rows = []
    if not content:
        if not view.nodes(lambda n: n.has_class('view-empty')):
            raise ValueError('Neither results nor explicit empty state')
    else:
        if len(content) != 1:
            raise ValueError('Ambiguous publication results')
        for group in content[0].children:
            if not isinstance(group, Node):
                continue
            titles = group.nodes(lambda n: n.tag == 'strong')
            if not titles:
                raise ValueError('Publication group has no title')
            title = titles[0].text()
            identity, date = None, None
            for field in group.nodes(lambda n: n.has_class('views-field-field-publication-id')
                                      or n.has_class('views-field-field-language')):
                if field.has_class('views-field-field-publication-id'):
                    identity = field.text().strip('() ')
                    dates = field.nodes(lambda n: n.tag == 'time')
                    date = dates[0].attrs.get('datetime') if dates else None
                else:
                    languages = field.nodes(lambda n: n.tag == 'b')
                    if not identity or not languages:
                        raise ValueError('Language version lacks publication identity')
                    language = languages[0].text().rstrip(':')
                    for anchor in field.nodes(lambda n: n.tag == 'a'):
                        url = native_url(anchor.attrs.get('href', ''), OSHA)
                        rows.append({'id': url, 'title': title, 'publication_label': identity,
                                     'publication_date': date, 'language': language,
                                     'format': anchor.text(), 'link_label': anchor.attrs.get('title'),
                                     'landing_page': url, 'reading_access_verified': False})
    next_pages = []
    for anchor in view.nodes(lambda n: n.tag == 'a' and 'href' in n.attrs):
        url = urljoin(OSHA, anchor.attrs['href'])
        p = urlsplit(url)
        params = parse_qs(p.query)
        if p.netloc == 'www.osha.gov' and p.path == urlsplit(OSHA).path and 'page' in params:
            if set(params) <= {'publication_title', 'page'} and params.get('publication_title') == [query]:
                next_pages.append(url)
    return {'results': unique(rows), 'published_page_links': list(dict.fromkeys(next_pages)),
            'scope': 'Public title/keyword/number search; only this response page, not full-text recall'}


def parse_faa(body):
    root = Tree(body).root
    tables = [t for t in root.nodes(lambda n: n.tag == 'table')
              if any(c.text() == 'Reference Handbooks' for c in t.nodes(lambda n: n.tag == 'caption'))]
    if len(tables) != 1:
        raise ValueError('Missing or ambiguous FAA Reference Handbooks table')
    table = tables[0]
    headers = [n.text() for n in table.nodes(lambda n: n.tag == 'th')]
    if headers != ['Title', 'Publication Date', 'Change/Add. Date']:
        raise ValueError('Changed handbook catalog columns')
    rows = []
    for tr in table.nodes(lambda n: n.tag == 'tr'):
        cells = [n for n in tr.children if isinstance(n, Node) and n.tag == 'td']
        if not cells:
            continue
        if len(cells) != 3:
            raise ValueError('Changed handbook row shape')
        links = cells[0].nodes(lambda n: n.tag == 'a')
        if not links:
            raise ValueError('Handbook row missing a native link')
        for link in links:
            url = native_url(link.attrs.get('href', ''), FAA)
            title = link.text()
            if not title:
                raise ValueError('Empty handbook title')
            rows.append({'id': url, 'title': title, 'landing_page': url,
                         'publication_number_in_title': re.findall(r'FAA-H-[0-9]+-[0-9A-Za-z]+', title),
                         'listing_publication_date': cells[1].text() or None,
                         'listing_change_date': cells[2].text() or None,
                         'date_scope': 'shared listing row; not assigned separately to each addendum' if len(links) > 1 else 'single listing entry',
                         'format': 'PDF link' if urlsplit(url).path.lower().endswith('.pdf') else 'HTML landing/index link',
                         'language': 'English catalog title; full-item language unverified',
                         'reading_access_verified': False})
    if not rows:
        raise ValueError('Empty reference handbook catalog')
    return unique(rows)


def search_faa(rows, query):
    text, mode = query.get('text'), query.get('mode')
    if not isinstance(text, str):
        raise ValueError('Search text must be a string')
    if mode == 'native_id':
        return [r for r in rows if r['id'] == text]
    if mode != 'title_tokens':
        raise ValueError('Only title tokens or exact native URLs supported')
    tokens = set(re.findall(r'\w+', text.casefold()))
    return [r for r in rows if tokens <= set(re.findall(r'\w+', r['title'].casefold()))] if tokens else []


def observed(source, case, capture, body):
    digest = hashlib.sha256(body).hexdigest()
    observation = {'observed_at': now(), 'http': capture['http'], 'robots_evidence': capture['robots_evidence'],
                   'response_sha256': digest, 'error': None, 'full_content_downloaded': False}
    results = []
    try:
        if (capture['http'].get('status') != 200 or capture['http'].get('truncated')
                or capture['http'].get('sampled_bytes_sha256') != digest):
            raise ValueError('Missing/mismatched complete successful metadata capture')
        if source['query']['adapter'] == 'osha-publications':
            q = case['request']['params']['publication_title']
            expected_url = OSHA + '?' + urlencode(case['request']['params'])
            if capture['http'].get('url') != expected_url:
                raise ValueError('Capture is not the requested OSHA query/page')
            parsed = parse_osha(body, q)
            results = parsed['results']
            observation.update(execution_mode='published-publication-search-form',
                               published_page_links=parsed['published_page_links'])
        else:
            if capture['http'].get('url') != FAA:
                raise ValueError('Wrong FAA catalog URL')
            inventory = parse_faa(body)
            results = search_faa(inventory, case['request']['local_query'])
            observation.update(execution_mode='public-catalog-metadata-local-search',
                               import_entry_count=len(inventory),
                               imported_at=capture['http']['requested_at'])
    except (ValueError, UnicodeError, KeyError) as exc:
        observation['error'] = str(exc)
    return evaluate(source, case, observation, {'results': results})


def probe(source, case_ids=None):
    """Serial, policy-checked metadata requests; stop on access/rate denial."""
    endpoint = source['query']['endpoint']
    if endpoint not in (OSHA, FAA):
        raise ValueError('Unreviewed endpoint')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(endpoint)
        cache = {}
        stopped = False
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            url = endpoint + ('?' + urlencode(case['request']['params']) if endpoint == OSHA else '')
            if url not in cache:
                http, body = {'status': None, 'truncated': False, 'url': url}, b''
                allowed = not stopped and policy is not False and (policy is None or policy.can_fetch(USER_AGENT, url))
                if allowed:
                    time.sleep(pacing_seconds(policy))
                    http, body = request(url, MAX_BYTES)
                if http.get('status') in (401, 403, 429, 503):
                    stopped = True
                capture = {'source_id': source['id'], 'observed_at': now(), 'http': http,
                           'robots_evidence': proof, 'request': {'method': 'GET', 'url': url},
                           'query_verified': False, 'outcome': 'captured' if http['status'] == 200 and not http.get('truncated') else 'blocked-or-failed'}
                with (REGISTRY / 'examples' / (source['id'] + '.access.jsonl')).open('a') as out:
                    out.write(json.dumps(capture, ensure_ascii=False, sort_keys=True) + '\n')
                cache[url] = (capture, body)
            result = observed(source, case, *cache[url])
            with (REGISTRY / 'examples' / (source['id'] + '.jsonl')).open('a') as out:
                out.write(json.dumps(result, ensure_ascii=False, sort_keys=True) + '\n')
            print(source['id'], case['id'], result['verdict'], result.get('returned_count'), flush=True)
