import sys,json,concurrent.futures
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from probe import fetch,robots_decision
ROOT=Path(__file__).parent
jobs=json.loads(sys.argv[1])
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for m in pool.map(lambda j:fetch(dest=ROOT,**j),jobs):
  print(json.dumps({k:m.get(k) for k in ('name','status','title','effective_url','error')},ensure_ascii=False)[:19000],flush=True)
