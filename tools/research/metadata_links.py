"""Research-only metadata searches and outbound links, without reader access gates.

Catalog imports contain titles/code labels only. Sugamya anonymous results do
not expose native book IDs: their composite keys are explicitly local, and the
outbound destination is the public search page, not a claimed book permalink.
"""
import fcntl
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit
import urllib.request
import urllib.error

from learning_catalogs import CatalogTree
from publication_catalogs import Node
from run_source_reviews import now, pacing_seconds, request, robots, ReviewRedirects
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINTS = {
    'madurai-catalog': 'https://www.projectmadurai.org/pmworks.html',
    'sugamya-public': 'https://sugamyapustakalaya.org.in/searchAction.action',
    'thoth-metadata': 'https://api.thoth.pub/graphql',
}
LIMIT = 4 * 1024 * 1024


class MaduraiTree(CatalogTree):
    def handle_starttag(self, tag, attrs):
        # The published table omits a closing td at work685. HTML tables
        # implicitly close the previous cell; mirror that browser behavior.
        if tag in ('td', 'th'):
            for n in reversed(self.stack):
                if n.tag == 'tr':
                    break
                if n.tag in ('td', 'th'):
                    self.handle_endtag(n.tag)
                    break
        super().handle_starttag(tag, attrs)


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def parse_madurai(body):
    if b'</table>' not in body or b'</html>' not in body.lower():
        raise ValueError('Incomplete catalog document')
    root = MaduraiTree(body).root
    tables = root.nodes(lambda n: n.tag == 'table' and n.attrs.get('id') == 'sortabletable')
    if len(tables) != 1:
        raise ValueError('Missing works catalog')
    headers = [n.text() for n in tables[0].nodes(lambda n: n.tag == 'th')]
    if headers != ['Work no.', 'Title', 'Author', 'Genre', 'PDF', 'Unicode']:
        raise ValueError('Changed works schema')
    works = {}
    for tr in tables[0].nodes(lambda n: n.tag == 'tr'):
        cells = [c for c in tr.children if isinstance(c, Node) and c.tag == 'td']
        if not cells:
            continue
        if len(cells) != 6 or not re.fullmatch(r'[0-9][0-9_, ()a-z-]*', cells[0].text()) or not cells[1].text():
            raise ValueError('Missing work identity/title')
        sid = cells[0].text()
        row = works.setdefault(sid, {'id': sid, 'title': '', 'titles': [], 'authors': [], 'genres': [],
            'listed_formats': [], 'unresolved_format_links': [], 'landing_page': ENDPOINTS['madurai-catalog'],
            'identity_scope': 'Native PM work number; component titles/parts grouped, not separate origins',
            'reading_access_verified': False})
        for key, value in [('titles', cells[1].text()), ('authors', cells[2].text()), ('genres', cells[3].text())]:
            if value and value not in row[key]:
                row[key].append(value)
        for cell in cells[4:]:
            for a in cell.nodes(lambda n: n.tag == 'a' and n.attrs.get('href')):
                url = urljoin(ENDPOINTS['madurai-catalog'], a.attrs['href'])
                if not re.fullmatch(r'https://www\.projectmadurai\.org/pm_etexts/(?:pdf|utf8)/[A-Za-z0-9_.-]+\.(?:html|pdf)', url):
                    # Preserve malformed published links as findings. Never repair
                    # or fetch guessed ebook URLs; catalog metadata remains usable.
                    row['unresolved_format_links'].append(url)
                    continue
                if url not in row['listed_formats']:
                    row['listed_formats'].append(url)
        row['title'] = ' / '.join(row['titles'])
    if not works:
        raise ValueError('Empty works catalog')
    return list(works.values())


def parse_sugamya(body, url):
    p = urlsplit(url); q = parse_qs(p.query)
    if p.scheme + '://' + p.netloc + p.path != ENDPOINTS['sugamya-public'] or set(q) != {'txtboxSearch'} or len(q['txtboxSearch']) != 1:
        raise ValueError('Unreviewed public search request')
    root = CatalogTree(body).root
    if not root.nodes(lambda n: n.tag == 'input' and n.attrs.get('name') == 'txtboxSearch' and n.attrs.get('value') == q['txtboxSearch'][0]):
        raise ValueError('Search query was not echoed')
    tables = root.nodes(lambda n: n.tag == 'table' and n.has_class('search-result-table'))
    if len(tables) != 1:
        if re.search(r'(?:No books found|Total 0 books found|No records found)', root.text(), re.I):
            return []
        raise ValueError('Missing result table/explicit empty state')
    rows = []
    for tr in tables[0].nodes(lambda n: n.tag == 'tr'):
        titles = [n for n in tr.children if isinstance(n, Node) and n.tag == 'th' and n.attrs.get('scope') == 'row']
        if not titles:
            continue
        cells = [n for n in tr.children if isinstance(n, Node) and n.tag == 'td']
        if len(titles) != 1 or len(cells) != 5 or not titles[0].text():
            raise ValueError('Changed anonymous search row')
        metadata = dict(zip(('title', 'author', 'publisher', 'library', 'format', 'language'),
                            [titles[0].text()] + [c.text() for c in cells]))
        rows.append({**metadata, 'id': 'anonymous-metadata:' + digest(metadata), 'native_id': None,
            'identity_scope': 'Local composite of displayed metadata; native edition/book identity not exposed anonymously',
            'landing_page': url, 'link_scope': 'Search results; no anonymous item permalink',
            'reading_access_verified': False, 'reader_access_label': 'Eligible-member login required for downloads'})
    # Identical visible entries cannot be treated as separately identified books.
    return list({r['id']: r for r in rows}.values())


