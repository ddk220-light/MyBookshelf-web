import sys,json,concurrent.futures
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from probe import fetch,robots_decision
D=Path(__file__).resolve().parent
jobs=json.loads(sys.argv[1])
def run(j):
 robot=j.pop('robot',None)
 if robot:
  d=robots_decision(D/'evidence'/f'{robot}.json',j['url']); (D/'evidence'/f"{j['name']}-policy.json").write_text(json.dumps(d,indent=2)); print(j['name'],d,flush=True)
  if not d['allowed']:return
 r=fetch(dest=D,**j); print({k:r.get(k) for k in ['name','status','error','title','effective_url']},flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as e:list(e.map(run,jobs))
