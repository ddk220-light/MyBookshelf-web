"""Search NHSRC's published NUHM guideline metadata; never fetch document bodies."""
import fcntl
import hashlib
import json
import re
import time
import unicodedata
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote

from run_source_reviews import robots, request, pacing_seconds, now
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT = 'https://nhsrcindia.org/national-urban-health-mission'
MAX_BYTES = 512 * 1024
SCOPE = 'NHSRC NUHM Guidelines section only; not the central NHM catalog or full document text'


class Catalog(HTMLParser):
    def __init__(self):
        super().__init__()
        self.heading = None
        self.active = False
        self.sections = 0
        self.table_depth = 0
        self.tables_closed = 0
        self.anchor = None
        self.links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'h3':
            self.active = False
            self.heading = []
        elif self.active and tag == 'table':
            self.table_depth += 1
        elif self.active and self.table_depth == 1 and tag == 'a':
            self.anchor = {'url': attrs.get('href', '').strip(), 'text': []}

    def handle_data(self, text):
        if self.heading is not None:
            self.heading.append(text)
        if self.anchor is not None:
            self.anchor['text'].append(text)

    def handle_endtag(self, tag):
        if tag == 'h3' and self.heading is not None:
            self.active = ' '.join(''.join(self.heading).split()) == 'NUHM Guidelines'
            self.sections += int(self.active)
            self.heading = None
        elif tag == 'a' and self.anchor is not None:
            self.links.append(self.anchor)
            self.anchor = None
        elif self.active and tag == 'table':
            self.table_depth -= 1
            self.tables_closed += int(self.table_depth == 0)


def parse(body):
    if not isinstance(body, bytes) or len(body) > MAX_BYTES:
        raise ValueError('Metadata must be bounded bytes')
    text = body.decode('utf-8')
    if not text.rstrip().lower().endswith('</html>'):
        raise ValueError('Incomplete metadata page')
    parser = Catalog()
    parser.feed(text)
    if parser.sections != 1 or parser.tables_closed != 1 or parser.table_depth != 0 or parser.anchor:
        raise ValueError('Missing, duplicated or incomplete NUHM Guidelines table')
    records, excluded = [], []
    for link in parser.links:
        title = ' '.join(''.join(link['text']).split())
        url = urljoin(ENDPOINT, link['url'])
        u = urlsplit(url)
        valid = (title and u.scheme == 'https' and u.netloc == 'nhsrcindia.org'
                 and not u.query and not u.fragment and not u.username
                 and re.fullmatch(r'/sites/default/files/\d{4}-\d{2}/[^/]+\.pdf', u.path)
                 and not any(c in unquote(u.path) for c in ['\\', '\x00', '\n', '\r'])
                 and '/' not in unquote(u.path.rsplit('/', 1)[-1]))
        if not valid:
            excluded.append({'title': title, 'url': url, 'reason': 'Unrecognized guideline file identity'})
            continue
        records.append({'id': url, 'title': title, 'landing_page': url,
                        'record_kind': 'published-guideline-file-link',
                        'reading_access_verified': False})
    counts = Counter(r['id'] for r in records)
    for row in records:
        if counts[row['id']] != 1:
            excluded.append({**row, 'reason': 'Duplicate/conflicting file identity; no edition inference'})
    records = [r for r in records if counts[r['id']] == 1]
    if not records or len(records) > 100:
        raise ValueError('Missing or unexpectedly large guideline metadata list')
    return {'records': records, 'excluded': excluded, 'scope': SCOPE}


def tokens(text):
    return re.findall(r'[^\W_]+', unicodedata.normalize('NFKC', text).casefold())


def search(rows, query):
    if set(query) != {'field', 'value'} or query['field'] not in ('title', 'id') or not isinstance(query['value'], str) or not query['value'].strip():
        raise ValueError('Unsupported guideline metadata query')
    words = tokens(query['value'])
    if not words:
        raise ValueError('Empty token query')
    return [r for r in rows if (r['id'] == query['value'] if query['field'] == 'id'
            else all(word in tokens(r['title']) for word in words))]


def assess(source, case, cap, body):
    error, rows = cap.get('error'), []
    try:
        h = cap['http']
        if error or h['status'] != 200 or h['truncated']:
            raise ValueError(error or 'Unsuccessful/incomplete guideline metadata')
        if h['sampled_bytes_sha256'] != hashlib.sha256(body).hexdigest():
            raise ValueError('Mismatched metadata capture')
        if case['request']['method'] != 'GET' or case['request']['url'] != ENDPOINT:
            raise ValueError('Unreviewed metadata request')
        rows = search(parse(body)['records'], case['request']['local_query'])
    except (KeyError, TypeError, ValueError) as exc:
        error = str(exc)
    return evaluate(source, case, {**cap, 'error': error, 'response_sha256': hashlib.sha256(body).hexdigest(),
        'full_content_downloaded': False, 'query_execution': 'Local title tokens/native file URL over permitted NHSRC NUHM metadata'}, {'results': rows})


def probe(source, case_ids=None):
    if source['id'] != 'nhm-guidelines' or source['query']['endpoint'] != ENDPOINT:
        raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(ENDPOINT)
        body = b''
        cap = {'observed_at': now(), 'robots_evidence': proof, 'http': {'status': None, 'truncated': False}}
        if policy is False or policy is not None and not all(policy.can_fetch(a, ENDPOINT) for a in [USER_AGENT, 'ChatGPT-User', 'OAI-SearchBot']):
            cap['error'] = 'Policy unavailable/disallowing'
        else:
            time.sleep(pacing_seconds(policy))
            cap['http'], body = request(ENDPOINT, limit=MAX_BYTES)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            row = assess(source, case, cap, body)
            with (REGISTRY / 'examples/nhm-guidelines.jsonl').open('a') as f:
                f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], row['verdict'], row['error'], flush=True)
