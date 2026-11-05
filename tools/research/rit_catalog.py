"""Research-only RIT published thesis catalog metadata; no PDF requests."""
import fcntl
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.parse import urlsplit
from publication_catalogs import Tree,Node
from learning_catalogs import search
from run_source_reviews import robots,pacing_seconds,request,now,save
from source_registry import REGISTRY,USER_AGENT,evaluate
ENDPOINT='https://repository.rit.edu/theses/'
RUN='rit-thesis-catalog-20261105el'


def parse(body,url):
    root=Tree(body).root;containers=root.nodes(lambda n:n.attrs.get('id')=='series-home')
    if len(containers)!=1:raise ValueError('Missing/ambiguous published thesis catalog')
    rows=[];year=None
    for n in containers[0].children:
        if not isinstance(n,Node):continue
        if n.tag=='h3' and re.fullmatch(r'year_[0-9]{4}',n.attrs.get('id','')):year=n.attrs['id'][5:]
        if n.tag!='p' or not n.has_class('article-listing'):continue
        links=n.nodes(lambda n:n.tag=='a');
        if len(links)!=1 or not year:raise ValueError('Changed thesis title/year structure')
        link=links[0];u=urlsplit(link.attrs.get('href',''));m=re.fullmatch(r'/theses/([0-9]+)',u.path)
        if u.scheme!='https' or u.netloc!='repository.rit.edu' or not m or u.query or u.fragment or not link.text():raise ValueError('Unexpected native thesis identity')
        rows.append({'id':m[1],'title':link.text(),'landing_page':link.attrs['href'],'listed_year':year,'catalog_page':url,'reading_access_verified':False})
    paging=re.search(r'Page\s+(\d+)\s+of\s+(\d+)',root.text())
    if not rows or len(rows)>100 or not paging:raise ValueError('Missing/broken catalog pagination')
    current,total=map(int,paging.groups());links=root.nodes(lambda n:n.tag=='a' and n.has_class('next'))
    nxt=links[0].attrs.get('href') if len(links)==1 else None
    # Digital Commons omits the Next arrow when the final page window is shown.
    # Follow the actual numbered link, not a synthesized unobserved URL.
    if current<total and not links:
        numbered=root.nodes(lambda n:n.tag=='a' and n.attrs.get('title')==f'Page {current+1}')
        if len(numbered)==1:
            nxt=numbered[0].attrs.get('href')
    if current<total and nxt!=f'https://repository.rit.edu/theses/index.{current+1}.html':raise ValueError('Invalid published next-page link')
    if current==total and links:raise ValueError('Unexpected final-page next link')
    return {'results':rows,'page':current,'total_pages':total,'next_url':nxt}


def collect():
    directory=REGISTRY/'runs'/RUN;directory.mkdir(exist_ok=True)
    obsfile=directory/'observations.jsonl';done=[json.loads(l) for l in obsfile.read_text().split('\n') if l] if obsfile.exists() else []
    captured={o['url']:o for o in done if o['outcome']=='captured'}
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);policy,proof=robots(ENDPOINT);url=ENDPOINT;queue=[];state={'run_id':RUN,'state':'running','heartbeat_at':now(),'processed':0,'total':111,'goal_complete':False}
        seen=set()
        while url:
            if url in seen or len(seen)>=120:raise ValueError('Cycle/unsafe catalog page count')
            seen.add(url);job={'id':hashlib.sha256(url.encode()).hexdigest()[:20],'url':url,'source_ids':['rit-scholarworks'],'lead_ids':[]};queue.append(job);save(directory/'queue.json',{'created_at':now(),'jobs':queue})
            if url in captured:obs=captured[url]
            else:
                state.update(current_url=url,heartbeat_at=now());save(directory/'progress.json',state)
                obs={'job_id':job['id'],'url':url,'source_ids':['rit-scholarworks'],'lead_ids':[],'observed_at':now(),'robots_evidence':proof,'query_verified':False}
                if policy is False or policy is not None and not policy.can_fetch(USER_AGENT,url):obs.update(outcome='skipped',reason='Unavailable/disallowing public policy; stop without alternate endpoint')
                else:
                    time.sleep(pacing_seconds(policy));http,body=request(url);obs['http']=http
                    if http.get('status')==200 and not http.get('truncated'):
                        try:obs.update(outcome='captured',catalog=parse(body,url))
                        except (ValueError,UnicodeError) as exc:obs.update(outcome='blocked-or-failed',reason=str(exc))
                    else:obs.update(outcome='blocked-or-failed',reason='Unsuccessful/incomplete catalog response')
                with obsfile.open('a') as out:out.write(json.dumps(obs,ensure_ascii=False,sort_keys=True)+'\n')
                print(url,obs['outcome'],len(obs.get('catalog',{}).get('results',[])),flush=True)
            state.update(processed=len(seen),heartbeat_at=now())
            if obs['outcome']!='captured':state.update(state='interrupted',reason=obs.get('reason'));save(directory/'progress.json',state);return
            state['total']=obs['catalog']['total_pages'];url=obs['catalog']['next_url'];save(directory/'progress.json',state)
        state.update(state='evidence-pass-complete',heartbeat_at=now(),remaining=0);save(directory/'progress.json',state)


def snapshot():
    directory=REGISTRY/'runs'/RUN;state=json.loads((directory/'progress.json').read_text());queue=json.loads((directory/'queue.json').read_text())['jobs'];observations=[json.loads(l) for l in (directory/'observations.jsonl').read_text().split('\n') if l];latest={o['job_id']:o for o in observations}
    if state['state']!='evidence-pass-complete' or len(queue)!=state['total'] or {x['id'] for x in queue}!=set(latest):raise ValueError('Incomplete catalog collection')
    records={};duplicates=[]
    for job in queue:
        o=latest[job['id']]
        if o['outcome']!='captured' or o['http']['status']!=200 or o['http']['truncated']:raise ValueError('Failed/incomplete page')
        for row in o['catalog']['results']:
            if row['id'] in records:
                prior=records[row['id']]
                if any(prior[k]!=row[k] for k in ['title','listed_year','landing_page']):raise ValueError('Conflicting thesis identity across pages')
                duplicates.append(row['id'])
            else:records[row['id']]=row
    return {'observed_at':state['heartbeat_at'],'results':list(records.values()),'pages':len(queue),'duplicate_native_ids':duplicates,'evidence':f'runs/{RUN}/observations.jsonl'}


def assess(source,case,snap):
    results=[];error=None
    try:
        if case['request']['url']!=ENDPOINT or snap['pages']<1:raise ValueError('Unreviewed/incomplete published catalog')
        results=search(snap['results'],case['request']['local_query'])
    except (ValueError,KeyError) as exc:error=str(exc)
    digest=hashlib.sha256(json.dumps(snap['results'],sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    return evaluate(source,case,{'source_id':source['id'],'observed_at':snap['observed_at'],'http':{'status':200,'url':ENDPOINT,'truncated':False,'evidence_kind':'complete captured HTML catalog metadata'},'response_sha256':digest,'error':error,'capture_evidence':snap['evidence'],'catalog_pages':snap['pages'],'catalog_entries':len(snap['results']),'execution_mode':'local-published-thesis-title-search','full_content_downloaded':False},{'results':results})


def probe(source,case_ids=None):
    snap=snapshot()
    for case in source['query']['cases']:
        if case_ids and case['id'] not in case_ids:continue
        row=assess(source,case,snap)
        with (REGISTRY/'examples/rit-scholarworks.jsonl').open('a') as out:out.write(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n')
        print(case['id'],row['verdict'],row['returned_count'],flush=True)

if __name__=='__main__':collect()
