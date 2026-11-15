import urllib.request, urllib.error, urllib.parse, urllib.robotparser, json, pathlib, sys, datetime, concurrent.futures, re
import http.cookiejar
sys.path.insert(0,'/workspace/mybookshelf-cloud/python-libs')
from bs4 import BeautifulSoup
BASE=pathlib.Path(__file__).parent
UA='MyBookshelfResearch/1.0 (public catalog feasibility check)'
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
def fetch(key,url,post=None):
 out={'key':key,'url':url,'checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 try:
  if post: out['post_payload']=post
  req=urllib.request.Request(url,data=urllib.parse.urlencode(post).encode() if post else None,headers={'User-Agent':UA})
  with opener.open(req,timeout=25) as r:
   data=r.read(1000000);out.update(status=r.status,final_url=r.url,bytes=len(data))
  p=BASE/'continuation-evidence'/f'{key}.html';p.write_bytes(data);out['evidence']=str(p.relative_to(BASE))
  s=BeautifulSoup(data,'html.parser')
  out['title']=s.title.get_text(' ',strip=True) if s.title else ''
  out['text']=s.get_text(' ',strip=True)[:13000]
  out['forms']=[{'action':f.get('action'),'method':f.get('method'),'fields':[{'tag':x.name,'name':x.get('name'),'value':x.get('value'),'type':x.get('type')} for x in f.select('input,select,button')]} for f in s.find_all('form')][:8]
  out['links']=[{'text':a.get_text(' ',strip=True)[:180],'url':urllib.parse.urljoin(url,a.get('href',''))} for a in s.select('a[href]') if a.get_text(' ',strip=True)][:100]
 except Exception as e: out['error']=str(e)
 (BASE/'continuation-evidence'/f'{key}.json').write_text(json.dumps(out,indent=2,ensure_ascii=False))
 return out
if __name__=='__main__':
 tasks=json.loads(sys.argv[1]);
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
  for r in ex.map(lambda t:fetch(*t),tasks): print(json.dumps(r,ensure_ascii=False))
