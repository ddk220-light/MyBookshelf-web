"""Repeat the published CaltechTHESIS browser search; metadata only."""
import fcntl, hashlib, json, subprocess, tempfile
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from recovery_queries import parse_caltech
from run_source_reviews import robots, now, pacing_seconds
from source_registry import REGISTRY, USER_AGENT, evaluate
ENDPOINT='https://thesis.caltech.edu/search.html'

def checked_case(case):
    req=case['request'];u=urlsplit(req['url'])
    if req.get('method')!='GET' or req.get('execution')!='public-browser' or u._replace(query='').geturl()!=ENDPOINT or parse_qs(u.query)!={'q':[case['query_text']]}:
        raise ValueError('Unreviewed public browser request')
    return req['url']

def assess(source,case,cap):
    rows=[];error=cap.get('error')
    try:
        if error or cap['http']['status']!=200 or cap['http']['truncated']:raise ValueError(error or 'Unsuccessful browser response')
        raw=json.dumps(cap['records'],ensure_ascii=False,separators=(',',':')).encode()
        if hashlib.sha256(raw).hexdigest()!=cap['rendered_result_sha256']:raise ValueError('Mismatched rendered metadata hash')
        rows=parse_caltech(cap['records'],case['query_text'])
    except (ValueError,KeyError,TypeError) as e:error=str(e)
    return evaluate(source,case,{**cap,'error':error,'response_sha256':cap.get('rendered_result_sha256',hashlib.sha256(b'').hexdigest()),'hash_scope':'Canonical JSON of rendered metadata links, not raw HTTP body','full_content_downloaded':False},{'results':rows})

def probe(source,case_ids=None):
    if source['query']['endpoint']!=ENDPOINT or source.get('research_selection',{}).get('included') is False:raise ValueError('Unreviewed or excluded source')
    cases=[c for c in source['query']['cases'] if not case_ids or c['id'] in case_ids]
    urls=[checked_case(c) for c in cases]
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);policy,proof=robots(ENDPOINT);captures=[]
        if policy is not False and (policy is None or all(policy.can_fetch(USER_AGENT,u) for u in urls)):
            with tempfile.TemporaryDirectory(prefix='caltech-search-') as temp:
                dest=Path(temp)/'observations.jsonl';inp=Path(temp)/'input.json'
                inp.write_text(json.dumps({'cases':cases,'output':str(dest),'pace_ms':pacing_seconds(policy)*1000}))
                result=subprocess.run(['node',str(Path(__file__).with_suffix('.cjs')),str(inp)],timeout=max(90,len(cases)*65),check=False)
                if dest.exists():captures=[json.loads(l) for l in dest.read_text().splitlines()]
                if not captures:captures=[{'case_id':cases[0]['id'],'observed_at':now(),'http':{'status':None,'truncated':False},'error':'Browser process produced no capture; exit '+str(result.returncode)}]
        elif cases:captures=[{'case_id':cases[0]['id'],'observed_at':now(),'http':{'status':None,'truncated':False},'error':'Policy unavailable or disallowing'}]
        byid={c['id']:c for c in cases}
        for cap in captures:
            cap['robots_evidence']=proof
            with (REGISTRY/'examples/caltech-thesis.browser.jsonl').open('a') as f:f.write(json.dumps(cap,ensure_ascii=False,sort_keys=True)+'\n')
            observation=assess(source,byid[cap['case_id']],cap)
            with (REGISTRY/'examples/caltech-thesis.jsonl').open('a') as f:f.write(json.dumps(observation,ensure_ascii=False,sort_keys=True)+'\n')
            print(cap['case_id'],observation['verdict'],observation['error'],flush=True)
