import urllib.request,urllib.error,urllib.parse,urllib.robotparser,concurrent.futures,json,time,datetime,pathlib,re,sys
sys.path.insert(0,'/workspace/mybookshelf-cloud/python-libs')
from bs4 import BeautifulSoup
ROOT=pathlib.Path(__file__).parent; E=ROOT/'evidence'; E.mkdir(exist_ok=True)
C=[('national','National Library of Nigeria','https://opac.nln.gov.ng/'),('noun','National Open University of Nigeria','https://koha.nou.edu.ng/'),('funaab','Federal University of Agriculture Abeokuta','https://opac.funaab.edu.ng/'),('jos','University of Jos','https://library.unijos.edu.ng/'),('cbn','Central Bank of Nigeria Library','https://library.cbn.gov.ng/'),('abuja','University of Abuja','https://opac.uniabuja.edu.ng/'),('nile','Nile University of Nigeria','https://webpac.nileuniversity.edu.ng/'),('abu','Ahmadu Bello University','https://catalog.abu.edu.ng/'),('ilorin','University of Ilorin','https://opac.unilorin.edu.ng/'),('unn','University of Nigeria Nsukka','https://nal.unn.edu.ng/'),('kwasu','Kwara State University','https://opac.kwasu.edu.ng/'),('run','Redeemers University','https://ttl.run.edu.ng/'),('statehouse','State House Library','https://library.statehouse.gov.ng/'),('ibadan','University of Ibadan','https://library.ui.edu.ng/'),('lagos','University of Lagos','https://library.unilag.edu.ng/')]
def fetch(url,fn):
 t=time.time(); d={'url':url,'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'MyBookshelfLibraryResearch/1.0 (public catalog compatibility check)'})
  with urllib.request.urlopen(req,timeout=18) as r: body=r.read(1500000); d.update(status=r.status,final_url=r.geturl(),elapsed=round(time.time()-t,2),bytes=len(body),content_type=r.headers.get('Content-Type'))
  (E/fn).write_bytes(body); d['evidence']='evidence/'+fn; return d,body.decode('utf-8','replace')
 except Exception as e: d.update(error=str(e),elapsed=round(time.time()-t,2)); return d,''
def run(c):
 slug,name,base=c; x={'id':slug,'name':name,'base_url':base}
 x['robots'],rb=fetch(base+'robots.txt',slug+'-robots.txt')
 x['homepage'],hp=fetch(base,slug+'-home.html')
 if hp:
  s=BeautifulSoup(hp,'html.parser'); x['home_title']=s.title.get_text(' ',strip=True) if s.title else ''
  x['catalog_links']=[{'text':a.get_text(' ',strip=True),'url':urllib.parse.urljoin(base,a['href'])} for a in s.select('a[href]') if re.search('catalog|opac|koha',a.get_text(' ',strip=True)+' '+a['href'],re.I)][:20]
 x['robots_text']=rb[:6000]
 if rb:
  rp=urllib.robotparser.RobotFileParser(); rp.parse(rb.splitlines()); allowed=rp.can_fetch('*',base+'cgi-bin/koha/opac-search.pl?q=economics')
  x['robots_search_allowed']=allowed
  if not allowed: x['search_status']='not_tested_robots_disallows'; return x
 if not hp: x['search_status']='homepage_unreachable'; return x
 if not re.search('koha|opac-search.pl',hp,re.I): x['search_status']='discover_custom_endpoint'; return x
 url=base+'cgi-bin/koha/opac-search.pl?q=economics'
 x['query']='economics'; x['search'],page=fetch(url,slug+'-search.html')
 s=BeautifulSoup(page,'html.parser'); x['search_title']=s.title.get_text(' ',strip=True) if s.title else ''
 a=s.select('a.title[href], a.btitle[href]');
 if not a: a=[a for a in s.select('a[href]') if 'opac-detail.pl?biblionumber=' in a['href'] and a.get_text(' ',strip=True)][:20]
 x['books']=[{'title':i.get_text(' ',strip=True),'url':urllib.parse.urljoin(url,i['href'])} for i in a][:5]
 x['search_excerpt']=s.get_text(' ',strip=True)[-12000:]
 x['search_status']='success' if x['books'] else 'no_verified_book_rows'
 return x
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
  for x in ex.map(run,C):
   (ROOT/(x['id']+'.json')).write_text(json.dumps(x,indent=2)); print(json.dumps({k:v for k,v in x.items() if k in ['id','name','home_title','search_title','books','search_status','catalog_links','robots_search_allowed','homepage']}),flush=True)
