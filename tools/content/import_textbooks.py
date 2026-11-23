#!/usr/bin/env python3
"""Import CC0 catalog metadata, never reviews, descriptions or textbook files."""
import argparse
import csv
import datetime
import hashlib
import io
import ipaddress
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request
from import_gutenberg import activate

SOURCE = 'https://open.umn.edu/opentextbooks/download.csv'
MAX_BYTES = 8 * 1024 * 1024
LICENSES = {'Attribution', 'Attribution-ShareAlike', 'Attribution-NonCommercial',
            'Attribution-NonCommercial-ShareAlike', 'Attribution-NonCommercial-NoDerivs',
            'Attribution-NoDerivs', 'No Rights Reserved', 'Free Documentation License (GNU)'}


def web_url(value):
    try:
        if not value or len(value) > 4000 or re.search(r'[\x00-\x20\x7f]', value): return None
        parsed = urllib.parse.urlsplit(value)
        host = parsed.hostname or ''
        if parsed.scheme not in ('http', 'https') or parsed.username or parsed.password or parsed.port not in (None, 80, 443): return None
        if '.' not in host or host.endswith(('.localhost', '.local', '.internal', '.invalid', '.test')): return None
        try:
            ipaddress.ip_address(host)
            return None
        except ValueError: pass
        if re.search(r'/(login|signin|sign-in|register)(/|\?|$)', parsed.path, re.I): return None
        # Reject numeric IP spellings too; these are not publisher domains.
        if re.fullmatch(r'[0-9.xa-f]+', host, re.I): return None
        return value
    except (ValueError, TypeError): return None


def isbn13(value):
    value = re.sub(r'[-\s]', '', value)
    if not re.fullmatch(r'97[89]\d{10}', value): return None
    return value if sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(value)) % 10 == 0 else None


def parse_record(row, observed_at):
    number, title = row['Otl id'].strip(), row['Title'].strip()
    if not re.fullmatch(r'[1-9]\d{0,8}', number) or not title or len(title) > 2000: raise ValueError('Invalid textbook identity/title')
    record_url = web_url(row['Library URL'].strip())
    if not record_url or urllib.parse.urlsplit(record_url).hostname != 'open.umn.edu': raise ValueError('Invalid catalog record URL')
    statement = row['License'].strip()
    locations = {}
    for index in range(1, 7):
        kind = row.get(f'Type {index}', '').strip()
        url = web_url(row.get(f'URL {index}', '').strip())
        if row.get(f'Price {index}', '').strip() != '$0.00' or kind not in ('Online', 'PDF', 'eBook') or not url: continue
        if url not in locations:
            locations[url] = {'id': f'open-textbook-library:{number}:{index}',
                'host': urllib.parse.urlsplit(url).hostname, 'landingUrl': url,
                'access': 'free_full_text' if statement in LICENSES else 'unknown',
                'license': {'statement': statement or 'Licence not stated'}, 'downloads': [],
                'evidence': {'sourceId': 'open-textbook-library', 'field': f'License + Type {index} + URL {index} + Price {index} ($0.00)', 'observedAt': observed_at}}
        location = locations[url]
        # A catalog's "PDF" label often links to an HTML page. Only an
        # explicitly supplied file URL can become a download action.
        path = urllib.parse.urlsplit(url).path.lower()
        mime = 'application/pdf' if kind == 'PDF' and path.endswith('.pdf') else 'application/epub+zip' if kind == 'eBook' and path.endswith('.epub') else None
        if mime and not location['downloads']: location['downloads'].append({'url': url, 'mimeType': mime})
        if kind == 'Online': location['readerUrl'] = url
    if not locations:
        locations[record_url] = {'id': f'open-textbook-library:{number}:catalog', 'host': 'Open Textbook Library',
            'landingUrl': record_url, 'access': 'metadata_only', 'downloads': [], 'license': {'statement': statement or 'Licence not stated'},
            'evidence': {'sourceId': 'open-textbook-library', 'field': 'Library URL; no supported zero-price reading format', 'observedAt': observed_at}}
    identifiers = [{'scheme': 'open-textbook-library', 'value': number}]
    isbn = isbn13(row.get('ISBN13', ''))
    if isbn: identifiers.append({'scheme': 'isbn13', 'value': isbn})
    # Preserve explicit contributor roles; absent language remains unknown.
    contributors = []
    for credit in row.get('Contributors', '').split(' / '):
        if not credit.strip(): continue
        name, separator, role = credit.rpartition(' - ')
        known = role.lower() in ('author', 'editor', 'illustrator', 'translator')
        contributors.append({'name': (name if separator and known else credit).strip()[:500],
                             'role': role.lower() if separator and known else 'contributor'})
    year = row.get('Copyright year', '').strip()
    return {'key': f'fcd:v1:open-textbook-library:{number}', 'kind': 'learning_resource', 'title': title[:500],
        'contributors': contributors[:30], 'identifiers': identifiers, 'languages': ['und'],
        'subjects': [row[f'Subject {i}'].strip()[:300] for i in (1, 2) if row.get(f'Subject {i}', '').strip()],
        'publishedAt': year if re.fullmatch(r'\d{4}', year) else None,
        'container': {'title': row['Publisher'].strip()[:300]} if row.get('Publisher', '').strip() else None,
        'relations': [], 'locations': list(locations.values()),
        'provenance': [{'sourceId': 'open-textbook-library', 'sourceRecordId': number, 'recordUrl': record_url,
            'retrievedAt': observed_at, 'mappingVersion': 'otl-csv-v1'}]}


