import sys,json,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from probe import fetch,robots_decision
D=Path(__file__).resolve().parent
seed=json.loads((D/'evidence/union-query.json').read_text())
for slug,name in [('ampara','Ampara Public Library'),('ambalangoda','Ambalangoda Public Library'),('veyangoda','Veyangoda  Public Library'),('kirimetiyana','Kirimetiyana Public Library'),('doluwa','Doluwa Public Library')]:
 link=next(x for x in seed['links'] if x['text'].startswith(name+' ') and 'filter' in x['url'])
 decision=robots_decision(D/'evidence/union-robots.json',link['url']);assert decision['allowed']
 m=fetch(slug+'-union-query',link['url'],D)
 print(slug,m.get('status'),m.get('text','')[:2400],flush=True)
 time.sleep(2)
