from probe import *
def f(z):
 k,u,post=z;t=time.time();d={'url':u,'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'POST' if post else 'GET'}
 if post:
  d['body']=post
  try:
   req=urllib.request.Request(u,data=urllib.parse.urlencode(post).encode(),headers={'User-Agent':'MyBookshelfLibraryResearch/1.0 (public catalog compatibility check)'})
   with urllib.request.urlopen(req,timeout=18) as r:b=r.read(1500000).decode();d.update(status=r.status,final_url=r.geturl(),elapsed=round(time.time()-t,2))
   (E/(k+'.html')).write_text(b);d['evidence']='evidence/'+k+'.html'
  except Exception as e:d.update(error=str(e),elapsed=round(time.time()-t,2));b=''
 else:d,b=fetch(u,k+'.html')
 s=BeautifulSoup(b,'html.parser');d['text']=s.get_text(' ',strip=True)[-15000:];d['links']=[{'title':a.get_text(' ',strip=True),'url':urllib.parse.urljoin(u,a['href'])} for a in s.select('a[href]') if re.search('opac|catalog|koha|library.babcock',a.get_text(' ',strip=True)+' '+a['href'],re.I)];(ROOT/(k+'.json')).write_text(json.dumps(d,indent=2));return k,{k:v for k,v in d.items() if k not in ['text']},d['text'][:500]
C=[('lagos-holdings','http://librarydb.unilag.edu.ng/newgenlibctxt/jsp/carbon/aportal/cataloguing/ViewHoldingsSummary.jsp',{'id':'AVAILSUM_24417_1'}),('benin-holdings','https://ir.uniben.edu/newgenlibctxt/jsp/carbon/aportal/cataloguing/ViewHoldingsSummary.jsp',{'id':'AVAILSUM_145_1'}),('babcock-official','https://www.babcock.edu.ng/library',None),('oou-home','https://library.oouagoiwoye.edu.ng/index.php',None),('lautech-specific','https://opac.lautech.edu.ng/cgi-bin/koha/opac-search.pl?idx=ti&q=Knowledge%20organisation%20and%20management',None),('kasu-colander-record','https://opac.kasu.edu.ng/cgi-bin/koha/opac-detail.pl?biblionumber=1774',None)]
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
 for d in ex.map(f,C):print(d,flush=True)
