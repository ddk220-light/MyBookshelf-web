import sys,pathlib,concurrent.futures,json
sys.path.insert(0,str(pathlib.Path(__file__).parent.parent))
from probe import fetch,robots_decision
base=pathlib.Path(__file__).parent
if __name__=='__main__':
 jobs=list(zip(sys.argv[1::2],sys.argv[2::2]))
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
  for m in ex.map(lambda x:fetch(x[0],x[1],base,max_bytes=450000),jobs): print(json.dumps({k:m.get(k) for k in ['name','status','title','error']},ensure_ascii=False))
