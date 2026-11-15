import sys,json,urllib.request,concurrent.futures
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent.parent))
from probe import fetch,robots_decision,BeautifulSoup
D=Path(__file__).parent
# Anonymous cookies remain in memory only. Form and search are ordinary public requests.
def run(j):
 n=j['name'];o=urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
 assert robots_decision(D/'evidence'/f'{j.get("robots",n)}-robots.json',j['home'])['allowed']
 h=fetch(n+'-freshform',j['home'],D,opener=o)
 if h['status']!=200:return h
 form=next(f for f in h['forms'] if any(x['name']=='user_query' for x in f['fields']))
 payload={x['name']:x['value'] or '' for x in form['fields'] if x['type']=='hidden'}
 payload.update(user_query=j['query'],look_TITLE='1',typdoc='a')
 q=fetch(n+'-query',form['action'],D,method='POST',payload=payload,opener=o)
 # PMB older template returns field-count intermediate; continue only exposed results form.
 if q['status']==200 and 'résultat(s)' in q.get('text',''):
  f=next((f for f in q['forms'] if 'lvl=more_results' in f['action'] and any(x['name']=='mode' for x in f['fields'])),None)
  if f:
   q=fetch(n+'-results',f['action'],D,method='POST',payload={x['name']:x['value'] or '' for x in f['fields'] if x['type']=='hidden'},opener=o)
 return {k:q.get(k) for k in ['name','status','title','text','error']}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as e:
 for x in e.map(run,json.loads(Path(sys.argv[1]).read_text())):print(json.dumps(x,ensure_ascii=False),flush=True)
