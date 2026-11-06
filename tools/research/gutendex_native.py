"""Documented Gutendex native-book metadata lookup; broad search remains separate."""
import fcntl,hashlib,json,re,time
from pathlib import Path
from run_source_reviews import robots,request,now,pacing_seconds
from source_registry import REGISTRY,USER_AGENT,evaluate
ENDPOINT='https://gutendex.com/books/'

def make_request(native):
    if not isinstance(native,str) or not re.fullmatch(r'[1-9][0-9]{0,7}',native):raise ValueError('Native positive book ID required')
    return {'method':'GET','url':ENDPOINT+native+'/','native_id':native}

def parse(data,native):
    if str(data.get('id'))!=native or not isinstance(data.get('title'),str) or not data['title'].strip():raise ValueError('Native book identity/title mismatch')
    return [{'id':native,'title':data['title'],'authors':[r['name'] for r in data.get('authors',[])],
        'languages':data.get('languages',[]),'reported_copyright':data.get('copyright'),
        'landing_page':ENDPOINT+native+'/','gutenberg_url':'https://www.gutenberg.org/ebooks/'+native,
        'identity_scope':'Project Gutenberg native ebook ID mirrored by Gutendex; not a new independent origin',
        'reading_access_verified':False}]

def assess(source,case,cap,body):
    rows=[];error=cap.get('error')
    try:
        h=cap['http']
        if error or h['status']!=200 or h['truncated']:raise ValueError(error or 'Unsuccessful/incomplete native-book response')
        if h['sampled_bytes_sha256']!=hashlib.sha256(body).hexdigest():raise ValueError('Mismatched response hash')
        rows=parse(json.loads(body),case['request']['native_id'])
    except (ValueError,KeyError,TypeError) as exc:error=str(exc)
    return evaluate(source,case,{**cap,'error':error,'response_sha256':hashlib.sha256(body).hexdigest(),'full_content_downloaded':False},{'results':rows})

def probe(source,case_ids=None):
    if source['id']!='gutendex' or source['query']['endpoint']!=ENDPOINT:raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);p,proof=robots(ENDPOINT)
        for c in source['query']['cases']:
            if case_ids and c['id'] not in case_ids:continue
            if c['request']!=make_request(c['query_text']):raise ValueError('Unreviewed native lookup')
            cap={'observed_at':now(),'robots_evidence':proof,'http':{'status':None,'truncated':False}};body=b''
            if p is False or p is not None and not p.can_fetch(USER_AGENT,c['request']['url']):cap['error']='Policy unavailable/disallowing'
            else:
                time.sleep(pacing_seconds(p));cap['http'],body=request(c['request']['url'],limit=256*1024,timeout=30)
            row=assess(source,c,cap,body)
            with (REGISTRY/'examples/gutendex.jsonl').open('a') as f:f.write(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n')
            print(c['id'],row['verdict'],row['http']['status'],row['error'],flush=True)
            if row['verdict']!='verified':break
