"""Book Dash's published GET search form; no private WordPress API or files."""
import fcntl,hashlib,json,re,time
from pathlib import Path
from urllib.parse import urlsplit,parse_qs,urlencode
from learning_catalogs import CatalogTree
from run_source_reviews import robots,request,pacing_seconds,now
from source_registry import REGISTRY,USER_AGENT,evaluate
ENDPOINT='https://bookdash.org/books'

def query_url(text):
 if not isinstance(text,str) or not text.strip():raise ValueError('Nonempty book query required')
 return ENDPOINT+'?'+urlencode({'s':text})

def parse(body,url):
 u=urlsplit(url);params=parse_qs(u.query)
 if u.scheme!='https' or u.netloc!='bookdash.org' or u.path!='/books' or set(params)!={'s'} or len(params['s'])!=1:raise ValueError('Unreviewed public book search request')
 root=CatalogTree(body).root;forms=root.nodes(lambda n:n.tag=='form' and n.attrs.get('method')=='get' and n.attrs.get('action')=='/books')
 if len(forms)!=1:raise ValueError('Missing published search form')
 inputs=forms[0].nodes(lambda n:n.tag=='input' and n.attrs.get('name')=='s')
 if len(inputs)!=1 or inputs[0].attrs.get('value')!=params['s'][0]:raise ValueError('Search query echo mismatch')
 rows=[]
 for a in root.nodes(lambda n:n.tag=='a' and n.attrs.get('title') and '/books/' in n.attrs.get('href','')):
  p=urlsplit(a.attrs['href'])
  if p.scheme!='https' or p.netloc!='bookdash.org' or not re.fullmatch(r'/books/[^/]+/',p.path) or p.query or p.fragment:raise ValueError('Invalid native book URL')
  rows.append({'id':a.attrs['href'],'title':a.attrs['title'],'landing_page':a.attrs['href'],'visible_card_label':a.text(),'identity_scope':'Native book/variant landing page; listed language-count is not a verified translated edition inventory','reading_access_verified':False})
 if len({r['id'] for r in rows})!=len(rows):raise ValueError('Duplicate book cards')
 if not rows and not re.search(r'No books|No results|nothing found|couldn.t find|no matches|We haven.t found any books that match your search',root.text(),re.I):raise ValueError('Missing results without explicit empty-state text')
 return rows

def assess(source,case,cap,body):
 rows=[];error=None
 try:
  if cap['http'].get('status')!=200 or cap['http'].get('truncated') or cap['http']['url']!=case['request']['url'] or cap['http']['sampled_bytes_sha256']!=hashlib.sha256(body).hexdigest():raise ValueError('Incomplete/mismatched search response')
  rows=parse(body,case['request']['url']);tokens=re.findall(r'\w+',parse_qs(urlsplit(case['request']['url']).query)['s'][0].casefold())
  if any(not all(t in r['title'].casefold() for t in tokens) for r in rows if r['id'] in case['expected_ids']):raise ValueError('Selected result lacks title relevance')
 except (ValueError,KeyError,TypeError,UnicodeError) as exc:error=str(exc)
 return evaluate(source,case,{**cap,'error':error,'response_sha256':hashlib.sha256(body).hexdigest(),'full_content_downloaded':False},{'results':rows})

def probe(source,case_ids=None):
 if source['query']['endpoint']!=ENDPOINT:raise ValueError('Unreviewed endpoint')
 with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);policy,proof=robots(ENDPOINT)
  for case in source['query']['cases']:
   if case_ids and case['id'] not in case_ids:continue
   url=case['request']['url'];cap={'source_id':source['id'],'observed_at':now(),'robots_evidence':proof,'http':{'url':url,'status':None,'truncated':False}}
   body=b''
   if policy is not False and (policy is None or policy.can_fetch(USER_AGENT,url)):
    time.sleep(pacing_seconds(policy));h,body=request(url,limit=2*1024*1024);cap['http']=h
   obs=assess(source,case,cap,body)
   with (REGISTRY/'examples/book-dash.jsonl').open('a') as out:out.write(json.dumps(obs,ensure_ascii=False,sort_keys=True)+'\n')
   if cap['http']['status'] in (None,401,403,429,500,502,503,504):break
