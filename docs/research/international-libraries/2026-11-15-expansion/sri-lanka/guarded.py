import sys,json,concurrent.futures
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from probe import fetch,robots_decision
D=Path(__file__).resolve().parent
jobs=json.loads(sys.argv[1])
def run(j):
 r=robots_decision(D/'evidence'/(j.pop('robots')+'.json'),j['url']);print(j['name'],r,flush=True)
 if not r['allowed']:return
 m=fetch(dest=D,**j);print(json.dumps({k:m.get(k) for k in ['name','status','error','effective_url','title','forms','links','text']},ensure_ascii=False),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as p:list(p.map(run,jobs))
