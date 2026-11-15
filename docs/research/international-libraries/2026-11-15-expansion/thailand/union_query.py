"""Bounded UC-TAL public title search. Anonymous token stays in memory."""
import sys,json,urllib.request,datetime
from pathlib import Path
D=Path(__file__).parent;sys.path.insert(0,str(D.parent));from probe import fetch,robots_decision,USER_AGENT
B='https://ucopacapi.walaiautolib.com/ucopacapi/v1/'
def token():
 u=B+'Token/Issue';assert robots_decision(D/'evidence/uctal-api-robots.json',u)['allowed']
 req=urllib.request.Request(u,data=b'{}',headers={'User-Agent':USER_AGENT,'Content-Type':'application/json'},method='POST')
 with urllib.request.urlopen(req,timeout=22) as r:return json.load(r)['access_token']
if __name__=='__main__':
 t=token();n=sys.argv[1];path=sys.argv[2];u=B+path;assert robots_decision(D/'evidence/uctal-api-robots.json',u)['allowed'];h={'Content-Type':'application/json','Authorization':'Bearer '+t}
 if len(sys.argv)>3:m=fetch(n,u,D,method='POST',payload=json.loads(sys.argv[3]),headers=h)
 else:m=fetch(n,u,D,headers=h)
 print(m.get('status'),m.get('text','')[:18000])
