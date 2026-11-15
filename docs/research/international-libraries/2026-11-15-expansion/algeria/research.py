import sys,json,concurrent.futures
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent.parent))
from probe import fetch,robots_decision
D=Path(__file__).parent
jobs=json.loads(Path(sys.argv[1]).read_text())
def run(j):
 r=j.pop('robots',None)
 if r:
  decision=robots_decision(D/'evidence'/f'{r}-robots.json',j['url'])
  if not decision['allowed']: return {'name':j['name'],'blocked':decision}
 result=fetch(dest=D,**j)
 return {k:result.get(k) for k in ['name','status','effective_url','title','forms','error','text']}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as e:
 for r in e.map(run,jobs):print(json.dumps(r,ensure_ascii=False),flush=True)
