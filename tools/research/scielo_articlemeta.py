"""Documented anonymous ArticleMeta article-ID metadata lookup; no article bodies."""
import fcntl, hashlib, json, re, time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from run_source_reviews import robots, request, pacing_seconds, now
from source_registry import REGISTRY, USER_AGENT, evaluate, request_url
ENDPOINT = 'https://articlemeta.scielo.org/api/v1/article/'

class TitleText(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]
    def handle_data(self, value):
        self.parts.append(value)

def make_request(code, collection='scl'):
    if not isinstance(code,str) or not re.fullmatch(r'S[0-9]{4}-[0-9X][0-9X]{3}[0-9]{13}',code):
        raise ValueError('Native SciELO article PID required')
    if collection!='scl': raise ValueError('Only reviewed Brazil collection scope')
    return {'method':'GET','url':ENDPOINT,'params':{'code':code,'collection':collection,'format':'xylose','body':'false'}}

def parse(data, code, collection):
    if data.get('code')!=code or data.get('collection')!=collection:
        raise ValueError('Wrong article/collection identity')
    article=data['article']
    if article.get('code')!=code or article.get('collection')!=collection:
        raise ValueError('Nested article identity mismatch')
    if data.get('body') or data.get('article_body'):
        raise ValueError('Unexpected full-text body')
    titles=[]
    for entry in article['v12']:
        if not isinstance(entry.get('_'),str):raise ValueError('Missing article title')
        parser=TitleText();parser.feed(entry['_']);title=' '.join(''.join(parser.parts).split())
        if not title:raise ValueError('Empty article title')
        titles.append({'title':title,'raw_markup':entry['_'],'language':entry.get('l')})
    if not titles:raise ValueError('No article titles')
    links=[]
    for formats in data.get('fulltexts',{}).values():
        if not isinstance(formats,dict):raise ValueError('Unexpected fulltexts shape')
        for lang,url in formats.items():
            u=urlsplit(url)
            if u.scheme not in ('http','https') or not (u.hostname=='scielo.br' or (u.hostname or '').endswith('.scielo.br')):raise ValueError('Unexpected content-link origin')
            links.append({'language':lang,'url':url,'fetched':False})
    return [{'id':collection+':'+code,'title':titles[0]['title'],'titles':titles,'native_pid':code,'collection':collection,
        'journal_title':data.get('title',{}).get('v100',[]),'document_type':data.get('document_type'),
        'publication_date_reported':data.get('publication_date'),'processing_date':data.get('processing_date'),
        'provider_version_label':data.get('version'),'reported_content_links':links,
        'landing_page':request_url(make_request(code,collection)),
        'identity_scope':'SciELO collection plus native article PID; provider version label is not an edition number',
        'reading_access_verified':False}]

def assess(source,case,cap,body):
    rows=[];error=cap.get('error')
    try:
        h=cap['http']
        if error or h['status']!=200 or h['truncated']:raise ValueError(error or 'Unsuccessful/oversized ArticleMeta metadata')
        if h['sampled_bytes_sha256']!=hashlib.sha256(body).hexdigest():raise ValueError('Mismatched response hash')
        params=case['request']['params'];rows=parse(json.loads(body),params['code'],params['collection'])
    except (ValueError,KeyError,TypeError) as exc:error=str(exc)
    return evaluate(source,case,{**cap,'error':error,'response_sha256':hashlib.sha256(body).hexdigest(),
        'full_content_downloaded':False,'requested_article_body':False},{'results':rows})

def probe(source,case_ids=None):
    if source['id']!='scielo' or source['query']['endpoint']!=ENDPOINT:raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);p,proof=robots(ENDPOINT)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:continue
            params=case['request']['params']
            if case['request']!=make_request(params['code'],params['collection']):raise ValueError('Unreviewed query')
            url=request_url(case['request']);body=b'';cap={'observed_at':now(),'robots_evidence':proof,'http':{'status':None,'truncated':False}}
            if p is False or p is not None and not all(p.can_fetch(a,url) for a in [USER_AGENT,'ChatGPT-User','OAI-SearchBot']):cap['error']='Unavailable/disallowing policy'
            else:
                time.sleep(max(3,pacing_seconds(p)));cap['http'],body=request(url,limit=1024*1024,timeout=30)
            row=assess(source,case,cap,body)
            with (REGISTRY/'examples/scielo.jsonl').open('a') as f:f.write(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n')
            print(case['id'],row['verdict'],row['error'],flush=True)
            if row['verdict']!='verified':break
