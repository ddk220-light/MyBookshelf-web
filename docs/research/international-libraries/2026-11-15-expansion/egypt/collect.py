import urllib.request,urllib.error,urllib.parse,json,pathlib,datetime,concurrent.futures,sys
ROOT=pathlib.Path(__file__).parent
def fetch(name,url):
 p=ROOT/'evidence'/name;p.parent.mkdir(exist_ok=True,parents=True)
 m={'url':url,'method':'GET','payload':None,'checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 try:
  r=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'MyBookshelfResearch/1.0 (public library catalog feasibility research)'}),timeout=25)
  b=r.read(2000000);m.update(status=r.status,effective_url=r.url,content_type=r.headers.get('Content-Type'))
 except urllib.error.HTTPError as e:
  b=e.read(100000);m.update(status=e.code,error=str(e),effective_url=e.url)
 except Exception as e:b=b'';m.update(status=None,error=str(e))
 p.with_suffix('.html').write_bytes(b);p.with_suffix('.json').write_text(json.dumps(m,indent=2,ensure_ascii=False))
 return {'name':name,**m,'bytes':len(b)}
if __name__=='__main__':
 jobs=json.loads(sys.argv[1])
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for r in pool.map(lambda x:fetch(*x),jobs):print(json.dumps(r,ensure_ascii=False),flush=True)
