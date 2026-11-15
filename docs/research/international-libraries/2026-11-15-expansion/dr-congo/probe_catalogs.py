import sys,json,concurrent.futures,urllib.request,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent.parent));from probe import fetch,robots_decision
P=Path(__file__).parent
jobs=[('mikanda','https://katalog.mikanda.info/pmb/opac_css/','Le petit prince'),('udbl','https://bibliotheque-udbl.org/pmb/opac_css/','Analyse microéconomique'),('sgnc','https://sgnc.pmb.cd/opac_css/','Géologie du Congo')]
def go(j):
 n,u,q=j;opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
 # Search routes and fields come from saved official anonymous form.
 m=json.loads((P/'evidence'/f'{n}-home.json').read_text())
 if n=='sgnc':m=fetch(n+'-fresh-form',u,P,opener=opener)
 f=m['forms'][0]; payload={'typdoc':'','surligne':'','user_query':q,'ok':'Rechercher','look_TITLE':'1','look_FIRSTACCESS':'1'}
 for field in f['fields']:
  if field['name']=='csrf_token':payload['csrf_token']=field['value']
 d=robots_decision(P/'evidence'/f'{n}-robots.json',f['action']);assert d['allowed']
 if d.get('delay_seconds'):time.sleep(d['delay_seconds'])
 r=fetch(n+'-query',f['action'],P,method='POST',payload=payload,opener=opener)
 return {k:r.get(k) for k in ['name','status','title','error','text','links']}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as x:
 for r in x.map(go,jobs):print(json.dumps(r,ensure_ascii=False))
