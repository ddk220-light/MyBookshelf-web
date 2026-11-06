"""Bounded public NASA media metadata and Lever Press/Fulcrum search tests."""
import fcntl, hashlib, json, re, time
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from learning_catalogs import CatalogTree
from run_source_reviews import robots, request, now, pacing_seconds
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINTS = {'nasa-images-public':'https://images-api.nasa.gov/search', 'lever-fulcrum':'https://www.fulcrum.org/leverpress'}

def parse_nasa(body):
    data=json.loads(body); collection=data.get('collection')
    if not isinstance(collection,dict) or not isinstance(collection.get('items'),list):
        raise ValueError('Missing NASA collection')
    rows=[]
    for item in collection['items']:
        records=item.get('data',[])
        if len(records)!=1 or not records[0].get('nasa_id') or not records[0].get('title'):
            raise ValueError('Missing native NASA identity/title')
        r=records[0]
        if r.get('media_type')!='image': raise ValueError('Outside reviewed image scope')
        rows.append({'id':r['nasa_id'],'title':r['title'],'media_type':r['media_type'], 'center':r.get('center'), 'date_created':r.get('date_created'), 'keywords':r.get('keywords',[]), 'description_excerpt':str(r.get('description',''))[:600], 'metadata_href':item.get('href'), 'reading_access_verified':False})
    if len({r['id'] for r in rows})!=len(rows): raise ValueError('Duplicate NASA ID')
    return rows

def parse_lever(body,query):
    root=CatalogTree(body).root
    if not root.nodes(lambda n:n.tag=='input' and n.attrs.get('name')=='q' and n.attrs.get('value')==query):
        raise ValueError('Missing echoed publisher query')
    rows=[]
    for article in root.nodes(lambda n:n.tag=='article' and n.has_class('blacklight-monograph')):
        titles=article.nodes(lambda n:n.has_class('index_title'))
        links=article.nodes(lambda n:n.tag=='a' and re.fullmatch(r'/concern/monographs/[a-z0-9]+(?:[?].*)?',n.attrs.get('href','')))
        if len(titles)!=1 or not links or not titles[0].text(): raise ValueError('Missing native Fulcrum title/link')
        path=urlsplit(links[0].attrs['href']).path; sid=path.rsplit('/',1)[-1]
        authors=article.nodes(lambda n:n.has_class('authors')); dates=article.nodes(lambda n:n.has_class('pub-date'))
        rows.append({'id':sid,'title':titles[0].text(),'authors':[n.text() for n in authors],'date':dates[0].text() if dates else None,'landing_page':'https://www.fulcrum.org'+path,'publisher_scope':'Lever Press','reading_access_verified':False})
    if not rows and not re.search(r'No (?:entries|results|books|works|items) found|No results|0 results|Sorry, no',root.text(),re.I):
        raise ValueError('Missing result rows or explicit empty state')
    if len({r['id'] for r in rows})!=len(rows): raise ValueError('Duplicate Fulcrum identity')
    return rows

def parse_caltech(records, query):
    if not isinstance(records,list) or len(records)>2: raise ValueError('Outside first-two rendered result scope')
    rows=[]
    for r in records:
        url=r.get('url',''); match=re.fullmatch(r'https://thesis[.]caltech[.]edu/([0-9]+)/',url)
        if not match or not r.get('title') or query.casefold() not in r['title'].casefold(): raise ValueError('Wrong thesis identity or query relevance')
        rows.append({'id':match.group(1),'title':r['title'],'landing_page':url,'reading_access_verified':False})
    if len({r['id'] for r in rows})!=len(rows): raise ValueError('Duplicate thesis identity')
    return rows


def assess(source,case,cap,body):
    error=None;rows=[]
    try:
        h=cap['http']
        if h['status']!=200 or h['truncated'] or h['sampled_bytes_sha256']!=hashlib.sha256(body).hexdigest(): raise ValueError('Incomplete or mismatched response')
        rows=parse_nasa(body) if source['query']['adapter']=='nasa-images-public' else parse_lever(body,case['query_text'])
        expected=set(case['expected_ids'])
        if any(case['query_text'].casefold() not in (r['title']+' '+r.get('description_excerpt','')+' '+' '.join(r.get('keywords',[]))).casefold() for r in rows if r['id'] in expected): raise ValueError('Expected record lacks observed query relevance')
    except (ValueError,TypeError,KeyError) as e:error=str(e)
    return evaluate(source,case,{**cap,'error':error,'response_sha256':hashlib.sha256(body).hexdigest(),'full_content_downloaded':False},{'results':rows})

def probe(source,case_ids=None):
    endpoint=ENDPOINTS[source['query']['adapter']]
    if source['query']['endpoint']!=endpoint: raise ValueError('Unreviewed endpoint')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        policy,proof=robots(endpoint)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids: continue
            req=case['request'];u=req['url']
            if urlsplit(u)._replace(query='').geturl()!=endpoint: raise ValueError('Unreviewed destination')
            cap={'observed_at':now(),'robots_evidence':proof,'http':{'url':u,'status':None,'truncated':False}};body=b''
            if policy is not False and (policy is None or policy.can_fetch(USER_AGENT,u)):
                time.sleep(pacing_seconds(policy));cap['http'],body=request(u,limit=1024*1024)
            obs=assess(source,case,cap,body)
            with (REGISTRY/'examples'/(source['id']+'.jsonl')).open('a') as f:f.write(json.dumps(obs,ensure_ascii=False,sort_keys=True)+'\n')
            print(source['id'],case['id'],obs['verdict'],obs['error'],flush=True)
            if cap['http']['status'] in (None,401,403,429,500,502,503,504): break