def import_csv(raw, observed_at):
    if not raw or len(raw) > MAX_BYTES: raise ValueError('Empty or oversized catalog')
    csv.field_size_limit(1024 * 1024)
    reader = csv.DictReader(io.StringIO(raw.decode('utf-8-sig'), newline=''))
    required = {'Otl id', 'Title', 'Library URL', 'License', 'Type 1', 'URL 1', 'Price 1'}
    if not required.issubset(reader.fieldnames or []): raise ValueError('Catalog schema changed')
    records, seen = [], set()
    for row in reader:
        if None in row or len(records) >= 10000: raise ValueError('Malformed or oversized catalog')
        record = parse_record(row, observed_at)
        if record['key'] in seen: raise ValueError('Duplicate textbook identity')
        records.append(record); seen.add(record['key'])
    if not records: raise ValueError('Empty catalog')
    records.sort(key=lambda r: int(r['identifiers'][0]['value']))
    payload = json.dumps(records, ensure_ascii=False, separators=(',', ':')).encode()
    return {'schemaVersion': 1, 'sourceId': 'open-textbook-library', 'sourceUrl': SOURCE,
        'importedAt': observed_at, 'revision': hashlib.sha256(payload).hexdigest(), 'sourceSha256': hashlib.sha256(raw).hexdigest(),
        'complete': False, 'coverageNote': 'Official CSV export; does not establish complete website coverage. Language not supplied.',
        'recordCount': len(records), 'records': records}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input')
    parser.add_argument('--observed-at')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if args.input and not args.observed_at: parser.error('Offline input requires original --observed-at')
    observed = args.observed_at or datetime.datetime.now(datetime.timezone.utc).isoformat()
    stamp = datetime.datetime.fromisoformat(observed.replace('Z', '+00:00'))
    if stamp.tzinfo is None or stamp > datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=5): parser.error('Invalid observation time')
    if args.input:
        with Path(args.input).open('rb') as stream: raw = stream.read(MAX_BYTES + 1)
    else:
        request = urllib.request.Request(SOURCE, headers={'User-Agent': 'MyBookshelf metadata importer (non-commercial; github.com/ddk220-light/MyBookshelf-web)'})
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.geturl() != SOURCE: raise ValueError('Unexpected catalog redirect')
            raw = response.read(MAX_BYTES + 1)
    result = import_csv(raw, observed)
    activate(result, args.output)
    print(json.dumps({k: result[k] for k in ('sourceId', 'recordCount', 'revision', 'sourceSha256')}))


if __name__ == '__main__': main()
