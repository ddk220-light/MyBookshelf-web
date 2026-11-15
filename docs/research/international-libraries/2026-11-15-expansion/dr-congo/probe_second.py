import sys,json,concurrent.futures,urllib.request,urllib.parse,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent.parent));from probe import fetch
P=Path(__file__).parent
jobs=[('mikanda-upc-query','https://katalog.mikanda.info/pmb/opac_css/','"La publicité est dans le film"',10),('opac-ulpgl-query-2','https://opac.bu-ulpgl.net/opac_css/','Sociologie des médias',0),('sgnc-query-3','https://sgnc.pmb.cd/opac_css/','haut- Uele',0)]
def go(j):
 n,u,q,delay=j;opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor());m=fetch(n+'-form',u,P,opener=opener);f=m['forms'][0]
 payload={'typdoc':'','user_query':q,'look_TITLE':'1','look_FIRSTACCESS':'1','ok':'Rechercher'}
 for field in f['fields']:
  if field['name']=='csrf_token':payload['csrf_token']=field['value']
 if delay:time.sleep(delay)
 r=fetch(n,f['action'],P,method='POST',payload=payload,opener=opener)
 if 'titres trouvés' not in r.get('text','') and 'aucun résultat' not in r.get('text',''):
  for f in r.get('forms',[]):
   if 'lvl=more_results' in f['action']:
    payload={a['name']:a['value'] for a in f['fields'] if a.get('name')}
    if delay:time.sleep(delay)
    r=fetch(n+'-results',f['action'],P,method='POST',payload=payload,opener=opener);break
 return {k:r.get(k) for k in ['name','status','title','text','error']}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as x:
 for m in x.map(go,jobs):print(json.dumps(m,ensure_ascii=False))
