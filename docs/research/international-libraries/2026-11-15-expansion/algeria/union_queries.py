import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent.parent))
from probe import fetch,robots_decision
D=Path(__file__).parent
url=json.loads((D/'evidence/ccdz-advanced.json').read_text())['forms'][0]['action']
assert robots_decision(D/'evidence/ccdz-robots.json',url)['allowed']
for n,loc,q in [('usthb',53,'Algèbre linéaire'),('alger1',60,'La peste'),('constantine1',124,'Le petit prince'),('oran1',119,'Le petit prince')]:
 payload={'Type_not':'a','not_loc':str(loc),'op_log_titre':' AND ','titres':q,'Auteurs':'','sujets':'','editeur':'','resumer':'','diplome':'','spec':'','issn':'','col':'','date_not':'','langue':'','Rechercher':'Rechercher'}
 d=fetch('ccdz-'+n+'-query',url,D,method='POST',payload=payload,timeout=35)
 print(n,d.get('status'),d.get('error'),d.get('text','')[-5000:],flush=True)
