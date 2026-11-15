import urllib.request,urllib.parse,urllib.error,json,time,re,datetime,pathlib,concurrent.futures
from bs4 import BeautifulSoup
BASE=pathlib.Path(__file__).parent
UA='MyBookshelfResearch/1.0 (+https://mybookshelf.cloud)'
def fetch(label,url,method='GET',data=None):
 t=time.time(); meta={'label':label,'url':url,'method':method,'checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 try:
  req=urllib.request.Request(url,headers={'User-Agent':UA},data=urllib.parse.urlencode(data).encode() if data else None,method=method)
  with urllib.request.urlopen(req,timeout=18) as r:
   body=r.read(1800000).decode('utf-8','replace');meta.update(status=r.status,final_url=r.url,content_type=r.headers.get('Content-Type'))
 except urllib.error.HTTPError as e:
  meta.update(status=e.code,error=str(e));body=e.read(100000).decode('utf-8','replace')
 except Exception as e: meta.update(status=None,error=str(e));body=''
 meta['elapsed_seconds']=round(time.time()-t,2)
 if data:meta['payload']=data
 p=BASE/'evidence'/f'{label}.html';p.write_text(body);meta['evidence']=str(p.relative_to(BASE));(p.with_suffix('.json')).write_text(json.dumps(meta,indent=2))
 return meta,body

def rules(txt,agent='mybookshelf'):
 gs=[];g=None;had=False
 for ln in txt.splitlines():
  m=re.match(r'^([^:]+):\s*(.*)$',ln.split('#')[0].strip())
  if not m:continue
  k,v=m[1].lower().strip(),m[2].strip()
  if k=='user-agent':
   if g is None or had:g={'agents':[],'rules':[],'delay':0};gs.append(g);had=False
   g['agents'].append(v.split('/')[0].lower())
  elif g is not None:
   had=True
   if k in ['allow','disallow'] and v:g['rules'].append((k=='allow',v))
   if k=='crawl-delay':
    try:g['delay']=float(v)
    except ValueError:pass
 selected=[g for g in gs if agent.lower() in g['agents']] or [g for g in gs if '*' in g['agents']]
 return [r for g in selected for r in g['rules']],max([g['delay'] for g in selected]+[0])
def allowed(txt,url,agent='mybookshelf'):
 rs,delay=rules(txt,agent);u=urllib.parse.urlsplit(url);path=u.path+('?' +u.query if u.query else '')
 matches=[]
 for a,p in rs:
  expr=re.escape(p[:-1] if p.endswith('$') else p).replace(r'\*','.*')+('$' if p.endswith('$') else '')
  if re.match(expr,path):matches.append((len(p.replace('*','').replace('$','')),a,p))
 matches.sort(reverse=True)
 return (matches[0][1] if matches else True),delay,matches[:3]
def inspect(label,url):
 m,b=fetch(label,url);s=BeautifulSoup(b,'html.parser');m['title']=s.title.get_text(' ',strip=True) if s.title else ''
 m['links']=[{'text':a.get_text(' ',strip=True),'url':urllib.parse.urljoin(url,a.get('href',''))} for a in s.find_all('a',href=True) if any(x in (a.get_text(' ',strip=True)+' '+a['href']).lower() for x in ['opac','catalog','library','koha'])][:70]
 m['forms']=[{'action':f.get('action'),'method':f.get('method'),'inputs':[(x.get('name'),x.get('value'),x.get('type')) for x in f.find_all(['input','select'])]} for f in s.find_all('form')]
 m['text_excerpt']=s.get_text(' ',strip=True)[:4000]
 (BASE/'evidence'/f'{label}-inspect.json').write_text(json.dumps(m,indent=2))
 return m
if __name__=='__main__':
 import sys
 inputs=json.loads(pathlib.Path(sys.argv[1]).read_text())
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as p:
  for m in p.map(lambda r:inspect(*r),inputs):print(json.dumps(m),flush=True)
