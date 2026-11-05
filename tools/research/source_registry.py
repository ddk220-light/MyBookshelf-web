#!/usr/bin/env python3
"""Small, dependency-free research registry. Nothing here is imported by the app."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request
from jsonl_io import read_jsonl

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / 'docs/research/free-content/registry'
USER_AGENT = 'MyBookshelf-SourceReview/1.0 (Codex GPT-6; +https://github.com/ddk220-light/MyBookshelf-web)'
MAX_BYTES = 4 * 1024 * 1024


def fingerprint(request):
    return hashlib.sha256(json.dumps(request, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def request_url(request):
    params = request.get('params')
    if isinstance(params, list):
        params = [tuple(pair) for pair in params]
    return request['url'] + ('?' + urllib.parse.urlencode(params, doseq=True) if params else '')


def fetch(request):
    url = request_url(request)
    if not url.startswith('https://'):
        raise ValueError('Research requests must use HTTPS')
    data = json.dumps(request['json'], ensure_ascii=False).encode() if request.get('json') else None
    headers = {'User-Agent': USER_AGENT, 'Accept': 'application/json'}
    if data:
        headers['Content-Type'] = 'application/json'
    start = time.monotonic()
    observed = datetime.now(timezone.utc).isoformat()
    body = b''
    http = {'status': None, 'content_type': None, 'final_url': url}
    error = None
    try:
        req = urllib.request.Request(url, data=data, headers=headers, method=request['method'])
        try:
            response = urllib.request.urlopen(req, timeout=35)
        except urllib.error.HTTPError as exc:
            response = exc
        with response:
            http.update(status=response.code, content_type=response.headers.get('Content-Type'), final_url=response.url)
            body = response.read(MAX_BYTES + 1)
    except (OSError, urllib.error.URLError) as exc:
        error = str(exc)
    truncated = len(body) > MAX_BYTES
    http.update(bytes=len(body), seconds=round(time.monotonic() - start, 3), truncated=truncated)
    parsed = None
    if not truncated:
        try:
            parsed = json.loads(body)
        except (ValueError, UnicodeDecodeError):
            error = error or 'Response was not JSON'
    else:
        error = 'Response exceeded research size limit'
    return {'observed_at': observed, 'http': http, 'response_sha256': hashlib.sha256(body).hexdigest(), 'error': error}, parsed


def normalize(source, data, endpoint=None):
    """Retain native identity and small metadata samples; never copy full works."""
    if source['query']['adapter'] == 'osti':
        if not isinstance(data, list):
            raise ValueError('OSTI error/invalid payload is not a record list')
        results, seen = [], set()
        for row in data:
            sid = row.get('osti_id') if isinstance(row, dict) else None
            if (not isinstance(sid, str) or not sid.isascii() or not sid.isdigit()
                    or sid in seen or not isinstance(row.get('title'), str) or not row['title'].strip()):
                raise ValueError('OSTI missing, duplicate or invalid native identity')
            seen.add(sid)
            links = [link for link in row.get('links', []) if isinstance(link, dict)
                     and isinstance(link.get('href'), str) and link['href'].startswith('https://')]
            results.append({'id': sid, 'title': row['title'], 'doi': row.get('doi'),
                            'product_type': row.get('product_type'), 'article_type': row.get('article_type'),
                            'publication_date': row.get('publication_date'), 'entry_date': row.get('entry_date'),
                            'language': row.get('language'), 'country_publication': row.get('country_publication'),
                            'availability': row.get('availability'), 'report_number': row.get('report_number'),
                            'subjects': row.get('subjects', []),
                            'citation_links': [link['href'] for link in links if link.get('rel') == 'citation'],
                            'reported_fulltext_links': [link['href'] for link in links if link.get('rel') == 'fulltext'],
                            'reading_access_verified': False, 'reuse_license': None})
        return results
    if not isinstance(data, dict) or data.get('errors') or data.get('error'):
        raise ValueError('Provider returned an error or invalid object')
    adapter = source['query']['adapter']
    if adapter == 'met-collection':
        oid = data.get('objectID')
        if (isinstance(oid, bool) or not isinstance(oid, int) or oid <= 0
                or not isinstance(data.get('title'), str) or not data['title'].strip()):
            raise ValueError('Invalid Met object identity/title')
        image_url = data.get('primaryImage')
        parsed_image = urllib.parse.urlsplit(image_url) if isinstance(image_url, str) else None
        if (data.get('isPublicDomain') is not True or parsed_image is None
                or parsed_image.scheme != 'https' or not parsed_image.hostname):
            raise ValueError('Object is outside the public-domain image subset')
        return [{'id': str(oid), 'title': data['title'], 'accession_number': data.get('accessionNumber'),
                 'artist': data.get('artistDisplayName'), 'object_date': data.get('objectDate'),
                 'culture': data.get('culture'), 'department': data.get('department'),
                 'medium': data.get('medium'), 'classification': data.get('classification'),
                 'credit_line': data.get('creditLine'), 'object_url': data.get('objectURL'),
                 'primary_image': image_url, 'is_public_domain': True,
                 'metadata_date': data.get('metadataDate'), 'country': data.get('country'),
                 'rights_and_reproduction': data.get('rightsAndReproduction'),
                 'reading_access_verified': False}]
    if adapter == 'openalex':
        import re
        rows = data.get('results', [data] if data.get('id') else None)
        if not isinstance(rows, list):
            raise ValueError('OpenAlex payload has no record list or singleton')
        results, seen = [], set()
        for row in rows:
            sid = row.get('id') if isinstance(row, dict) else None
            if not isinstance(sid, str) or not re.fullmatch(r'https://openalex.org/W[0-9]+', sid) or sid in seen:
                raise ValueError('Invalid or duplicate OpenAlex work identity')
            access = row.get('open_access')
            if not isinstance(access, dict) or access.get('is_oa') is not True or not isinstance(row.get('title'), str) or not row['title'].strip():
                raise ValueError('OpenAlex open-access/title assertion not satisfied')
            seen.add(sid)
            best = row.get('best_oa_location') or {}
            if not isinstance(best, dict):
                raise ValueError('Invalid OpenAlex location metadata')
            results.append({'id': sid, 'title': row['title'], 'doi': row.get('doi'),
                            'publication_year': row.get('publication_year'), 'language': row.get('language'),
                            'type': row.get('type'), 'is_retracted': row.get('is_retracted'),
                            'open_access': row['open_access'],
                            'best_oa_location': {key: best.get(key) for key in
                                                 ('id', 'is_oa', 'landing_page_url', 'pdf_url', 'license', 'version', 'is_accepted', 'is_published')},
                            'reading_access_verified': False,
                            'rights_caution': 'Provider OA/location/license claims; no independent content-access verification'})
        return results
    if adapter in ('sphinx-inventory', 'otl-csv', 'onet-json', 'indcat-sru', 'usgs-events', 'world-bank-indicators', 'siyavula-toc', 'federal-register', 'usaspending', 'tatoeba'):
        return data['results']
    if adapter == 'europe-pmc':
        if any(row.get('isOpenAccess') != 'Y' for row in data['resultList']['result']):
            raise ValueError('Open-access filter was not satisfied by every returned record')
        return [{'id': row['source'] + ':' + row['id'], 'title': row['title'],
                 'source': row['source'], 'native_id': row['id'], 'pmcid': row.get('pmcid'),
                 'doi': row.get('doi'), 'language': row.get('language'), 'year': row.get('pubYear'),
                 'first_publication_date': row.get('firstPublicationDate'),
                 'publication_types': row.get('pubTypeList', {}).get('pubType', []),
                 'license_label': row.get('license'),
                 'correction_relations': row.get('commentCorrectionList', {}).get('commentCorrection', []),
                 'is_retracted': row.get('isRetracted'),
                 'is_open_access': row.get('isOpenAccess'),
                 'landing_page': 'https://europepmc.org/article/' + row['source'] + '/' + row['id'],
                 'reported_free_links': [link for link in row.get('fullTextUrlList', {}).get('fullTextUrl', [])
                                         if link.get('availabilityCode') in ('OA', 'F')
                                         and link.get('url', '').startswith('https://')]}
                for row in data['resultList']['result']]
    if adapter == 'thoth':
        rows = data['data']['works']
        results = []
        for row in rows:
            links = []
            for pub in row.get('publications', []):
                if pub['publicationType'] not in ('PDF', 'EPUB', 'HTML'):
                    continue
                for loc in pub.get('locations', []):
                    url = loc.get('fullTextUrl')
                    if loc.get('canonical') and url and urllib.parse.urlparse(url).hostname in source['query']['official_content_hosts']:
                        links.append({'format': pub['publicationType'], 'url': url})
            results.append({'id': row['workId'], 'title': row['titles'][0]['fullTitle'], 'doi': row.get('doi'), 'license': row.get('license'), 'landing_page': row.get('landingPage'), 'canonical_digital_links': links})
        return results
    if adapter == 'gdl':
        return [{'id': str(r['postId']), 'title': r['title'], 'landing_page': r['postLink'], 'languages': [x['slug'] for x in r.get('language', [])], 'licenses': [x['slug'] for x in r.get('license', [])], 'h5p_id': r.get('h5pId')} for r in data['books']]
    if adapter == 'mediawiki':
        host = urllib.parse.urlsplit(endpoint or source['query']['endpoint']).netloc
        return [{'id': str(r['pageid']), 'title': r['title'], 'landing_page': f'https://{host}/?curid={r["pageid"]}'} for r in data['query']['search']]
    if adapter == 'loc':
        results = []
        for row in data['results']:
            record = {'id': row['id'], 'title': row['title'],
                      'reading_urls': [v['url'] for v in row.get('resources', []) if v.get('url')],
                      'pdfs': [v['pdf'] for v in row.get('resources', []) if v.get('pdf')]}
            if 'newspaper' in row.get('original_format', []):
                identity = urllib.parse.urlsplit(row['id'])
                page = urllib.parse.parse_qs(identity.query).get('sp', [])
                if (identity.hostname != 'www.loc.gov' or not identity.path.startswith('/resource/')
                        or '/ed-' not in identity.path or len(page) != 1 or not page[0].isdigit()):
                    raise ValueError('Newspaper page identity must preserve issue, edition and page')
                record.update(record_kind='newspaper-page', date=row.get('date'),
                    newspaper_titles=row.get('partof_title', []), lccn=row.get('number_lccn', []),
                    edition=row.get('number_edition', []), page_number=row.get('number_page', []),
                    provider_page_id=row.get('page_id'), languages=row.get('language', []),
                    formats=row.get('online_format', []), access_restricted=row.get('access_restricted'),
                    reading_access_verified=False, topic_relevance_verified=False)
            results.append(record)
        return results
    if adapter == 'ia':
        return [{'id': r['identifier'], 'title': r['title'], 'landing_page': 'https://archive.org/details/' + r['identifier']} for r in data['response']['docs']]
    if adapter == 'librivox':
        return [{'id': str(r['id']), 'title': r['title'], 'language': r.get('language'), 'landing_page': r.get('url_librivox'), 'sections': r.get('num_sections')} for r in data['books']]
    raise ValueError(f'Unknown adapter: {adapter}')


def evaluate(source, case, observation, data):
    results = []
    error = observation.get('error')
    if observation['http']['status'] == 200 and not observation['http']['truncated'] and not error:
        try:
            results = normalize(source, data, case['request']['url'])
            if any(not r.get('id') or not r.get('title') for r in results):
                raise ValueError('Result missing identity/title')
        except (KeyError, TypeError, ValueError, IndexError) as exc:
            error = 'Invalid result shape: ' + str(exc)
    expected = {str(x) for x in case['expected_ids']}
    matched = sorted(expected & {str(r['id']) for r in results})
    verified = bool(matched) and not error and observation['http']['status'] == 200
    # Put the matching record first so stored evidence always contains the proof.
    ordered = sorted(results, key=lambda r: str(r['id']) not in matched)
    return {**observation, 'schema_version': 1, 'source_id': source['id'], 'case_id': case['id'],
            'request': case['request'], 'request_fingerprint': fingerprint(case['request']),
            'expected_ids': sorted(expected), 'matched_ids': matched, 'sample_results': ordered[:3],
            'returned_count': len(results), 'verdict': 'verified' if verified else 'unverified', 'error': error}


def observations(registry, source_id):
    path = registry / 'examples' / f'{source_id}.jsonl'
    return read_jsonl(path)


def current_verified(source, rows):
    """Only the latest observation of the CURRENT case/request counts, once."""
    latest = {}
    for row in rows:
        key = (row['case_id'], row['request_fingerprint'])
        if key not in latest or row['observed_at'] > latest[key]['observed_at']:
            latest[key] = row
    passed = set()
    for case in source['query']['cases']:
        fp = fingerprint(case['request'])
        row = latest.get((case['id'], fp))
        if row and row['verdict'] == 'verified' and set(map(str, case['expected_ids'])) & set(row['matched_ids']):
            passed.add(fp)
    return len(passed)


def area_verified(source, rows, area):
    """Explicit subset mappings prevent book examples from proving newspaper search.

    Older records retain source-level evidence until their area mappings are
    reviewed. This is an evidence-presence measure, not area qualification.
    """
    mapping = source['query'].get('area_case_ids')
    if mapping is None:
        return current_verified(source, rows)
    ids = set(mapping.get(area, []))
    scoped = {**source, 'query': {**source['query'], 'cases': [
        case for case in source['query']['cases'] if case['id'] in ids]}}
    return current_verified(scoped, rows)


def validate(registry=REGISTRY):
    sources = [json.loads(p.read_text()) for p in sorted((registry / 'sources').glob('*.json'))]
    seen = set()
    total = verified_sources = 0
    valid_areas = {a['id'] for a in json.loads((registry / 'areas.json').read_text())['areas']}
    for source in sources:
        sid = source['id']
        assert sid not in seen, f'Duplicate source {sid}'
        seen.add(sid)
        assert (registry / 'sources' / f'{sid}.json').exists(), sid
        assert source['schema_version'] == 1 and source['enabled'] is False, sid
        assert set(source['areas']) <= valid_areas, sid
        assert source['name'] and source['capabilities'] and source['limitations'] and source['documentation'], sid
        cases = source['query']['cases']
        assert len({c['id'] for c in cases}) == len(cases), f'Duplicate cases: {sid}'
        assert len({fingerprint(c['request']) for c in cases}) == len(cases), f'Duplicate requests: {sid}'
        mapping = source['query'].get('area_case_ids')
        if mapping is not None:
            assert isinstance(mapping, dict) and set(mapping) == set(source['areas']), f'Incomplete area case mapping: {sid}'
            case_ids = {case['id'] for case in cases}
            for area, ids in mapping.items():
                assert isinstance(ids, list) and len(ids) == len(set(ids)) and set(ids) <= case_ids, f'Invalid area case mapping: {sid}/{area}'
        for case in cases:
            assert case['expected_ids'] and case['intent'], f'Empty expectation: {sid}'
            assert case['request']['method'] in ('GET', 'POST'), sid
            assert case['request']['url'].startswith('https://'), sid
        rows = observations(registry, sid)
        for row in rows:
            assert row['source_id'] == sid and row['request_fingerprint'] == fingerprint(row['request']), sid
            assert row['verdict'] in ('verified', 'unverified'), sid
            assert len(row['response_sha256']) == 64 and row['observed_at'], sid
            if row['verdict'] == 'verified':
                assert row['http']['status'] == 200 and not row['http']['truncated'] and not row['error'], sid
                assert set(row['matched_ids']) & set(row['expected_ids']), sid
                assert set(row['matched_ids']) & {str(r['id']) for r in row['sample_results']}, sid
        count = current_verified(source, rows)
        total += count
        verified_sources += count >= 10
        if source['state'] == 'ten-query-examples-verified':
            assert count >= 10, f'Insufficient current evidence: {sid}'
        print(f'{sid}: {count}/{len(cases)} current query examples verified; {source["state"]}')
    links = json.loads((registry / 'discovery-links.json').read_text())['leads']
    assert len({r['id'] for r in links}) == len(links)
    assert len({r['url'] for r in links}) == len(links)
    print(f'{len(sources)} source records; {verified_sources} with ten examples; {total} verified examples; {len(links)} discovery links; {len(valid_areas)} areas')


def probe(source_id, case_ids=None):
    source = json.loads((REGISTRY / 'sources' / f'{source_id}.json').read_text())
    if source['query']['adapter'] == 'tatoeba':
        from tatoeba_catalog import probe as probe_tatoeba
        return probe_tatoeba(source, case_ids)
    if source['query']['adapter'] in ('federal-register', 'usaspending'):
        from civic_catalogs import probe as probe_civic
        return probe_civic(source, case_ids)
    if source['query']['adapter'] == 'world-bank-indicators':
        from world_bank_indicators import probe as probe_indicators
        return probe_indicators(source, case_ids)
    if source['query']['adapter'] == 'siyavula-toc':
        from siyavula_inventory import probe as probe_siyavula
        return probe_siyavula(source, case_ids)
    if source['query']['adapter'] == 'met-collection':
        from met_collection import probe as probe_met
        return probe_met(source, case_ids)
    if source['query']['adapter'] == 'openalex':
        from openalex_metadata import probe as probe_openalex
        return probe_openalex(source, case_ids)
    if source['query']['adapter'] == 'indcat-sru':
        from sru_metadata import probe as probe_sru
        return probe_sru(source, case_ids)
    if source['query']['adapter'] == 'onet-json':
        from occupational_inventory import probe as probe_occupations
        return probe_occupations(source, case_ids)
    if source['query']['adapter'] == 'otl-csv':
        from catalog_inventory import probe as probe_catalog
        return probe_catalog(source, case_ids)
    if source['query']['adapter'] == 'sphinx-inventory':
        from sphinx_inventory import probe as probe_inventory
        return probe_inventory(source, case_ids)
    if source['query']['adapter'] == 'usgs-events':
        from usgs_events import probe as probe_events
        return probe_events(source, case_ids)
    for case in source['query']['cases']:
        if case_ids and case['id'] not in case_ids:
            continue
        obs, data = fetch(case['request'])
        row = evaluate(source, case, obs, data)
        with (REGISTRY / 'examples' / f'{source_id}.jsonl').open('a') as stream:
            stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n')
        print(f'{source_id}/{case["id"]}: {row["verdict"]} HTTP {row["http"]["status"]}', flush=True)
        provider_error = data.get('error') if isinstance(data, dict) else None
        if row['http']['status'] in (403, 429, 503) or (isinstance(provider_error, dict) and provider_error.get('code') == 'maxlag'):
            print('Stopping this source; respect access/rate/backpressure response.', flush=True)
            break
        time.sleep(source['query'].get('research_pause_seconds', 1))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('validate')
    runner = sub.add_parser('probe')
    runner.add_argument('source_id')
    runner.add_argument('--case', action='append', dest='case_ids')
    args = parser.parse_args()
    if args.command == 'validate':
        validate()
    else:
        probe(args.source_id, args.case_ids)


if __name__ == '__main__':
    main()
