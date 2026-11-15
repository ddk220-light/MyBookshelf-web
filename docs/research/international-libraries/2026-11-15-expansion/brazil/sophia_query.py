import sys, pathlib, urllib.request, http.cookiejar, re, time, json
from bs4 import BeautifulSoup
from probe_local import fetch,ROOT
def query(slug,base,term='Dom Casmurro'):
    jar=http.cookiejar.CookieJar()
    opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    meta,body=fetch(base,slug,'fresh-form',opener=opener)
    s=BeautifulSoup(body,'html.parser'); token=s.select_one('input[name="__RequestVerificationToken"]')
    path=re.search(r"serviceBaseUrl:\s*['\"]([^'\"]+)",body)
    root=path.group(1) if path else '/'
    origin=base.split('/')[0]+'//'+base.split('/')[2]
    url=origin+root+'Busca/RapidaAcervo?bibliotecas=&localizacoes='
    payload={'Guid':str(int(time.time()*1000)),'TipoBuscaRapida':1,'IniciadoCom':'false','PalavraChave':term}
    if token:payload['__RequestVerificationToken']=token['value']
    meta,result=fetch(url,slug,'search',data=payload,opener=opener)
    if token:
        meta['payload']['__RequestVerificationToken']='[fresh anonymous form token; not retained]'
        (ROOT/'evidence'/slug/'search.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2))
    ss=BeautifulSoup(result,'html.parser')
    print(slug,meta,ss.get_text(' ',strip=True)[:7000])
if __name__=='__main__':query(*sys.argv[1:])
