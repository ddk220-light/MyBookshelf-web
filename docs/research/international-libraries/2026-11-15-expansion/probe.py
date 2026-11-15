"""Bounded public research fetches. No search-result success is inferred here.

CLI: python probe.py COUNTRY_DIRECTORY BATCH_JSON
Batch: [{"name":"catalog-robots","url":"https://.../robots.txt"}, ...]
Call robots_decision(saved_metadata_path, target_url) before catalog requests.
"""
import concurrent.futures
import datetime
import hashlib
import ipaddress
import json
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, '/workspace/mybookshelf-cloud/python-libs')
from bs4 import BeautifulSoup

USER_AGENT = 'MyBookshelfResearch/1.0 (public library catalog compatibility research)'

def fetch(name, url, dest, method='GET', payload=None, headers=None, timeout=22, max_bytes=2000000, opener=None, **unused):
    parsed = urllib.parse.urlsplit(url)
    assert parsed.scheme in {'http', 'https'} and parsed.hostname
    try:
        address = ipaddress.ip_address(parsed.hostname)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise ValueError('Private/reserved literal origin is not a research target')
    if parsed.hostname.lower() in {'localhost', 'metadata.google.internal'}:
        raise ValueError('Internal origin is not a research target')
    assert re.fullmatch(r'[A-Za-z0-9_.-]+', name), name
    dest = Path(dest)
    evidence = dest / 'evidence'
    evidence.mkdir(parents=True, exist_ok=True)
    body_path = evidence / (name + '.html')
    meta_path = evidence / (name + '.json')
    request_headers = {'User-Agent': USER_AGENT, 'Accept': '*/*'}
    request_headers.update(headers or {})
    if isinstance(payload, (dict, list)):
        if 'json' in request_headers.get('Content-Type', ''):
            data = json.dumps(payload, ensure_ascii=False).encode()
        else:
            data = urllib.parse.urlencode(payload, doseq=True).encode()
    elif payload is None:
        data = None
    else:
        data = str(payload).encode()
    meta = dict(name=name, url=url, method=method.upper(), payload=payload,
                checked_at_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                user_agent=USER_AGENT, status=None, effective_url=None,
                evidence_path=str(body_path.relative_to(dest)),
                metadata_path=str(meta_path.relative_to(dest)))
    started = time.monotonic()
    raw = None
    try:
        try:
            open_request = opener.open if opener is not None else urllib.request.urlopen
            response = open_request(urllib.request.Request(url, data=data, headers=request_headers, method=method.upper()), timeout=timeout)
        except urllib.error.HTTPError as exc:
            response = exc
        with response:
            raw = response.read(max_bytes + 1)
            meta.update(status=response.status, effective_url=response.url,
                        response_headers={k:response.headers[k] for k in ['Content-Type','Location','Retry-After','Content-Length'] if response.headers.get(k)},
                        truncated=len(raw) > max_bytes)
            raw = raw[:max_bytes]
            text = raw.decode(response.headers.get_content_charset() or 'utf-8', 'replace')
        body_path.write_bytes(raw)
        meta.update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
        soup = BeautifulSoup(text, 'html.parser')
        meta['title'] = soup.title.get_text(' ', strip=True) if soup.title else ''
        meta['text'] = soup.get_text(' ', strip=True)[:18000]
        meta['links'] = [{'text':a.get_text(' ',strip=True)[:160], 'url':urllib.parse.urljoin(meta['effective_url'],a['href'])} for a in soup.select('a[href]')][:120]
        meta['forms'] = [{'method':f.get('method','GET'), 'action':urllib.parse.urljoin(meta['effective_url'],f.get('action','')), 'fields':[{'name':x.get('name'),'value':x.get('value'),'type':x.get('type')} for x in f.select('input[name],select[name],textarea[name]')]} for f in soup.select('form')][:10]
    except Exception as exc:
        meta['error'] = f'{type(exc).__name__}: {exc}'
        if raw is None:
            meta['evidence_path'] = None
    meta['elapsed_seconds'] = round(time.monotonic()-started, 3)
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2)+'\n')
    return meta

def robots_decision(metadata_path, target_url, tokens=('mybookshelfresearch', 'mybookshelf', 'chatgpt-user', 'oai-searchbot')):
    metadata_path = Path(metadata_path)
    meta = json.loads(metadata_path.read_text())
    status = meta.get('status')
    if status in (404,410):
        return {'decision':'no_published_rules','allowed':True,'delay_seconds':0,'note':f'HTTP{status}; not an affirmative reuse licence'}
    if status is None or status >= 500 or status in (401,403,429):
        return {'decision':'unresolved','allowed':False,'note':f'Robots status {status}; retain failure, do not infer permission'}
    if not (200 <= status < 300) or not meta.get('evidence_path'):
        return {'decision':'unresolved','allowed':False,'note':'Robots response not interpretable'}
    body = (metadata_path.parent / (meta['name']+'.html')).read_text(errors='replace')
    if '<html' in body.lower() and not re.search(r'^\s*User-agent\s*:',body,re.I|re.M):
        return {'decision':'unresolved','allowed':False,'note':'HTML returned instead of interpretable robots policy'}
    groups=[]; group=None; had_rule=False
    for line in body.splitlines():
        line=line.split('#',1)[0].strip()
        if ':' not in line: continue
        key,value=line.split(':',1);key=key.strip().lower();value=value.strip()
        if key=='user-agent':
            if group is None or had_rule:
                group={'agents':[],'rules':[],'delay':0};groups.append(group);had_rule=False
            group['agents'].append(value.split('/')[0].lower())
        elif group is not None:
            had_rule=True
            if key in ('allow','disallow') and value:group['rules'].append((key=='allow',value))
            if key=='crawl-delay':
                try:group['delay']=max(group['delay'],float(value))
                except ValueError:pass
    parsed=urllib.parse.urlsplit(target_url);path=parsed.path+('?' + parsed.query if parsed.query else '')
    decisions=[];delay=0
    for token in tokens:
        specific=[g for g in groups if token in g['agents']]
        selected=specific or [g for g in groups if '*' in g['agents']]
        matches=[]
        for g in selected:
            delay=max(delay,g['delay'])
            for allow,rule in g['rules']:
                end=rule.endswith('$');stem=rule[:-1] if end else rule
                expression='^'+re.escape(stem).replace(r'\*','.*')+('$' if end else '')
                if re.search(expression,path):matches.append((len(rule.replace('*','').replace('$','')),allow,rule))
        matches.sort(reverse=True)
        decisions.append({'agent':token,'allowed':not matches or matches[0][1], 'matching_rule':matches[0][2] if matches else None})
    allowed=all(x['allowed'] for x in decisions)
    return {'decision':'allowed_path' if allowed else 'restricted','allowed':allowed,'delay_seconds':delay,'agents':decisions,'note':'Public research path check; no reuse licence inferred'}

if __name__=='__main__':
    destination=Path(sys.argv[1]);batch=json.loads(Path(sys.argv[2]).read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        for result in executor.map(lambda job:fetch(dest=destination,**job),batch):
            print(json.dumps({k:result.get(k) for k in ['name','status','effective_url','title','error','elapsed_seconds','truncated']},ensure_ascii=False),flush=True)