def parse_thoth(data, publisher_id):
    if not isinstance(data, dict) or data.get('errors') or not isinstance(data.get('data', {}).get('works'), list):
        raise ValueError('Invalid GraphQL response')
    rows = []
    for w in data['data']['works']:
        sid = w.get('workId'); titles = w.get('titles', [])
        if (not isinstance(sid, str) or not re.fullmatch(r'[0-9a-f-]{36}', sid)
                or w.get('imprint', {}).get('publisherId') != publisher_id
                or w.get('workType') not in ('MONOGRAPH', 'EDITED_BOOK') or not titles or not titles[0].get('fullTitle')):
            raise ValueError('Wrong publisher/type or missing native identity')
        url = w.get('landingPage') or w.get('doi'); p = urlsplit(url or '')
        if p.scheme != 'https' or not p.hostname or p.username or p.password:
            raise ValueError('Missing public publisher landing page')
        rows.append({'id': sid, 'title': titles[0]['fullTitle'], 'publisher_id': publisher_id,
            'type': w['workType'], 'landing_page': url, 'content_license_claim': w.get('license'),
            'metadata_license': 'CC0', 'reading_access_verified': False})
    if len({r['id'] for r in rows}) != len(rows):
        raise ValueError('Duplicate work UUID')
    return rows


def local_search(records, query):
    if set(query) != {'field', 'value'} or query['field'] not in ('title', 'id') or not isinstance(query['value'], str) or not query['value'].strip():
        raise ValueError('Only nonempty title substring or exact native ID is supported')
    value = query['value'].casefold()
    return [r for r in records if (r['id'] == query['value'] if query['field'] == 'id' else value in r['title'].casefold())]


def http_json(req):
    """Bounded JSON request, without following redirects or sending credentials."""
    headers = {'User-Agent': USER_AGENT, 'Content-Type': 'application/json', 'Accept': 'application/json'}
    data = json.dumps(req['json']).encode()
    h = {'status': None, 'url': req['url'], 'truncated': False}; body = b''
    try:
        r = urllib.request.Request(req['url'], data=data, headers=headers, method='POST')
        try:
            response = urllib.request.build_opener(ReviewRedirects()).open(r, timeout=25)
        except urllib.error.HTTPError as e:
            response = e
        with response:
            h.update(status=response.status, content_type=response.headers.get('Content-Type'), final_url=response.url)
            body = response.read(LIMIT + 1)
    except OSError as e:
        h['error'] = str(e)
    h.update(truncated=len(body) > LIMIT, bytes_read=len(body), sampled_bytes_sha256=hashlib.sha256(body).hexdigest())
    return h, body


def assess(source, case, capture, body, records=None):
    rows = []; error = None; adapter = source['query']['adapter']
    try:
        h = capture['http']
        if h['status'] != 200 or h['truncated'] or h['sampled_bytes_sha256'] != hashlib.sha256(body).hexdigest():
            raise ValueError('Incomplete or mismatched response')
        if adapter == 'madurai-catalog':
            if records is None:
                records = parse_madurai(body)
            rows = local_search(records, case['request']['local_query'])
        elif adapter == 'sugamya-public':
            rows = parse_sugamya(body, case['request']['url'])
            query = parse_qs(urlsplit(case['request']['url']).query)['txtboxSearch'][0].casefold()
            if any(query not in r['title'].casefold() for r in rows if r['id'] in case['expected_ids']):
                raise ValueError('Expected result does not match the title query')
        elif adapter == 'thoth-metadata':
            rows = parse_thoth(json.loads(body), source['query']['publisher_id'])
            if any(case['query_text'].casefold() not in r['title'].casefold() for r in rows if r['id'] in case['expected_ids']):
                raise ValueError('Expected result lacks title relevance')
        else:
            raise ValueError('Unsupported metadata adapter')
    except (ValueError, TypeError, KeyError, UnicodeError) as e:
        error = str(e)
    return evaluate(source, case, {**capture, 'error': error, 'response_sha256': hashlib.sha256(body).hexdigest(),
        'full_content_downloaded': False, 'reader_access_is_queryability_gate': False}, {'results': rows})


def probe(source, case_ids=None):
    adapter = source['query']['adapter']; endpoint = ENDPOINTS[adapter]
    if source.get('research_selection', {}).get('included') is False or source['query']['endpoint'] != endpoint:
        raise ValueError('Excluded source or unreviewed endpoint')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(endpoint); cached = None
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            req = case['request']; u = req['url']; body = b''
            if urlsplit(u)._replace(query='').geturl() != endpoint:
                raise ValueError('Unreviewed request destination')
            cap = {'observed_at': now(), 'robots_evidence': proof, 'http': {'url': u, 'status': None, 'truncated': False}}
            if policy is not False and (policy is None or policy.can_fetch(USER_AGENT, u)):
                if cached and adapter == 'madurai-catalog':
                    cap, body = cached
                else:
                    time.sleep(pacing_seconds(policy))
                    cap['http'], body = http_json(req) if req['method'] == 'POST' else request(u, limit=LIMIT)
                    cached = (cap, body)
            obs = assess(source, case, cap, body)
            with (REGISTRY / 'examples' / (source['id'] + '.jsonl')).open('a') as f:
                f.write(json.dumps(obs, ensure_ascii=False, sort_keys=True) + '\n')
            print(source['id'], case['id'], obs['verdict'], obs['error'], flush=True)
            if cap['http']['status'] in (None, 401, 403, 429, 500, 502, 503, 504):
                break
