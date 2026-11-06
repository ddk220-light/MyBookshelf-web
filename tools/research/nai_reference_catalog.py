"""Bounded search of NAI's published Abhilekh finding-aid metadata table.

Does not request the restricted archival portal, PDFs or individual archive files.
"""
import fcntl
import hashlib
import json
import re
import time
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

from run_source_reviews import robots, request, pacing_seconds, now
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT = 'https://nationalarchives.nic.in/en/research-and-references/reference-tools'
MAX_BYTES = 512 * 1024


class Table(HTMLParser):
    def __init__(self):
        super().__init__()
        self.depth = 0
        self.rows = []
        self.row = None
        self.cell = None
        self.anchor = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'table':
            self.depth += 1
        if self.depth != 1:
            return
        if tag == 'tr':
            self.row = []
        elif tag in ('th', 'td') and self.row is not None:
            self.cell = {'text': [], 'links': []}
            self.row.append(self.cell)
        elif tag == 'a' and self.cell is not None:
            self.anchor = {'url': attrs.get('href', ''), 'text': []}
            self.cell['links'].append(self.anchor)

    def handle_data(self, data):
        if self.cell is not None:
            self.cell['text'].append(data)
        if self.anchor is not None:
            self.anchor['text'].append(data)

    def handle_endtag(self, tag):
        if tag == 'a':
            self.anchor = None
        elif tag in ('th', 'td'):
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            self.rows.append(self.row)
            self.row = None
        elif tag == 'table':
            self.depth -= 1


def clean(parts):
    return ' '.join(' '.join(parts).split())


def parse(body):
    if not isinstance(body, bytes) or len(body) > MAX_BYTES:
        raise ValueError('Metadata must be bounded bytes')
    text = body.decode('utf-8')
    if '</table>' not in text.lower() or '</html>' not in text.lower():
        raise ValueError('Incomplete published metadata table')
    p = Table()
    p.feed(text)
    candidates, excluded = [], []
    for cells in p.rows:
        if len(cells) != 2 or not cells[1]['links']:
            continue
        title, label = clean(cells[0]['text']), clean(cells[1]['text'])
        ids = list(dict.fromkeys(re.findall(r'\bRT_\d{12}\b', label)))
        links = cells[1]['links']
        if len(ids) != 1 or len(links) != 1 or not title:
            excluded.append({'title': title, 'reason': 'Missing/ambiguous native reference ID or link'})
            continue
        native, link = ids[0], links[0]
        u = urlsplit(link['url'])
        q = parse_qs(u.query)
        valid = (u.scheme == 'https' and u.netloc == 'www.abhilekh-patal.in'
                 and not u.fragment and not u.username and
                 ((u.path == '/Category/Search/QuerySearch' and q == {'query': [native]})
                  or (u.path == '/Category/ItemDetails/ItemDetails' and set(q) == {'itemId'}
                      and len(q['itemId']) == 1 and re.fullmatch(r'[0-9a-f-]{36}', q['itemId'][0]))))
        old = clean(link['text'])
        if not valid or not re.fullmatch(r'https://www\.abhilekh-patal\.in/jspui/handle/123456789/\d+', old):
            excluded.append({'id': native, 'title': title, 'url': link['url'], 'reason': 'Unrecognized or inconsistent published link identity'})
            continue
        candidates.append({'id': native, 'title': title, 'landing_page': link['url'],
                           'published_legacy_handle': old,
                           'record_kind': 'finding-aid-reference-tool',
                           'reading_access_verified': False})
    counts = {key: Counter(r[key] for r in candidates) for key in ('id', 'landing_page', 'published_legacy_handle')}
    records = []
    for row in candidates:
        if any(counts[key][row[key]] != 1 for key in counts):
            excluded.append({**row, 'reason': 'Conflicting duplicate native ID or target link; no inferred repair'})
        else:
            records.append(row)
    if not records:
        raise ValueError('No unambiguous reference-tool records')
    return {'records': records, 'excluded': excluded, 'scope': 'Published finding-aid reference table only; not archival-file catalog'}


def search(rows, query):
    if set(query) != {'field', 'value'} or query['field'] not in ('title', 'id') or not isinstance(query['value'], str) or not query['value'].strip():
        raise ValueError('Unsupported reference-table query')
    tokens = re.findall(r'\w+', query['value'].casefold())
    if not tokens:
        raise ValueError('Empty token query')
    return [r for r in rows if (r['id'] == query['value'] if query['field'] == 'id'
            else all(t in re.findall(r'\w+', r['title'].casefold()) for t in tokens))]


def assess(source, case, cap, body):
    error, rows = cap.get('error'), []
    try:
        h = cap['http']
        if error or h['status'] != 200 or h['truncated']:
            raise ValueError(error or 'Unsuccessful/incomplete reference metadata')
        if h['sampled_bytes_sha256'] != hashlib.sha256(body).hexdigest():
            raise ValueError('Mismatched metadata capture')
        rows = search(parse(body)['records'], case['request']['local_query'])
    except (KeyError, TypeError, ValueError) as exc:
        error = str(exc)
    return evaluate(source, case, {**cap, 'error': error, 'response_sha256': hashlib.sha256(body).hexdigest(),
        'full_content_downloaded': False, 'query_execution': 'Local title-token/native RT-ID search over official NAI reference-tool list'}, {'results': rows})


def probe(source, case_ids=None):
    if source['id'] != 'abhilekh-patal' or source['query']['endpoint'] != ENDPOINT:
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
            if case['request']['method'] != 'GET' or case['request']['url'] != ENDPOINT:
                raise ValueError('Unreviewed request')
            row = assess(source, case, cap, body)
            with (REGISTRY / 'examples/abhilekh-patal.jsonl').open('a') as f:
                f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], row['verdict'], row['error'], flush=True)
