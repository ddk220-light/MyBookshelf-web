import sys,pathlib,json,concurrent.futures
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent.parent))
from probe import fetch,robots_decision
ROOT=pathlib.Path(__file__).resolve().parent
if __name__=='__main__':
 jobs=json.loads(sys.argv[1])
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as p:
  for r in p.map(lambda j:fetch(dest=ROOT,**j),jobs):
   print(json.dumps({k:r.get(k) for k in ['name','status','title','effective_url','error','forms','text']},ensure_ascii=False)[:13000],flush=True)
