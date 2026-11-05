"""Research-only local searches over NGA's published CC0 object metadata CSV.

No media, biographies, donor/owner/provenance fields or full texts are retained.
The export is pinned by a Git commit and Git blob SHA before queries count.
"""
import csv
import fcntl
import hashlib
import io
import json
from pathlib import Path
import re
import time

from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate

LIMIT = 96 * 1024 * 1024
FIELDS = ('objectid', 'uuid', 'accessionnum', 'title', 'displaydate', 'attribution',
          'classification', 'parentid', 'isvirtual', 'lastdetectedmodification')


def parse(body):
    if len(body) > LIMIT:
        raise ValueError('Oversized metadata export')
    reader = csv.DictReader(io.StringIO(body.decode('utf-8-sig'), newline=''))
    if not reader.fieldnames or len(reader.fieldnames) != len(set(reader.fieldnames)) or not set(FIELDS) <= set(reader.fieldnames):
        raise ValueError('Missing/duplicate object metadata columns')
    rows, seen = [], set()
    for item in reader:
        if None in item or any(item.get(k) is None for k in FIELDS):
            raise ValueError('Malformed object metadata row')
        sid = item['objectid']
        if not sid.isascii() or not sid.isdigit() or sid in seen:
            raise ValueError('Invalid/duplicate native object ID')
        seen.add(sid)
        row = {k: item[k] for k in FIELDS}
        row.update(id=sid, reading_access_verified=False)
        rows.append(row)
    if not rows:
        raise ValueError('Empty export')
    return rows


def search(rows, query):
    if query.get('mode') == 'native_id':
        return [r for r in rows if r['id'] == query['text']]
    field = {'title_tokens': 'title', 'artist_tokens': 'attribution'}.get(query.get('mode'))
    if not field or not isinstance(query.get('text'), str):
        raise ValueError('Only title/artist tokens or exact native IDs supported')
    terms = set(re.findall(r'\w+', query['text'].casefold()))
    return [r for r in rows if terms <= set(re.findall(r'\w+', r[field].casefold()))] if terms else []


def assess(source, case, capture, rows):
    observation = {k: capture[k] for k in ('observed_at', 'http', 'response_sha256', 'robots_evidence')}
    observation.update(error=capture.get('error'), execution_mode='local-CC0-metadata-search',
                       import_entry_count=len(rows), export_git_blob_sha=capture.get('git_blob_sha'),
                       imported_at=capture['observed_at'], full_content_downloaded=False,
                       assessment_at=now())
    if case['request']['url'] != capture['http'].get('url'):
        observation['error'] = 'Mismatched export URL'
    if capture.get('git_blob_sha') != source['query']['export_git_blob_sha']:
        observation['error'] = 'Export blob hash mismatch'
    results = search(rows, case['request']['local_query']) if not observation['error'] else []
    return evaluate(source, case, observation, {'results': results})


def collect(source):
    url = source['query']['endpoint']
    if not re.fullmatch(r'https://raw\.githubusercontent\.com/NationalGalleryOfArt/opendata/[0-9a-f]{40}/data/objects\.csv', url):
        raise ValueError('Only pinned published object metadata export allowed')
    policy, proof = robots(url)
    body, error, rows = b'', None, []
    http = {'url': url, 'status': None, 'truncated': False}
    if policy is False or policy is not None and not policy.can_fetch(USER_AGENT, url):
        error = 'Unavailable/disallowing robots policy; no export requested'
    else:
        time.sleep(pacing_seconds(policy))
        http, body = request(url, LIMIT)
        if http['status'] != 200 or http['truncated']:
            error = http.get('error') or 'Non-200 or oversized object export'
    blob = hashlib.sha1(b'blob ' + str(len(body)).encode() + b'\0' + body).hexdigest()
    if not error:
        try:
            if blob != source['query']['export_git_blob_sha']:
                raise ValueError('Export differs from reviewed repository blob')
            rows = parse(body)
        except (ValueError, UnicodeError, csv.Error) as exc:
            error = str(exc)
    capture = {'source_id': source['id'], 'observed_at': now(), 'http': http,
               'response_sha256': hashlib.sha256(body).hexdigest(), 'git_blob_sha': blob,
               'robots_evidence': proof, 'error': error, 'import_entry_count': len(rows),
               'retained_fields': list(FIELDS), 'images_downloaded': False,
               'raw_export_retained': False, 'query_verified': False}
    with (REGISTRY / 'examples/national-gallery-art.access.jsonl').open('a') as out:
        out.write(json.dumps(capture, sort_keys=True) + '\n')
    return capture, rows


def probe(source, case_ids=None):
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        capture, rows = collect(source)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            result = assess(source, case, capture, rows)
            with (REGISTRY / 'examples/national-gallery-art.jsonl').open('a') as out:
                out.write(json.dumps(result, ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], result['verdict'], result['returned_count'], result['error'], flush=True)
