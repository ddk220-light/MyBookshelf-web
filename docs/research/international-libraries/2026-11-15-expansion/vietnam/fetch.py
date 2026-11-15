import urllib.request,urllib.error,datetime,pathlib,json,sys,concurrent.futures
BASE=pathlib.Path(__file__).parent/'evidence'
def fetch(label,url):
 m={'request_url':url,'method':'GET','checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'MyBookshelfResearch/1.0 (public library catalog feasibility study; no harvesting)'})
  try:r=urllib.request.urlopen(req,timeout=35)
  except urllib.error.HTTPError as e:r=e
  raw=r.read(450001);data=raw[:450000];m.update(http_status=r.status,effective_url=r.url,content_type=r.headers.get('Content-Type'),bytes_received=len(raw),truncated=len(raw)>len(data));
  (BASE/(label+'.html')).write_bytes(data)
  if len(data)<6000: print(label, m, data.decode('utf8',errors='replace')[:2500])
  else: print(label,m)
 except Exception as e: m['error']=str(e);print(label,m)
 (BASE/(label+'.json')).write_text(json.dumps(m,ensure_ascii=False,indent=2))
 return m
if __name__=='__main__':
 pairs=list(zip(sys.argv[1::2],sys.argv[2::2]))
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:list(ex.map(lambda p:fetch(*p),pairs))
