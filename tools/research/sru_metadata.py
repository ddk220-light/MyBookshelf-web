"""Bounded MARCXML evidence parsing for the documented IndCat SRU interface.

Research only. A bibliographic record or an 856 link is not free-reader evidence.
"""
import xml.etree.ElementTree as ET
import hashlib
import time

MAX_BYTES = 512 * 1024
SRU = {'http://docs.oasis-open.org/ns/search-ws/sruResponse', 'http://www.loc.gov/zing/srw/'}
ENDPOINT = 'https://indcatsru.inflibnet.ac.in/biblio'


def parse_sru(body):
    if not isinstance(body, bytes) or len(body) > MAX_BYTES:
        raise ValueError('SRU evidence must be bounded bytes')
    if b'<!DOCTYPE' in body.upper() or b'<!ENTITY' in body.upper():
        raise ValueError('XML declarations/entities are outside metadata evidence scope')
    try:
        root = ET.fromstring(body)
    except ET.ParseError as exc:
        raise ValueError('Invalid SRU XML') from exc
    namespace, _, name = root.tag[1:].partition('}') if root.tag.startswith('{') else ('', '', root.tag)
    if namespace not in SRU or name != 'searchRetrieveResponse':
        raise ValueError('Not an SRU search response')
    if any(el.tag.rsplit('}', 1)[-1] == 'diagnostic' for el in root.iter()):
        raise ValueError('SRU diagnostic is not an empty successful result')
    ns = '{' + namespace + '}'
    try:
        total = int(root.findtext(ns + 'numberOfRecords'))
    except (TypeError, ValueError) as exc:
        raise ValueError('Missing SRU result count') from exc
    if total < 0:
        raise ValueError('Negative SRU result count')
    results, seen = [], set()
    for wrapper in root.findall(ns + 'records/' + ns + 'record'):
        data = wrapper.find(ns + 'recordData')
        marc = next((el for el in list(data) if el.tag.rsplit('}', 1)[-1] == 'record'), None) if data is not None else None
        if marc is None:
            raise ValueError('Missing MARC record')
        controls, fields = {}, {}
        # IndCat emits MARC record namespace with unnamespaced child fields.
        for el in marc:
            tag = el.tag.rsplit('}', 1)[-1]
            if tag == 'controlfield':
                controls[el.get('tag')] = (el.text or '').strip()
            elif tag == 'datafield':
                fields.setdefault(el.get('tag'), []).extend(
                    (sub.get('code'), (sub.text or '').strip()) for sub in el
                    if sub.tag.rsplit('}', 1)[-1] == 'subfield')
        def values(tag, codes):
            return [text for code, text in fields.get(tag, []) if code in codes and text]
        native = controls.get('001')
        agency = controls.get('003')
        title = ' '.join(values('245', {'a', 'b', 'n', 'p'}))
        if not native or not agency or not title or native in seen:
            raise ValueError('Missing or duplicate native bibliographic identity/title')
        seen.add(native)
        results.append({'id': native, 'agency': agency, 'title': title,
                        'native_control_numbers': values('035', {'a'}),
                        'isbns': values('020', {'a'}), 'editions': values('250', {'a'}),
                        'publication_dates': values('260', {'c'}) + values('264', {'c'}),
                        'languages': values('041', {'a'}),
                        'reported_links': [u for u in values('856', {'u'}) if u.startswith('https://')],
                        'reading_access_verified': False, 'reuse_license': None})
    if len(results) > total:
        raise ValueError('SRU result count contradicts returned records')
    next_position = root.findtext(ns + 'nextRecordPosition')
    if next_position is not None and (not next_position.isdigit() or int(next_position) < 1):
        raise ValueError('Invalid next record position')
    return {'results': results, 'number_of_records': total,
            'next_record_position': int(next_position) if next_position else None}


class SRUSession:
    """Serial, bounded requests to the exact provider-documented public route."""
    def __init__(self):
        from run_source_reviews import robots, pacing_seconds
        self.policy, self.proof = robots(ENDPOINT)
        self.pause = pacing_seconds(self.policy)
        self.blocked = False
        time.sleep(self.pause)

    def fetch(self, req):
        from run_source_reviews import request, now, USER_AGENT
        from source_registry import request_url
        if req.get('method') != 'GET' or req.get('url') != ENDPOINT:
            raise ValueError('Only the documented IndCat public GET endpoint is supported')
        url = request_url(req)
        body = b''
        http = {'status': None, 'truncated': False}
        error, data = None, None
        observed_at = now()
        if self.blocked or self.policy is False or self.policy is not None and not self.policy.can_fetch(USER_AGENT, url):
            error = 'Policy unavailable/disallows request, or previous access/rate response; no request sent'
        else:
            http, body = request(url, limit=MAX_BYTES, headers={'Accept': 'application/xml'})
            if http['status'] in (401, 403, 429, 503):
                self.blocked = True
            if http['status'] != 200 or http['truncated']:
                error = http.get('error') or 'Non-200 or oversized SRU response'
            else:
                try:
                    data = parse_sru(body)
                except ValueError as exc:
                    error = str(exc)
            time.sleep(self.pause)
        observation = {'observed_at': observed_at, 'request': req, 'http': http,
                       'response_sha256': hashlib.sha256(body).hexdigest(),
                       'robots_evidence': self.proof, 'error': error}
        if error and http.get('status') == 200 and not http.get('truncated') and b'<html' not in body.lower():
            observation['invalid_metadata_xml_excerpt'] = body.decode(errors='replace')[:12000]
        return observation, data


def probe(source, case_ids=None):
    import fcntl
    import json
    from source_registry import REGISTRY, evaluate
    if source['query'].get('research_hold'):
        raise ValueError('Source on research hold: ' + source['query']['research_hold'])
    with open('/tmp/mybookshelf-source-review.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        session = SRUSession()
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:
                continue
            obs, data = session.fetch(case['request'])
            row = evaluate(source, case, obs, data)
            row['qualification_scope'] = 'bibliographic-metadata-only; free reading unverified'
            if data:
                row.update(number_of_records=data['number_of_records'], next_record_position=data['next_record_position'])
            with (REGISTRY / 'examples' / f'{source["id"]}.jsonl').open('a') as stream:
                stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n')
            print(f'{source["id"]}/{case["id"]}: {row["verdict"]} HTTP {obs["http"]["status"]}', flush=True)
            if session.blocked or session.policy is False:
                break
