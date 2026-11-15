from probe import *
C=[('benin-home','https://ir.uniben.edu/newgenlibctxt/Home?Id=1'),('benin-robots','https://ir.uniben.edu/robots.txt'),('portharcourt-home','https://www.library.uniport.edu.ng/'),('calabar-home','https://linktr.ee/libraryunical'),('uyo-home','https://uniuyo.edu.ng/teacher/e-library/'),('futa-home','https://lib.futa.edu.ng/home/2603'),('lasu-home','https://lasu.edu.ng/home/libraries/'),('futo-home','https://futo.edu.ng/')] 
def read(a):
 k,u=a;d,b=fetch(u,k+'.html');s=BeautifulSoup(b,'html.parser');d['links']=[{'title':x.get_text(' ',strip=True),'url':urllib.parse.urljoin(u,x['href'])} for x in s.select('a[href]') if re.search('catalog|opac|library|koha',x.get_text(' ',strip=True)+' '+x['href'],re.I)];d['forms']=[str(f)[:3000] for f in s.find_all('form')];d['excerpt']=s.get_text(' ',strip=True)[:7000];(ROOT/(k+'.json')).write_text(json.dumps(d,indent=2));return k,d
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
 for k,d in ex.map(read,C): print(k,json.dumps({k:v for k,v in d.items() if k not in ['forms','excerpt']})[:4000],flush=True)
