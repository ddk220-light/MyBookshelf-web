"""Bounded public US Topo metadata export queries. Never retrieve map files."""
import csv
import fcntl
import hashlib
import io
import json
import re
import time
import zipfile
from collections import Counter
from pathlib import Path
from urllib.parse import unquote, urlsplit

from run_source_reviews import robots, request, pacing_seconds, now
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT = 'https://prd-tnm.s3.amazonaws.com/StagedProducts/Maps/Metadata/ustopo_current.zip'
MAX_BYTES = 16 * 1024 * 1024
MAX_EXPANDED = 128 * 1024 * 1024
MEMBERS = {'ustopo_current.csv', 'ustopo_current.txt', 'ustopo_current_readme.txt'}
UUID = re.compile(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}')
FIELDS = {'product_auth_id', 'gnis_cell_id', 'series', 'edition', 'map_name', 'primary_state',
          'date_on_map', 'publication_date', 'production_date', 'distribution_date',
          'product_inventory_uuid', 'db_uuid', 'inv_uuid', 'product_url', 'product_filename'}


def parse(body):
    if not isinstance(body, bytes) or len(body) > MAX_BYTES:
        raise ValueError('Metadata archive exceeds bound')
    try:
        with zipfile.ZipFile(io.BytesIO(body)) as z:
            info = z.infolist()
            if len(info) != 3 or {i.filename for i in info} != MEMBERS or sum(i.file_size for i in info) > MAX_EXPANDED:
                raise ValueError('Unexpected or oversized metadata archive members')
            if any(i.flag_bits & 1 or i.file_size / max(i.compress_size, 1) > 200 for i in info):
                raise ValueError('Encrypted or excessive expansion metadata archive')
            summary = z.read('ustopo_current.txt').decode('utf-8-sig')
            count = re.search(r'Total Files\s*\|\s*(\d+)', summary)
            updated = re.search(r'Last Updated\s*\|\s*(\d{4}-\d{2}-\d{2})', summary)
            if not count or not updated or not 0 < int(count[1]) <= 150000:
                raise ValueError('Missing/bad provider metadata summary')
            records, excluded, seen = [], [], 0
            with z.open('ustopo_current.csv') as stream:
                reader = csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8-sig', newline=''), strict=True)
                if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames) or not FIELDS <= set(reader.fieldnames):
                    raise ValueError('Missing/duplicate CSV identity/version fields')
                for row in reader:
                    seen += 1
                    if seen > 150000 or None in row or any(row[k] is None for k in FIELDS):
                        raise ValueError('Truncated/malformed CSV row')
                    u = urlsplit(row['product_url'])
                    valid = (all(re.fullmatch(r'[1-9]\d*', row[k]) for k in ['product_auth_id', 'gnis_cell_id'])
                             and all(UUID.fullmatch(row[k]) for k in ['product_inventory_uuid', 'db_uuid', 'inv_uuid'])
                             and row['series'] == 'US Topo' and row['edition'] == 'Current'
                             and row['map_name'].strip() and row['primary_state'].strip()
                             and re.fullmatch(r'\d{4}', row['date_on_map'])
                             and u.scheme == 'https' and u.netloc == 'prd-tnm.s3.amazonaws.com'
                             and not u.query and not u.fragment and not u.username
                             and re.fullmatch(r'/StagedProducts/Maps/USTopo/Current/PDF/[A-Z]{2}/[^/]+\.pdf', u.path)
                             and unquote(u.path.rsplit('/', 1)[-1]) == row['product_filename']
                             and not any(c in row['product_filename'] for c in ['/', '\\', '\x00', '\n', '\r']))
                    if not valid:
                        excluded.append({'id': row['product_auth_id'], 'title': row['map_name'], 'reason': 'Invalid native identity/version or published product URL'})
                        continue
                    records.append({'id': row['product_auth_id'], 'title': row['map_name'],
                        'state': row['primary_state'], 'landing_page': row['product_url'],
                        **{k: row[k] for k in ['gnis_cell_id', 'series', 'edition', 'date_on_map', 'publication_date',
                            'production_date', 'distribution_date', 'product_inventory_uuid', 'db_uuid', 'inv_uuid']},
                        'reading_access_verified': False})
            if seen != int(count[1]):
                raise ValueError('CSV record count differs from provider summary')
    except (zipfile.BadZipFile, UnicodeError, csv.Error, RuntimeError) as exc:
        raise ValueError('Invalid metadata archive: '+str(exc)) from exc
    counts = {key: Counter(r[key] for r in records) for key in ['id', 'gnis_cell_id', 'landing_page']}
    unique = []
    for row in records:
        if any(counts[key][row[key]] != 1 for key in counts):
            excluded.append({'id': row['id'], 'title': row['title'], 'reason': 'Conflicting current-cell/version identity; not merged'})
        else:
            unique.append(row)
    if not unique:
        raise ValueError('No unambiguous current map records')
    return {'records': unique, 'excluded': excluded, 'provider_count': seen,
            'provider_updated': updated[1], 'archive_sha256': hashlib.sha256(body).hexdigest(),
            'scope': 'Published current US Topo map metadata only; no historical maps, elevation, hydrography or map bodies'}


