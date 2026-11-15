import sys,json,concurrent.futures,urllib.parse
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent.parent))
from probe import fetch,robots_decision
D=Path(__file__).parent

def batch(jobs):
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as e:
  for m in e.map(lambda j:fetch(dest=D,**j),jobs):
   print(json.dumps({k:m.get(k) for k in ['name','status','effective_url','title','error','text','forms']},ensure_ascii=False)[:1800],flush=True)

def policy(name,url):
 r=robots_decision(D/'evidence'/f'{name}.json',url)
 print(name,url,r)
 return r

if __name__=='__main__':
 batch(json.loads(sys.argv[1]))
