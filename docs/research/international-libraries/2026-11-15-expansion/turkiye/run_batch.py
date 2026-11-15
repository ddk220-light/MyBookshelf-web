import sys,concurrent.futures,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from probe import fetch,robots_decision
D=Path(__file__).resolve().parent
jobs=json.loads(sys.argv[1])
def job(j):
 name,url=j
 r=fetch(name+'-robots',url.split('/',3)[0]+'//'+url.split('/',3)[2]+'/robots.txt',D)
 d=robots_decision(D/r['metadata_path'],url)
 print(name,'ROBOTS',d,flush=True)
 if not d['allowed'] or d.get('delay_seconds',0)>0:return
 r=fetch(name,url,D); print(json.dumps({k:r.get(k) for k in ['name','status','error','title','forms']},ensure_ascii=False),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as e:list(e.map(job,jobs))
