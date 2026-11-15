import sys,json,urllib.request,urllib.parse
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent));from probe import fetch,robots_decision
from bs4 import BeautifulSoup
D=Path(__file__).resolve().parent
name,url,robot,q=sys.argv[1:]
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
for stage in ['form','search']:
 d=robots_decision(D/'evidence'/f'{robot}.json',url)
 (D/'evidence'/f'{name}-{stage}-policy.json').write_text(json.dumps(d,indent=2))
 if not d['allowed']:print(d);break
 if stage=='form':
  r=fetch(name+'-form',url,D,opener=opener)
  if r['status']!=200: print(r.get('error',r['status']));break
  soup=BeautifulSoup((D/r['evidence_path']).read_text(),'html.parser');form=soup.select_one('form[name="search_input"]') or next(f for f in soup.select('form') if f.select_one('[name=user_query]'))
  url=urllib.parse.urljoin(r['effective_url'],form.get('action',''))
  payload={x['name']:x.get('value','') for x in form.select('input[name][type=hidden]')}
  payload.update(user_query=q,look_TITLE='1',typdoc='',ok='Search')
 else:
  r=fetch(name+'-search',url,D,method='POST',payload=payload,opener=opener);print({k:r.get(k) for k in ['status','title','text','error']})
