import sys,pathlib,json,http.cookiejar,urllib.request,urllib.parse
sys.path.insert(0,str(pathlib.Path(__file__).parent.parent))
from probe import fetch
p=pathlib.Path(__file__).parent
label,origin,query=sys.argv[1:]
jar=http.cookiejar.CookieJar();urllib.request.install_opener(urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar)))
r=fetch(label+'-session-form',origin+'/SearchOpac/Index?'+urllib.parse.urlencode({'query':query,'category':4}),p,max_bytes=220000)
if r['status']!=200:sys.exit()
payload={'lstOrAndNot':',AND,AND,AND,AND','lstColunm':'4,4,4,4,4','lstValue':query+"''''",'heldmediumtype':'','materialtype':'b','location':'','locationTemp':'','language':'','lstZdbname':['-1']}
r=fetch(label+'-count',origin+'/SearchOpac/Search_Count',p,method='POST',payload=payload,headers={'Content-Type':'application/json;charset=utf-8'})
print(r['status'],r.get('text','')[:600])
if r['status']!=200:sys.exit()
d=json.loads((p/'evidence'/(label+'-count.html')).read_text()); rows=d.get('SearchResult',[])
if not rows or not rows[0].get('COUNT'):sys.exit()
id=rows[0]['ID']
r=fetch(label+'-query',origin+'/SearchOpac/SearchPaging',p,method='POST',payload={'dbResourceID':id,'pageIndex':1,'pageSize':5,'orderBy':'BIBID/DESC'},headers={'Content-Type':'application/json;charset=utf-8'});print(r['status']);d=json.loads((p/'evidence'/(label+'-query.html')).read_text());print([{k:x.get(k) for k in ['BIBID','AUTHOR','TITLE','MATERIALTYPE','COUNTHOLDING','COUNTHOLDINGAVAILABLE']} for x in d.get('SearchResult',[])])
