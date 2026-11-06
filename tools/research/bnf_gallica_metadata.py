"""Exact-title metadata search over BnF editions linked to Gallica reproductions."""
import fcntl,hashlib,json,re,time
from pathlib import Path
from run_source_reviews import robots,request,pacing_seconds,now
from source_registry import REGISTRY,USER_AGENT,evaluate,request_url
ENDPOINT='https://data.bnf.fr/sparql'
PREFIX='PREFIX rda: <http://rdvocab.info/RDARelationshipsWEMI/>\nPREFIX dcterms: <http://purl.org/dc/terms/>\n'

def make_request(title):
    if not isinstance(title,str) or not title.strip() or len(title)>1000:raise ValueError('Bounded literal title required')
    query=PREFIX+'SELECT DISTINCT ?edition ?title ?gallica WHERE {\n VALUES ?title { '+json.dumps(title,ensure_ascii=False)+' }\n ?edition rda:electronicReproduction ?gallica ; dcterms:title ?title .\n FILTER (STRSTARTS(STR(?gallica), "https://gallica.bnf.fr/ark:/12148/") || STRSTARTS(STR(?gallica), "http://gallica.bnf.fr/ark:/12148/"))\n} LIMIT 3'
    return {'method':'GET','url':ENDPOINT,'params':{'query':query,'format':'application/json','timeout':10000},'title':title}

def parse(data,title):
    bindings=data['results']['bindings']
    if not isinstance(bindings,list) or len(bindings)>3:raise ValueError('Invalid bounded SPARQL response')
    rows={}
    for b in bindings:
        edition=b['edition'];text=b['title'];reproduction=b['gallica']
        if edition.get('type')!='uri' or not re.fullmatch(r'https?://data\.bnf\.fr/ark:/12148/cb[0-9a-z]+#about',edition['value']):raise ValueError('Invalid BnF edition identity')
        if not (text.get('type')=='literal' or text.get('type')=='typed-literal' and text.get('datatype')=='http://www.w3.org/2001/XMLSchema#string') or text['value']!=title:raise ValueError('Irrelevant exact-title result')
        m=re.fullmatch(r'https?://gallica\.bnf\.fr/ark:/12148/([a-z0-9]+)',reproduction['value'])
        if reproduction.get('type')!='uri' or not m:raise ValueError('Result lacks native Gallica reproduction')
        native='ark:/12148/'+m[1];row={'id':native,'title':text['value'],'edition_uri':edition['value'],
            'landing_page':'https://gallica.bnf.fr/'+native,'reported_reproduction_url':reproduction['value'],
            'title_language':text.get('xml:lang'),'identity_scope':'BnF bibliographic edition linked to a distinct Gallica digital ARK; not a merged work',
            'reading_access_verified':False}
        if native in rows and rows[native]!=row:raise ValueError('Conflicting edition mapping for digital ARK')
        rows[native]=row
    return list(rows.values())

def assess(source,case,cap,body):
    rows=[];error=cap.get('error');observed=[]
    try:
        h=cap['http']
        if error or h['status']!=200 or h['truncated']:raise ValueError(error or 'Unsuccessful or oversized metadata response')
        if h['sampled_bytes_sha256']!=hashlib.sha256(body).hexdigest():raise ValueError('Mismatched metadata hash')
        data=json.loads(body);observed=data.get('results',{}).get('bindings',[])[:3]
        rows=parse(data,case['request']['title'])
    except (KeyError,TypeError,ValueError) as exc:error=str(exc)
    return evaluate(source,case,{**cap,'error':error,'response_sha256':hashlib.sha256(body).hexdigest(),'full_content_downloaded':False,'observed_bindings':observed},{'results':rows})

def probe(source,case_ids=None):
    if source['id']!='gallica' or source['query']['endpoint']!=ENDPOINT:raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);p,proof=robots(ENDPOINT)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:continue
            if case['request']!=make_request(case['query_text']):raise ValueError('Unreviewed metadata query')
            url=request_url(case['request']);cap={'observed_at':now(),'robots_evidence':proof,'http':{'status':None,'truncated':False}};body=b''
            if p is False or p is not None and not all(p.can_fetch(ua,url) for ua in [USER_AGENT,'ChatGPT-User','OAI-SearchBot']):cap['error']='Policy unavailable/disallowing'
            else:
                time.sleep(max(3,pacing_seconds(p)));cap['http'],body=request(url,limit=256*1024)
            row=assess(source,case,cap,body)
            with (REGISTRY/'examples/gallica.jsonl').open('a') as f:f.write(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n')
            print(case['id'],row['verdict'],row['http']['status'],row['error'],flush=True)
            if row['verdict']!='verified':break
