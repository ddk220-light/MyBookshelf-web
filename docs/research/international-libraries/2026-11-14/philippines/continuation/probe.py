import sys,urllib.request,urllib.error,urllib.parse,json,time,pathlib,concurrent.futures,datetime,re
sys.path.insert(0,'/workspace/mybookshelf-cloud/python-libs')
from bs4 import BeautifulSoup
ROOT=pathlib.Path(__file__).parent

def fetch(task):
 name,url=task[:2]
 payload=task[2] if len(task)>2 else None
 out={'name':name,'url':url,'checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 if payload:out['post_payload']=payload
 t=time.monotonic()
 try:
  r=urllib.request.urlopen(urllib.request.Request(url,data=urllib.parse.urlencode(payload,doseq=True).encode() if payload else None,headers={'User-Agent':'MyBookshelfResearch/1.0 (public catalog compatibility check)'}),timeout=25)
  raw=r.read(1500000); out.update(status=r.status,final_url=r.url,content_type=r.headers.get('Content-Type'),bytes=len(raw))
 except urllib.error.HTTPError as e:
  raw=e.read(200000);out.update(status=e.code,error=str(e),final_url=e.url)
 except Exception as e:
  raw=b'';out.update(status=None,error=str(e))
 out['duration_s']=round(time.monotonic()-t,2)
 if raw:
  fn=ROOT/'evidence'/(name+'.html');fn.write_bytes(raw);out['evidence_file']=str(fn.relative_to(ROOT))
  soup=BeautifulSoup(raw,'html.parser');out['title']=soup.title.get_text(' ',strip=True) if soup.title else None
  out['text']=soup.get_text(' ',strip=True)[:28000]
  out['links']=[{'text':a.get_text(' ',strip=True),'url':urllib.parse.urljoin(out.get('final_url',url),a['href'])} for a in soup.find_all('a',href=True)]
  out['forms']=[str(f)[:8000] for f in soup.find_all('form')]
 (ROOT/'evidence'/(name+'.json')).write_text(json.dumps(out,indent=2,ensure_ascii=False))
 return {k:v for k,v in out.items() if k not in ['text','links','forms']}|{'excerpt':out.get('text','')[:250]}
if __name__=='__main__':
 tasks=json.load(open(sys.argv[1]))
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
  for out in pool.map(fetch,tasks):print(json.dumps(out,ensure_ascii=False),flush=True)
