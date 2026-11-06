"""Search the museum's explicitly published, pinned artwork metadata export.

Only artwork labels and native IDs; no images, ownership or full texts. The
live Art Institute API remains blocked and is not requested by this adapter.
"""
import fcntl
import hashlib
import json
from pathlib import Path
import re
import time

from nga_catalog import search
from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate

LIMIT = 32 * 1024 * 1024
FIELDS = ('id', 'title', 'artist_title', 'department_title', 'main_reference_number')


def parse(body):
    if not isinstance(body, bytes) or len(body) > LIMIT or not body.endswith(b'\n'):
        raise ValueError('Incomplete or oversized artwork metadata export')
    rows, seen = [], set()
    for line in body.splitlines():
        item = json.loads(line)
        if not set(FIELDS) <= set(item):
            raise ValueError('Missing artwork export fields')
        sid = item['id']
        if type(sid) is not int or sid <= 0 or sid in seen:
            raise ValueError('Invalid or duplicate native artwork identity')
        if any(item[k] is not None and not isinstance(item[k], str) for k in FIELDS[1:]):
            raise ValueError('Invalid artwork text fields')
        seen.add(sid)
        row = {k: item[k] for k in FIELDS}
        # Preserve a missing title as missing. It cannot pass a query example.
        row.update(id=str(sid), title=item['title'] or '', attribution=item['artist_title'] or '',
                   title_missing=not bool(item['title']), reading_access_verified=False,
                   landing_page=f'https://www.artic.edu/artworks/{sid}')
        rows.append(row)
    if not rows:
        raise ValueError('Empty artwork export')
    return rows


def assess(source, case, capture, rows):
    obs = {k: capture[k] for k in ('observed_at', 'http', 'response_sha256', 'robots_evidence')}
    obs.update(error=capture.get('error'), execution_mode='local-published-metadata-search',
               export_git_blob_sha=capture.get('git_blob_sha'), import_entry_count=len(rows),
               untitled_native_ids=[r['id'] for r in rows if r['title_missing']],
               full_content_downloaded=False, assessment_at=now())
    if (case['request']['method'] != 'GET' or case['request']['url'] != capture['http'].get('url')
            or capture.get('git_blob_sha') != source['query']['export_git_blob_sha']
            or capture['response_sha256'] != capture['http'].get('sampled_bytes_sha256')):
        obs['error'] = 'Mismatched export request or evidence hash'
    found = search(rows, case['request']['local_query']) if not obs['error'] else []
    return evaluate(source, case, obs, {'results': found})


def collect(source):
    url = source['query']['endpoint']
    if not re.fullmatch(r'https://raw\.githubusercontent\.com/art-institute-of-chicago/api-data/[0-9a-f]{40}/getting-started/allArtworks\.jsonl', url):
        raise ValueError('Only the pinned official artwork export is supported')
    policy, proof = robots(url)
    body, error, rows = b'', None, []
    http = {'url': url, 'status': None, 'truncated': False}
    if policy is False or policy is not None and not policy.can_fetch(USER_AGENT, url):
        error = 'Policy unavailable/disallows metadata export; no request sent'
    else:
        time.sleep(pacing_seconds(policy))
        http, body = request(url, LIMIT, timeout=45)
        if http['status'] != 200 or http['truncated']:
            error = http.get('error') or 'Non-200 or oversized metadata export'
    blob = hashlib.sha1(b'blob ' + str(len(body)).encode() + b'\0' + body).hexdigest()
    if not error:
        try:
            if blob != source['query']['export_git_blob_sha']:
                raise ValueError('Export blob differs from reviewed repository version')
            rows = parse(body)
        except (ValueError, TypeError, UnicodeError) as exc:
            error = str(exc)
    cap = {'source_id': source['id'], 'observed_at': now(), 'http': http,
           'robots_evidence': proof, 'response_sha256': hashlib.sha256(body).hexdigest(),
           'git_blob_sha': blob, 'error': error, 'import_entry_count': len(rows),
           'raw_export_retained': False, 'images_downloaded': False, 'retained_fields': list(FIELDS)}
    with (REGISTRY / 'examples/art-institute-chicago.access.jsonl').open('a') as out:
        out.write(json.dumps(cap, sort_keys=True) + '\n')
    return cap, rows


def probe(source, case_ids=None):
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        cap, rows = collect(source)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            obs = assess(source, case, cap, rows)
            with (REGISTRY / 'examples/art-institute-chicago.jsonl').open('a') as out:
                out.write(json.dumps(obs, ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], obs['verdict'], obs['error'], flush=True)
