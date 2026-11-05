"""Research-only, documented book metadata APIs. No book/media retrieval."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import time
from urllib.parse import urlencode,urlsplit,parse_qs
from run_source_reviews import robots,pacing_seconds,request,now
from source_registry import REGISTRY,USER_AGENT,evaluate
ENDPOINTS={'gutendex-books':'https://gutendex.com/books/','openlibrary-search':'https://openlibrary.org/search.json','google-books-public':'https://www.googleapis.com/books/v1/volumes'}
FIELDS='key,title,author_name,first_publish_year,edition_count,ebook_access,editions,editions.key,editions.title,editions.ebook_access,editions.language'


def query_url(adapter,text,page=1):
    if adapter not in ENDPOINTS or not isinstance(text,str) or not text.strip() or type(page)!=int or page<1:raise ValueError('Reviewed adapter, nonempty query and positive page required')
    if adapter=='gutendex-books':p={'search':text,'copyright':'false','page':page}
    elif adapter=='openlibrary-search':p={'q':'title:('+text+') AND ebook_access:public','fields':FIELDS,'limit':3,'page':page}
    else:p={'q':'intitle:'+text,'filter':'free-ebooks','printType':'books','maxResults':3,'startIndex':(page-1)*3}
    return ENDPOINTS[adapter]+'?'+urlencode(p)


def normalize(data,adapter):
    if not isinstance(data,dict) or data.get('error') or data.get('detail'):raise ValueError('Invalid/error API response')
    results=[]
    if adapter=='gutendex-books':
        if type(data.get('count'))!=int or not isinstance(data.get('results'),list):raise ValueError('Missing book list/count')
        for r in data['results']:
            if type(r.get('id'))!=int or r['id']<=0 or not isinstance(r.get('title'),str) or r.get('copyright') is not False:raise ValueError('Invalid Gutenberg identity/title/public-domain filter')
            results.append({'id':str(r['id']),'title':r['title'],'authors':[a['name'] for a in r.get('authors',[])],'languages':r.get('languages',[]),'subjects':r.get('subjects',[]),'bookshelves':r.get('bookshelves',[]),'us_public_domain_reported':True,'landing_page':'https://www.gutenberg.org/ebooks/'+str(r['id']),'format_links':r.get('formats',{}),'identity_scope':'Project Gutenberg ebook ID; not independent Gutendex content origin or print edition','reading_access_verified':False})
        if len(results)>32:raise ValueError('Unexpected Gutendex page size')
    elif adapter=='openlibrary-search':
        if type(data.get('numFound',data.get('num_found')))!=int or not isinstance(data.get('docs'),list):raise ValueError('Missing work list/count')
        for r in data['docs']:
            if not re.fullmatch(r'/works/OL\d+W',r.get('key','')) or r.get('ebook_access')!='public':raise ValueError('Invalid work identity/public ebook classification')
            editions=r.get('editions',{}).get('docs',[])
            if any(not re.fullmatch(r'/books/OL\d+M',e.get('key','')) for e in editions):raise ValueError('Invalid edition identity')
            results.append({'id':r['key'],'title':r['title'],'authors':r.get('author_name',[]),'first_publish_year':r.get('first_publish_year'),'edition_count':r.get('edition_count'),'ebook_access':r['ebook_access'],'matching_editions':editions,'landing_page':'https://openlibrary.org'+r['key'],'identity_scope':'Work with provider-selected matching edition; first publication year is not edition date','reading_access_verified':False})
        if len(results)>3:raise ValueError('Unexpected work page size')
    elif adapter=='google-books-public':
        if data.get('kind')!='books#volumes' or type(data.get('totalItems'))!=int:raise ValueError('Missing Google volume list/count')
        for r in data.get('items',[]):
            v=r.get('volumeInfo',{});a=r.get('accessInfo',{});sale=r.get('saleInfo',{})
            if r.get('kind')!='books#volume' or not re.fullmatch(r'[A-Za-z0-9_-]+',r.get('id','')) or not v.get('title'):raise ValueError('Invalid volume identity/title')
            if sale.get('saleability')!='FREE' or not a.get('publicDomain') or a.get('viewability')!='ALL_PAGES':raise ValueError('Returned volume does not satisfy observed free full-view subset')
            results.append({'id':r['id'],'title':v['title'],'subtitle':v.get('subtitle'),'authors':v.get('authors',[]),'published_date':v.get('publishedDate'),'language':v.get('language'),'industry_identifiers':v.get('industryIdentifiers',[]),'content_version':v.get('contentVersion'),'etag':r.get('etag'),'saleability':sale.get('saleability'),'access_country':a.get('country'),'viewability':a.get('viewability'),'public_domain_reported':a.get('publicDomain'),'landing_page':v.get('infoLink'),'reader_link':a.get('webReaderLink'),'reading_access_verified':False})
        if len(results)>3:raise ValueError('Unexpected volume page size')
    else:raise ValueError('Unreviewed book adapter')
    if any(not r['title'] for r in results) or len({r['id'] for r in results})!=len(results):raise ValueError('Empty title/duplicate native IDs')
    return results


def assess(source,case,cap):
    results=[];error=None
    try:
        if cap.get('outcome')!='captured' or cap['http']['status']!=200 or cap['http'].get('truncated') or cap['request']!=case['request']:raise ValueError('Missing complete matching API response')
        raw=cap['response_text'].encode();digest=hashlib.sha256(raw).hexdigest()
        if digest!=cap['response_sha256'] or digest!=cap['http']['sampled_bytes_sha256']:raise ValueError('API response hash mismatch')
        results=normalize(json.loads(cap['response_text']),source['query']['adapter'])
        text=case['request']['query_text'].casefold();tokens=re.findall(r'\w+',text)
        for r in results:
            if r['id'] in case['expected_ids']:
                searchable=(r['title']+' '+ ' '.join(r.get('authors',[]))).casefold() if source['query']['adapter']=='gutendex-books' else (r['title']+' '+(r.get('subtitle') or '')).casefold()
                if not all(t in searchable for t in tokens):raise ValueError('Selected item lacks query relevance')
    except (ValueError,KeyError,TypeError) as exc:error=str(exc)
    return evaluate(source,case,{k:v for k,v in {**cap,'error':error}.items() if k!='response_text'},{'results':results})


def capture(adapter,text,page,policy,proof):
    url=query_url(adapter,text,page);public_request={'method':'GET','url':url,'query_text':text,'page':page}
    cap={'observed_at':now(),'request':public_request,'robots_evidence':proof,'http':{'url':url,'status':None,'truncated':False},'outcome':'skipped','response_sha256':hashlib.sha256(b'').hexdigest(),'full_content_downloaded':False}
    if policy is False or policy is not None and not policy.can_fetch(USER_AGENT,url):cap['reason']='Unavailable or disallowing policy';return cap
    secret=os.environ.get('GOOGLE_BOOKS_API_KEY') if adapter=='google-books-public' else None
    if adapter=='google-books-public' and not secret:cap['reason']='Existing authorized Google Books API key is absent';return cap
    time.sleep(pacing_seconds(policy));private_url=url+('&key='+secret if secret else '')
    h,b=request(private_url,limit=4*1024*1024)
    # A key is used only in transport; never persist it in URLs, errors or bodies.
    if secret:
        h=json.loads(json.dumps(h).replace(secret,'[REDACTED]'));h['url']=url
        if 'final_url' in h:h['final_url']=h['final_url'].replace('&key=[REDACTED]','')
        if secret.encode() in b:raise ValueError('Provider echoed a credential; response not persisted')
    cap.update(http=h,outcome='captured' if h['status']==200 and not h['truncated'] else 'blocked-or-failed',response_sha256=hashlib.sha256(b).hexdigest(),response_text=b.decode('utf-8'),credential_used=bool(secret))
    return cap


def probe(source,case_ids=None):
    adapter=source['query']['adapter']
    if source['query']['endpoint']!=ENDPOINTS[adapter]:raise ValueError('Unreviewed book API endpoint')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);policy,proof=robots(ENDPOINTS[adapter])
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:continue
            cap=capture(adapter,case['request']['query_text'],case['request']['page'],policy,proof)
            with (REGISTRY/'examples'/f'{source["id"]}.scouting.jsonl').open('a') as f:f.write(json.dumps(cap,ensure_ascii=False,sort_keys=True)+'\n')
            obs=assess(source,case,cap)
            with (REGISTRY/'examples'/f'{source["id"]}.jsonl').open('a') as f:f.write(json.dumps(obs,ensure_ascii=False,sort_keys=True)+'\n')
            print(case['id'],obs['verdict'],cap['http']['status'],flush=True)
            if cap['outcome']=='skipped' or cap['http']['status'] in (401,403,429,503):break
