"""Published Nalibali and Storyberries GET search forms; snippets only."""
import fcntl,hashlib,json,re,time
from pathlib import Path
from urllib.parse import urlsplit,parse_qs,urlencode
from learning_catalogs import CatalogTree
from run_source_reviews import robots,request,pacing_seconds,now
from source_registry import REGISTRY,USER_AGENT,evaluate
ENDPOINTS={'nalibali-public':'https://nalibali.org/','storyberries-public':'https://www.storyberries.com/'}

def query_url(adapter,text):
 if adapter not in ENDPOINTS or not isinstance(text,str) or not text.strip():raise ValueError('Reviewed source and nonempty keyword required')
 p={'s':text}
 if adapter=='nalibali-public':p['id']='35234'
 return ENDPOINTS[adapter]+'?'+urlencode(p)

def parse(body,url,adapter):
 u=urlsplit(url);q=parse_qs(u.query);base=urlsplit(ENDPOINTS[adapter]);expected={'s','id'} if adapter=='nalibali-public' else {'s'}
 if u.scheme!='https' or u.netloc!=base.netloc or u.path!='/' or set(q)!=expected or len(q.get('s',[]))!=1 or adapter=='nalibali-public' and q.get('id')!=['35234']:raise ValueError('Unreviewed published search request')
 root=CatalogTree(body).root;headings=root.nodes(lambda n:n.tag=='h1' and n.text().casefold()=='search results for: '+q['s'][0].casefold())
 empty_heading=root.nodes(lambda n:n.tag=='h1' and n.text()=='Nothing Found')
 echoed=root.nodes(lambda n:n.tag=='input' and n.attrs.get('name')=='s' and n.attrs.get('value')==q['s'][0])
 if len(headings)!=1 and not (adapter=='storyberries-public' and len(empty_heading)==1 and echoed):raise ValueError('Missing result heading/query echo')
 if adapter=='storyberries-public':
  mains=root.nodes(lambda n:n.tag=='main' and n.attrs.get('id')=='main')
  if len(mains)!=1:raise ValueError('Missing result container')
  root=mains[0]
 cards=root.nodes(lambda n:n.tag=='article' and (n.has_class('elementor-post') if adapter=='nalibali-public' else n.has_class('type-post')));rows=[]
 for card in cards:
  if adapter=='nalibali-public' and not card.has_class('type-stories'):continue
  matches=re.findall(r'(?:^|\s)post-(\d+)(?:\s|$)',card.attrs.get('class',''))
  if len(matches)!=1:raise ValueError('Missing/ambiguous native post ID')
  cls='elementor-post__title' if adapter=='nalibali-public' else 'entry-title';titles=card.nodes(lambda n:n.tag in ('h2','h3') and n.has_class(cls))
  if len(titles)!=1:raise ValueError('Missing native story title')
  links=titles[0].nodes(lambda n:n.tag=='a' and n.attrs.get('href'))
  if len(links)!=1:raise ValueError('Missing title landing link')
  link=urlsplit(links[0].attrs['href'])
  if link.scheme!='https' or link.netloc!=base.netloc or link.query or link.fragment or not link.path.endswith('/') or adapter=='nalibali-public' and not re.fullmatch(r'/stories/[^/]+/',link.path):raise ValueError('Unexpected native story URL')
  rows.append({'id':matches[0],'title':links[0].text(),'landing_page':links[0].attrs['href'],'identity_scope':'Public native post ID and canonical title link; no work/translation collapse','reading_access_verified':False})
 if len({r['id'] for r in rows})!=len(rows):raise ValueError('Duplicate native IDs')
 if not cards and not re.search(r'Nothing Found|nothing matched|No results|can.t find what you.re looking for',root.text(),re.I):raise ValueError('Missing cards without explicit empty state')
 return rows

def relevant(title,term):
 return any(re.fullmatch(re.escape(term.casefold())+r'(?:s|es)?',word) for word in re.findall(r'\w+',title.casefold()))

def assess(source,case,cap,body):
 rows=[];error=None
 try:
  if cap['http'].get('status')!=200 or cap['http'].get('truncated') or cap['http']['url']!=case['request']['url'] or cap['http']['sampled_bytes_sha256']!=hashlib.sha256(body).hexdigest():raise ValueError('Incomplete/mismatched response')
  rows=parse(body,case['request']['url'],source['query']['adapter']);term=parse_qs(urlsplit(case['request']['url']).query)['s'][0].casefold()
  if any(not relevant(r['title'],term) for r in rows if r['id'] in case['expected_ids']):raise ValueError('Selected item lacks title relevance')
 except (ValueError,KeyError,TypeError,UnicodeError) as exc:error=str(exc)
 return evaluate(source,case,{**cap,'error':error,'response_sha256':hashlib.sha256(body).hexdigest(),'full_content_downloaded':False},{'results':rows})

def probe(source,case_ids=None):
 adapter=source['query']['adapter'];endpoint=ENDPOINTS[adapter]
 if source['query']['endpoint']!=endpoint:raise ValueError('Unreviewed endpoint')
 with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);p,proof=robots(endpoint)
  for c in source['query']['cases']:
   if case_ids and c['id'] not in case_ids:continue
   u=c['request']['url'];cap={'source_id':source['id'],'observed_at':now(),'robots_evidence':proof,'http':{'url':u,'status':None,'truncated':False}};b=b''
   if p is not False and (p is None or p.can_fetch(USER_AGENT,u)):
    time.sleep(pacing_seconds(p));cap['http'],b=request(u,limit=2*1024*1024)
   obs=assess(source,c,cap,b)
   with (REGISTRY/'examples'/f'{source["id"]}.jsonl').open('a') as f:f.write(json.dumps(obs,ensure_ascii=False,sort_keys=True)+'\n')
   if cap['http']['status'] in (None,401,403,429,500,502,503,504):break
