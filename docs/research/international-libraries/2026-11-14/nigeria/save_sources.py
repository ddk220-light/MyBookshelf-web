from probe import *
C=[('source-lms-2025','https://acadrespub.com/index.php/oijlis/article/view/83'),('source-national-size','https://www.nln.gov.ng/news-details.php?post_Id=97&title=National+Library+Engages+Stakeholders+in+Southwest'),('source-oau-size','https://holibrary.oauife.edu.ng/about-us/'),('source-lagos-size','https://spgs.unilag.edu.ng/?page_id=4213'),('source-ibadan-size','https://library.ui.edu.ng/'),('source-unn-size','https://www.unn.edu.ng/academics/overview/'),('source-ilorin-size','https://universitylibrary.unilorin.edu.ng/about/achievements/'),('source-kasu-access','https://kasu.edu.ng/library/')]
def f(z):
 k,u=z;d,b=fetch(u,k+'.html');s=BeautifulSoup(b,'html.parser');d['excerpt']=s.get_text(' ',strip=True)[:14000];(ROOT/(k+'.json')).write_text(json.dumps(d,indent=2));return k,{k:v for k,v in d.items() if k!='excerpt'}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
 for d in ex.map(f,C):print(d,flush=True)
