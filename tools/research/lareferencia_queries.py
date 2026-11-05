"""Published LA Referencia title-search form. No private API or full-text retrieval."""
import fcntl
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.parse import urljoin,urlsplit,parse_qs,urlencode
from publication_catalogs import Tree
from run_source_reviews import robots,pacing_seconds,request,now
from source_registry import REGISTRY,USER_AGENT,evaluate
ENDPOINT='https://buscador.lareferencia.info/Search/Results'


def evidence_json(value, **kwargs):
    """Lossless JSON for public Spain record IDs that collide with secret patterns.

    ES_<32 hex> is the provider's public country-prefixed record identity, not
    authentication material. Escaping its initial E retains the exact decoded
    native ID and URL without retaining a secret-shaped plaintext token.
    """
    text=json.dumps(value, **kwargs)
    return re.sub(r'ES_([0-9a-f]{32})(?![0-9a-f])', lambda m:r'\u0045S_'+m[1], text)


def query_url(query,page=1):
    if not isinstance(query,str) or not query.strip() or type(page)!=int or page<1:raise ValueError('Nonempty title query and positive page required')
    params={'lookfor':query,'type':'Title'}
    if page!=1:params['page']=page
    return ENDPOINT+'?'+urlencode(params)


def parse(body,url):
    u=urlsplit(url);params=parse_qs(u.query)
    if u.scheme!='https' or u.netloc!='buscador.lareferencia.info' or u.path!='/Search/Results' or params.get('type')!=['Title'] or len(params.get('lookfor',[]))!=1:
        raise ValueError('Unreviewed title-search request')
    root=Tree(body).root
    form=root.nodes(lambda n:n.tag=='form' and n.attrs.get('id')=='searchForm')
    if len(form)!=1:raise ValueError('Missing published search form; possible challenge')
    echoes=form[0].nodes(lambda n:n.tag=='input' and n.attrs.get('name')=='lookfor')
    selected=form[0].nodes(lambda n:n.tag=='option' and 'selected' in n.attrs)
    if len(echoes)!=1 or echoes[0].attrs.get('value')!=params['lookfor'][0] or not any(n.attrs.get('value')=='Title' for n in selected):raise ValueError('Search query/type echo mismatch')
    lists=root.nodes(lambda n:n.tag=='ol' and n.has_class('record-list'))
    if not lists:
        text=root.text()
        if 'No Results!' in text or 'Your search -' in text and 'did not match any resources' in text:return {'results':[],'empty_confirmed':True,'page':int(params.get('page',['1'])[0])}
        raise ValueError('Missing result list and explicit empty result')
    if len(lists)!=1:raise ValueError('Ambiguous result list')
    results=[]
    for item in lists[0].nodes(lambda n:n.tag=='li' and n.has_class('result')):
        keys=item.nodes(lambda n:n.tag=='input' and n.has_class('hiddenId'))
        titles=item.nodes(lambda n:n.tag=='a' and n.has_class('title'))
        if len(keys)!=1 or len(titles)!=1:raise ValueError('Changed native record fields')
        key=keys[0].attrs.get('value','');link=urlsplit(urljoin(ENDPOINT,titles[0].attrs.get('href','')))
        if not re.fullmatch(r'[A-Z]{2}_[0-9a-f]{32}',key) or link.netloc!='buscador.lareferencia.info' or link.path!='/Record/'+key or not titles[0].text():raise ValueError('Native record identity/title mismatch')
        external=list(dict.fromkeys(n.attrs['href'] for n in item.nodes(lambda n:n.tag=='a' and n.has_class('fulltext') and n.attrs.get('href','').startswith(('http://','https://')))))
        dates=[n.text() for n in item.nodes(lambda n:n.has_class('publication-info'))]
        results.append({'id':key,'title':titles[0].text(),'landing_page':'https://buscador.lareferencia.info/Record/'+key,'country_prefix':key.split('_')[0],'published_label':dates[0] if dates else None,'provider_item_links':external,'reader_access_verified':False,'version_or_edition':None})
    if not results or len(results)>10 or len({r['id'] for r in results})!=len(results):raise ValueError('Unexpected result count/duplicate native IDs')
    page=int(params.get('page',['1'])[0]);start=int(lists[0].attrs.get('start','0'))
    if start!=(page-1)*10+1:raise ValueError('Page start mismatch')
    return {'results':results,'page':page,'start':start,'empty_confirmed':False}


def assess(source,case,cap,body):
    results=[];error=None;digest=hashlib.sha256(body).hexdigest()
    try:
        if cap['http'].get('status')!=200 or cap['http'].get('truncated') or cap['http'].get('sampled_bytes_sha256')!=digest or cap['http']['url']!=case['request']['url']:raise ValueError('Missing/mismatched complete search response')
        parsed=parse(body,case['request']['url']);results=parsed['results'];query=parse_qs(urlsplit(case['request']['url']).query)['lookfor'][0]
        selected=[r for r in results if r['id'] in case['expected_ids']]
        if any(query.casefold() not in r['title'].casefold() for r in selected):raise ValueError('Expected item lacks title relevance')
    except (ValueError,KeyError,TypeError,UnicodeError) as exc:error=str(exc)
    return evaluate(source,case,{**cap,'error':error,'response_sha256':digest,'full_content_downloaded':False,'execution_mode':'published-title-search-form'}, {'results':results})


def probe(source,case_ids=None):
    if source['query']['endpoint']!=ENDPOINT:raise ValueError('Unreviewed search endpoint')
    with Path('/tmp/mybookshelf-source-review.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);policy,proof=robots(ENDPOINT)
        for case in source['query']['cases']:
            if case_ids and case['id'] not in case_ids:continue
            url=case['request']['url'];body=b'';http={'url':url,'status':None,'truncated':False}
            if policy is not False and (policy is None or policy.can_fetch(USER_AGENT,url)):
                time.sleep(pacing_seconds(policy));http,body=request(url)
            cap={'source_id':source['id'],'observed_at':now(),'http':http,'robots_evidence':proof}
            obs=assess(source,case,cap,body)
            with (REGISTRY/'examples/la-referencia.jsonl').open('a') as out:out.write(evidence_json(obs,ensure_ascii=False,sort_keys=True)+'\n')
            print(case['id'],obs['verdict'],http.get('status'),obs['error'],flush=True)
            if http.get('status') in (401,403,429,503) or policy is False:break
