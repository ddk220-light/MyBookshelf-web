import urllib.request,urllib.error,pathlib,json,datetime,concurrent.futures
ROOT=pathlib.Path(__file__).parent/'evidence'; ROOT.mkdir(exist_ok=True)
CANDIDATES=[('uacm','https://catalogo.uacm.edu.mx'),('guanajuato','https://catalogo.bibliotecasguanajuato.gob.mx'),('mora','https://koha.mora.edu.mx'),('colmex','https://biblioteca.colmex.mx'),('bnm','https://catalogo.iib.unam.mx'),('vasconcelos','https://www.bibliotecavasconcelos.gob.mx'),('mexico','https://bibliotecademexico.gob.mx'),('unam','https://librunam.dgb.unam.mx')]
def one(c):
 slug,base=c;p=ROOT/slug;p.mkdir(exist_ok=True);url=base+'/robots.txt';meta={'url':url,'method':'GET','checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'user_agent':'MyBookshelfResearch/1.0 (public catalog feasibility research; OpenAI assistant)','tls_verification':True}
 try:
  r=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':meta['user_agent']}),timeout=25);raw=r.read(150000);meta.update(status=r.status,effective_url=r.url)
 except urllib.error.HTTPError as e:raw=e.read(150000);meta.update(status=e.code,error=str(e))
 except Exception as e:raw=b'';meta.update(status=None,error=str(e))
 (p/'robots.txt').write_bytes(raw);(p/'robots.json').write_text(json.dumps(meta,indent=2));return {'id':slug,**meta,'body':raw.decode('utf8','replace')[:800]}
if __name__=='__main__':
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for x in pool.map(one,CANDIDATES): print(json.dumps(x,ensure_ascii=False),flush=True)
