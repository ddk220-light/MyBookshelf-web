"""Permitted PMC OAI Dublin Core metadata lookups; never request full text.

The E-Utilities endpoint's robots policy disallows our query. PMC explicitly
documents this separate OAI metadata service and its own policy permits it.
"""
import fcntl
import hashlib
import json
from pathlib import Path
import re
import time
import xml.etree.ElementTree as ET
import zlib

from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate, request_url

ENDPOINT = 'https://pmc.ncbi.nlm.nih.gov/api/oai/v1/mh/'
LIMIT = 512 * 1024
OAI = '{http://www.openarchives.org/OAI/2.0/}'
DC = '{http://purl.org/dc/elements/1.1/}'


def decode(body, encoding):
    if not encoding:
        return body
    if encoding not in ('gzip', 'deflate'):
        raise ValueError('Unsupported response encoding')
    decoder = zlib.decompressobj(31 if encoding == 'gzip' else 15)
    decoded = decoder.decompress(body, LIMIT + 1)
    if len(decoded) > LIMIT or decoder.unconsumed_tail or not decoder.eof or decoder.unused_data:
        raise ValueError('Oversized, incomplete or concatenated compressed response')
    return decoded


def parse(body):
    if len(body) > LIMIT or b'<!DOCTYPE' in body.upper() or b'<!ENTITY' in body.upper():
        raise ValueError('Oversized or unsafe metadata XML')
    root = ET.fromstring(body)
    if root.tag != OAI + 'OAI-PMH':
        raise ValueError('Not an OAI-PMH response')
    errors = [{'code': e.get('code'), 'message': e.text} for e in root.findall(OAI + 'error')]
    if errors:
        return {'results': [], 'provider_errors': errors}
    rows, seen = [], set()
    for record in root.findall('.//' + OAI + 'record'):
        header = record.find(OAI + 'header')
        sid = header.findtext(OAI + 'identifier') if header is not None else None
        if not sid or not re.fullmatch(r'oai:pubmedcentral\.nih\.gov:[1-9]\d*', sid) or sid in seen:
            raise ValueError('Invalid/duplicate native OAI identity')
        seen.add(sid)
        if header.get('status') == 'deleted':
            continue
        metadata = record.find(OAI + 'metadata')
        if metadata is None:
            raise ValueError('Missing metadata')
        # JATS/full-text responses are not the requested Dublin Core contract.
        if metadata.find('{http://www.openarchives.org/OAI/2.0/oai_dc/}dc') is None:
            raise ValueError('Not Dublin Core metadata')
        def values(name):
            return [' '.join(''.join(n.itertext()).split()) for n in metadata.findall('.//' + DC + name)]
        titles = values('title')
        if not titles or not titles[0]:
            raise ValueError('Missing title')
        rows.append({'id': sid, 'pmcid': 'PMC' + sid.rsplit(':', 1)[1], 'title': titles[0],
                     'metadata_datestamp': header.findtext(OAI + 'datestamp'),
                     'sets': [x.text for x in header.findall(OAI + 'setSpec')],
                     'identifiers': values('identifier'), 'rights': values('rights'),
                     'dates': values('date'), 'languages': values('language'),
                     'types': values('type'), 'reading_access_verified': False})
    tokens = root.findall('.//' + OAI + 'resumptionToken')
    return {'results': rows, 'resumption_token': tokens[0].text if tokens else None}


def collect(source, cases, suffix='access'):
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(ENDPOINT)
        for case in cases:
            req = case['request'];params = req.get('params', {})
            if (req['method'] != 'GET' or req['url'] != ENDPOINT
                    or params.get('verb') not in ('GetRecord', 'ListRecords')
                    or set(params) - {'verb', 'identifier', 'metadataPrefix', 'from', 'until', 'set', 'resumptionToken'}
                    or ('metadataPrefix' in params and params['metadataPrefix'] != 'oai_dc')
                    or (params.get('resumptionToken') and (set(params) != {'verb', 'resumptionToken'}
                        or case.get('resumption_metadata_prefix') != 'oai_dc'))
                    or (params.get('metadataPrefix') != 'oai_dc' and not params.get('resumptionToken'))):
                raise ValueError('Only reviewed OAI Dublin Core metadata requests allowed')
            url = request_url(req);error = None;body = b'';parsed = {};http = {'url': url, 'status': None, 'truncated': False}
            if policy is False or policy is not None and not policy.can_fetch(USER_AGENT, url):
                error = 'Unavailable/disallowing OAI policy; no request sent'
            else:
                time.sleep(pacing_seconds(policy))
                http, body = request(url, LIMIT, {'Accept-Encoding': 'gzip, deflate', 'Accept': 'application/xml'})
                if http['status'] != 200 or http['truncated']:
                    error = http.get('error') or 'Non-200 or oversized OAI metadata response'
                else:
                    try:
                        parsed = parse(decode(body, http.get('response_headers', {}).get('Content-Encoding')))
                    except (ValueError, TypeError, KeyError, ET.ParseError, zlib.error) as exc:
                        error = str(exc)
            cap = {'source_id': source['id'], 'case_id': case['id'], 'observed_at': now(), 'request': req,
                   'http': http, 'response_sha256': hashlib.sha256(body).hexdigest(), 'robots_evidence': proof,
                   'parsed': parsed, 'error': error, 'full_content_downloaded': False, 'query_verified': False}
            with (REGISTRY / 'examples' / (source['id'] + '.oai-' + suffix + '.jsonl')).open('a') as out:
                out.write(json.dumps(cap, ensure_ascii=False, sort_keys=True) + '\n')
            if suffix == 'access':
                obs = {k: cap[k] for k in ('observed_at', 'http', 'response_sha256', 'robots_evidence', 'error')}
                obs.update(execution_mode='permitted-OAI-native-record-lookup', full_content_downloaded=False,
                           provider_errors=parsed.get('provider_errors', []))
                row = evaluate(source, case, obs, {'results': parsed.get('results', [])})
                with (REGISTRY / 'examples' / (source['id'] + '.jsonl')).open('a') as out:
                    out.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n')
            print(case['id'], http['status'], len(parsed.get('results', [])), error, parsed.get('provider_errors', []), flush=True)
            if policy is False or http['status'] in (401, 403, 429, 503) or http.get('error'):
                break


def probe(source, case_ids=None):
    collect(source, [c for c in source['query']['cases'] if not case_ids or c['id'] in case_ids])
