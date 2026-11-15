import urllib.request,urllib.error,urllib.parse,concurrent.futures,json,time,datetime,pathlib,re,sys,subprocess
sys.path.insert(0,'/workspace/mybookshelf-cloud/python-libs');from bs4 import BeautifulSoup
D=pathlib.Path(__file__).parent
POLICY='/workspace/MyBookshelf-web/server/services/providers/robots.js'
UA='MyBookshelf/1.0 (web; +https://mybookshelf.cloud/privacy)'
def get(u,k):
 t=time.time();d={'url':u,'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'GET'}; b=b''
 try:
  r=urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':UA}),timeout=18)
  with r:b=r.read(1500000);d.update(status=r.status,final_url=r.geturl(),content_type=r.headers.get('content-type'),server=r.headers.get('server'))
 except urllib.error.HTTPError as e:
  b=e.read(100000);d.update(status=e.code,error=str(e),content_type=e.headers.get('content-type'),server=e.headers.get('server'))
 except Exception as e:d['error']=str(e)
 d['elapsed']=round(time.time()-t,2)
 if b:
  (D/(k+'.html')).write_bytes(b);d['evidence']='evidence/continuation/main/'+k+'.html';d['bytes']=len(b)
 (D/(k+'.json')).write_text(json.dumps(d,indent=2));return d,b.decode('utf-8','replace')
def check(policy,url):
 js="import {robotsRules,robotsAllowed} from '"+POLICY+"';let d=JSON.parse(process.argv[1]);console.log(JSON.stringify({allowed:robotsAllowed(robotsRules(d.text),d.url),delayMs:robotsRules(d.text).delay}));"
 return json.loads(subprocess.check_output(['node','--input-type=module','-e',js,json.dumps({'text':policy,'url':url})]))
def controlled(z):
 k,u=z;p=urllib.parse.urlsplit(u);origin=p.scheme+'://'+p.netloc;rd,rb=get(origin+'/robots.txt',k+'-robots');out={'id':k,'robots':rd}
 if rd.get('status',0)>=500 or rd.get('status')==429:out['policy_result']='temporary_disallow_robots_error';return out
 pc=check(rb,u) if rd.get('status')==200 else {'allowed':True,'delayMs':0};out['policy']=pc
 if not pc['allowed']:out['policy_result']='disallowed';return out
 if pc['delayMs']>0:out['policy_result']='delay_required';return out
 d,b=get(u,k);s=BeautifulSoup(b,'html.parser');out['request']=d;out['title']=s.title.get_text(' ',strip=True) if s.title else '';out['links']=[{'title':a.get_text(' ',strip=True),'url':urllib.parse.urljoin(u,a['href'])} for a in s.select('a[href]') if re.search('opac|catalog|koha|library|newgenlib|ILS',a.get_text(' ',strip=True)+' '+a['href'],re.I)];out['forms']=[str(x)[:2000] for x in s.select('form')];out['text']=s.get_text(' ',strip=True)[:16000];(D/(k+'-parsed.json')).write_text(json.dumps(out,indent=2));return out
if __name__=='__main__':
 C=[('ilorin-official','https://universitylibrary.unilorin.edu.ng/divisions/electronic-support-services/'),('abu-official','https://library.abu.edu.ng/'),('unn-official','https://library.unn.edu.ng/online-presence-and-social-media-handles/'),('funaab-official','https://funaab.edu.ng/section/nimbe-adedipe-library/')]
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
  for x in ex.map(controlled,C):print(json.dumps({k:v for k,v in x.items() if k not in ['text','forms']}),flush=True)
