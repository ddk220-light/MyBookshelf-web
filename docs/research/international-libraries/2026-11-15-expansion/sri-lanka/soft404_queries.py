import sys,json,concurrent.futures
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from probe import fetch,robots_decision
D=Path(__file__).resolve().parent
def run(n):
 u=f'https://{n}.dlp.gov.lk/cgi-bin/koha/opac-search.pl?idx=ti&q=The+old+man+and+the+sea'
 r=robots_decision(D/'evidence'/f'{n}-robots.json',u)
 r.update(manual_decision='no_interpretable_published_policy',manual_note='Manually inspected saved HTTP200 Koha Error404 page; ordinary missing-page response with public search form, no denial or challenge. Protocol permits one bounded anonymous query. This does not establish a reuse licence.')
 (D/'evidence'/f'{n}-policy-review.json').write_text(json.dumps(r,indent=2)+'\n')
 m=fetch(n+'-query',u,D);print(n,m.get('status'),m.get('text','')[:1200])
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as p:list(p.map(run,['batticaloa','badulla','kurunegala']))
