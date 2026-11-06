"""Bounded research-only public regulation metadata and agency budget queries."""
from datetime import date
import fcntl
import json
import math
from pathlib import Path
import re
import time
from urllib.parse import urlencode, urlsplit

from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate

FIELDS = ['document_number', 'title', 'type', 'publication_date', 'effective_on',
          'citation', 'agencies', 'html_url', 'pdf_url', 'abstract', 'correction_of', 'corrections']
LIFECYCLE_FIELDS = ['action', 'dates', 'disposition_notes']
MAX_BYTES = 256 * 1024
LOCK = Path('/tmp/mybookshelf-source-review.lock')


def allowed_request(sid, req):
    u = urlsplit(req['url'])
    if req.get('method') != 'GET' or u.scheme != 'https' or u.query or u.fragment:
        raise ValueError('Only saved HTTPS GET shapes are permitted')
    params = req.get('params', {})
    if sid == 'federal-register':
        if u.netloc != 'www.federalregister.gov' or not re.fullmatch(
                r'/api/v1/documents(?:/(?:C[0-9]+-)?[0-9]{4}-[0-9]+)?\.json', u.path):
            raise ValueError('Only public Federal Register document metadata endpoints')
        allowed = {'fields[]', 'conditions[term]', 'conditions[type][]',
                   'conditions[publication_date][year]', 'per_page', 'page', 'order'}
        if (set(params) - allowed or not isinstance(params.get('fields[]'), list)
                or not params['fields[]'] or set(params['fields[]']) - set(FIELDS + LIFECYCLE_FIELDS)
                or not 1 <= int(params.get('per_page', 5)) <= 5):
            raise ValueError('Metadata fields and at most five results are required')
        year = params.get('conditions[publication_date][year]')
        if year is not None and (not re.fullmatch(r'[0-9]{4}', str(year)) or not 1900 <= int(year) <= 2100):
            raise ValueError('Invalid publication-year syntax must not reach the provider')
    elif sid == 'usaspending':
        if u.netloc != 'api.usaspending.gov' or not re.fullmatch(
                r'/api/v2/agency/[0-9]{3,4}/budgetary_resources/', u.path) or params:
            raise ValueError('Only agency aggregate budgets; no awards, recipients or personal data')
        year = req.get('local_query', {}).get('fiscal_year')
        if type(year) is not int or not 1900 <= year <= 2100:
            raise ValueError('Explicit local fiscal-year selection is required')
    else:
        raise ValueError('Unknown civic research catalog')


def parse_federal(data):
    if not isinstance(data, dict):
        raise ValueError('Expected document metadata object')
    if (type(data.get('count')) is int and data['count'] == 0
            and 'document_number' not in data and 'error' not in data
            and 'errors' not in data and data.get('results') in (None, [])):
        # Observed no-result searches omit results entirely. Do not create an
        # item or mistake a missing native document response for this shape.
        return []
    items = data.get('results') if 'results' in data else [data]
    if not isinstance(items, list) or len(items) > 5:
        raise ValueError('Invalid or oversized document page')
    seen, result = set(), []
    for item in items:
        if not isinstance(item, dict):
            raise ValueError('Invalid document row')
        identity = item.get('document_number')
        if not isinstance(identity, str) or not re.fullmatch(r'(?:C[0-9]+-)?[0-9]{4}-[0-9]+', identity) or identity in seen:
            raise ValueError('Missing/duplicate document number')
        if not isinstance(item.get('title'), str) or not item['title'].strip():
            raise ValueError('Missing document title')
        try:
            date.fromisoformat(item.get('publication_date'))
            if item.get('effective_on') is not None:
                date.fromisoformat(item['effective_on'])
        except (ValueError, TypeError):
            raise ValueError('Invalid publication/effective date') from None
        landing = urlsplit(item.get('html_url', ''))
        if landing.scheme != 'https' or landing.netloc != 'www.federalregister.gov' or identity not in landing.path.split('/'):
            raise ValueError('Missing or mismatched native reader link')
        if item.get('type') not in ('Rule', 'Proposed Rule', 'Notice', 'Presidential Document'):
            raise ValueError('Unknown legal document type')
        for field in LIFECYCLE_FIELDS:
            if item.get(field) is not None and not isinstance(item[field], str):
                raise ValueError('Lifecycle metadata must be text or null')
        corrections = item.get('corrections', [])
        if not isinstance(corrections, list):
            raise ValueError('Corrections must be an array of native document links')
        for link in corrections + ([item['correction_of']] if item.get('correction_of') else []):
            if not isinstance(link, str) or not re.fullmatch(
                    r'https://www\.federalregister\.gov/api/v1/documents/(?:C[0-9]+-)?[0-9]{4}-[0-9]+(?:\.json)?', link):
                raise ValueError('Correction relationship must retain its native document identity')
        seen.add(identity)
        result.append({'id': identity, 'title': item['title'], 'record_kind': 'federal-register-document',
                       **{k: item.get(k) for k in FIELDS if k not in ('document_number', 'title')},
                       **{k: item[k] for k in LIFECYCLE_FIELDS if k in item},
                       'landing_page': item['html_url'], 'reading_access_verified': False,
                       'legal_status': 'Informational HTML/XML rendition; verify official edition for legal reliance.',
                       'current_law_verified': False})
    return result


