import urllib.request, urllib.parse, urllib.robotparser, urllib.error, json, datetime, pathlib, concurrent.futures, time, re
from bs4 import BeautifulSoup
ROOT=pathlib.Path(__file__).parent
AGENT='MyBookshelfResearch/1.0'
def fetch(url, timeout=25):
 started=time.time(); checked=datetime.datetime.now(datetime.timezone.utc).isoformat()
 try:
  r=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':AGENT}),timeout=timeout)
  raw=r.read(2000000); return {'url':url,'final_url':r.url,'status':r.status,'checked_at_utc':checked,'elapsed_seconds':round(time.time()-started,2),'body':raw.decode('utf-8','replace')}
 except urllib.error.HTTPError as e: return {'url':url,'status':e.code,'checked_at_utc':checked,'error':str(e),'body':e.read(100000).decode('utf-8','replace')}
 except Exception as e: return {'url':url,'status':None,'checked_at_utc':checked,'error':str(e),'body':''}
def probe(c):
 slug, name, base=c[:3]
 query=c[3] if len(c)>3 else "Pakistan"
 path=ROOT/'evidence'/slug;path.mkdir(exist_ok=True)
 out={'id':slug,'name':name,'base_url':base,'lms':'Koha candidate','query':query,'query_type':'title' if len(c)>3 else 'keyword','search_url':base.rstrip('/')+'/cgi-bin/koha/opac-search.pl?'+urllib.parse.urlencode({'q':query,**({'idx':'ti'} if len(c)>3 else {})})}
 rob=fetch(base.rstrip('/')+'/robots.txt'); (path/'robots.txt').write_text(rob.pop('body'));out['robots']=rob
 if rob['status']==429 or (rob['status'] is not None and rob['status']>=500):
  out['status']='policy_unavailable';out['robots']['query_allowed']=False
  (path/'result.json').write_text(json.dumps(out,indent=2));return out
 rt=(path/'robots.txt').read_text()
 if rob['status']==200 and rt.strip() and '<html' not in rt.lower():
  groups=[];g=None;had=False
  for line in rt.splitlines():
   line=line.split('#')[0].strip()
   if ':' not in line:continue
   k,v=line.split(':',1);k=k.strip().lower();v=v.strip()
   if k=='user-agent':
    if g is None or had:g={'agents':[],'rules':[],'delay':0};groups.append(g);had=False
    g['agents'].append(v.lower().split('/')[0])
   elif g is not None:
    had=True
    if k in ['allow','disallow'] and v:g['rules'].append((v,k=='allow'))
    if k=='crawl-delay':
     try:g['delay']=float(v)
     except:pass
  selected=[g for g in groups if 'mybookshelfresearch' in g['agents']] or [g for g in groups if '*' in g['agents']]
  rules=[x for g in selected for x in g['rules']];target=urllib.parse.urlsplit(out['search_url']);target=target.path+('?' + target.query if target.query else '')
  matches=[x for x in rules if re.search('^'+re.escape(x[0]).replace(r'\*','.*').replace(r'\$','$'),target)]
  matches.sort(key=lambda x:(len(x[0].replace('*','').replace('$','')),x[1]),reverse=True)
  out['robots']['query_allowed']=not matches or matches[0][1]
  if not out['robots']['query_allowed']:
   out['status']='policy_blocked';(path/'result.json').write_text(json.dumps(out,indent=2));return out
  d=max([g['delay'] for g in selected]+[0])
  if d:time.sleep(min(d,60))
 r=fetch(out['search_url']);body=r.pop('body');(path/'search.html').write_text(body);out['response']=r
 s=BeautifulSoup(body,'html.parser');out['page_title']=s.title.get_text(' ',strip=True) if s.title else ''
 links=[]
 for a in s.select('a[href*="opac-detail.pl"]'):
  t=a.get_text(' ',strip=True)
  if t and t not in ['Place hold','Log in to add tags.','Log in to add tags','Place hold'] and len(t)>3:
   u=urllib.parse.urljoin(r.get('final_url',base),a['href'])
   if u not in [x['url'] for x in links]:links.append({'title':t,'url':u})
 out['returned_books']=links[:3];out['result_count_text']=[x.group(0) for x in re.finditer(r'\d[\d,]*\s+results?|No results found|Your search returned[^.]{0,100}',s.get_text(' ',strip=True),re.I)][:4]
 out['excerpt']=s.get_text(' ',strip=True)[:1800]
 out['status']='query_verified' if r.get('status')==200 and links else 'unverified'
 if links:
  d=fetch(links[0]['url']);db=d.pop('body');(path/'record.html').write_text(db);out['record_response']=d
  ds=BeautifulSoup(db,'html.parser');ht=ds.select_one('#holdingst');out['holdings_excerpt']=ht.get_text(' ',strip=True)[:1600] if ht else None
  out['book_record_title']=ds.h1.get_text(' ',strip=True) if ds.h1 else None
  out['record_isbn_text']=[x.get_text(' ',strip=True) for x in ds.select('.isbn')][:2]
  out['generator']=[x.get('content') for x in ds.select('meta[name="generator"]')]
 (path/'result.json').write_text(json.dumps(out,indent=2))
 return out
if __name__=='__main__':
 candidates=json.loads((ROOT/'candidates.json').read_text())
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  for out in pool.map(probe,candidates):
   print(json.dumps({k:out.get(k) for k in ['id','status','response','returned_books','result_count_text','holdings_excerpt']}),flush=True)
