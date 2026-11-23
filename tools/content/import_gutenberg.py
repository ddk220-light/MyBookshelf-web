#!/usr/bin/env python3
"""Bounded metadata-only import of Project Gutenberg's official RDF archive.

No archive extraction, ebook download or runtime writable disk dependency.
Build a validated snapshot, then replace the previous snapshot atomically.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import tarfile
import tempfile
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ARCHIVE = 'https://www.gutenberg.org/cache/epub/feeds/rdf-files.tar.bz2'
NS = {'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      'dc': 'http://purl.org/dc/terms/', 'pg': 'http://www.gutenberg.org/2009/pgterms/'}
ABOUT = '{' + NS['rdf'] + '}about'
MAX_XML = 2 * 1024 * 1024
MAX_DOWNLOAD = 150 * 1024 * 1024
MIMES = {'text/html', 'text/plain', 'application/epub+zip', 'application/pdf', 'application/x-mobipocket-ebook'}


def text(element, limit=2000):
    return '' if element is None else ' '.join(''.join(element.itertext()).split())[:limit]


def supplied_url(value):
    try:
        u = urllib.parse.urlsplit(value)
        if u.scheme not in ('https', 'http') or u.username or u.password or u.port not in (None, 80, 443):
            return None
        if u.hostname not in ('www.gutenberg.org', 'gutenberg.org'): return None
        return value if not re.search(r'[\x00-\x20\x7f]', value) else None
    except (TypeError, ValueError): return None


def parse_record(raw, observed_at):
    if len(raw) > MAX_XML or b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        raise ValueError('Unsafe or oversized RDF metadata')
    root = ET.fromstring(raw)
    ebook = root.find('pg:ebook', NS)
    if ebook is None: raise ValueError('Missing ebook record')
    match = re.fullmatch(r'(?:https?://(?:www\.)?gutenberg.org/)?ebooks/([1-9]\d{0,8})', ebook.get(ABOUT, ''))
    title = text(ebook.find('dc:title', NS), 500)
    if not match or not title: raise ValueError('Invalid Gutenberg identity/title')
    number = match.group(1)
    kind = text(ebook.find('dc:type/rdf:Description/rdf:value', NS))
    if kind != 'Text': return None
    rights = text(ebook.find('dc:rights', NS))
    languages = [text(x, 40) for x in ebook.findall('dc:language/rdf:Description/rdf:value', NS)]
    authors = [text(x, 240) for x in ebook.findall('dc:creator/pg:agent/pg:name', NS)]
    formats = []
    for file in ebook.findall('dc:hasFormat/pg:file', NS):
        url = supplied_url(file.get(ABOUT, ''))
        mime = text(file.find('dc:format/rdf:Description/rdf:value', NS)).split(';')[0].strip()
        # The legacy virtual HTML endpoint can return 404 even while the RDF
        # supplies a working /files/ HTML edition. Generated EPUB/Kindle routes
        # still work; retain those supplied URLs without inventing replacements.
        if url and mime == 'text/html' and urllib.parse.urlsplit(url).path.startswith('/ebooks/'): continue
        if url and mime in MIMES and not any(f['url'] == url for f in formats):
            formats.append({'url': url, 'mimeType': mime})
    # Do not infer a reusable/global public domain licence from catalog membership.
    # This first mapping only recognizes the exact per-item rights statement.
    free = rights == 'Public domain in the USA.' and bool(formats)
    landing = 'https://www.gutenberg.org/ebooks/' + number
    location = {'id': 'gutenberg:' + number, 'host': 'Project Gutenberg', 'landingUrl': landing,
                'downloads': formats, 'access': 'free_full_text' if free else 'unknown',
                'license': {'statement': rights or 'Rights not stated'}, 'rightsJurisdiction': 'US',
                'evidence': {'sourceId': 'gutenberg', 'field': 'dcterms:rights + dcterms:hasFormat', 'observedAt': observed_at}}
    reader = next((f['url'] for f in formats if f['mimeType'] == 'text/html'), None)
    if reader: location['readerUrl'] = reader
    return {'key': 'fcd:v1:gutenberg:' + number, 'kind': 'book', 'title': title,
            'contributors': [{'name': a, 'role': 'author'} for a in authors[:20]],
            'identifiers': [{'scheme': 'gutenberg', 'value': number}], 'languages': list(dict.fromkeys(languages)),
            'subjects': [text(x, 300) for x in ebook.findall('dc:subject/rdf:Description/rdf:value', NS)][:30],
            'publishedAt': text(ebook.find('dc:issued', NS), 20) or None, 'relations': [],
            'locations': [location], 'provenance': [{'sourceId': 'gutenberg', 'sourceRecordId': number,
                'recordUrl': landing, 'retrievedAt': observed_at, 'mappingVersion': 'gutenberg-rdf-v2'}]}


def snapshot(records, observed_at, source_url, complete=False):
    records = sorted(records, key=lambda item: int(item['identifiers'][0]['value']))
    if not records or len({r['key'] for r in records}) != len(records): raise ValueError('Empty or duplicate catalog')
    payload = json.dumps(records, ensure_ascii=False, separators=(',', ':'))
    return {'schemaVersion': 1, 'sourceId': 'gutenberg', 'sourceUrl': source_url,
            'importedAt': observed_at, 'revision': hashlib.sha256(payload.encode()).hexdigest(),
            'complete': complete, 'recordCount': len(records), 'records': records}


def activate(data, output):
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
    if not data['records'] or data['recordCount'] != len(data['records']) or len(serialized) > 50 * 1024 * 1024:
        raise ValueError('Invalid or oversized normalized catalog')
    # Refuse accidental mass removal on a refresh. A deliberate smaller pilot
    # needs an explicit new output path and review, not an empty-success import.
    if output.exists():
        prior = json.loads(output.read_text())
        if data['recordCount'] < prior['recordCount'] * .8: raise ValueError('Catalog shrink requires review')
    temp = None
    try:
        with tempfile.NamedTemporaryFile(dir=output.parent, delete=False) as stream:
            temp = stream.name
            stream.write(serialized)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, output)
    finally:
        if temp and os.path.exists(temp): os.unlink(temp)


class BoundedReader:
    def __init__(self, stream): self.stream, self.count = stream, 0
    def read(self, size=-1):
        chunk = self.stream.read(min(size if size >= 0 else MAX_DOWNLOAD + 1, 1024 * 1024))
        self.count += len(chunk)
        if self.count > MAX_DOWNLOAD: raise ValueError('Compressed metadata download exceeds limit')
        return chunk


def import_archive(stream, limit, observed_at, source_url):
    records = []
    seen = set()
    complete = True
    with tarfile.open(fileobj=BoundedReader(stream), mode='r|bz2') as archive:
        for member in archive:
            if not member.isfile() or not member.name.endswith('.rdf'): continue
            if member.size > MAX_XML: raise ValueError('RDF entry exceeds limit')
            entry = archive.extractfile(member)
            record = parse_record(entry.read(MAX_XML + 1), observed_at)
            if record and record['key'] not in seen:
                records.append(record)
                seen.add(record['key'])
            if len(records) >= limit:
                complete = False
                break
    return snapshot(records, observed_at, source_url, complete)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', help='Local RDF tar.bz2 for reproducible/offline import')
    parser.add_argument('--output', required=True)
    parser.add_argument('--max-records', type=int, default=1000)
    parser.add_argument('--observed-at', help='Original retrieval time (required for an offline archive)')
    args = parser.parse_args()
    if not 1 <= args.max_records <= 10000: parser.error('max-records must be between 1 and 10000')
    if args.input and not args.observed_at: parser.error('--input requires the original --observed-at timestamp')
    observed = args.observed_at or datetime.datetime.now(datetime.timezone.utc).isoformat()
    stamp = datetime.datetime.fromisoformat(observed.replace('Z', '+00:00'))
    if stamp.tzinfo is None or stamp > datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=5):
        parser.error('observed-at must be a valid past timestamp with timezone')
    if args.input:
        with open(args.input, 'rb') as stream: data = import_archive(stream, args.max_records, observed, ARCHIVE)
    else:
        req = urllib.request.Request(ARCHIVE, headers={'User-Agent': 'MyBookshelf metadata importer (non-commercial; github.com/ddk220-light/MyBookshelf-web)'})
        with urllib.request.urlopen(req, timeout=30) as stream:
            if stream.geturl() != ARCHIVE: raise ValueError('Unexpected metadata redirect')
            data = import_archive(stream, args.max_records, observed, ARCHIVE)
    activate(data, args.output)
    print(json.dumps({'records': data['recordCount'], 'complete': data['complete'], 'revision': data['revision']}))


if __name__ == '__main__': main()