def search(rows, query):
    if not {'field', 'value'} <= set(query) <= {'field', 'value', 'state'} or query['field'] not in ('title', 'id') or not isinstance(query['value'], str):
        raise ValueError('Unsupported US Topo metadata query')
    words = re.findall(r'\w+', query['value'].casefold())
    if not words or 'state' in query and (not isinstance(query['state'], str) or not query['state'].strip()):
        raise ValueError('Empty or invalid query')
    return [r for r in rows if ('state' not in query or r['state'].casefold() == query['state'].casefold())
            and (r['id'] == query['value'] if query['field'] == 'id' else all(w in re.findall(r'\w+', r['title'].casefold()) for w in words))]


def assess(source, case, cap, body, parsed=None):
    error, rows = cap.get('error'), []
    try:
        h = cap['http']
        if error or h['status'] != 200 or h['truncated']:
            raise ValueError(error or 'Unsuccessful/incomplete metadata capture')
        digest = hashlib.sha256(body).hexdigest()
        if h['sampled_bytes_sha256'] != digest or parsed is not None and parsed['archive_sha256'] != digest:
            raise ValueError('Mismatched metadata capture')
        if case['request']['method'] != 'GET' or case['request']['url'] != ENDPOINT:
            raise ValueError('Unreviewed request')
        rows = search((parsed or parse(body))['records'], case['request']['local_query'])
    except (KeyError, TypeError, ValueError) as exc:
        error = str(exc)
    return evaluate(source, case, {**cap, 'error': error, 'full_content_downloaded': False,
        'response_sha256': hashlib.sha256(body).hexdigest(),
        'query_execution': 'Local title/state/native product-auth-ID search over current US Topo metadata export'}, {'results': rows})


def probe(source, case_ids=None):
    if source['id'] != 'usgs-national-map' or source['query']['endpoint'] != ENDPOINT:
        raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(ENDPOINT)
        body, parsed = b'', None
        cap = {'observed_at': now(), 'robots_evidence': proof, 'http': {'status': None, 'truncated': False}}
        if policy is False or policy is not None and not all(policy.can_fetch(a, ENDPOINT) for a in [USER_AGENT, 'ChatGPT-User', 'OAI-SearchBot']):
            cap['error'] = 'Policy unavailable/disallowing'
        else:
            time.sleep(pacing_seconds(policy))
            cap['http'], body = request(ENDPOINT, limit=MAX_BYTES)
            if cap['http']['status'] == 200 and not cap['http']['truncated']:
                try:
                    parsed = parse(body)
                except ValueError as exc:
                    cap['error'] = str(exc)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            row = assess(source, case, cap, body, parsed)
            with (REGISTRY / 'examples/usgs-national-map.jsonl').open('a') as f:
                f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], row['verdict'], row['error'], flush=True)
