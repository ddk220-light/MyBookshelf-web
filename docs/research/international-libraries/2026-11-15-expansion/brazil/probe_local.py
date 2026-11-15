import urllib.request, urllib.error, urllib.parse, datetime, pathlib, json, time, re, hashlib
ROOT=pathlib.Path(__file__).parent
UA='MyBookshelfResearch/1.0 (public catalog feasibility research)'
def fetch(url, slug, kind, data=None, headers=None, opener=None):
    p=ROOT/'evidence'/slug;p.mkdir(parents=True,exist_ok=True)
    req=urllib.request.Request(url,data=urllib.parse.urlencode(data).encode() if isinstance(data,dict) else data,headers={'User-Agent':UA,**(headers or {})})
    meta={'url':url,'method':req.get_method(),'payload':data,'checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    try:
        r=(opener.open if opener else urllib.request.urlopen)(req,timeout=25)
        raw=r.read(600001);meta.update(status=r.status,effective_url=r.url,content_type=r.headers.get('Content-Type'),truncated=len(raw)>600000)
    except urllib.error.HTTPError as e:
        raw=e.read(600000);meta.update(status=e.code,effective_url=e.url,error=str(e))
    except Exception as e:
        raw=b'';meta.update(status=None,effective_url=url,error=str(e))
    body=raw[:600000].decode('utf-8','replace')
    saved=body
    for field in re.findall(r'<input\b[^>]*\bname=[\"\']__RequestVerificationToken[\"\'][^>]*>',body,re.I):
        value=re.search(r'\bvalue=[\"\']([^\"\']+)',field)
        if value:saved=saved.replace(value[1],'[REDACTED_ANONYMOUS_STATE]')
    if isinstance(meta.get('payload'),dict):
        meta['payload']=dict(meta['payload'])
        if '__RequestVerificationToken' in meta['payload']:meta['payload']['__RequestVerificationToken']='[fresh anonymous form token; not retained]'
    (p/(kind+'.html')).write_text(saved)
    meta['sha256']=hashlib.sha256(saved.encode()).hexdigest()
    meta['saved_bytes']=len(saved.encode())
    if saved!=body:
        meta['evidence_redacted']=True
        meta['redaction_note']='Anonymous form state removed; returned book/holding content preserved. Hash covers saved redacted bytes.'
    (p/(kind+'.json')).write_text(json.dumps(meta,ensure_ascii=False,indent=2))
    return meta,body
