import sys,json,concurrent.futures
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from probe import fetch,robots_decision
D=Path(__file__).resolve().parent
jobs=json.loads(sys.argv[1])
def one(j):
 r=j.pop('robots'); override=j.pop('manual_html_fallback',False)
 audit=robots_decision(D/'evidence'/f'{r}.json',j['url'])
 if override and audit['note']=='HTML returned instead of interpretable robots policy':
  audit.update(allowed=True,decision='no_published_rules',note='Manually inspected ordinary app-shell HTML fallback; no challenge or explicit denial. One bounded public query permitted by protocol.')
 (D/'evidence'/f'{j["name"]}-audit.json').write_text(json.dumps(audit,indent=2))
 if not audit['allowed']: return {'name':j['name'],'audit':audit}
 x=fetch(dest=D,**j)
 return {k:x.get(k) for k in ('name','status','error','title','text','forms')}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as e:
 for x in e.map(one,jobs):print(json.dumps(x,ensure_ascii=False)[:3000])
