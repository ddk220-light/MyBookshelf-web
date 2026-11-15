import json,urllib.request,urllib.error,pathlib,datetime
p=pathlib.Path(__file__).parent/'evidence'
url='https://lhl.aiias.edu/search'
payload={'searchTerm':'Research design','hitsPerPage':12,'startIndex':0,'sortCriteria':'Relevancy','facetFilters':[],'branchFilters':[],'audienceCharacteristicsFilters':[],'addToHistory':False}
m={'url':url,'checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':'POST','post_json':payload}
try:
 r=urllib.request.urlopen(urllib.request.Request(url,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json','User-Agent':'MyBookshelfResearch/1.0 (public catalog compatibility check)'}),timeout=25)
 raw=r.read(1200000);m.update(status=r.status,content_type=r.headers.get('Content-Type'),final_url=r.url)
 (p/'aiias-title-query-response.json').write_bytes(raw);d=json.loads(raw);print('RESULTS',d.get('totalHits'));print(json.dumps(d.get('resources',[])[:2],ensure_ascii=False)[:16000]);m.update(result_count=d.get('totalHits'),evidence_file='evidence/aiias-title-query-response.json')
except Exception as e:m.update(error=str(e));print(m)
(p/'aiias-title-query.json').write_text(json.dumps(m,indent=2))
