"""Bounded, read-only CMA CC0 metadata research; never downloads image assets."""
import fcntl
import json
import re
import time
from urllib.parse import urlencode
from civic_catalogs import LOCK
from run_source_reviews import now, pacing_seconds, request, robots
from source_registry import REGISTRY, USER_AGENT, evaluate

BASE = 'https://openaccess-api.clevelandart.org/api/artworks/'
FIELDS = ['id', 'accession_number', 'title', 'title_in_original_language', 'creation_date', 'share_license_status', 'url', 'images', 'has_conservation_images']


def allowed_request(req):
    if req.get('method') != 'GET':
        raise ValueError('Read-only GET required')
    p = req.get('params', {})
    if req.get('url') == BASE:
        if (set(p) != {'q','cc0','has_image','limit','skip','fields'} or p['cc0'] != '' or p['has_image'] != 1
                or type(p['limit']) is not int or not 1 <= p['limit'] <= 3
                or type(p['skip']) is not int or not 0 <= p['skip'] <= 6
                or not isinstance(p['q'],str) or not 1 <= len(p['q']) <= 80):
            raise ValueError('Bounded CC0 image-metadata search required')
    elif re.fullmatch(re.escape(BASE)+r'[1-9][0-9]{0,8}',req.get('url','')):
        if set(p) != {'fields'}:
            raise ValueError('Native lookup accepts only fixed projection')
    else:
        raise ValueError('Only published artwork search/native routes')
    if p.get('fields') != ','.join(FIELDS):
        raise ValueError('Fixed metadata projection required; no full works')


def parse(data, req):
    allowed_request(req)
    if not isinstance(data,dict) or 'error' in data or 'detail' in data:
        raise ValueError('Provider error is not an empty result')
    rows=data.get('data')
    if isinstance(rows,dict):rows=[rows]
    if not isinstance(rows,list) or len(rows)>req['params'].get('limit',1):
        raise ValueError('Expected bounded artwork records')
    out=[];seen=set()
    for a in rows:
        if not isinstance(a,dict) or set(a)-set(FIELDS) or set(FIELDS)-set(a)-{'title_in_original_language'}:
            raise ValueError('Missing or unexpected metadata fields')
        if type(a['has_conservation_images']) not in (bool,int) or a['has_conservation_images'] not in (True,False,0,1):
            raise ValueError('Invalid conservation-image availability flag')
        sid=a['id']
        if type(sid) is not int or sid<=0 or sid in seen or not isinstance(a['title'],str) or not a['title'].strip():
            raise ValueError('Distinct native identity/title required')
        if not isinstance(a['accession_number'],str) or not a['accession_number']:
            raise ValueError('Accession/version identity required')
        if a['share_license_status']!='CC0':
            raise ValueError('Metadata may be CC0 but this item is not an observed CC0-image item')
        if not isinstance(a['images'],dict) or not isinstance(a['images'].get('web'),dict) or not str(a['images']['web'].get('url','')).startswith('https://'):
            raise ValueError('Expected published HTTPS web-image metadata; no download implied')
        if req['url']!=BASE and str(sid)!=req['url'].rsplit('/',1)[-1]:
            raise ValueError('Native lookup returned wrong artwork')
        if not isinstance(a['url'],str) or not a['url'].startswith(('https://www.clevelandart.org/','https://clevelandart.org/')):
            raise ValueError('Expected native museum landing URL')
        seen.add(sid);out.append({'id':str(sid),'title':a['title'],'metadata':a,'omitted_optional_fields':sorted(set(FIELDS)-set(a)),'landing_page':a['url'],'image_access_verified':False,'reading_access_verified':False,'topic_relevance_verified':False})
    return out


def capture(req, policy, proof):
    allowed_request(req);url=req['url']+'?'+urlencode(req['params'])
    r={'source_id':'cleveland-museum-art','observed_at':now(),'request':req,'robots_evidence':proof,'http':{'status':None,'truncated':False},'query_verified':False}
    if policy is False or policy is not None and not policy.can_fetch(USER_AGENT,url):
        return {**r,'outcome':'skipped','error':'Unavailable/disallowing policy; no target request'}
    time.sleep(pacing_seconds(policy));h,b=request(url,128*1024,{'Accept':'application/json'});r.update(http=h,response_sha256=h['sampled_bytes_sha256'])
    if h['status']!=200 or h['truncated']:
        return {**r,'outcome':'blocked-or-failed','error':h.get('error') or f'HTTP {h["status"]}; truncated={h["truncated"]}'}
    try:
        d=json.loads(b);results=parse(d,req);r.update(outcome='captured',observed_output=d,parsed_results=results)
    except (ValueError,TypeError,UnicodeError) as exc:
        r.update(outcome='invalid-response',error=str(exc),response_values_omitted=True)
        if 'd' in locals() and isinstance(d,dict):
            rows=d.get('data');rows=rows if isinstance(rows,list) else [rows]
            r['response_field_names']=[sorted(x) for x in rows[:3] if isinstance(x,dict)]
    return r


def probe(source,case_ids=None):
    with LOCK.open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);policy,proof=robots(BASE)
        for c in source['query']['cases']:
            if case_ids and c['id'] not in case_ids:continue
            r=capture(c['request'],policy,proof);v=evaluate(source,c,r,{'results':r.get('parsed_results',[])})
            with (REGISTRY/'examples/cleveland-museum-art.jsonl').open('a') as f:f.write(json.dumps(v,ensure_ascii=False,sort_keys=True)+'\n')
            print(c['id'],v['verdict'],r['http']['status'],flush=True)
            if r['outcome']!='captured':break
