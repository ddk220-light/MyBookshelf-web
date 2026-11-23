"""Reproduce reviewed complete metadata snapshots from already-downloaded exports.

No network requests. Download the manifest's exact public URL only after reviewing
provider policy. A changed export requires an explicit manifest/source review.
Example: python tools/content/prepare-complete-catalog.py onet /tmp/occupation_data.json
"""
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path
import sys
from urllib.parse import urlencode

BASE = Path(__file__).resolve().parents[2] / 'server/data/content'


def project(source, body):
    if source == 'national-gallery-art':
        items = csv.DictReader(io.StringIO(body.decode('utf-8-sig'), newline=''))
        return [{'id': str(r['objectid']), 'title': r['title'],
                 'url': 'https://www.nga.gov/artwork-search?' + urlencode({'keywords': r['title'] or r['objectid']}),
                 **({'artist': r['attribution']} if r['attribution'] else {})} for r in items]
    if source == 'art-institute-chicago':
        if not body.endswith(b'\n'):
            raise ValueError('Incomplete JSONL export')
        return [{'id': str(r['id']), 'title': r['title'] or '',
                 'url': f'https://www.artic.edu/artworks/{r["id"]}',
                 **({'artist': r['artist_title']} if r['artist_title'] else {})}
                for r in map(json.loads, body.splitlines())]
    if source == 'onet':
        data = json.loads(body)
        if data['table_id'] != 'occupation_data':
            raise ValueError('Wrong O*NET table')
        return [{'id': r['onetsoc_code'], 'title': r['title'],
                 'url': 'https://www.onetonline.org/link/summary/' + r['onetsoc_code']} for r in data['row']]
    raise ValueError('Unreviewed export')


def main(source, path):
    manifest = json.loads((BASE / 'complete-catalogs.json').read_text())
    meta = manifest['catalogs'][source]
    body = Path(path).read_bytes()
    if hashlib.sha256(body).hexdigest() != meta['sourceSha256']:
        raise ValueError('Source differs from reviewed complete export')
    records = project(source, body)
    if len(records) != meta['records'] or len({r['id'] for r in records}) != len(records):
        raise ValueError('Incomplete catalog or duplicate native identity')
    payload = json.dumps(records, ensure_ascii=False, separators=(',', ':')).encode()
    if hashlib.sha256(payload).hexdigest() != meta['recordsSha256']:
        raise ValueError('Projection differs from reviewed manifest')
    packed = gzip.compress(payload, mtime=0)
    # gzip headers can vary across Python/zlib versions; the JSON hash is stable.
    meta['compressedSha256'] = hashlib.sha256(packed).hexdigest()
    (BASE / meta['file']).write_bytes(packed)
    (BASE / 'complete-catalogs.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(source, len(records), 'complete metadata records reproduced')


if __name__ == '__main__':
    main(*sys.argv[1:])
