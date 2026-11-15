"""Offline policy replay against saved successes; never makes a request."""
import importlib.util
import json
from pathlib import Path
import tempfile
import urllib.parse

ROOT=Path(__file__).parent
spec=importlib.util.spec_from_file_location('research_probe',ROOT/'probe.py')
probe=importlib.util.module_from_spec(spec);spec.loader.exec_module(probe)
rows=[]
additional=json.loads((ROOT/'additional-policy-evidence.json').read_text())
with tempfile.TemporaryDirectory(prefix='mybookshelf-policy-audit-') as tmp:
    temp=Path(tmp)
    for country in json.loads((ROOT/'countries.json').read_text()):
        c=country['slug'];p=ROOT/c/'findings.json'
        if not p.exists():continue
        d=json.loads(p.read_text())
        for lib in d.get('libraries',[]):
            policy=lib['robots'];source=policy.get('evidence_path');status=policy.get('status')
            raw=None;sourcepath=ROOT/c/source if source else None
            if sourcepath and sourcepath.exists():
                if sourcepath.suffix!='.json':raw=sourcepath.read_text(errors='replace')
                else:
                    meta=json.loads(sourcepath.read_text())
                    candidates=[]
                    for key in ['evidence_path','raw_response','body_path','response_body_path','raw_path']:
                        value=meta.get(key)
                        if isinstance(value,str):candidates.extend([ROOT/c/value,sourcepath.parent/value])
                    candidates.extend([sourcepath.with_suffix('.html'),sourcepath.with_suffix('.txt')])
                    for candidate in candidates:
                        if candidate.exists() and candidate!=sourcepath:
                            raw=candidate.read_text(errors='replace');break
                    if raw is None and isinstance(meta.get('body'),str):raw=meta['body']
            name=f'{c}-{lib["id"]}'
            meta=dict(name=name,status=status,evidence_path=f'{name}.html' if raw is not None else None)
            (temp/f'{name}.json').write_text(json.dumps(meta))
            if raw is not None:(temp/f'{name}.html').write_text(raw)
            urls=[('query',lib['query']['url'])]+[('record',b['record_url']) for b in lib['books'] if b.get('record_url')]
            for kind,url in urls:
                result=probe.robots_decision(temp/f'{name}.json',url)
                used_policy_url=policy.get('url');used_source=sourcepath
                target=urllib.parse.urlsplit(url);target_origin=f'{target.scheme}://{target.netloc}'
                extra=next((x for x in additional if x['country_slug']==c and x['library_id']==lib['id'] and x['target_origin']==target_origin),None)
                if extra:
                    used_source=ROOT/c/extra['metadata_path']
                    result=probe.robots_decision(used_source,url)
                    used_policy_url=json.loads(used_source.read_text())['url']
                policy_parts=urllib.parse.urlsplit(used_policy_url or '')
                same_origin=(policy_parts.scheme,policy_parts.netloc)==(target.scheme,target.netloc)
                if not same_origin:
                    result={'decision':'unresolved_cross_origin','allowed':None,'note':'The saved library-level policy does not cover this linked origin. No permission or successful record fetch is inferred.'}
                row=dict(country=country['name'],id=lib['id'],library=lib['name'],recommendation=lib['recommendation'],request_kind=kind,url=url,policy_url=used_policy_url,source=str(used_source.relative_to(ROOT)) if used_source else None,declared_decision=policy.get('decision'),replayed=result,same_hostname=policy_parts.hostname==target.hostname,same_origin=same_origin,additional_policy_evidence=bool(extra))
                row['review_required']=result['decision']=='restricted' and policy.get('decision')!='restricted'
                rows.append(row)
out=dict(method='Offline longest-path/Allow-tie replay for MyBookshelfResearch, MyBookshelf, ChatGPT-User and OAI-SearchBot. A library-level policy is not applied to another origin; linked records without separate saved policy remain unchecked. Robots does not grant a reuse licence.',checked_requests=len(rows),unacknowledged_restrictions=[r for r in rows if r['review_required']],cross_origin_links_requiring_policy_review=[r for r in rows if not r['same_origin']],rows=rows)
(ROOT/'policy-audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(checked_requests=len(rows),unacknowledged_restrictions=[dict(country=r['country'],id=r['id'],kind=r['request_kind']) for r in rows if r['review_required']],unresolved=sum(r['replayed']['decision'].startswith('unresolved') for r in rows),cross_origin_links=sum(not r['same_origin'] for r in rows)),ensure_ascii=False))
