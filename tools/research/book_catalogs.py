"""Permitted book metadata exports and the free 15-item Standard Ebooks feed."""
import csv
import fcntl
import hashlib
import io
import json
from pathlib import Path
import re
import time
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET
from learning_catalogs import search
from run_source_reviews import robots,request,pacing_seconds,now
from source_registry import REGISTRY,USER_AGENT,evaluate
ENDPOINTS={'gutenberg-csv':'https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv','standard-new-releases':'https://standardebooks.org/feeds/atom/new-releases'}
LIMIT=48*1024*1024


def parse(body,adapter):
    if len(body)>LIMIT:raise ValueError('Metadata export exceeds cap')
    rows=[]
    if adapter=='gutenberg-csv':
        reader=csv.DictReader(io.StringIO(body.decode('utf-8-sig'),newline=''))
        if reader.fieldnames!=['Text#','Type','Issued','Title','Language','Authors','Subjects','LoCC','Bookshelves']:raise ValueError('Changed Gutenberg CSV schema')
        for r in reader:
            if not r['Text#'].isascii() or not r['Text#'].isdigit() or not r['Title'].strip() or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',r['Issued']):raise ValueError('Invalid ebook ID/title/release date')
            rows.append({'id':r['Text#'],'title':r['Title'],'type':r['Type'],'gutenberg_release_date':r['Issued'],'languages':r['Language'].split('; '),'authors':r['Authors'],'subjects':r['Subjects'].split('; '),'classification':r['LoCC'],'bookshelves':r['Bookshelves'].split('; '),'landing_page':'https://www.gutenberg.org/ebooks/'+r['Text#'],'print_edition':None,'reading_access_verified':False})
    elif adapter=='standard-new-releases':
        if b'<!DOCTYPE' in body.upper() or b'<!ENTITY' in body.upper():raise ValueError('Unpermitted XML declarations')
        root=ET.fromstring(body);n={'a':'http://www.w3.org/2005/Atom'}
        if root.tag!='{'+n['a']+'}feed' or root.findtext('a:id',namespaces=n)!=ENDPOINTS[adapter]:raise ValueError('Changed Atom feed identity')
        if '15 latest' not in root.findtext('a:subtitle','',n):raise ValueError('Changed new-releases feed scope')
        for e in root.findall('a:entry',n):
            identity=e.findtext('a:id','',n);u=urlsplit(identity)
            if u.scheme!='https' or u.netloc!='standardebooks.org' or not re.fullmatch(r'/ebooks/[^/]+/[^/]+(?:/[^/]+)*',u.path) or u.query or u.fragment:raise ValueError('Invalid native edition URL')
            rows.append({'id':identity,'title':e.findtext('a:title','',n),'authors':[a.findtext('a:name','',n) for a in e.findall('a:author',n)],'published':e.findtext('a:published','',n),'updated':e.findtext('a:updated','',n),'rights_statement':e.findtext('a:rights','',n),'landing_page':identity,'identity_scope':'Edition URL includes creator/title/translator segments; no work-level merge','reading_access_verified':False})
        if not 1<=len(rows)<=15:raise ValueError('New-release count outside reviewed scope')
    else:raise ValueError('Unreviewed export adapter')
    if not rows or any(not r['id'] or not r['title'] for r in rows) or len({r['id'] for r in rows})!=len(rows):raise ValueError('Empty metadata or duplicate native IDs')
    return rows


def assess(source,case,cap,body):
    results=[];error=None
    try:
        digest=hashlib.sha256(body).hexdigest()
        if cap['http'].get('status')!=200 or cap['http'].get('truncated') or cap['http'].get('sampled_bytes_sha256')!=digest or cap['http']['url']!=case['request']['url'] or case['request']['url']!=ENDPOINTS[source['query']['adapter']]:raise ValueError('Incomplete/mismatched metadata export')
        rows=parse(body,source['query']['adapter']);results=search(rows,case['request']['local_query'])
    except (ValueError,KeyError,TypeError,ET.ParseError,UnicodeError) as exc:error=str(exc)
    return evaluate(source,case,{**cap,'error':error,'response_sha256':hashlib.sha256(body).hexdigest(),'full_content_downloaded':False,'execution_mode':'local-title-query-over-permitted-metadata'},{'results':results})


def probe(source,case_ids=None):
    adapter=source['query']['adapter'];url=ENDPOINTS[adapter]
    if source['query']['endpoint']!=url:raise ValueError('Unreviewed export URL')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);policy,proof=robots(url);cap={'source_id':source['id'],'observed_at':now(),'robots_evidence':proof,'query_verified':False}
        if policy is False or policy is not None and not policy.can_fetch(USER_AGENT,url):cap.update(outcome='skipped',reason='Unavailable/disallowing export policy')
        else:
            time.sleep(pacing_seconds(policy));h,body=request(url,limit=LIMIT);cap.update(http=h,outcome='captured' if h['status']==200 and not h['truncated'] else 'blocked-or-failed',response_sha256=hashlib.sha256(body).hexdigest())
        with (REGISTRY/'examples'/f'{source["id"]}.access.jsonl').open('a') as f:f.write(json.dumps(cap,ensure_ascii=False,sort_keys=True)+'\n')
        if cap['outcome']!='captured':return
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:continue
            obs=assess(source,case,cap,body)
            with (REGISTRY/'examples'/f'{source["id"]}.jsonl').open('a') as f:f.write(json.dumps(obs,ensure_ascii=False,sort_keys=True)+'\n')
