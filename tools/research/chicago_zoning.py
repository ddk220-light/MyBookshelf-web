"""Bounded public SODA zoning-class queries, with no geometry or owner fields."""
import fcntl
import hashlib
import json
import re
import time
import uuid
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from run_source_reviews import robots, request, now, pacing_seconds
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT='https://data.cityofchicago.org/resource/dj47-wfun.json'
FIELDS='objectid,globalid,zoning_id,zone_class,edit_date'


def checked_query(req):
    u=urlsplit(req['url']);p=parse_qs(u.query,keep_blank_values=True)
    if req['method']!='GET' or u.scheme+'://'+u.netloc+u.path!=ENDPOINT or u.fragment:
        raise ValueError('Unreviewed public zoning request')
    if (set(p)!={'$select','$where','$limit','$order'} or p['$select']!=[FIELDS] or
            p['$limit']!=['2'] or p['$order']!=['objectid'] or len(p['$where'])!=1):
        raise ValueError('Unreviewed fields, ordering or result bound')
    match=re.fullmatch(r"zone_class='([A-Z]{1,4}[0-9]?-[0-9]{1,3}(?:\.[0-9])?[A-Z]?)'",p['$where'][0])
    if not match:raise ValueError('Only literal published zoning-class equality is supported')
    return match[1]


def parse(body,zone):
    if not isinstance(body,bytes) or len(body)>64*1024:raise ValueError('Unbounded zoning metadata')
    data=json.loads(body)
    if not isinstance(data,list) or len(data)>2:raise ValueError('Not a bounded feature array')
    rows=[];seen=set();last_object=0
    for r in data:
        if not isinstance(r,dict) or set(r)-set(FIELDS.split(',')):raise ValueError('Unexpected fields in metadata-only response')
        gid=r.get('globalid');obj=r.get('objectid');zid=r.get('zoning_id')
        if (not isinstance(gid,str) or not re.fullmatch(r'\{[0-9A-Fa-f-]{36}\}',gid) or
                not isinstance(obj,str) or not re.fullmatch(r'[1-9][0-9]*',obj) or
                not isinstance(zid,str) or not re.fullmatch(r'[0-9]+',zid)):
            raise ValueError('Missing native feature identity')
        native=str(uuid.UUID(gid[1:-1]))
        if native in seen or int(obj)<=last_object or r.get('zone_class')!=zone:
            raise ValueError('Duplicate/unordered identity or zoning predicate mismatch')
        seen.add(native);last_object=int(obj)
        rows.append({'id':'dj47-wfun/'+native,'native_globalid':gid,'objectid':obj,
            'zoning_id':zid,'zone_class':zone,'reported_edit_date':r.get('edit_date'),
            'title':'Chicago zoning '+zone+' — feature '+obj,'title_is_generated_label':True,
            'dataset_id':'dj47-wfun','landing_page':'https://data.cityofchicago.org/d/dj47-wfun',
            'reading_access_verified':False,'geometry_requested':False,'personal_owner_fields_requested':False})
    return rows


def assess(source,case,cap,body):
    rows=[];error=cap.get('error')
    try:
        zone=checked_query(case['request'])
        if error or cap['http']['status']!=200 or cap['http']['truncated']:raise ValueError(error or 'Failed/incomplete zoning response')
        if hashlib.sha256(body).hexdigest()!=cap['http']['sampled_bytes_sha256']:raise ValueError('Mismatched response hash')
        rows=parse(body,zone)
    except (KeyError,ValueError,TypeError) as exc:error=str(exc)
    return evaluate(source,case,{**cap,'error':error,'response_sha256':hashlib.sha256(body).hexdigest(),
        'full_content_downloaded':False,'search_scope':'Public Chicago zoning-class metadata; first2 features by OBJECTID; no geometry/address/owner data'}, {'results':rows})


def probe(source,case_ids=None):
    if source['id']!='chicago-open-data-zoning' or source['query']['endpoint']!=ENDPOINT:raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);policy,proof=robots(ENDPOINT)
        for c in source['query']['cases']:
            if case_ids and c['id'] not in case_ids:continue
            checked_query(c['request']);cap={'observed_at':now(),'robots_evidence':proof,'http':{'status':None,'truncated':False}};body=b''
            if policy is False or policy is not None and not all(policy.can_fetch(a,c['request']['url']) for a in [USER_AGENT,'ChatGPT-User','OAI-SearchBot']):cap['error']='Policy unavailable/disallowing'
            else:
                time.sleep(pacing_seconds(policy));cap['http'],body=request(c['request']['url'],limit=64*1024)
            obs=assess(source,c,cap,body)
            with (REGISTRY/'examples/chicago-open-data-zoning.jsonl').open('a') as f:f.write(json.dumps(obs,ensure_ascii=False,sort_keys=True)+'\n')
            print(c['id'],obs['verdict'],obs['http']['status'],obs['error'],flush=True)
            if obs['verdict']!='verified':break
