"""Optional bounded recheck of the three PMB reserves; no login or persisted cookies.

Run manually only after rechecking current robots. This writes fresh evidence under
recheck-* names and never updates the original observations/findings automatically.
"""
import sys
from pathlib import Path
import urllib.parse
import urllib.request
sys.path.insert(0,str(Path(__file__).parent.parent))
from probe import fetch,robots_decision
from bs4 import BeautifulSoup
D=Path(__file__).parent
CASES=[('comfamiliar','https://biblioteca.comfamiliar.com.co/pmb/opac_css/','"Cien años de soledad"'),('fumc','https://pmb.fumc.edu.co/pmb/opac_css/','"Cien años de soledad"'),('academia','https://biblioteca.academiahistoria.org.co/pmb/opac_css/','"La vorágine"')]

def run(name,url,title):
 origin=urllib.parse.urlsplit(url)
 policy=fetch('recheck-'+name+'-robots',urllib.parse.urlunsplit((origin.scheme,origin.netloc,'/robots.txt','','')),D)
 def allowed(target):
  decision=robots_decision(D/policy['metadata_path'],target)
  if not decision['allowed']:raise RuntimeError(decision)
  # Current original observations are 404 with no delay. Recheck stops if new policy asks for delay.
  if decision.get('delay_seconds',0):raise RuntimeError('New crawl-delay requires manual scheduling; stop recheck')
 allowed(url)
 opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor())
 form_page=fetch('recheck-'+name+'-form',url,D,opener=opener)
 if form_page.get('status')!=200:raise RuntimeError('Form unavailable')
 soup=BeautifulSoup((D/form_page['evidence_path']).read_bytes(),'html.parser')
 form=next(f for f in soup.select('form') if f.select('[name=user_query]'))
 target=urllib.parse.urljoin(url,form.get('action',''))
 payload=dict(user_query=title,look_TITLE='1',look_FIRSTACCESS='1',surligne='',ok='Buscar')
 allowed(target)
 result=fetch('recheck-'+name+'-query',target,D,method='POST',payload=payload,opener=opener)
 if result.get('status')!=200:raise RuntimeError('Query unavailable')
 soup=BeautifulSoup((D/result['evidence_path']).read_bytes(),'html.parser')
 form=soup.find('form',{'name':'search_objects'})
 if form:
  target=urllib.parse.urljoin(url,form.get('action',''))
  payload={i['name']:i.get('value','') for i in form.select('input[name]')}
  allowed(target)
  result=fetch('recheck-'+name+'-results',target,D,method='POST',payload=payload,opener=opener)
 print(name,result.get('status'),result['metadata_path'])
if __name__=='__main__':
 for case in CASES:run(*case)
