"""Anonymous NSDC industry-report title form; public browser, no PDF downloads."""
import fcntl,hashlib,json,re,subprocess,sys,tempfile,urllib.robotparser
from pathlib import Path
from urllib.parse import urlsplit
from run_source_reviews import robots,now,pacing_seconds
from source_registry import REGISTRY,USER_AGENT,evaluate
ENDPOINT='https://www.nsdcindia.org/insights-reports/sector-wise-reports'
HOSTS=('www.nsdcindia.org','api1.nsdcindia.org')

def make_request(query):
    if not isinstance(query,str) or not query.strip() or len(query)>50:raise ValueError('Public title field allows1–50 characters')
    return {'method':'GET','url':ENDPOINT,'execution':'public-browser-title-form','title_query':query,'result_page':1}

def parse(records,query):
    rows=[];seen=set();tokens=query.casefold().split()
    if len(records)>10:raise ValueError('Unexpected first-page size')
    for r in records:
        parts=[x.strip() for x in r['text'].splitlines() if x.strip()]
        if len(parts)!=2 or not re.fullmatch(r'\d{2} [A-Za-z]{3} \d{4}',parts[1]):raise ValueError('Changed report title/date shape')
        title,updated=parts
        if not all(t in title.casefold() for t in tokens):raise ValueError('Irrelevant report title')
        urls=list(dict.fromkeys(link['url'] for link in r['links']))
        if len(urls)!=1:raise ValueError('Missing/ambiguous native report link')
        url=urls[0];u=urlsplit(url)
        if u.scheme!='https' or u.netloc!='api1.nsdcindia.org' or not re.fullmatch(r'/{1,2}system/files/\d{4}-\d{2}/[^/]+\.pdf',u.path) or u.query or u.fragment:raise ValueError('Unexpected native report URL')
        if url in seen:raise ValueError('Duplicate report identity')
        seen.add(url);rows.append({'id':url,'title':title,'displayed_updated_on':updated,'landing_page':ENDPOINT,
            'listed_document_url':url,'identity_scope':'Exact published report-file URL, including directory/version path; no inferred curriculum/edition identity',
            'reading_access_verified':False})
    return rows

def assess(source,case,cap):
    rows=[];error=cap.get('error')
    try:
        if error or cap['http']['status']!=200 or cap['http']['truncated']:raise ValueError(error or 'Failed public browser search')
        raw=json.dumps(cap['records'],ensure_ascii=False,separators=(',',':')).encode()
        if hashlib.sha256(raw).hexdigest()!=cap['rendered_result_sha256']:raise ValueError('Mismatched rendered metadata hash')
        rows=parse(cap['records'],case['query_text'])
    except (ValueError,KeyError,TypeError) as exc:error=str(exc)
    return evaluate(source,case,{**cap,'error':error,'response_sha256':cap.get('rendered_result_sha256',hashlib.sha256(b'').hexdigest()),
        'hash_scope':'Canonical JSON of visible report rows; not raw HTTP response','full_content_downloaded':False},{'results':rows})

def probe(source,case_ids=None):
    if source['id']!='nsdc-curricula' or source['query']['endpoint']!=ENDPOINT:raise ValueError('Unreviewed source')
    cases=[c for c in source['query']['cases'] if not case_ids or c['id'] in case_ids]
    for c in cases:
        if c['request']!=make_request(c['query_text']):raise ValueError('Unreviewed public form request')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);policies={};proofs={};delay=3;captures=[]
        for host in HOSTS:
            p,proof=robots('https://'+host+'/');proofs[host]=proof
            if p is False:break
            policies[host]=None if p is None else str(p);delay=max(delay,pacing_seconds(p))
        if len(policies)!=len(HOSTS):captures=[{'case_id':cases[0]['id'],'observed_at':now(),'http':{'status':None,'truncated':False},'error':'Required public browser host policy unavailable'}]
        else:
            with tempfile.TemporaryDirectory(prefix='nsdc-reports-') as temp:
                inp=Path(temp)/'input.json';dest=Path(temp)/'observations.jsonl';pp=Path(temp)/'policies.json'
                pp.write_text(json.dumps(policies));inp.write_text(json.dumps({'cases':cases,'output':str(dest),'policies':str(pp),'policy_checker':str(Path(__file__).resolve()),'pace_ms':delay*1000,'user_agent':USER_AGENT,'include_empty_control':not case_ids}))
                result=subprocess.run(['node',str(Path(__file__).with_suffix('.cjs')),str(inp)],timeout=150+len(cases)*35,check=False)
                if dest.exists():captures=[json.loads(l) for l in dest.read_text().splitlines()]
                if not captures:captures=[{'case_id':cases[0]['id'],'observed_at':now(),'http':{'status':None,'truncated':False},'error':'Browser produced no capture; exit'+str(result.returncode)}]
        byid={c['id']:c for c in cases}
        for cap in captures:
            cap['robots_evidence']=proofs
            with (REGISTRY/'examples/nsdc-curricula.browser.jsonl').open('a') as f:f.write(json.dumps(cap,ensure_ascii=False,sort_keys=True)+'\n')
            if cap['case_id']=='empty-control':continue
            row=assess(source,byid[cap['case_id']],cap)
            with (REGISTRY/'examples/nsdc-curricula.jsonl').open('a') as f:f.write(json.dumps(row,ensure_ascii=False,sort_keys=True)+'\n')
            print(cap['case_id'],row['verdict'],row['error'],flush=True)

if __name__=='__main__':
    if len(sys.argv)!=5 or sys.argv[1]!='--policy':raise SystemExit('Policy helper only')
    policies=json.loads(Path(sys.argv[2]).read_text());host=sys.argv[3];url=sys.argv[4]
    if host not in policies or urlsplit(url).hostname!=host:raise SystemExit(1)
    if policies[host] is None:raise SystemExit(0)
    p=urllib.robotparser.RobotFileParser();p.parse(policies[host].splitlines())
    raise SystemExit(0 if all(p.can_fetch(a,url) for a in [USER_AGENT,'ChatGPT-User','OAI-SearchBot']) else 1)
