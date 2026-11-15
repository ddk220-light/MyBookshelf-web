import sys,pathlib,json,http.cookiejar,urllib.request
from bs4 import BeautifulSoup
sys.path.insert(0,str(pathlib.Path(__file__).parent.parent))
from probe import fetch
p=pathlib.Path(__file__).parent
jar=http.cookiejar.CookieJar();urllib.request.install_opener(urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar)))
if sys.argv[1]=='nlv':
 r=fetch('nlv-session-form','https://opac.nlv.gov.vn/tim-kiem',p,max_bytes=150000)
 soup=BeautifulSoup((p/'evidence/nlv-session-form.html').read_text(),'html.parser')
 payload=json.loads((p/'evidence/nlv-search.json').read_text())['payload']
 r=fetch('nlv-session-query','https://opac.nlv.gov.vn/Search',p,method='POST',payload=payload,headers={'Content-Type':'application/json','RequestVerificationToken':soup.select_one('#requestVerificationToken')['value']},max_bytes=200000)
else:
 r=fetch('khanhhoa-session-form','https://pr.thuvienkhanhhoa.gov.vn/tracuutailieutruyenthong2dongian',p,max_bytes=450000)
 s=BeautifulSoup((p/'evidence/khanhhoa-session-form.html').read_text(),'html.parser');payload={}
 for x in s.select('form')[0].select('input[name]'):
  if x.get('type') in ['submit','button','image']:continue
  if x.get('type') in ['radio','checkbox'] and not x.has_attr('checked'):continue
  payload[x['name']]=x.get('value','')
 for x in s.select('form')[0].select('select[name]'):
  opts=x.select('option[selected]') or x.select('option')[:1];payload[x['name']]=opts[0].get('value','') if opts else ''
 payload.update({'ctl00$phContent$txtTitle':'Dế mèn phiêu lưu ký','ctl00$phContent$btnSearch':'Tìm kiếm','ctl00$phContent$ddlLimit':'50'})
 r=fetch('khanhhoa-session-query','https://pr.thuvienkhanhhoa.gov.vn/tracuutailieutruyenthong2dongian',p,method='POST',payload=payload,max_bytes=400000)
print(r['status'],r.get('text','')[:13000])
