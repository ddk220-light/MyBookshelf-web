import os,json,sys,subprocess,time,datetime,concurrent.futures,urllib.parse
sys.path.insert(0,'/workspace/mybookshelf-cloud/python-libs')
from bs4 import BeautifulSoup
BASE=os.path.dirname(__file__)
def fetch(name,url,kind='page'):
 p=os.path.join(BASE,'evidence',name+'-'+kind)
 st=time.time(); r=subprocess.run(['curl','--location','--max-time','25','--connect-timeout','10','--silent','--show-error','--compressed','--user-agent','MyBookshelfResearch/1.0 (public catalog compatibility review)','--dump-header',p+'.headers.txt','--output',p+'.html','--write-out','%{http_code}|%{url_effective}',url],capture_output=True,text=True)
 text=open(p+'.html',errors='replace').read() if os.path.exists(p+'.html') else ''
 soup=BeautifulSoup(text,'html.parser')
 v={'name':name,'kind':kind,'url':url,'checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'curl_exit':r.returncode,'status':r.stdout,'error':r.stderr,'elapsed_seconds':round(time.time()-st,2),'title':soup.title.get_text(' ',strip=True) if soup.title else '', 'text':soup.get_text(' ',strip=True)[:16000], 'links':[{'text':a.get_text(' ',strip=True),'url':urllib.parse.urljoin(url,a['href'])} for a in soup.select('a[href]') if any(k in a['href'] for k in ['opac','catalog','detail','record','search'])][:80], 'forms':[{'action':f.get('action'), 'method':f.get('method'),'inputs':[{ 'name':i.get('name'),'value':i.get('value')} for i in f.select('input')]} for f in soup.select('form')][:6]}
 json.dump(v,open(p+'.json','w'),ensure_ascii=False,indent=2)
 return {k:v[k] for k in ['name','kind','status','error','elapsed_seconds','title','text']} 
if __name__=='__main__':
 work=json.load(open(sys.argv[1]));
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for v in pool.map(lambda x:fetch(**x),work):
   v['text']=v['text'][:1200]; print(json.dumps(v,ensure_ascii=False),flush=True)
