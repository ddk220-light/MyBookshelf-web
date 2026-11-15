import sys,json,concurrent.futures
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from probe import fetch,robots_decision
D=Path(__file__).resolve().parent
jobs=json.loads(sys.argv[1])
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as e:
 for x in e.map(lambda j: fetch(dest=D,**j),jobs):
  print(json.dumps({k:x.get(k) for k in ('name','status','error','title','text','forms')},ensure_ascii=False)[:2000])
