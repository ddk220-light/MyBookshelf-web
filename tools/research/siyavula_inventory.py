"""Research-only local chapter lookup in one explicitly licensed textbook TOC."""
import fcntl
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
from urllib.parse import urljoin, urlsplit

from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT = 'https://www.siyavula.com/read/za/mathematics/grade-10'
LICENSE = 'https://creativecommons.org/licenses/by/3.0/'
LOCK_PATH = Path('/tmp/mybookshelf-source-review.lock')
MAX_BYTES = 512 * 1024


class Contents(HTMLParser):
    def __init__(self):
        super().__init__()
        self.language = None
        self.heading = False
        self.h1 = []
        self.active = None
        self.chapters = []
        self.licenses = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'html':
            self.language = attrs.get('lang')
        if tag == 'h1':
            self.heading = True
        if tag == 'a':
            if 'chapter-title' in attrs.get('class', '').split():
                self.active = [attrs.get('href'), []]
            if attrs.get('href', '').startswith('https://creativecommons.org/licenses/'):
                self.licenses.add(attrs['href'])

    def handle_data(self, data):
        if self.heading:
            self.h1.append(data)
        if self.active:
            self.active[1].append(data)

    def handle_endtag(self, tag):
        if tag == 'h1':
            self.heading = False
        if tag == 'a' and self.active:
            self.chapters.append((self.active[0], ''.join(self.active[1]).strip()))
            self.active = None


def parse_inventory(body):
    if len(body) > MAX_BYTES:
        raise ValueError('Table of contents exceeds research cap')
    parser = Contents()
    parser.feed(body.decode('utf-8'))
    if (''.join(parser.h1).strip() != 'Mathematics Grade 10'
            or parser.language != 'en' or LICENSE not in parser.licenses):
        raise ValueError('Wrong book/language or missing explicit CC BY3.0 license')
    if not 1 <= len(parser.chapters) <= 30:
        raise ValueError('Missing or oversized chapter catalog')
    result, seen, numbers = [], set(), set()
    digest = hashlib.sha256(body).hexdigest()
    for href, title in parser.chapters:
        if not isinstance(href, str):
            raise ValueError('Missing native chapter link')
        url = urljoin(ENDPOINT, href)
        match = re.fullmatch(r'Chapter ([0-9]+):\s*(.+)', title)
        parsed = urlsplit(url)
        if (not match or not url.startswith(ENDPOINT + '/') or parsed.query or parsed.fragment
                or '/' in url[len(ENDPOINT) + 1:] or url in seen or match[1] in numbers):
            raise ValueError('Invalid, duplicate or cross-book chapter identity')
        seen.add(url)
        numbers.add(match[1])
        result.append({'id': url, 'title': title, 'chapter_title': match[2],
                       'chapter_number': int(match[1]), 'book_title': 'Mathematics Grade 10',
                       'curriculum_country': 'South Africa', 'language': 'en', 'grade': 10,
                       'subject': 'Mathematics', 'landing_page': url,
                       'license': 'CC BY 3.0', 'license_url': LICENSE,
                       'snapshot_sha256': digest, 'edition_year': None,
                       'reading_access_verified': False,
                       'scope_note': 'Chapter metadata only; publisher HTML edition year unverified; third-party embeds excluded.'})
    return sorted(result, key=lambda row: row['chapter_number'])


def local_search(rows, query):
    mode, text = query.get('mode'), query.get('text')
    if not isinstance(text, str):
        raise ValueError('Search text must be a string')
    if mode == 'native_id':
        return [row for row in rows if row['id'] == text]
    if mode != 'title_tokens':
        raise ValueError('Only exact native IDs or chapter-title tokens are supported')
    terms = re.findall(r'\w+', text.casefold())
    if not terms:
        return []
    return [row for row in rows if set(terms) <= set(re.findall(r'\w+', row['chapter_title'].casefold()))]