def check_federal_filters(records, req):
    params = req.get('params', {})
    year = params.get('conditions[publication_date][year]')
    kinds = {'RULE': 'Rule', 'PRORULE': 'Proposed Rule', 'NOTICE': 'Notice', 'PRESDOCU': 'Presidential Document'}
    kind = params.get('conditions[type][]')
    native = re.fullmatch(r'/api/v1/documents/((?:C[0-9]+-)?[0-9]{4}-[0-9]+)\.json', urlsplit(req['url']).path) if req.get('url') else None
    if native and (len(records) != 1 or records[0]['id'] != native.group(1)):
        raise ValueError('Native lookup returned a different document or no document')
    for row in records:
        if year is not None and row['publication_date'][:4] != str(year):
            raise ValueError('Provider result does not match the requested publication year')
        if kind in kinds and row['type'] != kinds[kind]:
            raise ValueError('Provider result does not match the requested document type')


def review_federal_refresh(previous, candidate):
    """Review saved evidence only; never replace a catalog or infer legal effect."""
    old = parse_federal(previous['observed_output'])
    check_federal_filters(old, previous['request'])
    result = {'query_verified': False, 'replace_accepted': False,
              'current_law_verified': False, 'retained_ids': [r['id'] for r in old],
              'removed_ids': [], 'changed_ids': [], 'added_ids': [],
              'status': 'candidate-rejected', 'snapshot_stale': True}
    for row in (previous, candidate):
        digest = row.get('response_sha256')
        if not isinstance(digest, str) or not re.fullmatch('[0-9a-f]{64}', digest):
            return {**result, 'reason': 'Missing response hash; evidence cannot establish freshness'}
        if row.get('http', {}).get('sampled_bytes_sha256') != digest:
            return {**result, 'reason': 'Response hash disagrees with saved HTTP evidence'}
    if previous['request'] != candidate.get('request'):
        return {**result, 'reason': 'Different request scope is not a refresh of this snapshot'}
    http = candidate.get('http', {})
    if candidate.get('outcome') != 'captured' or http.get('status') != 200 or http.get('truncated'):
        return {**result, 'reason': 'Unavailable/failed candidate; preserve history, do not infer removal or repeal'}
    try:
        new = parse_federal(candidate['observed_output'])
        check_federal_filters(new, candidate['request'])
    except (ValueError, KeyError, TypeError) as exc:
        return {**result, 'reason': str(exc)}
    before, after = {r['id']: r for r in old}, {r['id']: r for r in new}
    changed = sorted(k for k in before.keys() & after.keys() if before[k] != after[k])
    missing = sorted(before.keys() - after.keys())
    added = sorted(after.keys() - before.keys())
    return {**result, 'status': 'manual-review-required' if changed or missing or added else 'unchanged',
            'snapshot_stale': bool(changed or missing or added), 'changed_ids': changed, 'added_ids': added,
            'missing_from_page_ids': missing,
            'reason': 'Page disappearance is not catalog deletion; action/correction text requires review, never automatic current-law status'}


