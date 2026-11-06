"""Documented Seattle Hub catalog-title queries; never query underlying assets."""
import fcntl, hashlib, json, re, time
from pathlib import Path
from urllib.parse import urlencode
from run_source_reviews import robots, request, now, pacing_seconds
from source_registry import REGISTRY, USER_AGENT, evaluate
ENDPOINT='https://data-seattlecitygis.opendata.arcgis.com/api/search/v1/collections/dataset/items'

def make_request(title):
    if not isinstance(title,str) or not title or len(title)>160:raise ValueError('Bounded title required')
    return {'method':'GET','url':ENDPOINT+'?'+urlencode({'q':title,'limit':3}),'title':title}

def parse(data,title):
    if data.get('type')!='FeatureCollection' or not isinstance(data.get('features'),list) or len(data['features'])>3:raise ValueError('Unexpected catalog response')
    rows=[];seen=set()
    for item in data['features']:
        native=item['id'];p=item['properties']
        if not re.fullmatch(r'[a-f0-9]{32}(?:_\d+)?',native) or p.get('id')!=native or p.get('access')!='public':raise ValueError('Native/public identity mismatch')
        if title.casefold() not in p['title'].casefold():continue  # Upstream q also matches descriptions; retain only title-relevant items.
        links=[l['href'] for l in item.get('links',[]) if l.get('rel')=='self']
        if links!=[ENDPOINT+'/'+native] or native in seen:raise ValueError('Ambiguous native record link')
        seen.add(native)
        rows.append({'id':native,'title':p['title'],'landing_page':links[0],'source_url':p.get('url'),
            'catalog_type':p.get('type'),'metadata_modified_ms':p.get('modified'),'publisher_attribution':p.get('accessInformation'),
            'license_statement':p.get('licenseInfo'),'identity_scope':'Catalog item ID; not an underlying parcel/asset row or dataset edition',
            'underlying_data_requested':False})
    return rows

def assess(source,case,capture,body):
    rows=[];error=capture.get('error');observed=[]
    try:
        h=capture['http']
        if error or h['status']!=200 or h['truncated']:raise ValueError(error or 'Unsuccessful/incomplete catalog response')
        if h['sampled_bytes_sha256']!=hashlib.sha256(body).hexdigest():raise ValueError('Mismatched response hash')
        data=json.loads(body)
        observed=[{'id':r.get('id'),'title':r.get('properties',{}).get('title')} for r in data.get('features',[])[:3]]
        rows=parse(data,case['request']['title'])
    except (KeyError,TypeError,ValueError) as exc:error=str(exc)
    return evaluate(source,case,{**capture,'error':error,'response_sha256':hashlib.sha256(body).hexdigest(),'full_content_downloaded':False,'observed_metadata':observed},{'results':rows})

def probe(source,case_ids=None):
    if source['id']!='seattle-geodata' or source['query']['endpoint']!=ENDPOINT:raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);policy,proof=robots(ENDPOINT)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:continue
            if case['request']!=make_request(case['query_text']):raise ValueError('Unreviewed query shape')
            cap={'observed_at':now(),'robots_evidence':proof,'http':{'status':None,'truncated':False}};body=b''
            if policy is False or policy is not None and not all(policy.can_fetch(ua,case['request']['url']) for ua in [USER_AGENT,'OAI-SearchBot','ChatGPT-User']):cap['error']='Policy unavailable/disallowing'
            else:
                delay=pacing_seconds(policy)
                while delay>0:step=min(20,delay);time.sleep(step);delay-=step
                cap['http'],body=request(case['request']['url'],limit=256*1024)
            row=assess(source,case,cap,body)
            with (REGISTRY/'examples/seattle-geodata.jsonl').open('a') as f:f.write(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n')
            print(case['id'],row['verdict'],row['http']['status'],row['error'],flush=True)
            if row['verdict']!='verified':break
