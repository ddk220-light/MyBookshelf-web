#!/usr/bin/env python3
"""Import a bounded English Book Dash metadata subset; never store book pages."""
import argparse
import datetime
import hashlib
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request
import urllib.error
from import_gutenberg import activate

ORIGIN = 'https://bookdash.org'
POLICY = ORIGIN + '/re-using-the-book-dash-content/'
MAX_BYTES = 2 * 1024 * 1024
ROLES = {'Writer': 'author', 'Illustrator': 'illustrator', 'Translator': 'translator',
         'Designer': 'designer', 'Editor': 'editor', 'Photographer': 'photographer'}


class BookPage(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.heading = None
        self.credits = []
        self.reader_depth = 0
        self.pages = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'h3': self.heading = []
        if tag == 'div':
            if self.reader_depth: self.reader_depth += 1
            elif attrs.get('id') == 'read-book': self.reader_depth = 1
        if tag == 'a' and self.reader_depth:
            url = attrs.get('href', '')
            if re.fullmatch(r'https://bookdash\.org/wp-content/uploads/[A-Za-z0-9_./%-]+\.(?:jpg|jpeg|png)', url, re.I):
                self.pages.add(url)

    def handle_data(self, value):
        if self.heading is not None: self.heading.append(value)

    def handle_endtag(self, tag):
        if tag == 'h3' and self.heading is not None:
            text = ' '.join(''.join(self.heading).split())
            match = re.fullmatch(r'(.{1,240}?)\s*\((Writer|Illustrator|Translator|Designer|Editor|Photographer)\)', text)
            if match: self.credits.append({'name': match[1].strip(), 'role': ROLES[match[2]]})
            self.heading = None
        if tag == 'div' and self.reader_depth: self.reader_depth -= 1


def map_record(row, page, observed_at, english_id):
    number, url = row.get('id'), row.get('link', '')
    title = unescape(row.get('title', {}).get('rendered', '')).strip()
    if not isinstance(number, int) or number <= 0 or number > 999999999:
        raise ValueError('Invalid native Book Dash identity')
    if not re.fullmatch(r'https://bookdash\.org/books/[a-z0-9]+(?:-[a-z0-9]+)*/', url):
        raise ValueError('Unexpected canonical book URL')
    if row.get('languages') != [english_id] or not title or len(title) > 500 or '<' in title or re.search(r'[\x00-\x1f]', title):
        raise ValueError('Explicit single-language English edition and title required')
    if not page or len(page.encode()) > MAX_BYTES: raise ValueError('Empty or oversized public book page')
    parsed = BookPage(); parsed.feed(page)
    if not 4 <= len(parsed.pages) <= 100 or not parsed.credits:
        raise ValueError('Complete public gallery and source creator credits required')
    credits = list({(c['name'], c['role']): c for c in parsed.credits}.values())
    return {'key': f'fcd:v1:bookdash:{number}', 'kind': 'book', 'title': title,
        'contributors': credits, 'identifiers': [{'scheme': 'bookdash', 'value': str(number)}],
        'languages': ['en'], 'subjects': ['Children’s picture books'], 'publisher': 'Book Dash', 'relations': [],
        'locations': [{'id': f'bookdash:{number}', 'host': 'Book Dash', 'landingUrl': url, 'readerUrl': url,
            'access': 'free_full_text', 'downloads': [], 'license': {'id': 'CC-BY-4.0',
                'url': 'https://creativecommons.org/licenses/by/4.0/',
                'statement': 'Book Dash publishes its books under CC BY 4.0. Credit Book Dash and the original creators.'},
            'evidence': {'sourceId': 'bookdash', 'field': f'Public full-book gallery ({len(parsed.pages)} pages) + publisher free-reading/CC BY 4.0 policy',
                'observedAt': observed_at, 'policyUrl': POLICY}}],
        'provenance': [{'sourceId': 'bookdash', 'sourceRecordId': str(number), 'recordUrl': url,
            'retrievedAt': observed_at, 'mappingVersion': 'bookdash-public-metadata-v1'}]}


def fetch(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or parsed.netloc != 'bookdash.org': raise ValueError('Unexpected source origin')
    request = urllib.request.Request(url, headers={'User-Agent': 'MyBookshelf metadata importer (non-commercial; github.com/ddk220-light/MyBookshelf-web)'})
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            raise ValueError('Unexpected source redirect')
    opener = urllib.request.build_opener(NoRedirect)
    for attempt in range(3):
        try:
            with opener.open(request, timeout=20) as response:
                raw = response.read(MAX_BYTES + 1)
                if len(raw) > MAX_BYTES: raise ValueError('Source metadata exceeds bound')
                return raw, response.headers
        except urllib.error.HTTPError as error:
            if error.code not in (429, 502, 503, 504) or attempt == 2:
                raise ValueError(f'Source HTTP {error.code}: {url}') from error
            retry = error.headers.get('Retry-After', '')
            if retry and (not retry.isdigit() or int(retry) > 10):
                raise ValueError('Source requested a longer cooldown; retry the import later') from error
            time.sleep(max(2 + 2 * attempt, int(retry or 0)))


def import_catalog(limit, selected_ids=None):
    if not 1 <= limit <= 100: raise ValueError('Book Dash subset must contain 1–100 records')
    raw_policy, _ = fetch(POLICY)
    policy = ' '.join(unescape(re.sub('<[^>]+>', ' ', raw_policy.decode())).split())
    if not re.search(r'publish all of our books under a Creative Commons CC BY 4\.0', policy):
        raise ValueError('Publisher book licence policy needs review')
    time.sleep(1.1)
    raw_language, _ = fetch(ORIGIN + '/wp-json/wp/v2/languages?slug=eng')
    languages = json.loads(raw_language)
    if len(languages) != 1 or languages[0].get('slug') != 'eng' or languages[0].get('name') != 'English':
        raise ValueError('Source language taxonomy changed')
    english_id = languages[0]['id']
    parameters = {'languages': english_id, 'per_page': limit, 'page': 1, '_fields': 'id,title,link,languages,modified_gmt'}
    if selected_ids:
        if len(selected_ids) > limit or len(set(selected_ids)) != len(selected_ids) or any(not isinstance(i, int) or i < 1 or i > 999999999 for i in selected_ids):
            raise ValueError('Invalid pinned source identities')
        parameters.update(include=','.join(str(i) for i in selected_ids), orderby='include')
    source_url = ORIGIN + '/wp-json/wp/v2/books?' + urllib.parse.urlencode(parameters)
    time.sleep(1.1)
    raw_catalog, headers = fetch(source_url)
    rows = json.loads(raw_catalog)
    if not isinstance(rows, list) or not rows or len(rows) > limit: raise ValueError('Invalid or empty source catalog')
    if selected_ids and {row.get('id') for row in rows} != set(selected_ids):
        raise ValueError('Pinned book metadata missing; source review required before changing saved identities')
    records, source_hash = [], hashlib.sha256(raw_policy + raw_language + raw_catalog)
    for row in rows:
        time.sleep(1.1)
        raw_page, _ = fetch(row['link'])
        observed_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        records.append(map_record(row, raw_page.decode(), observed_at, english_id)); source_hash.update(raw_page)
    if len({r['key'] for r in records}) != len(records): raise ValueError('Duplicate native book identity')
    records.sort(key=lambda record: int(record['identifiers'][0]['value']))
    payload = json.dumps(records, ensure_ascii=False, separators=(',', ':')).encode()
    return {'schemaVersion': 1, 'sourceId': 'bookdash', 'sourceUrl': source_url,
        'importedAt': min(record['provenance'][0]['retrievedAt'] for record in records),
        'revision': hashlib.sha256(payload).hexdigest(), 'sourceSha256': source_hash.hexdigest(),
        'complete': False, 'sourceLanguageRecordCount': languages[0].get('count'),
        'coverageNote': 'Bounded English-language editions, pinned to native IDs after initial selection; not the complete catalog. No reading levels inferred.',
        'recordCount': len(records), 'records': records}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--max-records', type=int, default=30)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    selected_ids = None
    if Path(args.output).exists():
        prior = json.loads(Path(args.output).read_text())
        if prior.get('sourceId') != 'bookdash': raise ValueError('Unexpected active source')
        if any(not re.fullmatch(r'fcd:v1:bookdash:[1-9]\d{0,8}', record.get('key', '')) for record in prior['records']):
            raise ValueError('Invalid active source identity')
        selected_ids = [int(record['key'].split(':')[-1]) for record in prior['records']]
    result = import_catalog(args.max_records, selected_ids)
    activate(result, args.output)
    print(json.dumps({k: result[k] for k in ['sourceId', 'recordCount', 'revision', 'complete', 'sourceLanguageRecordCount']}))


if __name__ == '__main__': main()