def parse_budget(data, code, agency):
    if not isinstance(data, dict) or data.get('toptier_code') != code:
        raise ValueError('Missing/mismatched native agency code')
    items = data.get('agency_data_by_year')
    if not isinstance(items, list) or len(items) > 30 or not isinstance(data.get('messages'), list):
        raise ValueError('Invalid or oversized annual aggregate response')
    keys = ['agency_budgetary_resources', 'agency_total_obligated',
            'agency_total_outlayed', 'total_budgetary_resources']
    seen, result = set(), []
    for item in items:
        year = item.get('fiscal_year') if isinstance(item, dict) else None
        if type(year) is not int or not 1900 <= year <= 2100 or year in seen:
            raise ValueError('Missing/duplicate fiscal-year identity')
        if any(k not in item for k in keys):
            raise ValueError('Absent amount field is not explicit null')
        for key in keys:
            n = item[key]
            if n is not None and (type(n) not in (int, float) or not math.isfinite(n)):
                raise ValueError('Budget amount must be finite number or explicit null')
        periods = item.get('agency_obligation_by_period')
        if not isinstance(periods, list) or len(periods) > 12:
            raise ValueError('Invalid reporting-period array')
        period_ids = set()
        for p in periods:
            if (not isinstance(p, dict) or type(p.get('period')) is not int
                    or not 1 <= p['period'] <= 12 or p['period'] in period_ids
                    or type(p.get('obligated')) not in (int, float) or not math.isfinite(p['obligated'])):
                raise ValueError('Invalid/duplicate reporting period')
            period_ids.add(p['period'])
        seen.add(year)
        result.append({'id': f'{code}:{year}', 'title': f'{agency["name"]} — fiscal year {year} budget aggregates',
                       'toptier_code': code, 'agency_name': agency['name'], 'fiscal_year': year,
                       **{key: item[key] for key in keys}, 'agency_obligation_by_period': periods,
                       'messages': data['messages'], 'data_available': all(item[k] is not None for k in keys),
                       'record_kind': 'agency-level-annual-budget-aggregate',
                       'landing_page': f'https://www.usaspending.gov/agency/{agency["slug"]}?fy={year}',
                       'reading_access_verified': False, 'currency_field_returned': False,
                       'version': 'Mutable response snapshot, not an immutable fiscal-year release'})
    return result


def capture(sid, req, policy, proof):
    allowed_request(sid, req)
    address = req['url'] + ('?' + urlencode(req['params'], doseq=True) if req.get('params') else '')
    row = {'source_id': sid, 'observed_at': now(), 'request': req, 'robots_evidence': proof,
           'http': {'status': None, 'truncated': False}, 'query_verified': False}
    if policy is False or policy is not None and not policy.can_fetch(USER_AGENT, address):
        return {**row, 'outcome': 'skipped', 'error': 'Policy unavailable/disallowing; no request sent'}
    time.sleep(pacing_seconds(policy))
    http, body = request(address, MAX_BYTES, {'Accept': 'application/json'})
    row.update(http=http, response_sha256=http['sampled_bytes_sha256'])
    if http['status'] != 200 or http['truncated']:
        return {**row, 'outcome': 'blocked-or-failed', 'error': http.get('error') or f'HTTP {http["status"]}; truncated={http["truncated"]}',
                'response_excerpt': body[:800].decode(errors='replace')}
    try:
        row.update(observed_output=json.loads(body), outcome='captured')
    except (ValueError, UnicodeError):
        row.update(outcome='invalid-response', error='Expected public API JSON', response_excerpt=body[:800].decode(errors='replace'))
    return row


def probe(source, case_ids=None):
    sid = source['id']
    with LOCK.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        policy, proof = robots(source['query']['endpoint'])
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            req = case['request']
            row = capture(sid, req, policy, proof)
            records = []
            if row['outcome'] == 'captured':
                try:
                    if sid == 'federal-register':
                        records = parse_federal(row['observed_output'])
                        check_federal_filters(records, req)
                    else:
                        code = req['url'].split('/')[-3]
                        all_rows = parse_budget(row['observed_output'], code, source['query']['agencies'][code])
                        selected = [x for x in all_rows if x['fiscal_year'] == req['local_query']['fiscal_year']]
                        row['missing_observations'] = [x for x in selected if not x['data_available']]
                        records = [x for x in selected if x['data_available']]
                except (ValueError, KeyError) as exc:
                    row.update(outcome='invalid-response', error=str(exc))
            value = evaluate(source, case, row, {'results': records})
            with (REGISTRY / 'examples' / f'{sid}.jsonl').open('a') as out:
                out.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + '\n')
            print(sid, case['id'], value['verdict'], row['http']['status'], flush=True)
            if row['outcome'] in ('skipped', 'blocked-or-failed', 'invalid-response'):
                break
