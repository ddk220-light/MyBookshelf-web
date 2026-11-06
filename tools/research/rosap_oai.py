"""ROSA P's explicitly published OAI Dublin Core metadata service, research only."""
import fcntl
import hashlib
import json
from pathlib import Path
import re
import time
import xml.etree.ElementTree as ET
from run_source_reviews import now, robots, request, pacing_seconds
from source_registry import REGISTRY, USER_AGENT, request_url, evaluate

ENDPOINT = 'https://rosap.ntl.bts.gov/fedora/oai'
OAI = '{http://www.openarchives.org/OAI/2.0/}'
DC = '{http://purl.org/dc/elements/1.1/}'
LIMIT = 512*1024


def parse(body):
    if len(body) > LIMIT or b'<!DOCTYPE' in body.upper() or b'<!ENTITY' in body.upper():
        raise ValueError('Unsafe or oversized metadata XML')
    root = ET.fromstring(body)
    if root.tag != OAI + 'OAI-PMH':
        raise ValueError('Not OAI metadata')
    errors = [{'code': n.get('code'), 'message': n.text} for n in root.findall(OAI+'error')]
    rows = []
    for record in root.findall('.//'+OAI+'record'):
        header = record.find(OAI+'header')
        sid = header.findtext(OAI+'identifier') if header is not None else None
        if not sid or not re.fullmatch(r'oai:dot\.stacks:dot:[1-9][0-9]*', sid):
            raise ValueError('Missing or wrong repository identity')
        if header.get('status') == 'deleted':
            continue
        meta = record.find(OAI+'metadata/{http://www.openarchives.org/OAI/2.0/oai_dc/}dc')
        if meta is None:
            raise ValueError('Missing Dublin Core; full-text modes unsupported')
        def values(name):
            return [' '.join(''.join(n.itertext()).split()) for n in meta.findall(DC+name)]
        titles = values('title')
        if not titles or not titles[0]:
            raise ValueError('Missing title')
        native = sid.rsplit(':', 1)[1]
        rows.append({'id': sid, 'title': titles[0], 'native_dot_id': native,
            'metadata_datestamp': header.findtext(OAI+'datestamp'), 'dates': values('date'),
            'identifiers': values('identifier'), 'languages': values('language'),
            'types': values('type'), 'rights': values('rights'),
            'landing_page': 'https://rosap.ntl.bts.gov/view/dot/'+native,
            'reading_access_verified': False})
    if len({r['id'] for r in rows}) != len(rows) or (errors and rows):
        raise ValueError('Duplicate identities or contradictory error payload')
    return {'results': rows, 'provider_errors': errors,
            'resumption_token': root.findtext('.//'+OAI+'resumptionToken')}


def fetch_case(source, case, policy, proof):
    req = case['request']; params = req.get('params', {})
    if (req.get('method') != 'GET' or req.get('url') != ENDPOINT
            or set(params) != {'verb', 'metadataPrefix', 'identifier'}
            or params['verb'] != 'GetRecord' or params['metadataPrefix'] != 'oai_dc'
            or not re.fullmatch(r'oai:dot\.stacks:dot:[1-9][0-9]*', params['identifier'])):
        raise ValueError('Only published native Dublin Core GetRecord requests supported')
    url = request_url(req); body = b''; parsed = {}; error = None
    h = {'status': None, 'truncated': False}
    if policy is False or policy is not None and not policy.can_fetch(USER_AGENT, url):
        error = 'Unavailable/disallowing policy; no query sent'
    else:
        h, body = request(url, limit=LIMIT)
        if h['status'] != 200 or h['truncated']:
            error = h.get('error') or 'Non-200 or oversized metadata'
        else:
            try:
                parsed = parse(body)
                if any(r['id'] != params['identifier'] for r in parsed['results']):
                    raise ValueError('GetRecord returned a different native record')
            except (ValueError, TypeError, KeyError, ET.ParseError) as exc:
                error = str(exc)
    obs = evaluate(source, case, {'observed_at': now(), 'http': h, 'robots_evidence': proof,
        'response_sha256': hashlib.sha256(body).hexdigest(), 'error': error,
        'provider_errors': parsed.get('provider_errors', []), 'full_content_downloaded': False},
        {'results': parsed.get('results', [])})
    return obs


def probe(source, case_ids=None):
    if source['id'] != 'rosa-p' or source['query']['endpoint'] != ENDPOINT:
        raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(ENDPOINT)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            time.sleep(pacing_seconds(policy)); row = fetch_case(source, case, policy, proof)
            with (REGISTRY/'examples/rosa-p.jsonl').open('a') as f:
                f.write(json.dumps(row, ensure_ascii=False, sort_keys=True)+'\n')
            print(case['id'], row['verdict'], row['error'], flush=True)
            if policy is False or row['http']['status'] in (401,403,429,503) or row['http']['status'] is None:
                break
