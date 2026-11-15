import sys,pathlib,json
from bs4 import BeautifulSoup
sys.path.insert(0,str(pathlib.Path(__file__).parent.parent))
from probe import fetch
base=pathlib.Path(__file__).parent
source,name,url,overrides=sys.argv[1:]
s=BeautifulSoup((base/'evidence'/(source+'.html')).read_text(),'html.parser');payload={}
for x in s.select('form')[0].select('input[name]'):
 if x.get('type') in ['submit','button','image']:continue
 if x.get('type') in ['radio','checkbox'] and not x.has_attr('checked'):continue
 payload[x['name']]=x.get('value','')
for x in s.select('form')[0].select('select[name]'):
 opts=x.select('option[selected]') or x.select('option')[:1];payload[x['name']]=opts[0].get('value','') if opts else ''
payload.update(json.loads(overrides))
r=fetch(name,url,base,method='POST',payload=payload,max_bytes=650000);print(r['status'],r.get('title'),r.get('error'));print(r.get('text','')[-10000:])
