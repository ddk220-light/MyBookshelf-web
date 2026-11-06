"""Search published Electrician ebook metadata; never fetch ebook bodies."""
import fcntl, hashlib, json, time
from pathlib import Path
from urllib.parse import quote, urljoin, urlsplit
from learning_catalogs import CatalogTree
from run_source_reviews import request, robots, now, pacing_seconds
from source_registry import REGISTRY, USER_AGENT, evaluate
from metadata_links import local_search
ENDPOINT='https://www.bharatskills.gov.in/Home/StudyMaterial?var=WSdYV6aWadK8jUuNKxoBWg==&Default=YES'

def parse(body):
    root=CatalogTree(body).root
    if not root.nodes(lambda n:n.tag=='h3' and n.text()=='Electrician Ebooks'):raise ValueError('Wrong trade/catalog')
    rows={}
    for a in root.nodes(lambda n:n.tag=='a' and n.attrs.get('href') and n.text()):
        raw=a.attrs['href']
        # WHATWG HTTPS URL parsing treats backslash as slash. Preserve the exact
        # printed href too; do not invent destinations or download the PDFs.
        url=quote(urljoin(ENDPOINT,raw.replace(chr(92),'/')),safe=':/%?=&()_-')
        u=urlsplit(url)
        if u.scheme!='https' or u.netloc!='www.bharatskills.gov.in' or not u.path.startswith('/pdf/E_Books/CTS/118/') or not u.path.lower().endswith('.pdf') or u.query or u.fragment:continue
        title='Electrician — '+a.text()
        if url in rows and rows[url]['title']!=title:raise ValueError('Conflicting resource label')
        rows[url]={'id':url,'title':title,'native_href':raw,'landing_page':ENDPOINT,'listed_resource_url':url,'trade':'Electrician','identity_scope':'Published resource URL preserves language/year/syllabus variant','reading_access_verified':False}
    if not rows:raise ValueError('No published Electrician ebook metadata')
    return list(rows.values())

def assess(source,case,cap,body):
    rows=[];error=None
    try:
        h=cap['http']
        if h['status']!=200 or h['truncated'] or h['sampled_bytes_sha256']!=hashlib.sha256(body).hexdigest():raise ValueError('Incomplete or mismatched catalog')
        rows=local_search(parse(body),case['request']['local_query'])
    except (KeyError,TypeError,ValueError) as e:error=str(e)
    return evaluate(source,case,{**cap,'error':error,'response_sha256':hashlib.sha256(body).hexdigest(),'full_content_downloaded':False,'query_execution':'local metadata query over one captured public HTML catalog'},{'results':rows})

def probe(source,case_ids=None):
    if source['query']['endpoint']!=ENDPOINT or source.get('research_selection',{}).get('included') is False:raise ValueError('Unreviewed source')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);policy,proof=robots(ENDPOINT);body=b'';cap={'observed_at':now(),'robots_evidence':proof,'http':{'status':None,'truncated':False}}
        if policy is not False and (policy is None or policy.can_fetch(USER_AGENT,ENDPOINT)):
            time.sleep(pacing_seconds(policy));cap['http'],body=request(ENDPOINT,limit=1024*1024)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:continue
            if case['request']['method']!='GET' or case['request']['url']!=ENDPOINT:raise ValueError('Unreviewed request')
            obs=assess(source,case,cap,body)
            with (REGISTRY/'examples/bharat-skills.jsonl').open('a') as f:f.write(json.dumps(obs,ensure_ascii=False,sort_keys=True)+'\n')
            print(case['id'],obs['verdict'],obs['error'],flush=True)
