"""Search six resolution records explicitly listed in MKC's public recycling guide.

This is a bounded historical document index, not the main MKC library catalogue.
"""
import re
import json, hashlib, fcntl, time
from pathlib import Path
from run_source_reviews import robots, request, pacing_seconds, now
from source_registry import REGISTRY, USER_AGENT, evaluate
from html.parser import HTMLParser
from urllib.parse import urlsplit,parse_qs
from cmda_opencity_catalog import search

ENDPOINT='https://imo.libguides.com/c.php?g=659460&p=4744890'
MAX_BYTES=256*1024

class Links(HTMLParser):
    def __init__(self):super().__init__();self.href=None;self.parts=[];self.links=[]
    def handle_starttag(self,tag,attrs):
        if tag=='a':self.href=dict(attrs).get('href');self.parts=[]
    def handle_data(self,data):
        if self.href:self.parts.append(data)
    def handle_endtag(self,tag):
        if tag=='a' and self.href:
            self.links.append((self.href,' '.join(' '.join(self.parts).replace('\u200b','').split())));self.href=None

def parse(body):
    if not isinstance(body,bytes) or len(body)>MAX_BYTES:raise ValueError('Metadata exceeds bound')
    text=body.decode()
    if '</html>' not in text.lower() or 'International Maritime Organization' not in text or 'Maritime Knowledge Centre' not in text:
        raise ValueError('Incomplete or unattributed guide')
    p=Links();p.feed(text);rows=[]
    for link,title in p.links:
        m=re.fullmatch(r'(MEPC\.\d+\(\d+\)) - (\d{4}) (.+)',title)
        if not m:continue
        u=urlsplit(link);ids=parse_qs(u.query)
        if u.scheme!='https' or u.netloc!='imo.libguides.com' or u.path!='/ld.php' or set(ids)!={'content_id'} or len(ids['content_id'])!=1 or not ids['content_id'][0].isdigit():
            raise ValueError('Mismatched document link')
        rows.append({'id':m[1],'title':title,'year_as_listed':m[2],'published_document_url':link,
          'guide_content_id':ids['content_id'][0],'identity_namespace':'IMO resolution symbol','full_content_access_verified':False,'current_legal_status_verified':False})
    if not 0<len(rows)<=50 or len({r['id'] for r in rows})!=len(rows):raise ValueError('Empty/unbounded or conflicting resolution IDs')
    return rows


def assess(source,case,cap,body):
    error,rows=cap.get('error'),[]
    try:
        h=cap['http']
        if error or h['status']!=200 or h['truncated']:raise ValueError(error or 'Unsuccessful/incomplete metadata')
        if h['sampled_bytes_sha256']!=hashlib.sha256(body).hexdigest():raise ValueError('Capture hash mismatch')
        req=case['request']
        if req['method']!='GET' or req['url']!=ENDPOINT:raise ValueError('Unreviewed request')
        rows=search(parse(body),req['local_query'])
    except (KeyError,TypeError,ValueError) as exc:error=str(exc)
    return evaluate(source,case,{**cap,'error':error,'response_sha256':hashlib.sha256(body).hexdigest(),
        'full_content_downloaded':False,'query_execution':'Local literal resolution-title/native-symbol search over public UI metadata'}, {'results':rows})


def probe(source,case_ids=None):
    if source['id']!='imo-knowledge-centre' or source['query']['endpoint']!=ENDPOINT:raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        policy,proof=robots(ENDPOINT);body=b''
        cap={'observed_at':now(),'robots_evidence':proof,'http':{'status':None,'truncated':False}}
        if policy is False or policy is not None and not all(policy.can_fetch(a,ENDPOINT) for a in [USER_AGENT,'ChatGPT-User','OAI-SearchBot']):
            cap['error']='Policy unavailable/disallowing; no metadata request'
        else:
            time.sleep(pacing_seconds(policy));cap['http'],body=request(ENDPOINT,limit=MAX_BYTES)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:continue
            row=assess(source,case,cap,body)
            with (REGISTRY/'examples/imo-knowledge-centre.jsonl').open('a') as f:f.write(json.dumps(row,sort_keys=True)+'\n')
            print(case['id'],row['verdict'],row['error'],flush=True)
