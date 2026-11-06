"""Bounded public survey-grid metadata. No owners, parcels, deeds or editor names."""
import fcntl
import json
import re
import time
from urllib.parse import urlencode
from civic_catalogs import LOCK
from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate

BASE = 'https://gis.blm.gov/natlplss/rest/services/Cadastral/BLM_Natl_PLSS_CadNSDI/MapServer/1'
FIELDS = ['OBJECTID', 'STATEABBR', 'PRINMERCD', 'PRINMER', 'PLSSID', 'TWNSHPLAB', 'SURVTYP', 'SURVTYPTXT', 'SOURCEDATE', 'last_edited_date', 'GlobalID']


def allowed_request(req):
    p = req.get('params', {})
    if req.get('method') != 'GET' or req.get('url') != BASE+'/query':
        raise ValueError('Only read-only public township-layer query')
    if (set(p) != {'f', 'where', 'outFields', 'returnGeometry', 'orderByFields', 'resultOffset', 'resultRecordCount'}
            or p['f'] != 'json' or p['outFields'] != ','.join(FIELDS) or p['returnGeometry'] != 'false'
            or p['orderByFields'] != 'OBJECTID ASC' or type(p['resultOffset']) is not int
            or not 0 <= p['resultOffset'] <= 10 or type(p['resultRecordCount']) is not int
            or not 1 <= p['resultRecordCount'] <= 5):
        raise ValueError('Fixed nonpersonal projection, no geometry and bounded ordered page required')
    if p['where'] not in ('1=1', '1=0') and not re.fullmatch(r"(?:PLSSID = '[A-Z0-9]{2,32}'|STATEABBR = '[A-Z]{2}')", p['where']):
        raise ValueError('Only exact native survey ID or state abbreviation')


def parse(data, req):
    if not isinstance(data, dict) or 'error' in data or not isinstance(data.get('features'), list):
        raise ValueError('Expected feature page, not provider error')
    if len(data['features']) > req['params']['resultRecordCount']:
        raise ValueError('Oversized feature page')
    result, seen = [], set()
    for feature in data['features']:
        if not isinstance(feature, dict) or set(feature) != {'attributes'}:
            raise ValueError('Only non-geometric survey attributes')
        a = feature['attributes']
        if not isinstance(a, dict) or set(a) != set(FIELDS):
            raise ValueError('Unexpected or missing fields; no personal/editor/free-text fields allowed')
        native = a['GlobalID']
        if not isinstance(native, str) or not re.fullmatch(r'\{[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}\}', native) or native in seen:
            raise ValueError('Missing/duplicate native GlobalID')
        if type(a['OBJECTID']) is not int or a['OBJECTID'] <= 0:
            raise ValueError('Invalid native OBJECTID')
        if not isinstance(a['PLSSID'], str) or not re.fullmatch(r'[A-Z0-9]{2,32}', a['PLSSID']):
            raise ValueError('Invalid PLSS identity')
        if not isinstance(a['STATEABBR'], str) or not re.fullmatch(r'[A-Z]{2}', a['STATEABBR']):
            raise ValueError('Invalid state abbreviation')
        for key in ['PRINMERCD', 'PRINMER', 'TWNSHPLAB', 'SURVTYP', 'SURVTYPTXT']:
            if a[key] is not None and not isinstance(a[key], str):
                raise ValueError('Survey label must be string or explicit null')
        for key in ['SOURCEDATE', 'last_edited_date']:
            if a[key] is not None and type(a[key]) is not int:
                raise ValueError('Date must be epoch milliseconds or explicit null')
        where = req['params']['where']
        if ' = ' in where:
            field, value = where.split(' = ', 1)
            if a[field] != value[1:-1]:
                raise ValueError('Provider ignored exact survey/state filter')
        seen.add(native)
        result.append({'id': native, 'title': a['STATEABBR']+' '+str(a['TWNSHPLAB'] or a['PLSSID']),
                       'attributes': a, 'record_kind': 'public-land-survey-grid-reference',
                       'landing_page': BASE, 'ownership_verified': False, 'legal_boundary_verified': False,
                       'reading_access_verified': False, 'version': 'Mutable layer and observation hash; source/edit dates are not title-effective dates'})
    return result


def capture(req, policy, proof):
    allowed_request(req);url=req['url']+'?'+urlencode(req['params'])
    row={'source_id':'blm-national-plss','observed_at':now(),'request':req,'robots_evidence':proof,'http':{'status':None,'truncated':False},'query_verified':False}
    if policy is False or policy is not None and not policy.can_fetch(USER_AGENT,url):
        return {**row,'outcome':'skipped','error':'Unavailable/disallowing policy; no target request'}
    time.sleep(pacing_seconds(policy));http,body=request(url,128*1024,{'Accept':'application/json'});row.update(http=http,response_sha256=http['sampled_bytes_sha256'])
    if http['status']!=200 or http['truncated']:
        return {**row,'outcome':'blocked-or-failed','error':http.get('error') or f'HTTP {http["status"]};truncated={http["truncated"]}','response_excerpt':body[:500].decode(errors='replace')}
    try:
        data = json.loads(body)
        if isinstance(data, dict) and isinstance(data.get('features'), list) and any(
                not isinstance(f, dict) or 'geometry' in f or not isinstance(f.get('attributes'), dict)
                or set(f['attributes']) - set(FIELDS) for f in data['features']):
            return {**row, 'outcome': 'invalid-response', 'error': 'Unexpected feature fields/geometry; response values omitted for privacy'}
        row.update(observed_output=data, outcome='captured')
    except (ValueError,UnicodeError):row.update(outcome='invalid-response',error='Expected bounded JSON')
    return row


def probe(source,case_ids=None):
    with LOCK.open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);policy,proof=robots(BASE)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:continue
            row=capture(case['request'],policy,proof);results=[]
            if row['outcome']=='captured':
                try:results=parse(row['observed_output'],case['request'])
                except ValueError as exc:row.update(outcome='invalid-response',error=str(exc))
            value=evaluate(source,case,row,{'results':results})
            with (REGISTRY/'examples/blm-national-plss.jsonl').open('a') as out:out.write(json.dumps(value,ensure_ascii=False,sort_keys=True)+'\n')
            print(case['id'],value['verdict'],row['http']['status'],flush=True)
            if row['outcome']!='captured':break
