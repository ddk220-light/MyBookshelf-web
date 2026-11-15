import sys,json,concurrent.futures
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from probe import fetch,robots_decision
D=Path(__file__).resolve().parent
jobs=json.loads(sys.argv[1])
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for m in pool.map(lambda j:fetch(dest=D,**j),jobs):
  print(json.dumps({**{k:m.get(k) for k in ['name','status','error','effective_url','title','forms']},'links':[x for x in m.get('links',[]) if any(z in (x['text']+' '+x['url']).lower() for z in ['opac','catalog','koha','collection','history'])],'text':m.get('text','')[:1200]},ensure_ascii=False))
