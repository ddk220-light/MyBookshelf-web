"""Search public circular metadata listed on the maritime authority's home page."""
import fcntl
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.parse import urlsplit
from learning_catalogs import CatalogTree
from metadata_links import local_search
from run_source_reviews import request, robots, now, pacing_seconds
from source_registry import REGISTRY, USER_AGENT, evaluate

ENDPOINT = 'https://dgma.gov.in/'

def parse(body):
    if b'</html>' not in body.lower():
        raise ValueError('Incomplete catalog')
    root=CatalogTree(body).root
    if not root.nodes(lambda n:n.tag=='title' and n.text() in ('Directorate General of Shipping - Government of India','Directorate General of Maritime Administration - Government of India')):
        raise ValueError('Wrong maritime authority page')
    rows={}
    for a in root.nodes(lambda n:n.tag=='a' and n.attrs.get('href')):
        url=a.attrs['href'];u=urlsplit(url)
        if u.scheme!='https' or u.netloc!='dgma.gov.in' or not re.fullmatch(r'/download/[^/]*circular[^/]*\.pdf',u.path,re.I) or u.query or u.fragment:
            continue
        labels=a.nodes(lambda n:n.has_class('light-sm-txt'))
        if len(labels)!=1:continue
        stamp=re.search(r'\b\d{2}-[A-Z][a-z]{2}-20\d{2}\b',labels[0].text())
        if not stamp:raise ValueError('Missing circular publication date')
        full=a.text();title=full.split(labels[0].text())[0].strip()
        if not title:raise ValueError('Missing circular title')
        row={'id':url,'title':title,'published_date_label':stamp[0],'landing_page':ENDPOINT,'listed_document_url':url,
            'identity_scope':'Versioned linked circular filename; supersession and legal currency not inferred',
            'reading_access_verified':False}
        if url in rows and rows[url]!=row:raise ValueError('Conflicting circular metadata')
        rows[url]=row
    if not rows:raise ValueError('No dated circular metadata')
    return list(rows.values())

def assess(source,case,capture,body):
    rows=[];error=None
    try:
        h=capture['http']
        if h['status']!=200 or h['truncated'] or h['sampled_bytes_sha256']!=hashlib.sha256(body).hexdigest():
            raise ValueError('Incomplete or mismatched catalog')
        rows=local_search(parse(body),case['request']['local_query'])
    except (KeyError,TypeError,ValueError) as exc:error=str(exc)
    return evaluate(source,case,{**capture,'error':error,'response_sha256':hashlib.sha256(body).hexdigest(),
        'full_content_downloaded':False,'query_execution':'local title/native URL search over currently listed public circular metadata'}, {'results':rows})

def probe(source,case_ids=None):
    if source['id']!='dg-shipping' or source['query']['endpoint']!=ENDPOINT:raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        policy,proof=robots(ENDPOINT);body=b''
        cap={'observed_at':now(),'robots_evidence':proof,'http':{'status':None,'truncated':False}}
        if policy is not False and (policy is None or policy.can_fetch(USER_AGENT,ENDPOINT)):
            time.sleep(pacing_seconds(policy));cap['http'],body=request(ENDPOINT,limit=2*1024*1024)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:continue
            if case['request']['method']!='GET' or case['request']['url']!=ENDPOINT:raise ValueError('Unreviewed request')
            row=assess(source,case,cap,body)
            with (REGISTRY/'examples/dg-shipping.jsonl').open('a') as f:f.write(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n')
            print(case['id'],row['verdict'],row['error'],flush=True)