def review_refresh(accepted_body, candidate_body, capture, accepted_sha256):
    """Compare a bounded TOC candidate without replacing or re-verifying anything.

    A same-day comparison is a refresh rehearsal, not reliability evidence.
    Removed/changed native IDs require review; a missing license rejects the
    candidate even when its titles happen to be unchanged.
    """
    accepted_hash = hashlib.sha256(accepted_body).hexdigest()
    candidate_hash = hashlib.sha256(candidate_body).hexdigest()
    if accepted_hash != accepted_sha256:
        raise ValueError('Accepted snapshot does not match its pinned hash')
    accepted = parse_inventory(accepted_body)
    result = {'accepted_sha256': accepted_hash, 'candidate_sha256': candidate_hash,
              'automatic_replacement': False, 'query_verified': False,
              'removed_ids': [], 'added_ids': [], 'changed_ids': [],
              'prior_examples_reverified': False}
    http = capture.get('http', {})
    if (http.get('status') != 200 or http.get('truncated')
            or http.get('sampled_bytes_sha256') != candidate_hash
            or capture.get('request', {}).get('url') != ENDPOINT):
        return {**result, 'outcome': 'candidate-rejected',
                'reason': 'Missing/mismatched successful TOC capture hash or endpoint'}
    try:
        candidate = parse_inventory(candidate_body)
    except (ValueError, UnicodeError) as exc:
        return {**result, 'outcome': 'candidate-rejected', 'reason': str(exc)}
    before = {r['id']: r for r in accepted}
    after = {r['id']: r for r in candidate}
    result['removed_ids'] = sorted(before.keys() - after.keys())
    result['added_ids'] = sorted(after.keys() - before.keys())
    # Body hashes change for navigation/advertisements too. Compare actual
    # chapter metadata separately, retaining the full hash change for review.
    fields = ('chapter_title', 'chapter_number', 'book_title', 'language',
              'grade', 'subject', 'license_url')
    result['changed_ids'] = sorted(k for k in before.keys() & after.keys()
                                  if any(before[k][f] != after[k][f] for f in fields))
    result['outcome'] = ('unchanged-snapshot' if candidate_hash == accepted_hash
                         else 'candidate-needs-manual-review')
    return result


def record_examples(source, capture, body, case_ids=None):
    digest = hashlib.sha256(body).hexdigest()
    rows, error = [], None
    if (capture['http'].get('status') != 200 or capture['http'].get('truncated')
            or capture['http'].get('sampled_bytes_sha256') != digest
            or capture['request']['url'] != ENDPOINT):
        error = 'Missing/mismatched successful TOC capture hash or endpoint'
    else:
        try:
            rows = parse_inventory(body)
            if (digest != source['query'].get('expected_inventory_sha256')
                    or len(rows) != source['query'].get('expected_entry_count')):
                raise ValueError('Pinned chapter inventory changed; manual review required')
        except (ValueError, UnicodeError) as exc:
            error = str(exc)
    for case in source['query']['cases']:
        if case_ids and case['id'] not in case_ids:
            continue
        results = local_search(rows, case['request']['local_query']) if not error else []
        obs = {'observed_at': now(), 'http': capture['http'], 'response_sha256': digest,
               'error': error, 'robots_evidence': capture['robots_evidence'],
               'execution_mode': 'licensed-toc-metadata-import-local-search',
               'import': {'url': ENDPOINT, 'retrieved_at': capture['http'].get('requested_at'),
                          'sha256': digest, 'entry_count': len(rows), 'full_book_text_imported': False},
               'attribution': 'Siyavula Education, Mathematics Grade10, CC BY3.0; from siyavula.com; metadata selections only.'}
        result = evaluate(source, case, obs, {'results': results})
        with (REGISTRY / 'examples/siyavula.jsonl').open('a') as out:
            out.write(json.dumps(result, ensure_ascii=False, sort_keys=True) + '\n')
        print('siyavula', case['id'], result['verdict'], flush=True)


def probe(source, case_ids=None):
    with LOCK_PATH.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(ENDPOINT)
        http, body = {'status': None, 'truncated': False}, b''
        if policy is not False and (policy is None or policy.can_fetch(USER_AGENT, ENDPOINT)):
            time.sleep(pacing_seconds(policy))
            http, body = request(ENDPOINT, MAX_BYTES)
        capture = {'source_id': 'siyavula', 'observed_at': now(), 'http': http,
                   'request': {'method': 'GET', 'url': ENDPOINT}, 'robots_evidence': proof,
                   'query_verified': False, 'outcome': 'captured' if http['status'] == 200 and not http.get('truncated') else 'blocked-or-failed'}
        with (REGISTRY / 'examples/siyavula.access.jsonl').open('a') as out:
            out.write(json.dumps(capture, ensure_ascii=False, sort_keys=True) + '\n')
        record_examples(source, capture, body, case_ids)
