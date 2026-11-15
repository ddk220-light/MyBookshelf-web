import urllib.request,urllib.error,urllib.parse,json,time,datetime,pathlib,sys,concurrent.futures,re,subprocess
sys.path.insert(0,'/workspace/mybookshelf-cloud/python-libs')
from bs4 import BeautifulSoup
P=pathlib.Path(__file__).parent
UA='MyBookshelf/1.0 (public catalog compatibility research)'
def fetch(url,name):
 t=time.monotonic();d={'url':url,'checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'GET'};body=b''
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA}),timeout=12) as r:
   body=r.read(1500000);d.update(status=r.status,final_url=r.geturl(),headers={k:r.headers.get(k) for k in ['Content-Type','Location','Server'] if r.headers.get(k)})
 except urllib.error.HTTPError as e:
  d.update(status=e.code,error=str(e),headers={k:e.headers.get(k) for k in ['Content-Type','Location','Server'] if e.headers.get(k)});body=e.read(1500000)
 except Exception as e:d['error']=str(e)
 d.update(elapsed_seconds=round(time.monotonic()-t,2),response_bytes=len(body))
 if body:(P/(name+'.html')).write_bytes(body);d['evidence']=name+'.html'
 (P/(name+'.json')).write_text(json.dumps(d,indent=2)+'\n')
 return d,body.decode('utf8','replace')
if __name__=='__main__':
 tasks=[('https://library.ui.edu.ng/library-guide','current-guide'),('http://ils.library.ui.edu.ng/robots.txt','ils-robots'),('https://library.ui.edu.ng/e-resources','eresources')]
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
  for d,b in pool.map(lambda x:fetch(*x),tasks):
   s=BeautifulSoup(b,'html.parser');print(d);print([{'text':a.get_text(' ',strip=True),'href':a['href']} for a in s.select('a[href]') if re.search('opac|ils|41.184|catalog',a.get_text(' ',strip=True)+a['href'],re.I)])
