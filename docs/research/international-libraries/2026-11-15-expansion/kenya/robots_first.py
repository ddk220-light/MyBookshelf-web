import urllib.request, urllib.error, json, concurrent.futures, pathlib, datetime
E=pathlib.Path(__file__).parent/'evidence'
hosts={'kenyatta':'https://maktaba.ku.ac.ke','moi':'https://library.mu.ac.ke','strathmore':'https://opac.library.strathmore.edu','mku':'https://opac.mku.ac.ke','knls':'https://librarycatalog.knls.ac.ke','uon':'http://library.uonbi.ac.ke','jkuat':'http://library.jkuat.ac.ke','pwani':'http://maktaba.pu.ac.ke','daystar':'https://library.daystar.ac.ke'}
def run(k):
 u=hosts[k]+'/robots.txt'; m={'url':u,'method':'GET','checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}; data=b''
 try:
  r=urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'MyBookshelfResearch/1.0 (public library discovery; OpenAI assistant)'}),timeout=25); m.update(status=r.status,effective_url=r.url); data=r.read(131072)
 except urllib.error.HTTPError as e: m.update(status=e.code,effective_url=e.url); data=e.read(131072)
 except Exception as e: m.update(status=None,error=str(e))
 (E/(k+'-robots.txt')).write_bytes(data); (E/(k+'-robots.json')).write_text(json.dumps(m,indent=2)); print(k,m,data.decode(errors='replace')[:4500],flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:list(ex.map(run,hosts))
